import { useLayoutEffect, type RefObject } from 'react'

export function stickyHeadOffset(desired: number, tableTop: number, tableH: number, headH: number) {
  const max = Math.max(0, tableH - headH)
  return Math.round(Math.min(Math.max(0, desired - tableTop), max))
}

function readProgress(scroller: Element, el: HTMLElement) {
  const max = scroller.scrollHeight - scroller.clientHeight
  const p = max <= 0 ? 0 : Math.min(1, Math.max(0, scroller.scrollTop / max))
  el.style.setProperty('--page-read', String(p))
}

function readPinY(node: HTMLElement) {
  const raw = node.style.transform.match(/translateY\(([-\d.]+)px\)/)
  return raw ? Number(raw[1]) : 0
}

function writePin(node: HTMLElement, y: number, pin: boolean) {
  const next = pin ? y : 0
  const was = node.classList.contains('is-pinned')
  if (was === pin && Math.abs(readPinY(node) - next) < 1) return
  node.style.transform = pin ? `translateY(${next}px)` : ''
  node.classList.toggle('is-pinned', pin)
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
  const bulk = wrap?.querySelector('.fsdb-bulk-slot')
  if (!(table instanceof HTMLTableElement) || !thead) {
    clearPin(thead)
    if (checkHead instanceof HTMLElement) clearPin(checkHead)
    if (bulk instanceof HTMLElement) clearPin(bulk)
    return
  }
  const desired = toolbar.getBoundingClientRect().bottom + 10
  const y = stickyHeadOffset(desired, table.getBoundingClientRect().top, table.offsetHeight, thead.offsetHeight)
  const pin = y > 0
  writePin(thead, y, pin)
  if (checkHead instanceof HTMLElement) writePin(checkHead, y, pin)
  if (bulk instanceof HTMLElement) {
    const cell = wrap.querySelector('th.is-pin-col, th[data-col-key="title"]')
    const label = cell instanceof HTMLElement ? cell.querySelector('.tasks-th') : null
    const pad = cell instanceof HTMLElement ? Number.parseFloat(getComputedStyle(cell).paddingLeft) || 0 : 0
    const gap = label instanceof HTMLElement ? Number.parseFloat(getComputedStyle(label).gap) || 5 : 5
    const labelW = label instanceof HTMLElement ? label.offsetWidth : 0
    const shift = Math.round(pad + labelW + gap)
    bulk.style.setProperty('--fsdb-bulk-shift', `${shift}px`)
    bulk.style.setProperty('--fsdb-head-h', `${Math.round(thead.offsetHeight)}px`)
    writePin(bulk, y, pin)
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
    let raf = 0
    const onScroll = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        if (scroller) readProgress(scroller, el)
        pinCollectionHead(el)
      })
    }
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
      if (raf) cancelAnimationFrame(raf)
      scroller?.removeEventListener('scroll', onScroll)
      mark.remove()
      el.classList.remove('is-stuck')
      el.style.removeProperty('--page-read')
      clearPin(wrap?.querySelector('thead'))
      const checkHead = wrap?.querySelector('.fsdb-check-slot.is-head')
      if (checkHead instanceof HTMLElement) clearPin(checkHead)
      const bulk = wrap?.querySelector('.fsdb-bulk-slot')
      if (bulk instanceof HTMLElement) clearPin(bulk)
    }
  }, [ref])
}
