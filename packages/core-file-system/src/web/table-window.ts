export const TABLE_ROW_PX = 37
export const TABLE_WRAP_ROW_PX = 96
export const TABLE_WINDOW_OVERSCAN = 4
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
