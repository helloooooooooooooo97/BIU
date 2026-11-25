import { isViewModeId, type ViewMode } from './fields.ts'
import { normalizeColumnSummaries, type ColumnSummaryOp } from './column-summary.ts'
import { normalizeColumnViews, type ColumnViewConfig } from './column-sandbox-model.ts'
import { normalizeTableSandboxViews, type TableSandboxItem } from './table-sandbox-model.ts'
import { countFilterRules, filterTreeStateKey, normalizeSorts, resolveViewFilterTree, sortsStateKey, type FilterGroup, type SortRule } from '../query-logic.ts'

export type GroupSortMode = 'manual' | 'asc' | 'desc'

/** 视图自身的可见范围两态（纯展示，不授予底层数据权限）：私人（仅创建者可见）、空间（空间内部成员可见）。 */
export type ViewScope = 'personal' | 'workspace'

export function normalizeViewScope(value: unknown): ViewScope | undefined {
  if (value === 'personal' || value === 'workspace') return value
  if (value === 'shared') return 'personal'
  return undefined
}

export type GroupConfig = {
  sort?: GroupSortMode
  hideEmpty?: boolean
  hidden?: string[]
  order?: string[]
}

export type SavedView = {
  id: string
  name: string
  mode: ViewMode
  /** 视图自身的可见范围三态（缺省视为 workspace）。 */
  scope?: ViewScope
  /** 创建者账号 ID（用于私人视图可见性隔离与创建者/管理员独占编辑权）。 */
  createdBy?: string
  sortField: string
  sortDir: 'asc' | 'desc'
  sorts?: SortRule[]
  filters: Record<string, string>
  filterTree?: FilterGroup
  columns: string[]
  groupBy?: string
  groupConfig?: GroupConfig
  tree?: boolean
  wrap?: boolean
  truncate?: boolean
  rowNumbers?: boolean
  freezeTitle?: boolean
  /** 冻结至指定列 key（含该列及左侧所有列）。 */
  freezeUntil?: string
  query?: string
  pageSize?: number
  /** 表格列宽（px），按字段 key。 */
  columnWidths?: Record<string, number>
  /** 表格列统计方式，按字段 key。 */
  columnSummaries?: Record<string, ColumnSummaryOp>
  /** 表格列属性沙箱视图配置，按字段 key。 */
  columnViews?: Record<string, ColumnViewConfig>
  /** 表级沙箱呈现视图列表。 */
  sandboxViews?: TableSandboxItem[]
  /** 工作区创建时写入的种子视图。与后来保存的视图同一套改名 / 筛选 / 删除规则。 */
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
        throw new Error('columns 应为字符串数组，例如 ["title","tag"]')
      }
    }
    if (text.includes('"') || text.includes(']')) {
      throw new Error('columns 应为字符串数组，例如 ["title","tag"]，不能按逗号拆 JSON 碎片')
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

export function normalizeGroupConfig(value: unknown): GroupConfig | undefined {
  let raw = value
  if (typeof raw === 'string') {
    const text = raw.trim()
    if (!text) return undefined
    try {
      raw = JSON.parse(text) as unknown
    } catch {
      return undefined
    }
  }
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const obj = raw as Record<string, unknown>
  const sort: GroupSortMode | undefined =
    obj.sort === 'asc' || obj.sort === 'desc' || obj.sort === 'manual' ? obj.sort : undefined
  const hideEmpty = typeof obj.hideEmpty === 'boolean' ? obj.hideEmpty : undefined
  const hidden = Array.isArray(obj.hidden)
    ? [...new Set(obj.hidden.map((item) => String(item ?? '')))]
    : undefined
  const order = Array.isArray(obj.order)
    ? [...new Set(obj.order.map((item) => String(item ?? '')))]
    : undefined
  const out: GroupConfig = {}
  if (sort && sort !== 'manual') out.sort = sort
  if (hideEmpty === false) out.hideEmpty = false
  if (hidden?.length) out.hidden = hidden
  if (order?.length) out.order = order
  return Object.keys(out).length ? out : undefined
}

export function groupConfigStateKey(config?: GroupConfig | null) {
  const norm = normalizeGroupConfig(config)
  if (!norm) return ''
  return JSON.stringify({
    sort: norm.sort ?? 'manual',
    hideEmpty: norm.hideEmpty !== false,
    hidden: norm.hidden ?? [],
    order: norm.order ?? [],
  })
}

export function orderGroupBuckets<T extends { key: string; label: string }>(
  buckets: T[],
  config?: GroupConfig,
): T[] {
  if (buckets.length <= 1) return buckets
  const sort = config?.sort ?? 'manual'
  if (sort === 'asc' || sort === 'desc') {
    const dir = sort === 'desc' ? -1 : 1
    return [...buckets].sort((a, b) => {
      const aEmpty = a.key === ''
      const bEmpty = b.key === ''
      if (aEmpty !== bEmpty) return aEmpty ? 1 : -1
      const aVal = a.key || a.label
      const bVal = b.key || b.label
      return aVal.localeCompare(bVal, 'zh-Hans-CN', { numeric: true }) * dir
    })
  }
  const order = config?.order
  if (!order?.length) return buckets
  const rank = new Map<string, number>()
  order.forEach((key, idx) => rank.set(key, idx))
  return [...buckets].sort((a, b) => {
    const ra = rank.has(a.key) ? rank.get(a.key)! : Number.MAX_SAFE_INTEGER
    const rb = rank.has(b.key) ? rank.get(b.key)! : Number.MAX_SAFE_INTEGER
    return ra - rb
  })
}

export function applyGroupConfig<T extends { key: string; label: string; rows: unknown[]; total?: number }>(
  buckets: T[],
  config?: GroupConfig,
  options?: { includeHidden?: boolean },
): T[] {
  const hideEmpty = config?.hideEmpty !== false
  const hiddenSet = !options?.includeHidden && config?.hidden?.length ? new Set(config.hidden) : null
  const filtered = buckets.filter((item) => {
    if (hideEmpty && (item.total ?? item.rows.length) === 0) return false
    if (hiddenSet && hiddenSet.has(item.key)) return false
    return true
  })
  return orderGroupBuckets(filtered, config)
}

export function normalizeSavedView(view: SavedView): SavedView {
  const sorts = normalizeSorts(view.sorts, view.sortField || 'title', view.sortDir === 'desc' ? 'desc' : 'asc')
  const scope = normalizeViewScope(view.scope)
  const createdBy = typeof view.createdBy === 'string' && view.createdBy.trim() ? view.createdBy.trim() : undefined
  return {
    ...view,
    ...(scope ? { scope } : { scope: undefined }),
    ...(createdBy ? { createdBy } : { createdBy: undefined }),
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
    groupConfig: normalizeGroupConfig(view.groupConfig),
    tree: !!view.tree,
    wrap: !!view.wrap,
    truncate: view.truncate !== false,
    rowNumbers: !!view.rowNumbers,
    freezeTitle: !!view.freezeTitle,
    freezeUntil: typeof view.freezeUntil === 'string' && view.freezeUntil.trim() ? view.freezeUntil.trim() : undefined,
    query: view.query ?? '',
    pageSize: normalizePageSize(view.pageSize),
    columnWidths: normalizeColumnWidths(view.columnWidths),
    columnSummaries: normalizeColumnSummaries(view.columnSummaries),
    columnViews: normalizeColumnViews(view.columnViews),
    sandboxViews: normalizeTableSandboxViews(view.sandboxViews),
    builtin: Boolean(view.builtin),
    updatedAt: Number(view.updatedAt) || 0,
    rank: Number.isFinite(Number(view.rank)) ? Math.round(Number(view.rank)) : undefined,
  }
}

export function canRemoveCollectionView(views: Array<{ id: string }>) {
  return views.length > 1
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
  view: Pick<SavedView, 'mode' | 'sortField' | 'sortDir' | 'sorts' | 'filters' | 'filterTree' | 'columns' | 'groupBy' | 'groupConfig' | 'tree' | 'wrap' | 'truncate' | 'rowNumbers' | 'freezeTitle' | 'freezeUntil' | 'query' | 'pageSize' | 'columnWidths' | 'columnSummaries' | 'columnViews' | 'sandboxViews'>,
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
    groupConfig: groupConfigStateKey(view.groupConfig),
    tree: !!view.tree,
    wrap: !!view.wrap,
    truncate: view.truncate !== false,
    rowNumbers: !!view.rowNumbers,
    freezeTitle: !!view.freezeTitle,
    freezeUntil: typeof view.freezeUntil === 'string' && view.freezeUntil.trim() ? view.freezeUntil.trim() : undefined,
    query: view.query ?? '',
    pageSize: normalizePageSize(view.pageSize),
    columnWidths: normalizeColumnWidths(view.columnWidths),
    columnSummaries: normalizeColumnSummaries(view.columnSummaries),
    columnViews: normalizeColumnViews(view.columnViews),
    sandboxViews: normalizeTableSandboxViews(view.sandboxViews),
  })
}

/** incoming 的 updatedAt 不低于 current 时才算更新；本地已打戳、对端没有时间戳时保住本地。 */
export function viewIsFresher(incoming: SavedView, current?: SavedView | null) {
  if (!current) return true
  const incomingAt = Number(incoming.updatedAt) || 0
  const currentAt = Number(current.updatedAt) || 0
  if (!incomingAt && currentAt) return false
  if (!incomingAt || !currentAt) return true
  return incomingAt >= currentAt
}
