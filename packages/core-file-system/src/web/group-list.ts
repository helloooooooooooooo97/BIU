import { isRefFieldType, type CollectionSchema, type CollectionSchemaPack, type DbRecord } from '@biu/type-file-system'
import type { SortRule } from '../query-logic.ts'
import { readJson, type ListPage } from './db-client.ts'
import { parseTagFlatColumnKey } from '../query-logic.ts'
import { groupListFilter, groupListKeys, mergeListFilters, recordGroupLabels, uniqueValues, type GroupBucket } from './fields.ts'
import { resolveGroupField, strategyForField } from './group-strategies.ts'

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
  groupValues?: () => Promise<Array<{ key: string; total: number }> | null>
  /** Only a group page change may reuse unchanged buckets; data refreshes must refetch. */
  reuseUnchanged?: boolean
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
  // Values of open-ended fields must come from the collection, not the rows
  // left in memory before a refresh. Otherwise a cold load queries only “unset”.
  const extraValues = new Set(opts.extraValues ?? [])
  const indexed = parseTagFlatColumnKey(opts.groupBy) && opts.groupValues ? await opts.groupValues() : null
  for (const item of indexed ?? []) if (item.key) extraValues.add(item.key)
  const kind = group ? strategyForField(group.field)?.kind : undefined
  if (!indexed && group && !group.field.enum?.length &&
      ['select', 'multi-select', 'tag', 'person', 'ref', 'multi-ref'].includes(kind ?? '') &&
      !['shareScope', 'table', 'tablePath'].includes(group.key) && !(opts.reuseUnchanged && opts.previous?.length)) {
    const limit = 200
    for (let offset = 0; ; offset += limit) {
      const page = await opts.list({
        path: opts.path, limit, offset, query: opts.query,
        filters: opts.filters, columns: [group.key],
        sortField: 'id', sortDir: 'asc',
      })
      for (const value of uniqueValues(page.items, group.key, group.field)) extraValues.add(value)
      if (!page.items.length || offset + page.items.length >= page.total || extraValues.size >= 80) break
    }
  }
  let keys = groupListKeys(opts.schema, opts.groupBy, [...extraValues], packs, seedLabels)
  if (indexed) {
    const labels = new Map(keys.map(item => [item.key, item.label]))
    keys = indexed.filter(item => item.total > 0 || item.key === '').map(item => ({
      key: item.key, label: labels.get(item.key) ?? (item.key || '未填'),
    }))
  }
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
      keys = keys.map(item => ({ ...item, label: labels[item.key] ?? item.label }))
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
      if (opts.reuseUnchanged && previous?.length && samePage && (prev || !indexed)) {
        return { ...item, rows: prev?.rows ?? [], total: prev?.total ?? prev?.rows.length ?? 0, schema: undefined as CollectionSchema | undefined, filters, pageIndex }
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


export function listAttributeGroups(opts: {
  path: string; groupBy: string; query?: string; filters?: Record<string, unknown>; fresh?: boolean
}) {
  const params = new URLSearchParams({ path: opts.path, field: opts.groupBy,
    q: opts.query ?? '', filter: JSON.stringify(opts.filters ?? {}),
  })
  return readJson<{ groups: Array<{ key: string; total: number }> | null }>(
    `/api/db/groups?${params}`, undefined, { fresh: opts.fresh },
  ).then(result => result.groups)
}
