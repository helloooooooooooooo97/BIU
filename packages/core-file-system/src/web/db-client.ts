import type { CollectionSchema, DbRecord } from '@biu/type-file-system'
import { ApiHttpError, apiJson, invalidateApiInflight } from '@biu/biu-ui/api-client'

/** Unified HTTP error alias so callers checking `instanceof HttpError` share `@biu/biu-ui/api-client`. */
export { ApiHttpError as HttpError }

const GET_INFLIGHT_HOLD_MS = 400

export async function readJson<T>(path: string, init?: RequestInit, opts?: { fresh?: boolean }): Promise<T> {
  return apiJson<T>(path, init, {
    fresh: opts?.fresh,
    dedupeHoldMs: GET_INFLIGHT_HOLD_MS,
  })
}

export type ListPage = {
  items: Array<DbRecord & { path?: string }>
  total: number
  schema?: CollectionSchema
}

/** Drop briefly-held GETs so a write/view switch cannot reuse a stale list page. */
export function invalidateListReads() {
  invalidateApiInflight()
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
  const body = await apiJson<ListPage & { items?: DbRecord[]; total?: number; schema?: CollectionSchema }>(
    `/api/db/list?${params}`,
    undefined,
    {
      fresh: opts.fresh,
      dedupeHoldMs: GET_INFLIGHT_HOLD_MS,
      shareInflightWhenFresh: true,
    },
  )
  const items = Array.isArray(body.items) ? body.items : []
  return {
    items,
    total: typeof body.total === 'number' ? body.total : items.length,
    schema: body.schema,
  } satisfies ListPage
}
