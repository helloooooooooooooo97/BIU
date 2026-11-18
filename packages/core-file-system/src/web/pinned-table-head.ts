import { useEffect, useState, type RefObject } from 'react'
export type PinnedHeadLayout = { host: HTMLElement; width: number; tableWidth: number }

export function usePinnedTableHead(tableRef: RefObject<HTMLTableElement | null>, wrapRef: RefObject<HTMLDivElement | null>) {
  const [layout, setLayout] = useState<PinnedHeadLayout | null>(null)
  useEffect(() => {
    const table = tableRef.current, wrap = wrapRef.current
    const toolbar = wrap?.closest('.fsdb-main')?.querySelector<HTMLElement>(':scope > .tasks-toolbar')
    const page = wrap?.closest<HTMLElement>('.fsdb-right-body')
    if (!table || !wrap || !toolbar || !page) return
    const host = document.createElement('div'); host.className = 'fsdb-pinned-head-host'; toolbar.append(host)
    let pinned = false, frame = 0
    let start = Infinity, end = Infinity
    let cached: PinnedHeadLayout | null = null
    const update = () => {
      // Scroll position only: geometry reads are restricted to resize/content changes.
      const next = page.scrollTop > start && page.scrollTop < end
      if (next === pinned) return
      pinned = next
      wrap.classList.toggle('has-docked-head', next)
      if (next) table.tHead?.setAttribute('aria-hidden', 'true')
      else table.tHead?.removeAttribute('aria-hidden')
      setLayout(next ? cached : null)
    }
    const measure = () => {
      frame = 0
      const rect = table.getBoundingClientRect(), pageRect = page.getBoundingClientRect(), bounds = wrap.getBoundingClientRect()
      const toolbarRect = toolbar.getBoundingClientRect(), height = table.tHead?.offsetHeight ?? 0
      const top = rect.top - pageRect.top - page.clientTop + page.scrollTop
      start = height ? top - toolbar.offsetHeight - 10 : Infinity
      end = top + rect.height - toolbar.offsetHeight - 10 - height
      cached = { host, width: wrap.clientWidth, tableWidth: rect.width }
      host.style.setProperty('--fsdb-docked-left', `${bounds.left - toolbarRect.left - toolbar.clientLeft}px`)
      if (pinned) setLayout((prev) => prev?.width === cached!.width && prev.tableWidth === cached!.tableWidth ? prev : cached)
      update()
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    const syncX = () => {
      const viewport = host.querySelector<HTMLElement>('.fsdb-pinned-head-viewport')
      if (viewport && viewport.scrollLeft !== wrap.scrollLeft) viewport.scrollLeft = wrap.scrollLeft
    }
    const observer = new ResizeObserver(schedule)
    for (const node of [page, wrap, table, toolbar, table.tHead, page.querySelector(':scope > .app-pane-in')]) if (node) observer.observe(node)
    const mutation = new MutationObserver(schedule); mutation.observe(table, { childList: true, subtree: true, attributes: true, attributeFilter: ['style'] })
    page.addEventListener('scroll', update, { passive: true }); page.addEventListener('animationend', schedule)
    wrap.addEventListener('scroll', syncX, { passive: true }); measure()
    return () => {
      cancelAnimationFrame(frame); observer.disconnect(); mutation.disconnect()
      page.removeEventListener('scroll', update); page.removeEventListener('animationend', schedule); wrap.removeEventListener('scroll', syncX)
      wrap.classList.remove('has-docked-head'); table.tHead?.removeAttribute('aria-hidden'); host.remove()
    }
  }, [tableRef, wrapRef])
  return layout
}
