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

const GET_CACHE_TTL_MS = 5000
const getInflight = new Map<string, Promise<unknown>>()
const getCache = new Map<string, { value: unknown; at: number }>()
let readEpoch = 0

async function readJsonNow<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = (await res.json()) as T & { error?: string; code?: string }
  if (!res.ok) throw new HttpError(body.error || res.statusText, res.status, body)
  return body
}

function cacheHit<T>(map: Map<string, { value: T; at: number }>, key: string): T | undefined {
  const hit = map.get(key)
  if (!hit) return undefined
  if (Date.now() - hit.at > GET_CACHE_TTL_MS) {
    map.delete(key)
    return undefined
  }
  return hit.value
}

export function readCacheKeyTouchesPath(key: string, path: string) {
  const raw = String(path ?? '').trim()
  if (!raw) return false
  const enc = encodeURIComponent(raw)
  return key.includes(`path=${enc}`) || key.includes(`path=${raw}`)
}

function dropKeysTouching(map: { keys(): IterableIterator<string>; delete(key: string): boolean }, path: string) {
  for (const key of [...map.keys()]) {
    if (readCacheKeyTouchesPath(key, path)) map.delete(key)
  }
}

export async function readJson<T>(path: string, init?: RequestInit, opts?: { fresh?: boolean }): Promise<T> {
  const method = String(init?.method ?? 'GET').toUpperCase()
  if (method !== 'GET' || init?.body || opts?.fresh) return readJsonNow<T>(path, init)
  const cached = cacheHit(getCache, path)
  if (cached !== undefined) return cached as T
  const pending = getInflight.get(path)
  if (pending) return pending as Promise<T>
  let request: Promise<T>
  request = readJsonNow<T>(path, init).then(
    (body) => {
      if (getInflight.get(path) === request) getInflight.delete(path)
      getCache.set(path, { value: body, at: Date.now() })
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
const listCache = new Map<string, { value: ListPage; at: number }>()

/** Drop GET/list cache. Pass a collection path to invalidate only that table. */
export function invalidateListReads(path?: string) {
  const scoped = String(path ?? '').trim()
  if (!scoped) {
    readEpoch += 1
    getInflight.clear()
    listInflight.clear()
    listFetching.clear()
    getCache.clear()
    listCache.clear()
    return
  }
  dropKeysTouching(getInflight, scoped)
  dropKeysTouching(listInflight, scoped)
  dropKeysTouching(getCache, scoped)
  dropKeysTouching(listCache, scoped)
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
  if (!opts.fresh) {
    const cached = cacheHit(listCache, key)
    if (cached) return cached
  }
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
      const page = {
        items,
        total: typeof body.total === 'number' ? body.total : items.length,
        schema: body.schema,
      } satisfies ListPage
      if (listInflight.get(key) === request) listInflight.delete(key)
      if (epoch === readEpoch) listCache.set(key, { value: page, at: Date.now() })
      return page
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
