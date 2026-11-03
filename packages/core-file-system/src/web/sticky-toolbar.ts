import { useLayoutEffect, type RefObject } from 'react'

function readProgress(scroller: Element, el: HTMLElement) {
  const max = scroller.scrollHeight - scroller.clientHeight
  const p = max <= 0 ? 0 : Math.min(1, Math.max(0, scroller.scrollTop / max))
  el.style.setProperty('--page-read', String(p))
}

function clearPin(node: HTMLElement | null | undefined) {
  if (!node) return
  node.style.removeProperty('transform')
  node.classList.remove('is-pinned')
}

/** 集合表格：操作栏贴顶时表头跟在栏下。页面详情不处理。 */
function pinCollectionHead(toolbar: HTMLElement) {
  const main = toolbar.parentElement
  const wrap = main?.classList.contains('fsdb-main') ? main.querySelector('.tasks-table-wrap') : null
  const table = wrap?.querySelector('.tasks-table')
  const thead = table instanceof HTMLTableElement ? table.tHead : null
  const checkHead = wrap?.querySelector('.fsdb-check-slot.is-head')
  if (!(table instanceof HTMLTableElement) || !thead) {
    clearPin(thead)
    if (checkHead instanceof HTMLElement) clearPin(checkHead)
    return
  }
  const desired = toolbar.getBoundingClientRect().bottom + 10
  const y = Math.min(Math.max(0, desired - table.getBoundingClientRect().top), Math.max(0, table.offsetHeight - thead.offsetHeight))
  const pin = y > 0.5
  thead.style.transform = pin ? `translateY(${y}px)` : ''
  thead.classList.toggle('is-pinned', pin)
  if (checkHead instanceof HTMLElement) {
    checkHead.style.transform = pin ? `translateY(${y}px)` : ''
    checkHead.classList.toggle('is-pinned', pin)
  }
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
      pinCollectionHead(el)
    }
    onScroll()
    scroller?.addEventListener('scroll', onScroll, { passive: true })
    const ro = typeof ResizeObserver === 'undefined' || !scroller ? null : new ResizeObserver(onScroll)
    ro?.observe(scroller)
    const inner = scroller?.firstElementChild
    if (inner) ro?.observe(inner)
    return () => {
      io.disconnect()
      ro?.disconnect()
      scroller?.removeEventListener('scroll', onScroll)
      mark.remove()
      el.classList.remove('is-stuck')
      el.style.removeProperty('--page-read')
      const wrap = el.parentElement?.querySelector('.tasks-table-wrap')
      clearPin(wrap?.querySelector('thead'))
      const checkHead = wrap?.querySelector('.fsdb-check-slot.is-head')
      if (checkHead instanceof HTMLElement) clearPin(checkHead)
    }
  }, [ref])
}
