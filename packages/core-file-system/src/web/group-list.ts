import type { CollectionSchema, CollectionSchemaPack, DbRecord } from '@biu/type-file-system'
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
  packs?: CollectionSchemaPack[]
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
  const keys = groupListKeys(opts.schema, opts.groupBy, opts.extraValues, opts.packs)
  if (!keys.length) return null
  const pageSize = Math.max(1, opts.pageSize)
  const fullCount = groupedFullFetchCount(pageSize, keys.length, opts.wrap)
  const filled = new Set(opts.fillKeys ?? [])
  const previous = opts.previous
  const prevByKey = new Map((previous ?? []).map((bucket) => [bucket.key || 'unset', bucket]))
  const prevPages = opts.previousPages ?? {}
  const fetchGroup = (filters: Record<string, unknown>, pageIndex: number, limit: number) =>
    opts.list({
      path: opts.path,
      limit,
      offset: pageIndex * pageSize,
      query: opts.query,
      sortField: opts.sortField,
      sortDir: opts.sortDir,
      sorts: opts.sorts,
      filters,
      columns: opts.columns,
    })
  const pages = await Promise.all(
    keys.map(async (item, index) => {
      const filters = mergeListFilters(opts.filters ?? {}, groupListFilter(opts.groupBy, item.key, opts.schema, opts.packs))
      const groupKey = item.key || 'unset'
      const pageIndex = Math.max(0, opts.groupPages?.[groupKey] ?? 0)
      if (!filters) {
        return { ...item, rows: [] as DbRecord[], total: 0, schema: undefined as CollectionSchema | undefined, full: true, filters, pageIndex }
      }
      const full = index < fullCount || filled.has(item.key) || filled.has(groupKey)
      const prev = prevByKey.get(groupKey)
      const samePage = pageIndex === (prevPages[groupKey] ?? 0)
      if (previous && samePage) {
        if (full && prev && prev.rows.length > 0) {
          return { ...item, rows: prev.rows, total: prev.total ?? prev.rows.length, schema: undefined as CollectionSchema | undefined, full: true, filters, pageIndex }
        }
        if (!full && prev) {
          return { ...item, rows: [] as DbRecord[], total: prev.total ?? 0, schema: undefined as CollectionSchema | undefined, full: false, filters, pageIndex }
        }
        if (!prev) {
          return { ...item, rows: [] as DbRecord[], total: 0, schema: undefined as CollectionSchema | undefined, full: true, filters, pageIndex }
        }
      }
      const listed = await fetchGroup(filters, pageIndex, full ? pageSize : 1)
      return { ...item, rows: full ? listed.items : [], total: listed.total, schema: listed.schema, full, filters, pageIndex }
    }),
  )
  /** 前几组是空的时候，首屏会先画出「共享 13」却没有行。把还没拉行的第一屏组在这次返回前补上。 */
  let haveRows = pages.filter((item) => item.rows.length > 0).length
  if (haveRows < fullCount) {
    const pending: number[] = []
    for (let i = 0; i < pages.length && haveRows < fullCount; i += 1) {
      const item = pages[i]!
      if (item.full || !item.filters || item.total <= 0 || item.rows.length) continue
      pending.push(i)
      haveRows += 1
    }
    if (pending.length) {
      const extra = await Promise.all(
        pending.map(async (index) => {
          const item = pages[index]!
          const listed = await fetchGroup(item.filters!, item.pageIndex ?? 0, pageSize)
          return { index, listed }
        }),
      )
      for (const { index, listed } of extra) {
        const item = pages[index]!
        pages[index] = { ...item, rows: listed.items, total: listed.total, schema: listed.schema ?? item.schema, full: true }
      }
    }
  }
  const buckets = pages
    .map(({ key, label, rows, total }) => ({ key, label, rows, total }))
    .filter((item) => item.total > 0)
  const items = buckets.flatMap((item) => item.rows) as Array<DbRecord & { path?: string }>
  const total = buckets.reduce((sum, item) => sum + item.total, 0)
  const schema = pages.find((item) => item.schema)?.schema
  return { buckets, items, total, schema }
}
