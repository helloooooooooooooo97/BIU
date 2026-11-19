import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { TABLE_COL_VIEWPORT_FALLBACK, tableColumnSlice } from './table-window.ts'

export function useTableColumnViewport(options: {
  keys: string[]; widths: number[]; pinCount: number; resetKey: string; wrapCells: boolean
  tableRef: RefObject<HTMLTableElement | null>; wrapRef: RefObject<HTMLDivElement | null>
  retainedKey?: string | null; resizingKey?: string | null; preserveMounted?: boolean
}) {
  // Start conservatively wide until the parent-owned wrap ref is available; never expose a first-frame spacer.
  const [viewport, setViewport] = useState(() => ({ left: 0, width: typeof window === 'undefined' ? TABLE_COL_VIEWPORT_FALLBACK : window.innerWidth }))
  const actualViewport = useRef(viewport)
  const [interacted, setInteracted] = useState<string | null>(null)
  const offsets = useMemo(() => {
    const values = [0]
    for (const width of options.widths) values.push(values[values.length - 1]! + width)
    return values
  }, [options.widths])
  const current = useRef(options); current.current = options
  useEffect(() => {
    const wrap = options.wrapRef.current, table = options.tableRef.current
    if (!wrap || !table) return
    let width = 0
    const read = () => {
      const gutter = parseFloat(getComputedStyle(wrap).getPropertyValue('--fsdb-check-gutter')) || 0
      width = Math.max(1, wrap.clientWidth - gutter)
      scroll()
    }
    const scroll = () => {
      if (wrap.scrollTop) wrap.scrollTop = 0
      const next = { left: wrap.scrollLeft, width }
      actualViewport.current = next
      setViewport((prev) => {
        const model = current.current
        const before = tableColumnSlice(model.keys.length, model.pinCount, prev.left, prev.width, model.widths)
        const after = tableColumnSlice(model.keys.length, model.pinCount, next.left, next.width, model.widths)
        return prev.width === next.width && before.start === after.start && before.end === after.end ? prev : next
      })
    }
    const retain = (event: Event) => {
      const target = event.target
      if (target instanceof Element && table.contains(target)) setInteracted(target.closest<HTMLElement>('td[data-col-key]')?.dataset.colKey ?? null)
    }
    const observer = new ResizeObserver(read)
    observer.observe(wrap)
    wrap.addEventListener('scroll', scroll, { passive: true })
    table.addEventListener('pointerdown', retain, true)
    table.addEventListener('focusin', retain)
    read()
    return () => {
      observer.disconnect(); wrap.removeEventListener('scroll', scroll)
      table.removeEventListener('pointerdown', retain, true); table.removeEventListener('focusin', retain)
    }
  }, [options.tableRef, options.wrapRef])
  useEffect(() => { setInteracted(null) }, [options.resetKey])
  const slice = useMemo(() => {
    // Auto-height wrapped rows need every column to determine their full natural height.
    if (options.wrapCells) {
      return { pin: options.pinCount, start: options.pinCount, end: options.keys.length, padLeft: 0, padRight: 0 }
    }
    const actual = actualViewport.current
    const next = tableColumnSlice(options.keys.length, options.pinCount, actual.left, actual.width, options.widths)
    const retained = [options.retainedKey, options.resizingKey, options.preserveMounted ? interacted : null]
    for (const key of retained) {
      const index = key ? options.keys.indexOf(key) : -1
      if (index < next.pin) continue
      next.start = Math.min(next.start, index)
      next.end = Math.max(next.end, index + 1)
    }
    next.padLeft = offsets[next.start]! - offsets[next.pin]!
    next.padRight = offsets[options.keys.length]! - offsets[next.end]!
    return next
  }, [options.keys, options.widths, options.pinCount, options.wrapCells, options.retainedKey, options.resizingKey, options.preserveMounted, interacted, offsets, viewport])
  const revealColumn = useCallback((key: string) => {
    const model = current.current, wrap = model.wrapRef.current
    const index = model.keys.indexOf(key)
    if (!wrap || index < model.pinCount) return
    const prefix = model.widths.slice(0, index).reduce((sum, width) => sum + width, 0)
    const pinned = model.widths.slice(0, model.pinCount).reduce((sum, width) => sum + width, 0)
    const gutter = parseFloat(getComputedStyle(wrap).getPropertyValue('--fsdb-check-gutter')) || 0
    const width = wrap.clientWidth - gutter
    let left = wrap.scrollLeft
    if (prefix < left + pinned) left = Math.max(0, prefix - pinned)
    else if (prefix + model.widths[index]! > left + width) left = prefix + model.widths[index]! - width
    wrap.scrollLeft = left
    actualViewport.current = { left: wrap.scrollLeft, width }
    setViewport(actualViewport.current)
  }, [])
  return { slice, revealColumn }
}
