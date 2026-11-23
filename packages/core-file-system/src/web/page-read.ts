/** 小于半个百分点的进度变化肉眼看不出，不必写回工具栏。 */
export const PAGE_READ_STEP = 0.005

/** Chromium 原生支持 CSS Scroll-Driven Animation 时，进度条完全交给 GPU 合成器线程，跳过 JS 滚动/尺寸监听。 */
export function supportsScrollDrivenProgress() {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('animation-timeline: scroll()')
}

export function pageReadRatio(scrollTop: number, scrollHeight: number, clientHeight: number) {
  const max = scrollHeight - clientHeight
  if (max <= 0) return 0
  return Math.min(1, Math.max(0, scrollTop / max))
}

export function bindPageRead(
  scroller: Element,
  el: HTMLElement,
  schedule: (cb: () => void) => number,
  cancel: (id: number) => void,
) {
  let frame = 0
  let painted = -1
  const flush = () => {
    frame = 0
    const next = pageReadRatio(scroller.scrollTop, scroller.scrollHeight, scroller.clientHeight)
    if (painted >= 0 && Math.abs(next - painted) < PAGE_READ_STEP) return
    painted = next
    el.style.setProperty('--page-read', String(next))
  }
  return {
    poke() {
      if (frame) return
      frame = schedule(flush)
    },
    stop() {
      if (!frame) return
      cancel(frame)
      frame = 0
    },
  }
}
