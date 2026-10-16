import type { CollectionSchema, DbRecord } from '@biu/type-file-system'
import type { SortRule } from '../query-logic.ts'
import type { ListPage } from './db-client.ts'
import { groupListFilter, groupListKeys, mergeListFilters, type GroupBucket } from './fields.ts'
import { groupedFullFetchCount } from './table-window.ts'

export type GroupedCollectionPage = {
  buckets: GroupBucket[]
  items: Array<DbRecord & { path?: string }>
  total: number
  schema?: CollectionSchema
}

/** 分组视图：每个组按自己的页码拉一页，不再混拉一大页再客户端切。 */
export async function listGroupedCollection(opts: {
  path: string
  groupBy: string
  schema?: CollectionSchema
  extraValues?: string[]
  pageSize: number
  groupPages?: Record<string, number>
  wrap?: boolean
  fillKeys?: string[]
  query?: string
  sortField?: string
  sortDir?: string
  sorts?: SortRule[]
  filters?: Record<string, unknown>
  columns?: string[]
  previous?: GroupBucket[]
  previousPages?: Record<string, number>
  list: (input: {
    path: string
    limit: number
    offset?: number
    query?: string
    sortField?: string
    sortDir?: string
    sorts?: SortRule[]
    filters?: Record<string, unknown>
    columns?: string[]
  }) => Promise<ListPage>
}): Promise<GroupedCollectionPage | null> {
  const keys = groupListKeys(opts.schema, opts.groupBy, opts.extraValues)
  if (!keys.length) return null
  const pageSize = Math.max(1, opts.pageSize)
  const fullCount = groupedFullFetchCount(pageSize, keys.length, opts.wrap)
  const filled = new Set(opts.fillKeys ?? [])
  const previous = opts.previous
  const prevByKey = new Map((previous ?? []).map((bucket) => [bucket.key || 'unset', bucket]))
  const prevPages = opts.previousPages ?? {}
  const pages = await Promise.all(
    keys.map(async (item, index) => {
      const filters = mergeListFilters(opts.filters ?? {}, groupListFilter(opts.groupBy, item.key))
      if (!filters) return { ...item, rows: [] as DbRecord[], total: 0, schema: undefined as CollectionSchema | undefined }
      const groupKey = item.key || 'unset'
      const pageIndex = Math.max(0, opts.groupPages?.[groupKey] ?? 0)
      const full = index < fullCount || filled.has(item.key) || filled.has(groupKey)
      const prev = prevByKey.get(groupKey)
      const samePage = pageIndex === (prevPages[groupKey] ?? 0)
      if (previous && samePage) {
        if (full && prev && prev.rows.length > 0) {
          return { ...item, rows: prev.rows, total: prev.total ?? prev.rows.length, schema: undefined as CollectionSchema | undefined }
        }
        if (!full && prev) {
          return { ...item, rows: [] as DbRecord[], total: prev.total ?? 0, schema: undefined as CollectionSchema | undefined }
        }
        if (!prev) {
          return { ...item, rows: [] as DbRecord[], total: 0, schema: undefined as CollectionSchema | undefined }
        }
      }
      const listed = await opts.list({
        path: opts.path,
        limit: full ? pageSize : 1,
        offset: pageIndex * pageSize,
        query: opts.query,
        sortField: opts.sortField,
        sortDir: opts.sortDir,
        sorts: opts.sorts,
        filters,
        columns: opts.columns,
      })
      return { ...item, rows: full ? listed.items : [], total: listed.total, schema: listed.schema }
    }),
  )
  const buckets = pages
    .map(({ key, label, rows, total }) => ({ key, label, rows, total }))
    .filter((item) => item.total > 0)
  const items = buckets.flatMap((item) => item.rows) as Array<DbRecord & { path?: string }>
  const total = buckets.reduce((sum, item) => sum + item.total, 0)
  const schema = pages.find((item) => item.schema)?.schema
  return { buckets, items, total, schema }
}
