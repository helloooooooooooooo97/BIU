import { isRefFieldType, type CollectionSchema, type CollectionSchemaPack, type DbRecord } from '@biu/type-file-system'
import type { SortRule } from '../query-logic.ts'
import type { ListPage } from './db-client.ts'
import { groupListFilter, groupListKeys, mergeListFilters, recordGroupLabels, type GroupBucket } from './fields.ts'
import { resolveGroupField } from './group-strategies.ts'

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
  const packs = opts.packs ?? []
  const group = resolveGroupField(opts.schema, opts.groupBy, packs)
  const refGroup = group && isRefFieldType(group.field.type)
  const seedLabels = recordGroupLabels((opts.previous ?? []).flatMap((bucket) => bucket.rows))
  let keys = groupListKeys(opts.schema, opts.groupBy, opts.extraValues, packs, seedLabels)
  if (!keys.length) return null
  if (refGroup) {
    const missing = keys.map((item) => item.key).filter((key) => key && !seedLabels[key])
    if (missing.length) {
      const listed = await opts.list({
        path: opts.path,
        limit: missing.length,
        filters: {
          $tree: {
            kind: 'group',
            id: 'group-ref-labels',
            combinator: 'or',
            children: missing.map((id, index) => ({
              kind: 'rule',
              id: `group-ref-${index}`,
              field: 'id',
              op: 'eq',
              value: id,
            })),
          },
        },
        columns: ['id', 'title'],
      })
      const labels = { ...seedLabels, ...recordGroupLabels(listed.items) }
      keys = groupListKeys(opts.schema, opts.groupBy, opts.extraValues, packs, labels)
    }
  }
  const pageSize = Math.max(1, opts.pageSize)
  const previous = opts.previous
  const prevByKey = new Map((previous ?? []).map((bucket) => [bucket.key || 'unset', bucket]))
  const prevPages = opts.previousPages ?? {}
  const fetchGroup = (filters: Record<string, unknown>, pageIndex: number) =>
    opts.list({
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
  const pages = await Promise.all(
    keys.map(async (item) => {
      const filters = mergeListFilters(opts.filters ?? {}, groupListFilter(opts.groupBy, item.key, opts.schema, opts.packs))
      const groupKey = item.key || 'unset'
      const pageIndex = Math.max(0, opts.groupPages?.[groupKey] ?? 0)
      if (!filters) {
        return { ...item, rows: [] as DbRecord[], total: 0, schema: undefined as CollectionSchema | undefined, filters, pageIndex }
      }
      const prev = prevByKey.get(groupKey)
      const samePage = pageIndex === (prevPages[groupKey] ?? 0)
      if (previous && samePage) {
        if (prev) {
          return { ...item, rows: prev.rows, total: prev.total ?? prev.rows.length, schema: undefined as CollectionSchema | undefined, filters, pageIndex }
        }
        return { ...item, rows: [] as DbRecord[], total: 0, schema: undefined as CollectionSchema | undefined, filters, pageIndex }
      }
      const listed = await fetchGroup(filters, pageIndex)
      return { ...item, rows: listed.items, total: listed.total, schema: listed.schema, filters, pageIndex }
    }),
  )
  const buckets = pages
    .map(({ key, label, rows, total }) => ({ key, label, rows, total }))
    .filter((item) => item.total > 0 || item.key === '')
  const items = buckets.flatMap((item) => item.rows) as Array<DbRecord & { path?: string }>
  const total = buckets.reduce((sum, item) => sum + item.total, 0)
  const schema = pages.find((item) => item.schema)?.schema
  return { buckets, items, total, schema }
}
