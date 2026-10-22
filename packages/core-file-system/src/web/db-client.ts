import type { CollectionSchema, DbRecord } from '@biu/type-file-system'

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

async function readJsonNow<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = (await res.json()) as T & { error?: string; code?: string }
  if (!res.ok) throw new HttpError(body.error || res.statusText, res.status, body)
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
}

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
