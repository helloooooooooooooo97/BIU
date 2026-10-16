export const TABLE_ROW_PX = 37
export const TABLE_WRAP_ROW_PX = 96
export const TABLE_WINDOW_OVERSCAN = 4
export const TABLE_WINDOW_VIEWPORT_FALLBACK = 560
export const TABLE_COL_PX = 72
export const TABLE_COL_PIN_PX = 140
export const TABLE_COL_OVERSCAN = 1
export const TABLE_COL_VIEWPORT_FALLBACK = 624

export type TableWindowSlice = {
  start: number
  end: number
  padTop: number
  padBottom: number
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
  const start = Math.max(0, Math.floor(Math.max(0, scrollTop) / rowPx) - overscan)
  const visible = Math.ceil(view / rowPx) + overscan * 2
  const end = Math.min(count, start + Math.max(visible, 1))
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

export function tableColumnWidth(px: unknown, pin = false) {
  const n = typeof px === 'number' ? px : Number(px)
  if (Number.isFinite(n) && n > 0) return Math.round(n)
  return pin ? TABLE_COL_PIN_PX : TABLE_COL_PX
}

/** Saved width if present; otherwise a kind-ish first-paint estimate so table-layout:fixed does not clip 创建人. */
export function tableColumnEstimate(key: string, saved: unknown, pin = false) {
  const n = typeof saved === 'number' ? saved : Number(saved)
  if (Number.isFinite(n) && n > 0) return Math.round(n)
  if (pin) return TABLE_COL_PIN_PX
  if (key === 'createdBy' || key === 'updatedBy' || key === 'assignee') return 120
  if (key === 'updatedAt' || key === 'createdAt' || key === 'dueAt') return 130
  if (key === 'shareScope' || key === 'shareRole') return 64
  if (key === 'actions') return 62
  return TABLE_COL_PX
}

/** If every column almost fits, shrink them onto the wrap so the last col is not a 70px scroll away. */
export function tableColumnFit(widths: number[], viewportW: number) {
  const view = viewportW > 0 ? viewportW : TABLE_COL_VIEWPORT_FALLBACK
  let sum = 0
  for (const w of widths) sum += w
  if (sum <= 0 || sum <= view || sum > view + 120) return widths
  const scale = view / sum
  return widths.map((w) => Math.max(56, Math.round(w * scale)))
}

/** 首屏只画钉住列 + 视口里的列；左右用空 td 垫宽度，横滑再补。 */
export function tableColumnSlice(
  count: number,
  pinCount: number,
  scrollLeft: number,
  viewportW: number,
  widths: number[],
): TableColumnSlice {
  const pin = Math.min(Math.max(0, pinCount), Math.max(0, count))
  if (count <= 0) return { start: 0, end: 0, pin: 0, padLeft: 0, padRight: 0 }
  const view = viewportW > 0 ? viewportW : TABLE_COL_VIEWPORT_FALLBACK
  const left = Math.max(0, scrollLeft)
  const right = left + view
  const widthAt = (i: number) => {
    const n = widths[i]
    if (Number.isFinite(n) && n > 0) return n
    return i < pin ? TABLE_COL_PIN_PX : TABLE_COL_PX
  }
  const starts = new Array<number>(count)
  let x = 0
  for (let i = 0; i < count; i += 1) {
    starts[i] = x
    x += widthAt(i)
  }
  let start = pin
  for (let i = pin; i < count; i += 1) {
    if (starts[i]! + widthAt(i) > left) {
      start = i
      break
    }
    start = i + 1
  }
  start = Math.max(pin, start - TABLE_COL_OVERSCAN)
  let end = count
  for (let i = start; i < count; i += 1) {
    if (starts[i]! >= right) {
      end = i
      break
    }
  }
  end = Math.min(count, Math.max(start, end) + TABLE_COL_OVERSCAN)
  let padLeft = 0
  for (let i = pin; i < start; i += 1) padLeft += widthAt(i)
  let padRight = 0
  for (let i = end; i < count; i += 1) padRight += widthAt(i)
  return { start, end, pin, padLeft, padRight }
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

/** 一页已经超过一屏时，首屏只拉进入视口的组；其余组先拿总数。 */
export function groupedFullFetchCount(
  pageSize: number,
  groupCount: number,
  wrap?: boolean,
  viewportH = TABLE_WINDOW_VIEWPORT_FALLBACK,
) {
  if (groupCount <= 1) return Math.max(0, groupCount)
  const rowPx = wrap ? TABLE_WRAP_ROW_PX : TABLE_ROW_PX
  const view = viewportH > 0 ? viewportH : TABLE_WINDOW_VIEWPORT_FALLBACK
  const paintRows = Math.ceil(view / rowPx) + TABLE_WINDOW_OVERSCAN * 2
  if (pageSize <= paintRows) return groupCount
  return 1
}
