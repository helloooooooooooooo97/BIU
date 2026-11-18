import type { SortRule } from '../query-logic.ts'
import type { ListPage } from './db-client.ts'
import { mergeListFilters } from './fields.ts'
import { DATA_COLLECTION_PATH } from './database-path.ts'

export type TreeListInput = {
  path: string
  limit: number
  offset?: number
  query?: string
  sortField?: string
  sortDir?: string
  sorts?: SortRule[]
  filters?: Record<string, unknown>
  columns?: string[]
}

type ListFn = (input: TreeListInput) => Promise<ListPage>

const CHILD_PAGE = 200
const HAS_KIDS_CAP = 500

export function treeRootFilter(parentKey: string): Record<string, unknown> {
  return {
    $tree: {
      kind: 'group',
      id: 'tree-roots',
      combinator: 'and',
      children: [{ kind: 'rule', id: 'tree-root', field: parentKey, op: 'is_empty', value: '' }],
    },
  }
}

export function treeChildrenFilter(parentKey: string, parentId: string): Record<string, unknown> {
  return { [parentKey]: parentId }
}

function parentInFilter(parentKey: string, ids: string[]): Record<string, unknown> {
  if (ids.length === 1) return { [parentKey]: ids[0] }
  return {
    $tree: {
      kind: 'group',
      id: 'tree-has-kids',
      combinator: 'or',
      children: ids.map((id, index) => ({
        kind: 'rule',
        id: `tree-has-kid-${index}`,
        field: parentKey,
        op: 'eq',
        value: id,
      })),
    },
  }
}

export const TREE_HAS_KIDS = '__treeHasKids'

async function markDirectHasKids(
  list: ListFn,
  opts: { path: string; parentKey: string; items: ListPage['items'] },
): Promise<ListPage['items']> {
  const ids = opts.items.map((row) => String(row.id ?? '')).filter(Boolean)
  if (!ids.length) return opts.items
  const wanted = new Set(ids)
  const listed = await list({
    path: opts.path,
    limit: Math.min(HAS_KIDS_CAP, Math.max(ids.length * 8, 1)),
    columns: [opts.parentKey],
    filters: parentInFilter(opts.parentKey, ids),
  })
  const hasKids = new Set<string>()
  for (const row of listed.items) {
    const parent = String(row[opts.parentKey] ?? '')
    if (wanted.has(parent)) hasKids.add(parent)
  }
  return opts.items.map((row) => {
    const next = hasKids.has(String(row.id ?? ''))
    if (row[TREE_HAS_KIDS] === next) return row
    return { ...row, [TREE_HAS_KIDS]: next }
  })
}

/** 树形列表：只拉这一页顶层（父级为空）。子节点要等手动展开再 listTreeChildren。total 是顶层条数。 */
export async function listTreeCollection(opts: TreeListInput & {
  tree?: boolean
  parentKey?: string | null
  list: ListFn
}): Promise<ListPage> {
  const parentKey = String(opts.parentKey ?? '').trim()
  const list = opts.list
  if (!opts.tree || !parentKey || opts.path === DATA_COLLECTION_PATH) {
    return list({
      path: opts.path,
      limit: opts.limit,
      offset: opts.offset,
      query: opts.query,
      sortField: opts.sortField,
      sortDir: opts.sortDir,
      sorts: opts.sorts,
      filters: opts.filters,
      columns: opts.columns,
    })
  }
  const rootFilters = mergeListFilters(opts.filters ?? {}, treeRootFilter(parentKey))
  if (!rootFilters) return { items: [], total: 0 }
  const roots = await list({
    path: opts.path,
    limit: opts.limit,
    offset: opts.offset,
    query: opts.query,
    sortField: opts.sortField,
    sortDir: opts.sortDir,
    sorts: opts.sorts,
    filters: rootFilters,
    columns: opts.columns,
  })
  return { ...roots, items: await markDirectHasKids(list, { path: opts.path, parentKey, items: roots.items }) }
}

/** 展开某一条时才拉它的直接子记录。 */
export async function listTreeChildren(opts: {
  path: string
  parentKey: string
  parentId: string
  sortField?: string
  sortDir?: string
  sorts?: SortRule[]
  columns?: string[]
  list: ListFn
}): Promise<ListPage> {
  const parentKey = String(opts.parentKey ?? '').trim()
  const parentId = String(opts.parentId ?? '').trim()
  if (!parentKey || !parentId) return { items: [], total: 0 }
  const listed = await opts.list({
    path: opts.path,
    limit: CHILD_PAGE,
    offset: 0,
    sortField: opts.sortField,
    sortDir: opts.sortDir,
    sorts: opts.sorts,
    columns: opts.columns,
    filters: treeChildrenFilter(parentKey, parentId),
  })
  return { ...listed, items: await markDirectHasKids(opts.list, { path: opts.path, parentKey, items: listed.items }) }
}
