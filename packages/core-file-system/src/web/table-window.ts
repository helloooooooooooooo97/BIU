export const TABLE_ROW_PX = 37
export const TABLE_WRAP_ROW_PX = 96
export const TABLE_WINDOW_OVERSCAN = 4
export const TABLE_WINDOW_VIEWPORT_FALLBACK = 560
export const TABLE_COL_PX = 120
export const TABLE_COL_PIN_PX = 240
export const TABLE_COL_ACTIONS_PX = 72
export const TABLE_COL_OVERSCAN = 1
export const TABLE_COL_VIEWPORT_FALLBACK = 624

const lastTableWrap = {
  width: TABLE_COL_VIEWPORT_FALLBACK,
  height: TABLE_WINDOW_VIEWPORT_FALLBACK,
}

/** Last measured table wrap. Reuse this when the wrap remounts instead of flashing 624×560. */
export function rememberedTableWrap() {
  return { width: lastTableWrap.width, height: lastTableWrap.height }
}

export function resetRememberedTableWrap() {
  lastTableWrap.width = TABLE_COL_VIEWPORT_FALLBACK
  lastTableWrap.height = TABLE_WINDOW_VIEWPORT_FALLBACK
}

export function rememberTableWrap(width: number, height: number) {
  if (width > 0) lastTableWrap.width = width
  if (height > 0) lastTableWrap.height = height
  return rememberedTableWrap()
}

export function tableWrapScroll(
  wrap: { clientWidth: number; clientHeight: number; scrollTop: number; scrollLeft: number },
  top?: number,
) {
  const size = rememberTableWrap(wrap.clientWidth, wrap.clientHeight)
  return {
    top: top ?? wrap.scrollTop,
    height: size.height,
    left: wrap.scrollLeft,
    width: size.width,
  }
}

export type TableWindowSlice = {
  start: number
  end: number
  padTop: number
  padBottom: number
}

export function tableRowFallbackPx(wrap = false) {
  return wrap ? TABLE_WRAP_ROW_PX : TABLE_ROW_PX
}

/** Median of painted data-row heights. Virtual lists (TanStack / react-window) keep pad math on measured size, not a CSS guess. */
export function medianPaintedRowPx(heights: number[], fallback = TABLE_ROW_PX) {
  const xs = heights.filter((h) => Number.isFinite(h) && h > 0).sort((a, b) => a - b)
  if (!xs.length) return fallback
  return xs[Math.floor(xs.length / 2)]!
}

/** 可见行中位高会随窗口跳变；小于此阈值不写回，避免 layout 里 setState 打到 React #185。 */
export const TABLE_ROW_PX_SETTLE = 2

export function settlePaintedRowPx(measured: number, current: number, minDelta = TABLE_ROW_PX_SETTLE) {
  const next = Math.max(1, Math.round(measured))
  const prev = Math.max(1, Math.round(current))
  if (Math.abs(next - prev) < minDelta) return prev
  return next
}

export function tableWindowSlice(
  count: number,
  scrollTop: number,
  viewportH: number,
  rowPx = TABLE_ROW_PX,
  overscan = TABLE_WINDOW_OVERSCAN,
): TableWindowSlice {
  if (count <= 0) return { start: 0, end: 0, padTop: 0, padBottom: 0 }
  const view = viewportH > 0 ? viewportH : TABLE_WINDOW_VIEWPORT_FALLBACK
  const span = Math.max(Math.ceil(view / rowPx) + overscan * 2, 1)
  const maxStart = Math.max(0, count - span)
  const start = Math.min(maxStart, Math.max(0, Math.floor(Math.max(0, scrollTop) / rowPx) - overscan))
  const end = Math.min(count, start + span)
  return {
    start,
    end,
    padTop: start * rowPx,
    padBottom: Math.max(0, count - end) * rowPx,
  }
}

export function tableWindowUnchanged(
  count: number,
  prev: { top: number; height: number },
  next: { top: number; height: number },
  rowPx = TABLE_ROW_PX,
) {
  if (prev.top === next.top && prev.height === next.height) return true
  const a = tableWindowSlice(count, prev.top, prev.height, rowPx)
  const b = tableWindowSlice(count, next.top, next.height, rowPx)
  return a.start === b.start && a.end === b.end && a.padTop === b.padTop && a.padBottom === b.padBottom
}

export type TableColumnSlice = {
  start: number
  end: number
  pin: number
  padLeft: number
  padRight: number
}

/** 标题列冻结；有动作列时紧挨标题一并冻结。 */
export function tablePinCount(keys: string[], labelField?: string | null) {
  let n = 0
  if (labelField && keys[0] === labelField) n = 1
  if (keys[n] === 'actions') return n + 1
  if (keys[0] === 'actions') return 1
  return n
}

/** Prefix of visible keys that stay sticky. Missing frozen list keeps the default title+actions pin. */
export function tableFrozenKeys(keys: string[], frozen?: string[] | null, labelField?: string | null) {
  if (!keys.length) return []
  const wanted = frozen == null ? new Set(keys.slice(0, tablePinCount(keys, labelField))) : new Set(frozen)
  const out: string[] = []
  for (const key of keys) {
    if (!wanted.has(key)) break
    out.push(key)
  }
  return out
}

