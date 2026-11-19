import { useLayoutEffect, type RefObject } from 'react'
import { bindPageRead } from './page-read.ts'

export function stickyHeadOffset(desired: number, tableTop: number, tableH: number, headH: number) {
  const max = Math.max(0, tableH - headH)
  return Math.round(Math.min(Math.max(0, desired - tableTop), max))
}

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
    const read = scroller ? bindPageRead(scroller, el, requestAnimationFrame, cancelAnimationFrame) : null
    const onScroll = () => read?.poke()
    onScroll()
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' || !scroller ? null : new ResizeObserver(onScroll)
    ro?.observe(scroller)
    const inner = scroller?.firstElementChild
    if (inner) ro?.observe(inner)
    const wrap = el.parentElement?.querySelector('.tasks-table-wrap')
    const mo = wrap ? new MutationObserver(onScroll) : null
    if (wrap instanceof Element) mo?.observe(wrap, { childList: true })
    return () => {
      io.disconnect()
      ro?.disconnect()
      mo?.disconnect()
      read?.stop()
      scroller?.removeEventListener('scroll', onScroll)
      mark.remove()
      el.classList.remove('is-stuck')
      el.style.removeProperty('--page-read')
    }
  }, [ref])
}
