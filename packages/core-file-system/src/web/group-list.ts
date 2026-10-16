import type { CollectionSchema, DbRecord } from '@biu/type-file-system'
import type { SortRule } from '../query-logic.ts'
import type { ListPage } from './db-client.ts'
import { groupListFilter, groupListKeys, mergeListFilters, type GroupBucket } from './fields.ts'

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
  query?: string
  sortField?: string
  sortDir?: string
  sorts?: SortRule[]
  filters?: Record<string, unknown>
  columns?: string[]
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
  const pages = await Promise.all(
    keys.map(async (item) => {
      const filters = mergeListFilters(opts.filters ?? {}, groupListFilter(opts.groupBy, item.key))
      if (!filters) return { ...item, rows: [] as DbRecord[], total: 0, schema: undefined as CollectionSchema | undefined }
      const pageIndex = Math.max(0, opts.groupPages?.[item.key || 'unset'] ?? 0)
      const listed = await opts.list({
        path: opts.path,
        limit: pageSize,
        offset: pageIndex * pageSize,
        query: opts.query,
        sortField: opts.sortField,
        sortDir: opts.sortDir,
        sorts: opts.sorts,
        filters,
        columns: opts.columns,
      })
      return { ...item, rows: listed.items, total: listed.total, schema: listed.schema }
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
