/** 打开会话只拉最近 100 轮。和 SESSION_TAIL_TURNS 同值，单独放这个文件是为了入口能早打 GET。 */
import { readStorageString } from '@biu/biu-ui/client-storage'
import { apiFetch } from '@biu/biu-ui/api-client'
import { KeyedSingleflight, registerWorkspaceCache } from '@biu/biu-ui/cache'
import { mostRecentSessionId } from './session-groups.ts'

export const SESSION_LOAD_TURNS = 100

const SESSIONS_LIST_HOLD_MS = 400
const SESSION_TURNS_HOLD_MS = 400

const sessionsListSingleflight = new KeyedSingleflight<string, unknown[] | null>()
const sessionTurnsSingleflight = new KeyedSingleflight<string, { status: number; body: unknown } | null>()

export function resetSessionsListGet() {
  sessionsListSingleflight.clear()
  sessionTurnsSingleflight.clear()
}

registerWorkspaceCache('web-session-view-list', resetSessionsListGet)

/** One in-flight GET /api/agents for boot seed, constructor, applyRoute, and fsdb:change. */
export async function getSessionsList<T = Record<string, unknown>>(opts?: {
  refresh?: boolean
}): Promise<T[] | null> {
  if (opts?.refresh) sessionsListSingleflight.delete('list')
  return sessionsListSingleflight.run(
    'list',
    async () => {
      const res = await apiFetch('/api/agents')
      if (!res.ok) return null
      const body = (await res.json()) as { sessions?: unknown[] }
      return Array.isArray(body.sessions) ? body.sessions : []
    },
    {
      holdMs: SESSIONS_LIST_HOLD_MS,
      shouldHold: (body) => body !== null,
    },
  ) as Promise<T[] | null>
}

export async function getSessionTurns<T = Record<string, unknown>>(
  sessionId: string,
  opts?: { refresh?: boolean },
): Promise<{ status: number; body: T } | null> {
  if (!sessionId) return null
  if (opts?.refresh) sessionTurnsSingleflight.delete(sessionId)
  return sessionTurnsSingleflight.run(
    sessionId,
    async () => {
      const res = await apiFetch(`/api/agents/${sessionId}?turns=${SESSION_LOAD_TURNS}`)
      const body = (await res.json().catch(() => ({}))) as unknown
      return { status: res.status, body }
    },
    {
      holdMs: SESSION_TURNS_HOLD_MS,
      shouldHold: (got) => Boolean(got && got.status >= 200 && got.status < 300),
    },
  ) as Promise<{ status: number; body: T } | null>
}

function hasAccountToken() {
  if (typeof localStorage === 'undefined') return true
  try {
    return Boolean(readStorageString('biu.account.token'))
  } catch {
    return true
  }
}

/** 入口在插件图加载前先打列表和最近一条 turns，避免等 session-view 模块才发请求。 */
export function seedHomeSessionFetches() {
  if (typeof window === 'undefined') return
  if (!hasAccountToken()) return
  void getSessionsList().then((sessions) => {
    const id = mostRecentSessionId(sessions ?? [])
    if (id) void getSessionTurns(id)
  })
}
