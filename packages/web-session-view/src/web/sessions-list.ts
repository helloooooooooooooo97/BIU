/** 打开会话只拉最近 100 轮。和 SESSION_TAIL_TURNS 同值，单独放这个文件是为了入口能早打 GET。 */
export const SESSION_LOAD_TURNS = 100

const SESSIONS_LIST_HOLD_MS = 400
const SESSION_TURNS_HOLD_MS = 400

let sessionsListInflight: Promise<unknown[] | null> | null = null
const sessionTurnsInflight = new Map<string, Promise<{ status: number; body: unknown } | null>>()

export function resetSessionsListGet() {
  sessionsListInflight = null
  sessionTurnsInflight.clear()
}

/** One in-flight GET /api/agents for boot seed, constructor, applyRoute, and fsdb:change. */
export async function getSessionsList<T = Record<string, unknown>>(opts?: {
  refresh?: boolean
}): Promise<T[] | null> {
  if (opts?.refresh) sessionsListInflight = null
  if (sessionsListInflight) return sessionsListInflight as Promise<T[] | null>
  let request: Promise<unknown[] | null>
  request = (async () => {
    const res = await fetch('/api/agents')
    if (!res.ok) return null
    const body = (await res.json()) as { sessions?: unknown[] }
    return Array.isArray(body.sessions) ? body.sessions : []
  })().then(
    (body) => {
      if (body) {
        setTimeout(() => {
          if (sessionsListInflight === request) sessionsListInflight = null
        }, SESSIONS_LIST_HOLD_MS)
      } else if (sessionsListInflight === request) {
        sessionsListInflight = null
      }
      return body
    },
    (error) => {
      if (sessionsListInflight === request) sessionsListInflight = null
      throw error
    },
  )
  sessionsListInflight = request
  return request as Promise<T[] | null>
}

export async function getSessionTurns<T = Record<string, unknown>>(
  sessionId: string,
  opts?: { refresh?: boolean },
): Promise<{ status: number; body: T } | null> {
  if (!sessionId) return null
  if (opts?.refresh) sessionTurnsInflight.delete(sessionId)
  const pending = sessionTurnsInflight.get(sessionId)
  if (pending) return pending as Promise<{ status: number; body: T } | null>
  let request: Promise<{ status: number; body: unknown } | null>
  request = (async () => {
    const res = await fetch(`/api/agents/${sessionId}?turns=${SESSION_LOAD_TURNS}`)
    const body = (await res.json().catch(() => ({}))) as unknown
    return { status: res.status, body }
  })().then(
    (got) => {
      if (got && got.status >= 200 && got.status < 300) {
        setTimeout(() => {
          if (sessionTurnsInflight.get(sessionId) === request) sessionTurnsInflight.delete(sessionId)
        }, SESSION_TURNS_HOLD_MS)
      } else if (sessionTurnsInflight.get(sessionId) === request) {
        sessionTurnsInflight.delete(sessionId)
      }
      return got
    },
    (error) => {
      if (sessionTurnsInflight.get(sessionId) === request) sessionTurnsInflight.delete(sessionId)
      throw error
    },
  )
  sessionTurnsInflight.set(sessionId, request)
  return request as Promise<{ status: number; body: T } | null>
}

function mostRecentSessionId(sessions: Array<{ id?: unknown; updatedAt?: unknown }>) {
  let best: { id: string; updatedAt: number } | undefined
  for (const item of sessions) {
    const id = typeof item.id === 'string' ? item.id : ''
    if (!id) continue
    const updatedAt = typeof item.updatedAt === 'number' ? item.updatedAt : 0
    if (
      !best ||
      updatedAt > best.updatedAt ||
      (updatedAt === best.updatedAt && id.localeCompare(best.id) < 0)
    ) {
      best = { id, updatedAt }
    }
  }
  return best?.id
}

function hasAccountToken() {
  if (typeof localStorage === 'undefined') return true
  try {
    return Boolean(localStorage.getItem('biu.account.token'))
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
