import type { CollectionSchema, DbRecord } from '@biu/type-file-system'
import { apiFetch, invalidateApiInflight } from '@biu/biu-ui/api-client'
import { registerWorkspaceCache } from './workspace-client-store.ts'

export class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public body: { error?: string; code?: string },
  ) {
    super(message)
    this.name = 'HttpError'
  }
}

const GET_INFLIGHT_HOLD_MS = 400
const getInflight = new Map<string, Promise<unknown>>()
let readEpoch = 0

async function readJsonNow<T>(path: string, init?: RequestInit, retry = true): Promise<T> {
  const res = await apiFetch(path, init)
  if (res.status === 431) {
    throw new HttpError(
      `接口 ${path.split('?')[0]} 的请求头或查询地址过大（HTTP 431）`,
      res.status,
      { code: 'REQUEST_HEADERS_TOO_LARGE' },
    )
  }
  let body: T & { error?: string; code?: string }
  try {
    body = await res.json()
  } catch (error) {
    if (init?.signal?.aborted || (error instanceof Error && error.name === 'AbortError')) throw error
    const method = String(init?.method ?? 'GET').toUpperCase()
    // A view load can receive an empty/truncated response during a reconnect.
    // Retry reads once without cache; never replay a write whose outcome is unknown.
    if (retry && res.ok && method === 'GET' && !init?.body && error instanceof SyntaxError) {
      return readJsonNow<T>(path, { ...init, cache: 'no-store' }, false)
    }
    throw new HttpError(
      `接口 ${path.split('?')[0]} 返回空或无效的 JSON（HTTP ${res.status}），请重试`,
      res.status,
      { code: 'INVALID_JSON_RESPONSE' },
    )
  }
  if (!res.ok) throw new HttpError(body?.error || res.statusText, res.status, body ?? {})
  return body
}

export async function readJson<T>(path: string, init?: RequestInit, opts?: { fresh?: boolean }): Promise<T> {
  const method = String(init?.method ?? 'GET').toUpperCase()
  if (method !== 'GET' || init?.body || opts?.fresh) return readJsonNow<T>(path, init)
  const pending = getInflight.get(path)
  if (pending) return pending as Promise<T>
  let request: Promise<T>
  request = readJsonNow<T>(path, init).then(
    (body) => {
      setTimeout(() => {
        if (getInflight.get(path) === request) getInflight.delete(path)
      }, GET_INFLIGHT_HOLD_MS)
      return body
    },
    (error) => {
      if (getInflight.get(path) === request) getInflight.delete(path)
      throw error
    },
  )
  getInflight.set(path, request)
  return request
}

export type ListPage = {
  items: Array<DbRecord & { path?: string }>
  total: number
  schema?: CollectionSchema
}

const listInflight = new Map<string, Promise<ListPage>>()
const listFetching = new Set<Promise<ListPage>>()

/** Drop briefly-held GETs so a write/view switch cannot reuse a stale list page. */
export function invalidateListReads() {
  readEpoch += 1
  getInflight.clear()
  listInflight.clear()
  listFetching.clear()
  invalidateApiInflight()
}

registerWorkspaceCache('db-client-inflight', () => {
  invalidateListReads()
})

export async function listCollection(opts: {
  path: string
  limit: number
  offset?: number
  query?: string
  sortField?: string
  sortDir?: string
  sorts?: Array<{ field: string; dir: 'asc' | 'desc' }>
  filters?: Record<string, unknown>
  columns?: string[]
  fresh?: boolean
}): Promise<ListPage> {
  const params = new URLSearchParams({
    path: opts.path,
    limit: String(Math.max(1, opts.limit)),
    offset: String(Math.max(0, opts.offset ?? 0)),
    q: opts.query ?? '',
    sort: opts.sortField || 'title',
    dir: opts.sortDir === 'desc' ? 'desc' : 'asc',
    filter: JSON.stringify(opts.filters ?? {}),
  })
  if (opts.sorts?.length) {
    params.set('sorts', JSON.stringify(opts.sorts.map((item) => ({ field: item.field, dir: item.dir }))))
  }
  if (opts.columns?.length) params.set('columns', opts.columns.join(','))
  const key = params.toString()
  const epoch = readEpoch
  const pending = listInflight.get(key)
  if (pending && (listFetching.has(pending) || !opts.fresh)) return pending
  let request: Promise<ListPage>
  request = readJson<ListPage & { items?: DbRecord[]; total?: number; schema?: CollectionSchema }>(
    `/api/db/list?${params}`,
    undefined,
    { fresh: opts.fresh },
  ).then(
    (body) => {
      const items = Array.isArray(body.items) ? body.items : []
      if (opts.fresh) {
        if (listInflight.get(key) === request) listInflight.delete(key)
      } else if (epoch === readEpoch) {
        setTimeout(() => {
          if (listInflight.get(key) === request) listInflight.delete(key)
        }, GET_INFLIGHT_HOLD_MS)
      } else if (listInflight.get(key) === request) {
        listInflight.delete(key)
      }
      return {
        items,
        total: typeof body.total === 'number' ? body.total : items.length,
        schema: body.schema,
      } satisfies ListPage
    },
    (error) => {
      if (listInflight.get(key) === request) listInflight.delete(key)
      throw error
    },
  )
  listFetching.add(request)
  void request.finally(() => listFetching.delete(request))
  listInflight.set(key, request)
  return request
}
