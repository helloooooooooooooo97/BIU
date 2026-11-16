export const TABLE_DRAG_SCROLL_EDGE = 48
export const TABLE_DRAG_SCROLL_MAX = 28

export function tableVertScroller(from: HTMLElement | null) {
  if (!from) return null
  return (from.closest('.fsdb-right-body') as HTMLElement | null) ?? (from.closest('.tasks-table-wrap') as HTMLElement | null)
}

export function tableDragScrollBand(
  scroller: { top: number; bottom: number },
  headBottom?: number,
  overlayTop?: number,
) {
  const top = Number.isFinite(headBottom) ? Math.max(scroller.top, headBottom as number) : scroller.top
  const bottom = Number.isFinite(overlayTop) ? Math.min(scroller.bottom, overlayTop as number) : scroller.bottom
  return { top, bottom }
}

/** 光标贴上看见的上/下沿时，返回要滚的像素（上负下正）。 */
export function tableDragScrollDelta(
  clientY: number,
  band: { top: number; bottom: number },
  edge = TABLE_DRAG_SCROLL_EDGE,
) {
  if (band.bottom - band.top < edge * 2) return 0
  if (clientY <= band.top + edge) {
    const t = Math.min(1, Math.max(0, (band.top + edge - clientY) / edge))
    return -Math.max(2, t * TABLE_DRAG_SCROLL_MAX)
  }
  if (clientY >= band.bottom - edge) {
    const t = Math.min(1, Math.max(0, (clientY - (band.bottom - edge)) / edge))
    return Math.max(2, t * TABLE_DRAG_SCROLL_MAX)
  }
  return 0
}

export function caretAtPoint(x: number, y: number) {
  const doc = document as Document & {
    caretRangeFromPoint?: (x: number, y: number) => Range | null
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  }
  if (typeof doc.caretRangeFromPoint === 'function') {
    const range = doc.caretRangeFromPoint(x, y)
    if (range) return { node: range.startContainer, offset: range.startOffset }
  }
  const pos = doc.caretPositionFromPoint?.(x, y)
  if (pos) return { node: pos.offsetNode, offset: pos.offset }
  return null
}

export function extendTextSelectionToPoint(x: number, y: number) {
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return
  const hit = caretAtPoint(x, y)
  if (!hit) return
  try {
    sel.extend(hit.node, hit.offset)
  } catch {
    /* 节点已卸载时忽略 */
  }
}

export function runTableDragScrollStep(opts: {
  scroller: HTMLElement
  clientX: number
  clientY: number
  headBottom?: number
  overlayTop?: number
  selectText?: boolean
}) {
  const band = tableDragScrollBand(opts.scroller.getBoundingClientRect(), opts.headBottom, opts.overlayTop)
  const dy = tableDragScrollDelta(opts.clientY, band)
  if (!dy) return 0
  opts.scroller.scrollTop += dy
  if (opts.selectText !== false) extendTextSelectionToPoint(opts.clientX, opts.clientY)
  return dy
}

export function bindTableDragScroll(opts: {
  scroller: () => HTMLElement | null
  headBottom?: () => number | undefined
  overlayTop?: () => number | undefined
  origin: { x: number; y: number }
  dragPx?: number
  selectText?: boolean
  onArmed?: () => void
  onDrag?: (ptr: { x: number; y: number }) => void
  onEnd?: () => void
}) {
  let raf = 0
  let ptr = { x: opts.origin.x, y: opts.origin.y }
  let dragged = false
  const dragPx = opts.dragPx ?? 6

  const stop = () => {
    if (raf) cancelAnimationFrame(raf)
    raf = 0
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', stop)
    window.removeEventListener('pointercancel', stop)
    if (dragged) opts.onEnd?.()
  }

  const tick = () => {
    raf = 0
    const scroller = opts.scroller()
    if (!scroller) return
    const dy = runTableDragScrollStep({
      scroller,
      clientX: ptr.x,
      clientY: ptr.y,
      headBottom: opts.headBottom?.(),
      overlayTop: opts.overlayTop?.(),
      selectText: opts.selectText,
    })
    if (dy) {
      opts.onDrag?.(ptr)
      raf = requestAnimationFrame(tick)
    }
  }

  const onMove = (event: PointerEvent) => {
    if (event.buttons === 0) {
      stop()
      return
    }
    ptr = { x: event.clientX, y: event.clientY }
    if (!dragged) {
      if (Math.hypot(ptr.x - opts.origin.x, ptr.y - opts.origin.y) < dragPx) return
      dragged = true
      opts.onArmed?.()
    }
    opts.onDrag?.(ptr)
    if (!raf) raf = requestAnimationFrame(tick)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', stop)
  window.addEventListener('pointercancel', stop)
  return stop
}
