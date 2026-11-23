import { useLayoutEffect, type RefObject } from 'react'
import { bindPageRead, supportsScrollDrivenProgress } from '@biu/core-file-system/page-read'

export function useStickyToolbar(ref: RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const mark = document.createElement('i')
    mark.setAttribute('data-fsdb-stick-mark', '')
    mark.setAttribute('aria-hidden', 'true')
    mark.style.cssText = 'display:block;height:1px;margin:0 0 -1px;padding:0;border:0;pointer-events:none;visibility:hidden'
    el.before(mark)
    const root = el.closest('.fsdb-right-body')
    const scroller = root instanceof HTMLElement ? root : null
    const io = new IntersectionObserver(
      ([entry]) => {
        el.classList.toggle('is-stuck', Boolean(entry) && !entry.isIntersecting)
      },
      { root: scroller, threshold: 0 },
    )
    io.observe(mark)
    const nativeCss = supportsScrollDrivenProgress()
    const read = !nativeCss && scroller ? bindPageRead(scroller, el, requestAnimationFrame, cancelAnimationFrame) : null
    const onScroll = () => read?.poke()
    let ro: ResizeObserver | null = null
    if (read && scroller) {
      onScroll()
      scroller.addEventListener('scroll', onScroll, { passive: true })
      ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onScroll)
      if (ro) {
        ro.observe(scroller)
        const inner = scroller.firstElementChild
        if (inner) ro.observe(inner)
      }
    }
    return () => {
      io.disconnect()
      ro?.disconnect()
      read?.stop()
      if (read && scroller) scroller.removeEventListener('scroll', onScroll)
      mark.remove()
      el.classList.remove('is-stuck')
      el.style.removeProperty('--page-read')
    }
  }, [ref])
}
