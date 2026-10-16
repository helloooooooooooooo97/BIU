export const TABLE_ROW_PX = 37
export const TABLE_WINDOW_OVERSCAN = 10
export const TABLE_WINDOW_VIEWPORT_FALLBACK = 960

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
