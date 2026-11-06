import type { Context } from 'cordis'
import { FILE_TOOL_NAMES, MINIMAL_TOOL_NAMES, normalizeAgentMode, type AgentToolMode } from '@biu/host-tools'
import {
  collectLiveDispatchedTasks,
  usageFromTaskReports,
  type DispatchedTask,
  type LiveTurnDispatch,
  type TaskDispatchSource,
  type TokenUsageSum,
} from '@biu/host-live-sessions/usage'
import type { SessionEvent } from '@biu/type-session'

export type ToolSourceId = 'minimal' | 'db' | 'plugin' | 'store'

export interface InspectorToolRow {
  name: string
  description: string
  source: ToolSourceId
  active: boolean
  configurable: boolean
}

export interface InspectorSourceInfo {
  id: ToolSourceId
  label: string
  description: string
}

const SOURCE_INFO: InspectorSourceInfo[] = [
  {
    id: 'minimal',
    label: '极简模式',
    description: 'agentMode=minimal 时的底座工具（bash、str_replace_editor）。',
  },
  {
    id: 'db',
    label: '数据库',
    description: 'agentMode=file 时仅开放这些 db_* 工具（Biu 文件系统）。',
  },
  {
    id: 'plugin',
    label: '插件注册',
    description: '内置 seams 工具；标准模式全开，极简需勾选常驻或 slash 临时放开。',
  },
  {
    id: 'store',
    label: '商店插件',
    description: '已安装商店插件注册的工具，标准模式可调用。',
  },
]

export function toolSourceOf(name: string, origin?: 'core' | 'store'): ToolSourceId {
  if ((MINIMAL_TOOL_NAMES as readonly string[]).includes(name)) return 'minimal'
  if ((FILE_TOOL_NAMES as readonly string[]).includes(name)) return 'db'
  if (origin === 'store') return 'store'
  return 'plugin'
}

export function isToolActiveForSession(opts: {
  name: string
  mode: AgentToolMode
  pinnedExtras: readonly string[]
  origin?: 'core' | 'store'
}): boolean {
  if (opts.mode === 'standard') return true
  if (opts.origin === 'store' || toolSourceOf(opts.name, opts.origin) === 'store') return false
  if (opts.mode === 'file') return (FILE_TOOL_NAMES as readonly string[]).includes(opts.name)
  if ((MINIMAL_TOOL_NAMES as readonly string[]).includes(opts.name)) return true
  return opts.pinnedExtras.includes(opts.name)
}

export function buildInspectorTools(
  catalog: Array<{ name: string; description: string; origin?: 'core' | 'store' }>,
  opts: { mode: AgentToolMode; pinnedExtras: readonly string[] },
): InspectorToolRow[] {
  return catalog
    .map((item) => {
      const source = toolSourceOf(item.name, item.origin)
      return {
        name: item.name,
        description: item.description,
        source,
        active: isToolActiveForSession({
          name: item.name,
          mode: opts.mode,
          pinnedExtras: opts.pinnedExtras,
          origin: item.origin,
        }),
        configurable: opts.mode === 'minimal' && source === 'plugin',
      }
    })
    .sort((a, b) => {
      const order = { minimal: 0, db: 1, plugin: 2, store: 3 } as const
      const diff = order[a.source] - order[b.source]
      return diff !== 0 ? diff : a.name.localeCompare(b.name)
    })
}

export function registerChatInspectorRoutes(ctx: Context) {
  ctx.http.route('GET', '/api/agents/:id/inspector', async (route) => {
    const id = route.params.id
    const record = await ctx.sessions.get(id)
    if (!record) return route.send(404, { error: 'unknown session' })
    const resolved = ctx.chat.resolveEffective(id)
    const mode: AgentToolMode = normalizeAgentMode(resolved.effective.agentMode)
    const pinnedExtras = Array.isArray(resolved.effective.extraTools) ? resolved.effective.extraTools : []
    const tools = buildInspectorTools(ctx.tools.catalog(), { mode, pinnedExtras })
    const title =
      'title' in resolved.effective && typeof resolved.effective.title === 'string'
        ? resolved.effective.title
        : record.config?.title ?? null
    const body: Record<string, unknown> = {
      sessionId: id,
      title,
      agentMode: mode,
      extraTools: pinnedExtras,
      defaults: resolved.defaults,
      config: resolved.config ?? null,
      effective: resolved.effective,
      sources: SOURCE_INFO,
      tools,
      contextWindow: ctx.chat.contextWindowFor(id),
      contextWindowTokens: ctx.chat.contextWindowFor(id) === '1m' ? 1_000_000 : 200_000,
    }
    Object.assign(body, decorateDispatchedTasks(ctx, await loadDispatchedUsage(ctx, id, record.events)))
    route.send(200, body)
  })

  ctx.http.route('GET', '/api/agents/:id/dispatched-usage', async (route) => {
    const id = route.params.id
    const record = await ctx.sessions.get(id)
    if (!record) return route.send(404, { error: 'unknown session' })
    route.send(200, {
      sessionId: id,
      ...decorateDispatchedTasks(ctx, await loadDispatchedUsage(ctx, id, record.events)),
    })
  })
}

