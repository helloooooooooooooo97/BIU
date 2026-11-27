import { KeyedSingleflight, registerWorkspaceCache } from './cache.ts'
import { getPendingWorkspaceEndpointSync, isHostControlPath, resolveApiRequest } from './workspace-transport.ts'

/**
 * Unified frontend HTTP API client singleton.
 * Centralizes `/api/*` requests with:
 * - consistent `ApiHttpError` error handling and JSON parsing
 * - GET in-flight deduplication and single reconnect retry on truncated JSON
 * - workspace-scope AbortController cancellation on account/workspace switch
 */
export class ApiHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: { error?: string; code?: string } = {},
  ) {
    super(message)
    this.name = 'ApiHttpError'
  }
}

const inflightGets = new KeyedSingleflight<string, unknown>()
const activeControllers = new Set<AbortController>()
const DEFAULT_INFLIGHT_HOLD_MS = 300

export type ApiRequestInterceptor = (
  path: string,
  init: RequestInit,
) => RequestInit | void

const requestInterceptors = new Set<ApiRequestInterceptor>()

/**
 * Register a request interceptor (e.g. auth token / workspace header injection)
 * without monkey-patching global `window.fetch`.
 */
export function registerApiRequestInterceptor(fn: ApiRequestInterceptor): () => void {
  requestInterceptors.add(fn)
  return () => {
    requestInterceptors.delete(fn)
  }
}

function applyInterceptors(path: string, init: RequestInit): RequestInit {
  let next = init
  for (const fn of requestInterceptors) {
    const out = fn(path, next)
    if (out) next = out
  }
  return next
}

function mergeSignals(a?: AbortSignal | null, b?: AbortSignal | null): AbortSignal | undefined {
  if (!a) return b ?? undefined
  if (!b) return a
  if (typeof AbortSignal !== 'undefined' && typeof AbortSignal.any === 'function') {
    return AbortSignal.any([a, b])
  }
  const merged = new AbortController()
  const onAbort = () => merged.abort()
  if (a.aborted || b.aborted) merged.abort()
  else {
    a.addEventListener('abort', onAbort, { once: true })
    b.addEventListener('abort', onAbort, { once: true })
  }
  return merged.signal
}

/**
 * Drop all tracked GET in-flight deduplication entries so subsequent reads fetch fresh data.
 */
export function invalidateApiInflight(): void {
  inflightGets.clear()
}

/**
 * Abort all active scoped API requests (e.g. when switching workspace or logging out).
 */
export function abortApiScope(reason = 'workspace-scope-changed'): number {
  let aborted = 0
  for (const ctrl of [...activeControllers]) {
    activeControllers.delete(ctrl)
    try {
      ctrl.abort(reason)
      aborted += 1
    } catch {
      /* ignore */
    }
  }
  inflightGets.clear()
  return aborted
}

export interface ApiFetchOptions extends RequestInit {
  /** When true, request is tracked under the active workspace scope and cancelled on scope reset. */
  scoped?: boolean
}

/**
 * Unified raw fetch wrapper for `/api/*` endpoints.
 * Always delegates to `globalThis.fetch` so tests stubbing `globalThis.fetch` work seamlessly.
 */
export async function apiFetch(path: string, init?: ApiFetchOptions): Promise<Response> {
  const { scoped, signal, ...rest } = init ?? {}
  const pendingSync =
    path.startsWith('/api/') && !isHostControlPath(path) ? getPendingWorkspaceEndpointSync() : null
  if (!scoped) {
    if (pendingSync) {
      try {
        await pendingSync
      } catch {
        /* fall back to active endpoint */
      }
    }
    const prepared = applyInterceptors(path, rest)
    const resolved = resolveApiRequest(path, prepared)
    const finalInit = signal ? { ...resolved.init, signal } : resolved.init
    return Object.keys(finalInit).length > 0 ? globalThis.fetch(resolved.url, finalInit) : globalThis.fetch(resolved.url)
  }
  const ctrl = new AbortController()
  activeControllers.add(ctrl)
  try {
    if (pendingSync) {
      try {
        await pendingSync
      } catch {
        /* fall back to active endpoint */
      }
      if (ctrl.signal.aborted) {
        throw ctrl.signal.reason instanceof Error
          ? ctrl.signal.reason
          : new Error(`Request aborted: ${String(ctrl.signal.reason ?? 'aborted')}`)
      }
    }
    const prepared = applyInterceptors(path, rest)
    const resolved = resolveApiRequest(path, prepared)
    return await globalThis.fetch(resolved.url, { ...resolved.init, signal: mergeSignals(signal, ctrl.signal) })
  } finally {
    activeControllers.delete(ctrl)
  }
}

async function fetchJsonNow<T>(path: string, init?: ApiFetchOptions, retry = true): Promise<T> {
  const res = await apiFetch(path, init)
  if (res.status === 431) {
    throw new ApiHttpError(
      `接口 ${path.split('?')[0]} 的请求头或查询地址过大（HTTP 431）`,
      res.status,
      { code: 'REQUEST_HEADERS_TOO_LARGE' },
    )
  }
  let body: T & { error?: string; code?: string }
  try {
    body = (await res.json()) as T & { error?: string; code?: string }
  } catch (error) {
    if (init?.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error
    const method = String(init?.method ?? 'GET').toUpperCase()
    if (retry && res.ok && method === 'GET' && !init?.body && error instanceof SyntaxError) {
      return fetchJsonNow<T>(path, { ...init, cache: 'no-store' }, false)
    }
    throw new ApiHttpError(
      `接口 ${path.split('?')[0]} 返回空或无效的 JSON（HTTP ${res.status}），请重试`,
      res.status,
      { code: 'INVALID_JSON_RESPONSE' },
    )
  }
  if (!res.ok) throw new ApiHttpError(body?.error || res.statusText, res.status, body ?? {})
  return body
}

export interface ApiJsonOptions {
  /** Bypass GET post-completion hold cache. */
  fresh?: boolean
  /** Hold completed GET in dedupe map briefly (ms). Defaults to 300ms; 0 disables hold. */
  dedupeHoldMs?: number
  /** When true alongside `fresh: true`, still coalesce identical currently-in-flight GETs. */
  shareInflightWhenFresh?: boolean
}

/**
 * Unified JSON API helper with optional GET in-flight deduplication and uniform `ApiHttpError`.
 */
export async function apiJson<T>(path: string, init?: ApiFetchOptions, opts?: ApiJsonOptions): Promise<T> {
  const method = String(init?.method ?? 'GET').toUpperCase()
  if (method !== 'GET' || init?.body) {
    return fetchJsonNow<T>(path, init)
  }
  return inflightGets.run(path, () => fetchJsonNow<T>(path, init), {
    fresh: opts?.fresh,
    holdMs: opts?.dedupeHoldMs ?? DEFAULT_INFLIGHT_HOLD_MS,
    shareInflightWhenFresh: opts?.shareInflightWhenFresh,
  }) as Promise<T>
}

registerWorkspaceCache('api-client', () => {
  abortApiScope('workspace-cache-reset')
})
