import { isViewModeId, type ViewMode } from './fields.ts'
import { countFilterRules, filterTreeStateKey, normalizeSorts, resolveViewFilterTree, sortsStateKey, type FilterGroup, type SortRule } from '../query-logic.ts'

export type SavedView = {
  id: string
  name: string
  mode: ViewMode
  sortField: string
  sortDir: 'asc' | 'desc'
  sorts?: SortRule[]
  filters: Record<string, string>
  filterTree?: FilterGroup
  columns: string[]
  groupBy?: string
  tree?: boolean
  wrap?: boolean
  truncate?: boolean
  query?: string
  pageSize?: number
  /** 表格列宽（px），按字段 key。 */
  columnWidths?: Record<string, number>
  /** 系统内置视图（全部 xx / 目录），不能改筛选、不能删改名。 */
  builtin?: boolean
  /** 本地最后修改时间（ms）。多窗口下用来丢弃比库里更旧的快照。 */
  updatedAt?: number
  /** 视图浮窗/Tab 的排列顺序，越小越靠前。 */
  rank?: number
}

export const COL_WIDTH_MIN = 56
export const COL_WIDTH_MAX = 720

export function parseViewColumns(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))]
  if (typeof value === 'string' && value.trim()) {
    const text = value.trim()
    if (text.startsWith('[')) {
      try {
        return parseViewColumns(JSON.parse(text) as unknown)
      } catch {
        throw new Error('columns 应为字符串数组，例如 ["title","facet"]')
      }
    }
    if (text.includes('"') || text.includes(']')) {
      throw new Error('columns 应为字符串数组，例如 ["title","facet"]，不能按逗号拆 JSON 碎片')
    }
    try {
      return parseViewColumns(JSON.parse(text) as unknown)
    } catch {
      return [...new Set(text.split(',').map((item) => item.trim()).filter(Boolean))]
    }
  }
  return []
}

export function normalizeColumnWidths(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (!key || !Number.isFinite(n)) continue
    out[key] = Math.round(Math.min(COL_WIDTH_MAX, Math.max(COL_WIDTH_MIN, n)))
  }
  return out
}

/** Explicit px box so table-layout:fixed cannot stretch neighbors. */
export function colWidthStyle(px: unknown): { width: string; minWidth: string; maxWidth: string } | undefined {
  const n = typeof px === 'number' ? px : Number(px)
  if (!Number.isFinite(n)) return undefined
  const v = `${Math.round(Math.min(COL_WIDTH_MAX, Math.max(COL_WIDTH_MIN, n)))}px`
  return { width: v, minWidth: v, maxWidth: v }
}

export function tableWidthStyle(widths: Record<string, number>, keys: string[]): { width: string; minWidth: string; maxWidth: string } | undefined {
  let sum = 0
  for (const key of keys) {
    const n = widths[key]
    if (!n) return undefined
    sum += n
  }
  const v = `${sum}px`
  return { width: v, minWidth: v, maxWidth: v }
}

export function normalizeSavedView(view: SavedView): SavedView {
  const sorts = normalizeSorts(view.sorts, view.sortField || 'title', view.sortDir === 'desc' ? 'desc' : 'asc')
  return {
    ...view,
    mode: isViewModeId(view.mode) ? view.mode : 'table',
    sortField: sorts[0]?.field || 'title',
    sortDir: sorts[0]?.dir ?? 'asc',
    sorts,
    filters: view.filters && typeof view.filters === 'object' ? view.filters : {},
    filterTree: (() => {
      const tree = resolveViewFilterTree(view)
      return countFilterRules(tree) ? tree : undefined
    })(),
    columns: parseViewColumns(view.columns),
    groupBy: view.groupBy ?? '',
    tree: view.tree !== false,
    wrap: !!view.wrap,
    truncate: view.truncate !== false,
    query: view.query ?? '',
    pageSize: normalizePageSize(view.pageSize),
    columnWidths: normalizeColumnWidths(view.columnWidths),
    builtin: Boolean(view.builtin),
    updatedAt: Number(view.updatedAt) || 0,
    rank: Number.isFinite(Number(view.rank)) ? Math.round(Number(view.rank)) : undefined,
  }
}

export function sortViewsByRank(views: SavedView[]): SavedView[] {
  return views
    .map((view, index) => ({
      view,
      index,
      rank: Number.isFinite(Number(view.rank)) ? Number(view.rank) : index,
    }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((item) => item.view)
}

/** 每条视图都有 0..n-1 的 rank，缺省时跟 previous 里的位置走，不跟 merge 出来的默认顺序走。 */
export function rankListedViews(listed: SavedView[], previous: SavedView[] = listed): SavedView[] {
  const prevRank = new Map<string, number>()
  previous.forEach((view, index) => {
    prevRank.set(view.id, Number.isFinite(Number(view.rank)) ? Number(view.rank) : index)
  })
  const prepared = listed.map((view, index) => ({
    ...view,
    rank: Number.isFinite(Number(view.rank))
      ? Math.round(Number(view.rank))
      : (prevRank.get(view.id) ?? index),
  }))
  return sortViewsByRank(prepared).map((view, rank) => (view.rank === rank ? view : { ...view, rank }))
}

export const PAGE_SIZES = [20, 50, 100] as const
export const DEFAULT_VIEW_PAGE_SIZE = PAGE_SIZES[0]

export function normalizePageSize(value: unknown) {
  const n = Number(value)
  if (PAGE_SIZES.includes(n as (typeof PAGE_SIZES)[number])) return n
  return DEFAULT_VIEW_PAGE_SIZE
}

export function viewStateKey(
  view: Pick<SavedView, 'mode' | 'sortField' | 'sortDir' | 'sorts' | 'filters' | 'filterTree' | 'columns' | 'groupBy' | 'tree' | 'wrap' | 'truncate' | 'query' | 'pageSize' | 'columnWidths'>,
) {
  return JSON.stringify({
    mode: view.mode,
    sortField: view.sortField,
    sortDir: view.sortDir,
    sorts: sortsStateKey(view.sorts),
    filters: view.filters,
    filterTree: filterTreeStateKey(view.filterTree),
    columns: view.columns,
    groupBy: view.groupBy ?? '',
    tree: view.tree !== false,
    wrap: !!view.wrap,
    truncate: view.truncate !== false,
    query: view.query ?? '',
    pageSize: normalizePageSize(view.pageSize),
    columnWidths: normalizeColumnWidths(view.columnWidths),
  })
}

/** incoming 的 updatedAt 不低于 current 时才算更新；缺时间戳视为可采纳。 */
export function viewIsFresher(incoming: SavedView, current?: SavedView | null) {
  if (!current) return true
  const incomingAt = Number(incoming.updatedAt) || 0
  const currentAt = Number(current.updatedAt) || 0
  if (!incomingAt || !currentAt) return true
  return incomingAt >= currentAt
}
