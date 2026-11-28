export const TABLE_ROW_PX = 32
export const TABLE_WRAP_ROW_PX = 96
export const TABLE_WINDOW_OVERSCAN = 4
/** 虚拟表格实际视口上下预渲染行数：参考 AG Grid rowBuffer（>=10），32px 行高下采用 12 行（384px）基线缓冲，快滑方向同步扩展至 20 行（640px）。 */
export const TABLE_VIEWPORT_OVERSCAN = 12
export const TABLE_WINDOW_VIEWPORT_FALLBACK = 560
export const TABLE_COL_PX = 120
export const TABLE_COL_PIN_PX = 240
export const TABLE_COL_ACTIONS_PX = 148
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

/** 冻结最左侧连续列：支持冻结标题列或冻结至任意指定列（freezeUntil）。 */
export function tablePinCount(
  keys: string[],
  labelField?: string | null,
  freezeTitle = false,
  freezeUntil?: string | null,
) {
  const target = String(freezeUntil ?? '').trim() || (freezeTitle ? String(labelField ?? '').trim() : '')
  if (!target) return 0
  const idx = keys.indexOf(target)
  return idx >= 0 ? idx + 1 : 0
}

export function tablePinColClass(key: string, labelField?: string | null, freezeTitle = false) {
  return freezeTitle && key === labelField ? 'is-pin-col' : ''
}

export type PinnedColOffset = {
  left: number
  isEdge: boolean
}

export function tablePinColOffsets(
  keys: string[],
  columnWidths: Record<string, number>,
  pinCount: number,
  labelField?: string | null,
): Map<string, PinnedColOffset> {
  const map = new Map<string, PinnedColOffset>()
  if (pinCount <= 0) return map
  let left = 0
  const limit = Math.min(pinCount, keys.length)
  for (let i = 0; i < limit; i += 1) {
    const key = keys[i]!
    map.set(key, { left, isEdge: i === limit - 1 })
    left += tableColumnWidth(key, columnWidths[key], key === labelField)
  }
  return map
}

/** 将任意列 key 编码为安全的 ASCII CSS 自定义属性名，用于 AG Grid 风格弹性列宽 60fps 零重绘缩放。 */
export function tableColWidthVar(key: string) {
  let out = '--fsdb-cw-'
  for (let i = 0; i < key.length; i += 1) {
    const ch = key[i]!
    const code = ch.charCodeAt(0)
    if ((code >= 48 && code <= 57) || (code >= 65 && code <= 90) || (code >= 97 && code <= 122) || code === 45 || code === 95) {
      out += ch
    } else {
      out += `_${code.toString(16)}_`
    }
  }
  return out
}

/** 有手动值用手动值；否则钉住列 / 操作列 / 其余列各一个固定默认宽，不随视口缩放。 */
export function tableColumnWidth(key: string, saved: unknown, pin = false) {
  const n = typeof saved === 'number' ? saved : Number(saved)
  if (Number.isFinite(n) && n > 0) return Math.round(n)
  if (key === '__rowNumber') return 44
  if (key === 'actions') return TABLE_COL_ACTIONS_PX
  if (pin) return TABLE_COL_PIN_PX
  return TABLE_COL_PX
}

/** Frozen columns plus the visible horizontal range and one-column overscan. */
export function tableColumnSlice(
  count: number,
  pinCount: number,
  scrollLeft = 0,
  viewportW = TABLE_COL_VIEWPORT_FALLBACK,
  widths: number[] = [],
): TableColumnSlice {
  const pin = Math.min(Math.max(0, pinCount), Math.max(0, count))
  if (count <= 0) return { start: 0, end: 0, pin: 0, padLeft: 0, padRight: 0 }
  const offsets = [0]
  for (let i = 0; i < count; i += 1) offsets.push(offsets[i]! + (widths[i] && widths[i]! > 0 ? widths[i]! : TABLE_COL_PX))
  const left = Math.max(0, scrollLeft) + offsets[pin]!
  const right = Math.max(left, Math.max(0, scrollLeft) + (viewportW > 0 ? viewportW : TABLE_COL_VIEWPORT_FALLBACK))
  let start = pin
  while (start < count && offsets[start + 1]! <= left) start += 1
  let end = start
  while (end < count && offsets[end]! < right) end += 1
  start = Math.max(pin, Math.min(count, start) - TABLE_COL_OVERSCAN)
  end = Math.min(count, Math.max(start + 1, end + TABLE_COL_OVERSCAN))
  return { start, end, pin, padLeft: offsets[start]! - offsets[pin]!, padRight: offsets[count]! - offsets[end]! }
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
