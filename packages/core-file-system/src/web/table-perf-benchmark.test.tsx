import { writeFileSync } from 'node:fs'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { createPortal } from 'react-dom'
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from 'react'
import { WindowedTable, type TableCheckStore } from './windowed-table.tsx'
import { startTableColumnResize } from './table-col-resize.ts'
import { usePinnedTableHead } from './pinned-table-head.ts'
import { LiveTableCellSelection, type TableSelectionModel, type TableSelectionState } from './table-cell-selection.ts'
import { resetRememberedTableWrap, TABLE_ROW_PX } from './table-window.ts'

const ROW_COUNT = 500
const COL_COUNT = 25

function makeWideColumns(count: number) {
  return Array.from({ length: count }, (_, i) => ({ key: i === 0 ? 'title' : `col_${i}` }))
}

function makeRichNodes(rowCount: number, colCount: number) {
  return Array.from({ length: rowCount }, (_, r) => {
    const row: Record<string, unknown> = {
      id: `r-${r}`,
      title: `压测页面 ${r} - 表格性能基准测试数据条目`,
    }
    for (let c = 1; c < colCount; c += 1) {
      row[`col_${c}`] = `val-${r}-${c}-${'内容'.repeat(12)}`
    }
    return {
      kind: 'row' as const,
      key: `r-${r}`,
      row,
      depth: 0,
      hasKids: false,
      kidCount: 0,
    }
  })
}

function box(top: number, height: number, width = 800): DOMRect {
  return { x: 0, y: top, top, bottom: top + height, left: 0, right: width, width, height, toJSON() {} }
}

let observeCalls = 0
let rafQueue: FrameRequestCallback[] = []
function flushRaf() {
  const batch = rafQueue.splice(0, rafQueue.length)
  for (const cb of batch) cb(performance.now())
}

