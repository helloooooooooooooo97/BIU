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

/** 有手动值用手动值；否则钉住列 / 操作列 / 其余列各一个固定默认宽，不随视口缩放。 */
export function tableColumnWidth(key: string, saved: unknown, pin = false) {
  const n = typeof saved === 'number' ? saved : Number(saved)
  if (Number.isFinite(n) && n > 0) return Math.round(n)
  if (pin) return TABLE_COL_PIN_PX
  if (key === 'actions') return TABLE_COL_ACTIONS_PX
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

/** shareScope 这类少量枚举组必须首屏一次拉齐，否则「共享」先画出计数再补行会闪。 */
export const GROUPED_FULL_FETCH_ALL_MAX = 8

/** 一页已经超过一屏时，首屏只拉进入视口的组；其余组先拿总数。 */
export function groupedFullFetchCount(
  pageSize: number,
  groupCount: number,
  wrap?: boolean,
  viewportH = TABLE_WINDOW_VIEWPORT_FALLBACK,
) {
  if (groupCount <= 1) return Math.max(0, groupCount)
  if (groupCount <= GROUPED_FULL_FETCH_ALL_MAX) return groupCount
  const rowPx = wrap ? TABLE_WRAP_ROW_PX : TABLE_ROW_PX
  const view = viewportH > 0 ? viewportH : TABLE_WINDOW_VIEWPORT_FALLBACK
  const paintRows = Math.ceil(view / rowPx) + TABLE_WINDOW_OVERSCAN * 2
  if (pageSize <= paintRows) return groupCount
  return 1
}
