import { useLayoutEffect, type RefObject } from 'react'

function readProgress(scroller: Element, el: HTMLElement) {
  const max = scroller.scrollHeight - scroller.clientHeight
  const p = max <= 0 ? 0 : Math.min(1, Math.max(0, scroller.scrollTop / max))
  el.style.setProperty('--page-read', String(p))
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
    const onScroll = () => {
      if (scroller) readProgress(scroller, el)
    }
    onScroll()
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' || !scroller ? null : new ResizeObserver(onScroll)
    ro?.observe(scroller)
    const inner = scroller.firstElementChild
    if (inner) ro.observe(inner)
    return () => {
      io.disconnect()
      ro?.disconnect()
      scroller?.removeEventListener('scroll', onScroll)
      mark.remove()
      el.classList.remove('is-stuck')
      el.style.removeProperty('--page-read')
    }
  }, [ref])
}
