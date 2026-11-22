import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from 'react'
import { defaultRangeExtractor, useVirtualizer, type Range } from '@tanstack/react-virtual'
import { tableVertScroller } from './table-drag-scroll.ts'
import { TABLE_VIEWPORT_OVERSCAN, tableRowFallbackPx } from './table-window.ts'

type Node = { key: string; kind: string; row?: { id: string } }
export function useTableViewport(options: {
  nodes: Node[]; wrapCells: boolean; resetKey: string; layoutKey: string; measureKey?: string
  tableRef: RefObject<HTMLTableElement | null>; wrapRef: RefObject<HTMLDivElement | null>
  retainedRowId?: string | null; retainedRowKey?: string | null; preserveMountedRows?: boolean
}) {
  const { nodes, tableRef, wrapRef } = options
  const [scroller, setScroller] = useState<HTMLElement | null>(null)
  const [geometry, setGeometry] = useState({ margin: 0, padding: 40 })
  const [interactedRow, setInteractedRow] = useState<string | null>(null)
  const interactedHistory = useMemo(() => new Set<string>(), [options.resetKey])
  const keyIndices = useMemo(() => new Map(nodes.map((node, index) => [node.key, index])), [nodes])
  const rowIndices = useMemo(() => {
    const first = new Map<string, number>()
    nodes.forEach((node, index) => { if (node.row && !first.has(node.row.id)) first.set(node.row.id, index) })
    return first
  }, [nodes])
  // The wrap belongs to the parent. Passive effects run after all DOM refs are attached.
  useEffect(() => {
    const wrap = wrapRef.current, table = tableRef.current
    const page = tableVertScroller(wrap)
    if (!wrap || !table || !page) return
    setScroller(page)
    let frame = 0
    const measure = () => {
      frame = 0
      const head = table.tHead?.offsetHeight ?? 37
      const pageRect = page.getBoundingClientRect(), tableRect = table.getBoundingClientRect()
      const toolbar = table.closest('.fsdb-main')?.querySelector<HTMLElement>(':scope > .tasks-toolbar')
      const margin = tableRect.top - pageRect.top - page.clientTop + page.scrollTop + table.clientTop + head
      const padding = head + (toolbar?.offsetHeight ?? 0) + 10
      setGeometry((prev) => Math.abs(prev.margin - margin) < 0.25 && prev.padding === padding ? prev : { margin, padding })
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(measure) }
    const retain = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const row = target.closest<HTMLTableRowElement>('tr[data-record-id]')
      if (row && table.contains(row)) setInteractedRow(row.dataset.rowKey ?? row.dataset.recordId ?? null)
    }
    const lockInnerY = () => { if (wrap !== page && wrap.scrollTop) wrap.scrollTop = 0 }
    measure()
    const observer = new ResizeObserver(schedule)
    observer.observe(page); observer.observe(wrap)
    if (table.tHead) observer.observe(table.tHead)
    const content = page.querySelector(':scope > .app-pane-in')
    if (content) observer.observe(content)
    table.addEventListener('pointerdown', retain, true); table.addEventListener('focusin', retain)
    wrap.addEventListener('scroll', lockInnerY, { passive: true })
    page.addEventListener('animationend', schedule)
    return () => {
      cancelAnimationFrame(frame); observer.disconnect()
      table.removeEventListener('pointerdown', retain, true); table.removeEventListener('focusin', retain)
      wrap.removeEventListener('scroll', lockInnerY); page.removeEventListener('animationend', schedule)
    }
  }, [tableRef, wrapRef])
  const rangeExtractor = useCallback((range: Range) => {
    const indices = new Set(defaultRangeExtractor(range))
    const retained = options.retainedRowKey ? keyIndices.get(options.retainedRowKey) : options.retainedRowId ? rowIndices.get(options.retainedRowId) : undefined
    if (retained != null) indices.add(retained)
    const interacted = interactedRow ? keyIndices.get(interactedRow) ?? rowIndices.get(interactedRow) : undefined
    if (interacted != null) indices.add(interacted)
    const focused = document.activeElement
    if (focused instanceof Element && tableRef.current?.contains(focused)) {
      const row = focused.closest<HTMLTableRowElement>('tr[data-record-id]')
      const index = row?.dataset.rowKey ? keyIndices.get(row.dataset.rowKey) : rowIndices.get(row?.dataset.recordId ?? '')
      if (index != null) indices.add(index)
    }
    if (options.preserveMountedRows) {
      if (interactedRow) {
        interactedHistory.delete(interactedRow)
        interactedHistory.add(interactedRow)
        while (interactedHistory.size > 8) {
          const oldest = interactedHistory.values().next().value
          if (oldest !== undefined) interactedHistory.delete(oldest)
          else break
        }
      }
      for (const key of interactedHistory) {
        const index = keyIndices.get(key) ?? rowIndices.get(key)
        if (index != null) indices.add(index)
      }
    }
    return [...indices].sort((a, b) => a - b)
  }, [nodes, options.retainedRowId, options.retainedRowKey, options.preserveMountedRows, interactedRow, rowIndices, keyIndices, tableRef, interactedHistory])
  const getScrollElement = useCallback(() => scroller, [scroller])
  const getItemKey = useCallback((index: number) => `${options.resetKey}\0${nodes[index]!.key}`, [nodes, options.resetKey])
  const estimateSize = useCallback(
    (index: number) =>
      nodes[index]?.kind === 'group-head'
        ? 33
        : nodes[index]?.kind === 'group-pager' || nodes[index]?.kind === 'summary'
          ? 32
          : tableRowFallbackPx(options.wrapCells),
    [nodes, options.wrapCells],
  )
  const virtualizer = useVirtualizer({ count: nodes.length, getScrollElement, getItemKey, estimateSize, rangeExtractor,
    overscan: TABLE_VIEWPORT_OVERSCAN, scrollMargin: geometry.margin, scrollPaddingStart: geometry.padding,
    initialRect: { width: 624, height: 560 },
  })
  // 非换行模式下所有行高固定（32px），禁用 scrollTop 反向修正，避免上滑进入未测量行时整表微跳闪烁；换行模式仍屏蔽 <2px 抖动。
  virtualizer.shouldAdjustScrollPositionOnItemSizeChange = (item, delta, instance) => {
    if (!options.wrapCells) return false
    if (Math.abs(delta) < 2) return false
    return item.start < (instance.scrollOffset ?? 0) + instance.options.scrollMargin
  }
  const current = useRef(virtualizer); current.current = virtualizer
  const previousLayout = useRef(options.layoutKey)
  useLayoutEffect(() => {
    if (previousLayout.current === options.layoutKey) return
    previousLayout.current = options.layoutKey
    current.current.measure()
    tableRef.current?.querySelectorAll<HTMLTableRowElement>('tbody tr[data-index]').forEach(current.current.measureElement)
  }, [options.layoutKey, tableRef])
  const previousMeasure = useRef(options.measureKey ?? '')
  useLayoutEffect(() => {
    const next = options.measureKey ?? ''
    if (previousMeasure.current === next) return
    previousMeasure.current = next
    if (!next) return
    tableRef.current?.querySelectorAll<HTMLTableRowElement>('tbody tr[data-index]').forEach(current.current.measureElement)
  }, [options.measureKey, tableRef])
  useEffect(() => { setInteractedRow(null) }, [options.resetKey])
  const revealRow = useCallback((id: string, rowKey?: string) => {
    const index = rowKey ? keyIndices.get(rowKey) : rowIndices.get(id)
    if (index != null) current.current.scrollToIndex(index, { align: 'auto', behavior: 'auto' })
  }, [rowIndices, keyIndices])
  return { virtualizer, items: virtualizer.getVirtualItems(), margin: geometry.margin, isScrolling: virtualizer.isScrolling, revealRow }
}
