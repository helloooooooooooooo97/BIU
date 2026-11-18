import { visiblePickBox } from './resolve.ts'

const EDGE = 48
const MAX_STEP = 28

/** Use the pane where the drag began, rather than whichever pane is under the pointer later. */
export function pickDragScroller(path: EventTarget[]) {
  for (const node of path) {
    if (!(node instanceof HTMLElement) || node.scrollHeight <= node.clientHeight) continue
    const style = getComputedStyle(node)
    if (/auto|scroll|overlay/.test(style.overflowY || style.overflow)) return node
  }
  const page = document.scrollingElement
  return page instanceof HTMLElement && page.scrollHeight > page.clientHeight ? page : null
}

export function pickDragScrollStep(scroller: HTMLElement, point: { x: number; y: number }) {
  const visible = visiblePickBox(scroller)
  if (!visible) return 0
  const left = Math.max(0, visible.left)
  const right = Math.min(window.innerWidth, visible.left + visible.width)
  let top = Math.max(0, visible.top)
  let bottom = Math.min(window.innerHeight, visible.top + visible.height)
  if (scroller === document.scrollingElement) {
    top = 0
    bottom = window.innerHeight
  }
  if (point.x < left || point.x > right) return 0
  // Sticky table tools and the chat dock reduce the usable selection viewport.
  const head = scroller.querySelector('.tasks-toolbar')?.getBoundingClientRect()
  if (head && head.bottom > top && head.top <= top + EDGE) top = head.bottom
  const dock = document.querySelector('[data-testid="chat-overlay-panel"]')?.getBoundingClientRect()
  if (dock && dock.height > 0 && dock.right > left && dock.left < right && dock.top > top && dock.top < bottom) bottom = dock.top
  const edge = Math.min(EDGE, (bottom - top) / 3)
  if (edge <= 0) return 0
  const proximity = point.y < top + edge
    ? -Math.min(1, (top + edge - point.y) / edge)
    : point.y > bottom - edge
      ? Math.min(1, (point.y - bottom + edge) / edge)
      : 0
  if (!proximity) return 0
  const delta = Math.sign(proximity) * Math.max(2, Math.abs(proximity) * MAX_STEP)
  const before = scroller.scrollTop
  scroller.scrollTop = Math.max(0, Math.min(scroller.scrollHeight - scroller.clientHeight, before + delta))
  return scroller.scrollTop - before
}

/** Keep scrolling with a stationary pointer at an edge; stop as soon as the pane hits its limit. */
export function bindPickDragScroll(scroller: HTMLElement, onScroll: () => void) {
  let raf = 0
  let point = { x: 0, y: 0 }
  const tick = () => {
    raf = 0
    if (!scroller.isConnected || !pickDragScrollStep(scroller, point)) return
    onScroll()
    raf = requestAnimationFrame(tick)
  }
  return {
    update(next: { x: number; y: number }) {
      point = next
      if (!raf) raf = requestAnimationFrame(tick)
    },
    stop() {
      if (raf) cancelAnimationFrame(raf)
      raf = 0
    },
  }
}