beforeEach(() => {
  observeCalls = 0
  rafQueue = []
  resetRememberedTableWrap()
  vi.stubGlobal('ResizeObserver', class {
    observe() { observeCalls += 1 }
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
    rafQueue.push(cb)
    return rafQueue.length
  })
  vi.stubGlobal('cancelAnimationFrame', () => {})
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('fsdb-right-body') ? 480 : 37
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(840)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    if (this.classList.contains('fsdb-right-body')) return 480
    if (this.tagName === 'THEAD') return 36
    return 37
  })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('table performance benchmark suite', async () => {
  const results: Record<string, unknown> = {}

  // -------------------------------------------------------------------------
  // 1. P0-1: preserveMountedRows 虚拟滚动 DOM 膨胀测试
  // -------------------------------------------------------------------------
  {
    const cols = makeWideColumns(COL_COUNT)
    const widths = Object.fromEntries(cols.map((c, i) => [c.key, i === 0 ? 240 : 120]))
    const nodes = makeRichNodes(ROW_COUNT, COL_COUNT)
    let cellPaints = 0

    function BenchTable({ preserve }: { preserve: boolean }) {
      const paintRef = useRef<any>({ colSpan: 1, error: '', renderNode: () => null })
      const chromeRef = useRef<any>({
        paintHeadTh: (col: { key: string }) => <th key={col.key}>{col.key}</th>,
        onClick: () => {},
        onMouseOver: () => {},
      })
      const colWindowRef = useRef({ pin: 1, start: 1, end: 8, padLeft: 0, padRight: 0 })
      const tableRef = useRef<HTMLTableElement>(null)
      const wrapRef = useRef<HTMLDivElement>(null)
      const stageRef = useRef<HTMLDivElement>(null)
      const checkStackRef = useRef<HTMLDivElement>(null)
      const checkHoverRef = useRef<string | 'head' | null>(null)
      paintRef.current.renderCell = (node: any, colKey: string) => {
        cellPaints += 1
        return <td key={colKey} data-col-key={colKey}>{String(node.row[colKey] ?? '')}</td>
      }
      paintRef.current.renderRow = (node: any, cells: ReactNode) => (
        <tr key={node.key} data-record-id={node.row.id} data-row-key={node.key}>{cells}</tr>
      )
      return (
        <div className="fsdb-right-body">
          <div className="tasks-table-wrap" ref={wrapRef}>
            <WindowedTable
              columns={cols}
              columnWidths={widths}
              columnPinCount={1}
              wrapCells={false}
              truncateCells={false}
              resizingCol={null}
              nodes={nodes}
              error=""
              pickMode={false}
              resetKey="bench-preserve"
              forceLiveChecks={false}
              checkLayoutExtra=""
              paintRef={paintRef}
              chromeRef={chromeRef}
              colWindowRef={colWindowRef}
              tableRef={tableRef}
              wrapRef={wrapRef}
              stageRef={stageRef}
              checkStackRef={checkStackRef}
              checkHoverRef={checkHoverRef}
              paintCheckHover={() => {}}
              renderCheckHead={() => null}
              renderCheckRow={() => null}
              activeRowId={null}
              preserveMountedRows={preserve}
            />
          </div>
        </div>
      )
    }

    const view = render(<BenchTable preserve={true} />)
    const page = view.container.querySelector<HTMLElement>('.fsdb-right-body')!
    const wrap = view.container.querySelector<HTMLElement>('.tasks-table-wrap')!
    let left = 0
    Object.defineProperty(wrap, 'scrollLeft', { configurable: true, get: () => left, set: (v) => { left = Number(v) || 0 } })

    const t0 = performance.now()
    for (let step = 1; step <= 20; step += 1) {
      act(() => {
        page.scrollTop = step * TABLE_ROW_PX * 10
        page.dispatchEvent(new Event('scroll'))
      })
    }
    for (let step = 1; step <= 10; step += 1) {
      act(() => {
        wrap.scrollLeft = step * 200
        wrap.dispatchEvent(new Event('scroll'))
      })
    }
    const elapsedMs = performance.now() - t0
    const mountedRows = view.container.querySelectorAll('tbody tr[data-record-id]').length
    const mountedCells = view.container.querySelectorAll('tbody td[data-col-key]').length
    results.p0_1_preserveMounted = {
      mountedRows,
      mountedCells,
      cellPaints,
      elapsedMs: Number(elapsedMs.toFixed(2)),
    }
    view.unmount()
  }

  // -------------------------------------------------------------------------
  // 2. P0-2: usePinnedTableHead 滚屏 tbody DOM 变动引发的强制回流次数
  // -------------------------------------------------------------------------
  {
    let scroll = 0
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      if (this.matches('.fsdb-right-body')) return box(0, 600)
      if (this.matches('.tasks-toolbar')) return box(0, 40)
      if (this.matches('table')) return box(120 - scroll, 4000)
      return box(120 - scroll, 37)
    })

    function PinnedFixture() {
      const wrapRef = useRef<HTMLDivElement>(null)
      const tableRef = useRef<HTMLTableElement>(null)
      const pinned = usePinnedTableHead(tableRef, wrapRef)
      return (
        <div className="fsdb-right-body">
          <div className="app-pane-in">
            <main className="fsdb-main">
              <header className="tasks-toolbar">操作栏</header>
              <div ref={wrapRef} className="tasks-table-wrap">
                {pinned ? createPortal(<div className="fsdb-pinned-head-viewport">head</div>, pinned.host) : null}
                <table ref={tableRef}>
                  <thead><tr><th>标题</th><th>列1</th></tr></thead>
                  <tbody>
                    <tr className="fsdb-table-pad"><td style={{ height: '0px' }} /></tr>
                    <tr data-record-id="r0"><td>A</td><td>B</td></tr>
                  </tbody>
                </table>
              </div>
            </main>
          </div>
        </div>
      )
    }

    const view = render(<PinnedFixture />)
    const page = view.container.querySelector<HTMLElement>('.fsdb-right-body')!
    const tbody = view.container.querySelector('tbody')!
    const padTd = tbody.querySelector<HTMLElement>('tr.fsdb-table-pad td')!

    act(() => {
      scroll = 300
      page.scrollTop = scroll
      page.dispatchEvent(new Event('scroll'))
      flushRaf()
    })

    const beforeReads = rectSpy.mock.calls.length
    const t0 = performance.now()
    for (let frame = 0; frame < 60; frame += 1) {
      act(() => {
        scroll = 300 + frame * 37
        page.scrollTop = scroll
        padTd.style.height = `${frame * 37}px`
        const tr = document.createElement('tr')
        tr.dataset.recordId = `dyn-${frame}`
        tbody.appendChild(tr)
        if (tbody.children.length > 15) tbody.children[1]?.remove()
        page.dispatchEvent(new Event('scroll'))
      })
      await Promise.resolve()
      act(() => { flushRaf() })
    }
    const elapsedMs = performance.now() - t0
    const layoutReads = rectSpy.mock.calls.length - beforeReads
    results.p0_2_pinnedHeadScroll = {
      frames: 60,
      layoutReads,
      elapsedMs: Number(elapsedMs.toFixed(2)),
    }
    view.unmount()
    rectSpy.mockRestore()
  }

  // -------------------------------------------------------------------------
  // 2b. P0-3: 列宽拖拽 60 次 pointermove 重渲染开销
  // -------------------------------------------------------------------------
  {
    const cols = makeWideColumns(20)
    const initialWidths = Object.fromEntries(cols.map((c, i) => [c.key, i === 0 ? 240 : 120]))
    const nodes = makeRichNodes(200, 20)
    let headPaints = 0
    let setWidthsExtern: ((w: Record<string, number>) => void) | null = null
    let tableEl: HTMLTableElement | null = null

    function ResizeBench() {
      const [columnWidths, setColumnWidths] = useState(initialWidths)
      setWidthsExtern = setColumnWidths
      const paintRef = useRef<any>({ colSpan: 1, error: '', renderNode: () => null })
      const chromeRef = useRef<any>({
        paintHeadTh: (col: { key: string }) => {
          headPaints += 1
          return <th key={col.key}>{col.key}</th>
        },
        onClick: () => {},
        onMouseOver: () => {},
      })
      const colWindowRef = useRef({ pin: 1, start: 1, end: 8, padLeft: 0, padRight: 0 })
      const tableRef = useRef<HTMLTableElement>(null)
      const wrapRef = useRef<HTMLDivElement>(null)
      const stageRef = useRef<HTMLDivElement>(null)
      const checkStackRef = useRef<HTMLDivElement>(null)
      const checkHoverRef = useRef<string | 'head' | null>(null)
      paintRef.current.renderCell = (node: any, colKey: string) => (
        <td key={colKey} data-col-key={colKey}>{String(node.row[colKey] ?? '')}</td>
      )
      paintRef.current.renderRow = (node: any, cells: ReactNode) => (
        <tr key={node.key} data-record-id={node.row.id} data-row-key={node.key}>{cells}</tr>
      )
      return (
        <div className="fsdb-right-body">
          <div className="tasks-table-wrap" ref={wrapRef}>
            <WindowedTable
              columns={cols}
              columnWidths={columnWidths}
              columnPinCount={1}
              wrapCells={false}
              truncateCells={false}
              resizingCol="col_1"
              nodes={nodes}
              error=""
              pickMode={false}
              resetKey="bench-resize"
              forceLiveChecks={false}
              checkLayoutExtra=""
              paintRef={paintRef}
              chromeRef={chromeRef}
              colWindowRef={colWindowRef}
              tableRef={tableRef}
              wrapRef={wrapRef}
              stageRef={stageRef}
              checkStackRef={checkStackRef}
              checkHoverRef={checkHoverRef}
              paintCheckHover={() => {}}
              renderCheckHead={() => null}
              renderCheckRow={() => null}
              activeRowId={null}
            />
          </div>
        </div>
      )
    }

    const view = render(<ResizeBench />)
    tableEl = view.container.querySelector('table')
    const handle = document.createElement('span')
    tableEl?.appendChild(handle)
    headPaints = 0
    const t0 = performance.now()
    // Optimized: startTableColumnResize updates <col> via rAF DOM preview, commits React state once on pointerup
    act(() => {
      startTableColumnResize({
        handle,
        table: tableEl!,
        colKey: 'col_1',
        startX: 100,
        pointerId: 1,
        snapshot: { ...initialWidths },
        isPinnedFirst: false,
        onCommit: (nextWidths) => setWidthsExtern?.(nextWidths),
      })
    })
    for (let step = 1; step <= 60; step += 1) {
      act(() => {
        const ev = new Event('pointermove') as PointerEvent
        Object.defineProperty(ev, 'clientX', { value: 100 + step * 2 })
        handle.dispatchEvent(ev)
        flushRaf()
      })
    }
    act(() => {
      handle.dispatchEvent(new Event('pointerup'))
    })
    const elapsedMs = performance.now() - t0
    results.p0_3_columnResize = {
      pointerMoves: 60,
      headPaints,
      hasTable: Boolean(tableEl),
      finalColWidth: tableEl?.querySelector<HTMLElement>('col[data-col-key="col_1"]')?.style.width,
      elapsedMs: Number(elapsedMs.toFixed(2)),
    }
    view.unmount()
  }

  // -------------------------------------------------------------------------
  // 3. P1-1: TableCheckRail 滚屏 DOM 测量 + 勾选击穿 WindowedTable 重渲染
  // -------------------------------------------------------------------------
  {
    const cols = makeWideColumns(12)
    const widths = Object.fromEntries(cols.map((c, i) => [c.key, i === 0 ? 240 : 120]))
    const nodes = makeRichNodes(200, 12)
    const rectSpy = vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      return box(0, 37, 800)
    })

    let setPickedExtern: ((fn: (prev: string[]) => string[]) => void) | null = null
    let windowedHeadPaints = 0

    function CheckBench() {
      const [pickedIds, setPickedIds] = useState<string[]>(['r-0'])
      setPickedExtern = setPickedIds
      const paintRef = useRef<any>({ colSpan: 1, error: '', renderNode: () => null })
      const chromeRef = useRef<any>({
        paintHeadTh: (col: { key: string }) => {
          windowedHeadPaints += 1
          return <th key={col.key}>{col.key}</th>
        },
        onClick: () => {},
        onMouseOver: () => {},
      })
      const colWindowRef = useRef({ pin: 1, start: 1, end: 8, padLeft: 0, padRight: 0 })
      const tableRef = useRef<HTMLTableElement>(null)
      const wrapRef = useRef<HTMLDivElement>(null)
      const stageRef = useRef<HTMLDivElement>(null)
      const checkStackRef = useRef<HTMLDivElement>(null)
      const checkHoverRef = useRef<string | 'head' | null>(null)
      paintRef.current.renderCell = (node: any, colKey: string) => (
        <td key={colKey} data-col-key={colKey}>{String(node.row[colKey] ?? '')}</td>
      )
      paintRef.current.renderRow = (node: any, cells: ReactNode) => (
        <tr key={node.key} data-record-id={node.row.id} data-row-key={node.key}>{cells}</tr>
      )
      // Mirrors updated browser.tsx: stable renderCheckHead/renderCheckRow + external checkStore
      const checkDrawRef = useRef({
        renderHead: () => <input type="checkbox" readOnly checked={pickedIds.length > 0} />,
        renderRow: (id: string) => <input type="checkbox" readOnly checked={pickedIds.includes(id)} />,
        hasPicked: () => pickedIds.length > 0,
      })
      checkDrawRef.current.renderHead = () => <input type="checkbox" readOnly checked={pickedIds.length > 0} />
      checkDrawRef.current.renderRow = (id: string) => <input type="checkbox" readOnly checked={pickedIds.includes(id)} />
      checkDrawRef.current.hasPicked = () => pickedIds.length > 0
      const listenersRef = useRef(new Set<() => void>())
      const versionRef = useRef(0)
      const checkStore = useMemo<TableCheckStore>(() => ({
        subscribe: (fn) => { listenersRef.current.add(fn); return () => { listenersRef.current.delete(fn) } },
        getVersion: () => versionRef.current,
        hasPicked: () => checkDrawRef.current.hasPicked(),
        renderHead: () => checkDrawRef.current.renderHead(),
        renderRow: (id: string) => checkDrawRef.current.renderRow(id),
      }), [])
      useLayoutEffect(() => {
        versionRef.current += 1
        for (const fn of listenersRef.current) fn()
      }, [pickedIds])
      const renderCheckHead = useCallback(() => checkDrawRef.current.renderHead(), [])
      const renderCheckRow = useCallback((id: string) => checkDrawRef.current.renderRow(id), [])
      const forceLive = true
      const paintCheckHover = useCallback(() => {}, [])
      return (
        <div className="fsdb-right-body">
          <div className="tasks-table-wrap" ref={wrapRef}>
            <WindowedTable
              columns={cols}
              columnWidths={widths}
              columnPinCount={1}
              wrapCells={false}
              truncateCells={false}
              resizingCol={null}
              nodes={nodes}
              error=""
              pickMode={true}
              resetKey="bench-check"
              forceLiveChecks={forceLive}
              checkLayoutExtra=""
              paintRef={paintRef}
              chromeRef={chromeRef}
              colWindowRef={colWindowRef}
              tableRef={tableRef}
              wrapRef={wrapRef}
              stageRef={stageRef}
              checkStackRef={checkStackRef}
              checkHoverRef={checkHoverRef}
              paintCheckHover={paintCheckHover}
              renderCheckHead={renderCheckHead}
              renderCheckRow={renderCheckRow}
              checkStore={checkStore}
              activeRowId={null}
            />
          </div>
        </div>
      )
    }

    const view = render(<CheckBench />)
    const page = view.container.querySelector<HTMLElement>('.fsdb-right-body')!
    act(() => { flushRaf() })

    const readsBefore = rectSpy.mock.calls.length
    const obsBefore = observeCalls
    const tScroll0 = performance.now()
    for (let step = 1; step <= 30; step += 1) {
      act(() => {
        page.scrollTop = step * TABLE_ROW_PX * 3
        page.dispatchEvent(new Event('scroll'))
        flushRaf()
      })
    }
    const scrollMs = performance.now() - tScroll0
    const checkScrollRectReads = rectSpy.mock.calls.length - readsBefore
    const checkScrollObserverRebinds = observeCalls - obsBefore

    const headRendersBefore = windowedHeadPaints
    const tPick0 = performance.now()
    for (let i = 1; i <= 20; i += 1) {
      act(() => {
        setPickedExtern?.((prev) => [...prev, `r-${i}`])
      })
    }
    const pickMs = performance.now() - tPick0
    results.p1_1_checkRail = {
      scrollSteps: 30,
      checkScrollRectReads,
      checkScrollObserverRebinds,
      scrollMs: Number(scrollMs.toFixed(2)),
      pickToggles: 20,
      pickMs: Number(pickMs.toFixed(2)),
      windowedTableHeadPaintsOnPick: windowedHeadPaints - headRendersBefore,
    }
    view.unmount()
    rectSpy.mockRestore()
  }

  // -------------------------------------------------------------------------
  // 4. P1-2a: 单格编辑时的 cellCache 命中率 & renderCell 调用次数
  // -------------------------------------------------------------------------
  {
    const cols = makeWideColumns(20)
    const widths = Object.fromEntries(cols.map((c, i) => [c.key, i === 0 ? 240 : 120]))
    const initialNodes = makeRichNodes(100, 20)
    let cellRenders = 0
    let setNodesExtern: ((next: typeof initialNodes) => void) | null = null

    function EditBench() {
      const [nodes, setNodes] = useState(initialNodes)
      setNodesExtern = setNodes
      const paintRef = useRef<any>({ colSpan: 1, error: '', renderNode: () => null })
      const chromeRef = useRef<any>({
        paintHeadTh: (col: { key: string }) => <th key={col.key}>{col.key}</th>,
        onClick: () => {},
        onMouseOver: () => {},
      })
      const colWindowRef = useRef({ pin: 1, start: 1, end: 10, padLeft: 0, padRight: 0 })
      const tableRef = useRef<HTMLTableElement>(null)
      const wrapRef = useRef<HTMLDivElement>(null)
      const stageRef = useRef<HTMLDivElement>(null)
      const checkStackRef = useRef<HTMLDivElement>(null)
      const checkHoverRef = useRef<string | 'head' | null>(null)
      paintRef.current.renderCell = (node: any, colKey: string) => {
        cellRenders += 1
        return <td key={colKey} data-col-key={colKey}>{String(node.row[colKey] ?? '')}</td>
      }
      paintRef.current.renderRow = (node: any, cells: ReactNode) => (
        <tr key={node.key} data-record-id={node.row.id} data-row-key={node.key}>{cells}</tr>
      )
      return (
        <div className="fsdb-right-body">
          <div className="tasks-table-wrap" ref={wrapRef}>
            <WindowedTable
              columns={cols}
              columnWidths={widths}
              columnPinCount={1}
              wrapCells={false}
              truncateCells={false}
              resizingCol={null}
              nodes={nodes}
              error=""
              pickMode={false}
              resetKey="bench-edit"
              forceLiveChecks={false}
              checkLayoutExtra=""
              paintRef={paintRef}
              chromeRef={chromeRef}
              colWindowRef={colWindowRef}
              tableRef={tableRef}
              wrapRef={wrapRef}
              stageRef={stageRef}
              checkStackRef={checkStackRef}
              checkHoverRef={checkHoverRef}
              paintCheckHover={() => {}}
              renderCheckHead={() => null}
              renderCheckRow={() => null}
              activeRowId={null}
            />
          </div>
        </div>
      )
    }

    const view = render(<EditBench />)
    const page = view.container.querySelector<HTMLElement>('.fsdb-right-body')!
    act(() => { page.dispatchEvent(new Event('scroll')) })
    cellRenders = 0

    let current = initialNodes
    const t0 = performance.now()
    for (let edit = 1; edit <= 30; edit += 1) {
      current = current.map((n, idx) => idx === 0 ? { ...n, row: { ...n.row, title: `已编辑 ${edit}` } } : n)
      act(() => { setNodesExtern?.(current) })
    }
    const elapsedMs = performance.now() - t0
    results.p1_2a_singleCellEdit = {
      edits: 30,
      cellRenders,
      cellsPerEdit: Number((cellRenders / 30).toFixed(2)),
      elapsedMs: Number(elapsedMs.toFixed(2)),
    }
    view.unmount()
  }

  // -------------------------------------------------------------------------
  // 5. P1-2b: LiveTableCellSelection.paint() 空选区滚屏开销
  // -------------------------------------------------------------------------
  {
    const rowIds = Array.from({ length: 30 }, (_, i) => `r-${i}`)
    const colKeys = Array.from({ length: 15 }, (_, i) => `c-${i}`)
    document.body.innerHTML = `<table><tbody>${rowIds.map((id) => `<tr data-record-id="${id}">${colKeys.map((k) => `<td data-col-key="${k}"></td>`).join('')}</tr>`).join('')}</tbody></table>`
    const table = document.querySelector('table')!
    const model: TableSelectionModel = { rowIds, keys: colKeys, writable: new Set(colKeys) }
    const state: TableSelectionState = { focus: { current: null }, range: { current: null }, members: { current: new Set() } }
    const selection = new LiveTableCellSelection(() => model, state)

    let toggles = 0
    const origToggle = DOMTokenList.prototype.toggle
    DOMTokenList.prototype.toggle = function (token: string, force?: boolean) {
      toggles += 1
      return origToggle.call(this, token, force)
    }

    const t0 = performance.now()
    for (let i = 0; i < 200; i += 1) {
      selection.paint(table)
    }
    const elapsedMs = performance.now() - t0
    DOMTokenList.prototype.toggle = origToggle

    results.p1_2b_emptySelectionPaint = {
      paints: 200,
      domClassToggles: toggles,
      elapsedMs: Number(elapsedMs.toFixed(2)),
    }
    document.body.innerHTML = ''
  }

  const outPath = process.env.BENCH_OUT
  if (outPath) writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log('=== BENCHMARK RESULTS ===\n' + JSON.stringify(results, null, 2))

  // Regression guards for all 6 performance optimizations
  // 32px row height fits ~2 more visible rows in a 560px viewport than legacy 37px (18 + 8*2 = 34 max).
  expect((results.p0_1_preserveMounted as any).mountedRows).toBeLessThanOrEqual(34)
  expect((results.p0_1_preserveMounted as any).mountedCells).toBeLessThanOrEqual(300)
  expect((results.p0_2_pinnedHeadScroll as any).layoutReads).toBe(0)
  expect((results.p0_3_columnResize as any).headPaints).toBeLessThanOrEqual(10)
  expect((results.p0_3_columnResize as any).finalColWidth).toBe('240px')
  expect((results.p1_1_checkRail as any).checkScrollRectReads).toBe(0)
  expect((results.p1_1_checkRail as any).windowedTableHeadPaintsOnPick).toBe(0)
  expect((results.p1_2a_singleCellEdit as any).cellsPerEdit).toBe(1)
  expect((results.p1_2b_emptySelectionPaint as any).domClassToggles).toBe(0)
})
