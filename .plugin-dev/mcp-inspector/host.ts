import type { Context } from 'cordis'
import {
  buildEnrichmentPlan,
  deriveCallPairs,
  parseMcpOutput,
  stableJson,
  type CallPair,
  type EnrichmentPlan,
  type EnrichmentResult,
} from './model.ts'

export const name = 'mcp-inspector'
export const inject = ['http', 'sessions', 'mcp']

type McpCaller = (plan: EnrichmentPlan) => Promise<unknown>

type CacheEntry = {
  expiresAt: number
  value: Promise<Omit<EnrichmentResult, 'sourceCallId' | 'targetTool' | 'cached'>>
}

/** raw 历史窗口是不可变数据；缓存半小时，失败只缓存 15 秒便于恢复。 */
export class RawFetchCache {
  private entries = new Map<string, CacheEntry>()

  async get(
    plan: EnrichmentPlan,
    caller: McpCaller,
  ): Promise<Omit<EnrichmentResult, 'sourceCallId' | 'targetTool'> & { cached: boolean }> {
    const key = stableJson({ server: plan.server, tool: plan.targetTool, args: plan.args })
    const now = Date.now()
    const existing = this.entries.get(key)
    if (existing && existing.expiresAt > now) {
      return { ...(await existing.value), cached: true }
    }
    if (existing) this.entries.delete(key)

    const value = caller(plan)
      .then((raw) => {
        const parsed = parseMcpOutput(raw)
        return {
          state: parsed.state === 'pending' ? ('error' as const) : parsed.state,
          ...(parsed.data !== undefined ? { data: parsed.data } : {}),
          ...(parsed.error ? { error: parsed.error } : {}),
          ...(parsed.partial ? { partial: true } : {}),
        }
      })
      .catch((error) => ({
        state: 'error' as const,
        error: String(error).replace(/\s+/g, ' ').slice(0, 500),
      }))

    // 先放 Promise，重复并发请求会共享同一次 MCP 调用。
    this.entries.set(key, { expiresAt: now + 30 * 60_000, value })
    const result = await value
    if (result.state === 'error') {
      this.entries.set(key, { expiresAt: Date.now() + 15_000, value: Promise.resolve(result) })
    }
    return { ...result, cached: false }
  }

  clear() {
    this.entries.clear()
  }
}

async function mapLimit<T, R>(items: T[], limit: number, run: (item: T) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length)
  let cursor = 0
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= items.length) return
      results[index] = await run(items[index]!)
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * 只处理 model 从历史事件推导出的白名单计划。
 * 浏览器不能传 tool/arguments，因此这个函数不存在“任意调用 MCP”的入口。
 */
export async function enrichPairs(
  pairs: CallPair[],
  caller: McpCaller,
  cache = new RawFetchCache(),
): Promise<EnrichmentResult[]> {
  const immediate: Array<{ seq: number; result: EnrichmentResult }> = []
  const plans: EnrichmentPlan[] = []

  for (const pair of pairs) {
    const decision = buildEnrichmentPlan(pair)
    if (!decision) continue
    if (decision.skipped) {
      immediate.push({ seq: pair.call.seq, result: decision.skipped })
    } else if (decision.plan) {
      plans.push(decision.plan)
    }
  }

  const fetched = await mapLimit(plans, 4, async (plan) => {
    const result = await cache.get(plan, caller)
    return {
      seq: plan.sourceSeq,
      result: {
        sourceCallId: plan.sourceCallId,
        targetTool: plan.targetTool,
        ...result,
      } satisfies EnrichmentResult,
    }
  })

  return [...immediate, ...fetched].sort((a, b) => a.seq - b.seq).map((entry) => entry.result)
}

type PluginContext = Context & {
  sessions: {
    get(id: string): Promise<{ events: unknown[] } | null | undefined>
  }
  mcp: {
    call(server: string, name: string, args: Record<string, unknown>): Promise<unknown>
  }
  http: {
    route(
      method: string,
      path: string,
      handler: (route: {
        json<T>(): Promise<T>
        send(status: number, body: unknown): void
      }) => void | Promise<void>,
    ): void
  }
}

export function apply(base: Context) {
  const ctx = base as PluginContext
  const cache = new RawFetchCache()
  ctx.effect(() => () => cache.clear(), 'mcp-inspector.raw-cache')

  ctx.http.route('POST', '/api/mcp-inspector/enrich', async (route) => {
    try {
      const body = await route.json<{ sessionId?: unknown; turn?: unknown }>()
      const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : ''
      if (!sessionId) {
        route.send(400, { error: 'sessionId required' })
        return
      }
      const turn =
        body.turn == null || body.turn === ''
          ? null
          : Number.isInteger(Number(body.turn))
            ? Number(body.turn)
            : Number.NaN
      if (Number.isNaN(turn)) {
        route.send(400, { error: 'turn must be an integer or null' })
        return
      }

      const session = await ctx.sessions.get(sessionId)
      if (!session) {
        route.send(404, { error: 'unknown session' })
        return
      }

      const pairs = deriveCallPairs(session.events, turn)
      const results = await enrichPairs(
        pairs,
        (plan) =>
          ctx.mcp.call(plan.server, 'execute_tools', {
            tool_name: plan.targetTool,
            arguments: plan.args,
          }),
        cache,
      )
      route.send(200, { results })
    } catch (error) {
      route.send(500, { error: String(error).replace(/\s+/g, ' ').slice(0, 500) })
    }
  })
}