function sessionDecorations(ctx: Context, ids: Iterable<string>) {
  const titles = new Map<string, string>()
  const mascots = new Map<string, { shape: string; color: string; eye?: number }>()
  const projects = new Map<string, { name: string; path?: string }>()
  const seen = new Set<string>()
  for (const id of ids) {
    if (!id || seen.has(id)) continue
    seen.add(id)
    let item: {
      id: string
      title?: string
      mascot?: { shape: string; color: string; eye?: number }
      project?: { name: string; path?: string }
    } | null = null
    try {
      item = ctx.sessions.peekSummary?.(id) ?? null
    } catch {
      item = null
    }
    if (!item) continue
    titles.set(item.id, item.title ?? item.id.slice(0, 8))
    if (item.mascot) mascots.set(item.id, item.mascot)
    if (item.project?.name) {
      projects.set(item.id, {
        name: item.project.name,
        ...(item.project.path ? { path: item.project.path } : {}),
      })
    }
  }
  return { titles, mascots, projects }
}

export function decorateDispatchedTasks(
  ctx: Context,
  dispatched: { tasks: DispatchedTask[]; byLiveTurn: Record<string, LiveTurnDispatch>; total: TokenUsageSum },
) {
  const { titles, mascots, projects } = sessionDecorations(
    ctx,
    dispatched.tasks.map((task) => task.sessionId),
  )
  return {
    dispatchedUsage: dispatched.total,
    dispatchedUsageByTurn: Object.fromEntries(
      Object.entries(dispatched.byLiveTurn).map(([key, value]) => [key, value.usage]),
    ),
    dispatchedTasksByTurn: Object.fromEntries(
      Object.entries(dispatched.byLiveTurn).map(([key, value]) => [
        key,
        value.tasks.map((task) => decorateTask(task, titles, mascots, projects)),
      ]),
    ),
  }
}

function decorateTask(
  task: DispatchedTask,
  titles: Map<string, string>,
  mascots: Map<string, { shape: string; color: string; eye?: number }>,
  projects: Map<string, { name: string; path?: string }>,
) {
  return {
    ...task,
    title: titles.get(task.sessionId) ?? task.sessionId.slice(0, 8),
    ...(mascots.get(task.sessionId) ? { mascot: mascots.get(task.sessionId) } : {}),
    ...(projects.get(task.sessionId) ? { project: projects.get(task.sessionId) } : {}),
  }
}

/** 从 task 体系取出本 live（作为 creator）派发的任务；用量读 reports 里已经累加好的字段。 */
export async function loadLiveDispatchTasks(
  ctx: Context & {
    tasks?: {
      list(filter: { creatorSessionId?: string }): Array<{
        id: string
        title: string
        status: 'todo' | 'doing' | 'done'
        createdAt: number
        assignee?: { sessionId?: string } | null
        reports?: Array<{
          sessionId?: string
          turn?: number | null
          usage?: TokenUsageSum
        }>
      }>
    }
  },
  liveId: string,
): Promise<TaskDispatchSource[]> {
  if (!ctx.tasks) return []
  const rows = ctx.tasks.list({ creatorSessionId: liveId })
  return rows
    .map((row) => {
      const usage = usageFromTaskReports(row.reports)
      const workerTurn = [...(row.reports ?? [])]
        .reverse()
        .find((report) => report.turn != null)?.turn
      return {
        id: row.id,
        title: row.title,
        sessionId: row.assignee?.sessionId ?? '',
        createdAt: row.createdAt,
        status: row.status,
        ...(usage ? { usage } : {}),
        ...(workerTurn != null ? { workerTurn } : {}),
      }
    })
    .filter((item) => Boolean(item.sessionId))
}

export async function loadDispatchedUsage(
  ctx: Context,
  liveId: string,
  liveEvents: SessionEvent[],
) {
  let liveTasks: TaskDispatchSource[] = []
  try {
    liveTasks = await loadLiveDispatchTasks(ctx, liveId)
  } catch {
    liveTasks = []
  }
  return collectLiveDispatchedTasks(liveId, liveEvents, [], liveTasks)
}