/** Freeze column K ⇒ first K stay frozen. Unfreeze K ⇒ K and everything after thaw. */
export function toggleFrozenPrefix(keys: string[], frozen: string[] | undefined, key: string, labelField?: string | null) {
  const index = keys.indexOf(key)
  if (index < 0) return tableFrozenKeys(keys, frozen, labelField)
  const current = tableFrozenKeys(keys, frozen, labelField)
  if (current.includes(key)) return keys.slice(0, index)
  return keys.slice(0, index + 1)
}

export function tablePinColClass(key: string, frozenKeys: string[] = []) {
  return frozenKeys.includes(key) ? 'is-pin-col' : ''
}

/** 有手动值用手动值；否则钉住列 / 操作列 / 其余列各一个固定默认宽，不随视口缩放。 */
export function tableColumnWidth(key: string, saved: unknown, pin = false) {
  const n = typeof saved === 'number' ? saved : Number(saved)
  if (Number.isFinite(n) && n > 0) return Math.round(n)
  if (key === 'actions') return TABLE_COL_ACTIONS_PX
  if (pin) return TABLE_COL_PIN_PX
  return TABLE_COL_PX
}

/** 表格列一次画全，不做横向虚拟化。钉住列仍占 slice 前缀，便于表头/单元格共用。 */
export function tableColumnSlice(
  count: number,
  pinCount: number,
  _scrollLeft?: number,
  _viewportW?: number,
  _widths?: number[],
): TableColumnSlice {
  const pin = Math.min(Math.max(0, pinCount), Math.max(0, count))
  if (count <= 0) return { start: 0, end: 0, pin: 0, padLeft: 0, padRight: 0 }
  return { start: pin, end: count, pin, padLeft: 0, padRight: 0 }
}

export function tableColumnUnchanged(
  count: number,
  pinCount: number,
  prev: { left: number; width: number },
  next: { left: number; width: number },
  widths: number[],
) {
  if (prev.left === next.left && prev.width === next.width) return true
  const a = tableColumnSlice(count, pinCount, prev.left, prev.width, widths)
  const b = tableColumnSlice(count, pinCount, next.left, next.width, widths)
  return a.start === b.start && a.end === b.end && a.padLeft === b.padLeft && a.padRight === b.padRight && a.pin === b.pin
}

export const TABLE_CHECK_MEASURE_MAX = 8

export type TableCheckSlot = { kind: 'head' | 'row' | 'gap'; id?: string; top: number; h: number }

type CheckSlotNode = { kind: string; row?: { id?: unknown } | null }

/** Checkbox rail from the virtual window — no per-row offsetTop on scroll. */
export function tableCheckSlots(
  nodes: CheckSlotNode[],
  window: TableWindowSlice,
  rowPx: number,
  headPx = TABLE_ROW_PX,
): TableCheckSlot[] {
  const h = Math.max(1, Math.round(rowPx))
  const headH = Math.max(1, Math.round(headPx))
  const slots: TableCheckSlot[] = [{ kind: 'head', top: 0, h: headH }]
  let y = headH
  if (window.padTop > 0) {
    slots.push({ kind: 'gap', top: y, h: window.padTop })
    y += window.padTop
  }
  for (let i = window.start; i < window.end; i += 1) {
    const node = nodes[i]
    const id = node?.kind === 'row' ? String(node.row?.id ?? '').trim() : ''
    if (id) slots.push({ kind: 'row', id, top: y, h })
    else slots.push({ kind: 'gap', top: y, h })
    y += h
  }
  if (window.padBottom > 0) slots.push({ kind: 'gap', top: y, h: window.padBottom })
  return slots
}

type ReusePaintNode = {
  kind: string
  key: string
  row?: unknown
  depth?: number
  hasKids?: boolean
  kidCount?: number
  groupKey?: string
  label?: string
  count?: number
  pageIndex?: number
}

function samePaintNode(prev: ReusePaintNode, next: ReusePaintNode) {
  if (prev === next) return true
  if (prev.kind !== next.kind || prev.key !== next.key) return false
  if (prev.kind === 'row') {
    return prev.row === next.row && prev.depth === next.depth && prev.hasKids === next.hasKids && prev.kidCount === next.kidCount
  }
  if (prev.kind === 'group-head') return prev.groupKey === next.groupKey && prev.label === next.label && prev.count === next.count
  if (prev.kind === 'group-pager') return prev.groupKey === next.groupKey && prev.count === next.count && prev.pageIndex === next.pageIndex
  return true
}

/** Keep node object identity when row/group payloads did not change. */
export function reusePaintNodes<T extends ReusePaintNode>(prev: T[] | undefined, next: T[]): T[] {
  if (!prev?.length || prev === next) return next
  let changed = prev.length !== next.length
  const out = next.map((node, i) => {
    const old = prev[i]
    if (old && samePaintNode(old, node)) return old
    changed = true
    return node
  })
  return changed ? out : prev
}

/** 标签等分组超过 8 个时也要首屏按页大小拉齐，不能只探第一条。 */
export const GROUPED_FULL_FETCH_ALL_MAX = 8

/** 每个组都拉一页行。limit=1 只拿总数会把行丢掉，要等滚动或 20s 轮询才补，硬刷新分组会空。 */
export function groupedFullFetchCount(
  _pageSize: number,
  groupCount: number,
  _wrap?: boolean,
  _viewportH = TABLE_WINDOW_VIEWPORT_FALLBACK,
) {
  return Math.max(0, groupCount)
}
