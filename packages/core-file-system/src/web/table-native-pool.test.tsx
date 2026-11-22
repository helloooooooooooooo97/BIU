// @vitest-environment jsdom
import { createRef } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import type { DbRecord } from '@biu/type-file-system'
import { WindowedTable, type TableChromeBag, type TablePaintBag, type TablePaintNode } from './windowed-table.tsx'
import { NativeRowPool, type NativeCellDescribe, type NativePoolFrame } from './table-native-pool.ts'
import type { TableColumnSlice } from './table-window.ts'

const COLUMNS = [
  { key: 'title' },
  { key: 'status' },
  { key: 'priority' },
  { key: 'done' },
  { key: 'owner' },
  { key: 'category' },
  { key: 'points' },
  { key: 'sprint' },
  { key: 'createdAt' },
  { key: 'updatedAt' },
  { key: 'notes' },
  { key: 'actions' },
]

const COLUMN_WIDTHS: Record<string, number> = {
  title: 220,
  status: 110,
  priority: 90,
  done: 72,
  owner: 110,
  category: 110,
  points: 80,
  sprint: 100,
  createdAt: 130,
  updatedAt: 130,
  notes: 160,
  actions: 80,
}

function makeNodes(count: number): TablePaintNode[] {
  const statuses = ['进行中', '已完成', '待开始']
  const priorities = ['P0', 'P1', 'P2']
  return Array.from({ length: count }, (_, i) => {
    const row: DbRecord = {
      id: `r-${i}`,
      title: `Task item #${i}`,
      status: statuses[i % statuses.length],
      priority: priorities[i % priorities.length],
      done: i % 2 === 0,
      owner: `User ${i % 10}`,
      category: i % 3 === 0 ? '核心引擎' : '交互优化',
      points: (i % 13) + 1,
      sprint: `S${(i % 6) + 1}`,
      createdAt: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
      updatedAt: `2026-11-${String((i % 28) + 1).padStart(2, '0')}`,
      notes: `Benchmark note for row ${i}`,
    }
    return {
      kind: 'row',
      key: `r-${i}`,
      keyPrefix: '',
      row,
      depth: 0,
      hasKids: false,
      kidCount: 0,
    }
  })
}

function makeDescribe(node: Extract<TablePaintNode, { kind: 'row' }>, colKey: string): NativeCellDescribe {
  const row = node.row
  if (colKey === 'title' || colKey === 'actions') {
    return { spec: { kind: 'portal' } }
  }
  if (colKey === 'done') {
    return { spec: { kind: 'bool', on: Boolean(row.done), writable: true } }
  }
  if (colKey === 'status' || colKey === 'priority') {
    const val = String(row[colKey] ?? '')
    return {
      spec: {
        kind: 'tags',
        items: val ? [{ id: val, label: val, tone: 'var(--biu-tag-blue)' }] : [],
      },
    }
  }
  return { spec: { kind: 'text', text: String(row[colKey] ?? '') } }
}

if (typeof globalThis.ResizeObserver === 'undefined') {
  globalThis.ResizeObserver = class ResizeObserver {
    private cb: ResizeObserverCallback
    constructor(cb: ResizeObserverCallback) {
      this.cb = cb
    }
    observe(target: Element) {
      this.cb(
        [
          {
            target,
            contentRect: { width: 1600, height: 600, top: 0, left: 0, bottom: 600, right: 1600, x: 0, y: 0, toJSON: () => ({}) },
            borderBoxSize: [{ inlineSize: 1600, blockSize: 600 }],
            contentBoxSize: [{ inlineSize: 1600, blockSize: 600 }],
          } as unknown as ResizeObserverEntry,
        ],
        this,
      )
    }
    unobserve() {}
    disconnect() {}
  }
}

const origClientHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientHeight')
const origClientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth')
const origScrollHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollHeight')
const origOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'offsetHeight')

beforeEach(() => {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('fsdb-right-body') || this.classList.contains('tasks-table-wrap') ? 600 : 32
    },
  })
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1600 })
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 20000 })
  Object.defineProperty(HTMLElement.prototype, 'offsetHeight', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList.contains('fsdb-right-body') || this.classList.contains('tasks-table-wrap')) return 600
      if (this.tagName === 'THEAD') return 36
      return 32
    },
  })
})

afterEach(() => {
  cleanup()
  if (origClientHeight) Object.defineProperty(HTMLElement.prototype, 'clientHeight', origClientHeight)
  if (origClientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', origClientWidth)
  if (origScrollHeight) Object.defineProperty(HTMLElement.prototype, 'scrollHeight', origScrollHeight)
  if (origOffsetHeight) Object.defineProperty(HTMLElement.prototype, 'offsetHeight', origOffsetHeight)
})

describe('NativeRowPool unit tests', () => {

  it('recycles 100% of <tr> and <td> slots during steady-state scrolling with zero DOM creations', () => {
    const table = document.createElement('table')
    const tbody = document.createElement('tbody')
    table.appendChild(tbody)
    document.body.appendChild(table)

    const pool = new NativeRowPool(tbody)
    const cols = ['title', 'status', 'done', 'notes']

    const buildFrame = (start: number, count: number): NativePoolFrame => ({
      pinCount: 1,
      padLeft: 0,
      padRight: 0,
      visibleColKeys: cols,
      rows: Array.from({ length: count }, (_, idx) => {
        const i = start + idx
        return {
          key: `row-${i}`,
          index: i,
          top: i * 32,
          recordId: `row-${i}`,
          active: i === 2,
          delayMs: 0,
          cells: [
            { colKey: 'title', stamp: `p-${i}`, describe: { spec: { kind: 'portal' } } },
            {
              colKey: 'status',
              stamp: `g-${i}`,
              describe: { spec: { kind: 'tags', items: [{ id: 'ok', label: `S${i}`, tone: '#3b82f6' }] } },
            },
            { colKey: 'done', stamp: `b-${i % 2}`, describe: { spec: { kind: 'bool', on: i % 2 === 0, writable: true } } },
            { colKey: 'notes', stamp: `t-${i}`, describe: { spec: { kind: 'text', text: `Note ${i}` } } },
          ],
        }
      }),
    })

    // Initial mount: 20 rows
    const portals0 = pool.sync(buildFrame(0, 20))
    expect(pool.stats.rowsCreated).toBe(20)
    expect(pool.stats.cellsCreated).toBe(80)
    expect(portals0).toHaveLength(20)
    expect(tbody.querySelectorAll('tr').length).toBe(20)
    expect(tbody.querySelector('button.fsdb-boolbtn[data-native-bool="1"]')).not.toBeNull()
    expect(tbody.querySelector('.biu-tags .biu-tag .biu-tag-label')?.textContent).toBe('S0')

    // Reset stats and scroll 10 steps (moving 5 rows per step = 50 row transitions)
    pool.resetStats()
    for (let step = 1; step <= 10; step += 1) {
      const portals = pool.sync(buildFrame(step * 5, 20))
      expect(portals).toHaveLength(20)
    }

    expect(pool.stats.rowsCreated).toBe(0)
    expect(pool.stats.cellsCreated).toBe(0)
    expect(pool.stats.rowsRecycled).toBe(50)
    expect(pool.stats.nativeCellsPainted).toBeGreaterThan(0)
    expect(tbody.querySelectorAll('tr').length).toBe(20)

    pool.destroy()
    table.remove()
  })

  it('delegates writable native boolean clicks to onNativeBoolToggle without bubbling to table click', () => {
    const nodes = makeNodes(10)
    const toggled: Array<{ rowId: string; colKey: string }> = []
    const tableClicks = vi.fn()
    const wrapRef = createRef<HTMLDivElement>()
    const tableRef = createRef<HTMLTableElement>()
    const stageRef = createRef<HTMLDivElement>()
    const checkStackRef = createRef<HTMLDivElement>()
    const checkHoverRef = { current: null as string | 'head' | null }
    const colWindowRef = { current: { pin: 1, start: 1, end: COLUMNS.length, padLeft: 0, padRight: 0 } as TableColumnSlice }

    const paintRef = {
      current: {
        colSpan: COLUMNS.length + 1,
        error: '',
        renderNode: () => null,
        describeNativeCell: makeDescribe,
        renderPortalCellContent: (node, colKey) =>
          colKey === 'title' ? <span className="portal-title">{String(node.row.title)}</span> : <button type="button">Act</button>,
        onNativeBoolToggle: (rowId, colKey) => toggled.push({ rowId, colKey }),
      } as TablePaintBag,
    }
    const chromeRef = {
      current: {
        paintHeadTh: (col) => <th key={col.key}>{col.key}</th>,
        onPointerDown: undefined,
        onPointerMove: undefined,
        onClick: tableClicks,
        onMouseOver: undefined,
      } as TableChromeBag,
    }

    const { container } = render(
      <div ref={wrapRef} className="tasks-table-wrap" style={{ height: 480, overflow: 'auto' }}>
        <WindowedTable
          columns={COLUMNS}
          columnWidths={COLUMN_WIDTHS}
          columnPinCount={1}
          wrapCells={false}
          truncateCells={false}
          resizingCol={null}
          nodes={nodes}
          error=""
          pickMode={false}
          resetKey="native-click"
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
      </div>,
    )

    // Verify portal cells mounted inside pooled <td>s
    const titlePortals = container.querySelectorAll('tbody.fsdb-grid-body .portal-title')
    expect(titlePortals.length).toBeGreaterThan(0)
    expect(titlePortals[0]?.textContent).toBe('Task item #0')

    // Click native writable boolean button
    const boolBtn = container.querySelector('tbody.fsdb-grid-body button.fsdb-boolbtn[data-native-bool="1"]') as HTMLButtonElement | null
    expect(boolBtn).not.toBeNull()
    fireEvent.click(boolBtn!)

    expect(toggled).toEqual([{ rowId: 'r-0', colKey: 'done' }])
    expect(tableClicks).not.toHaveBeenCalled()
  })
})

describe('Before vs After benchmark: React TableBody vs NativeRowPool + Portal Hybrid', () => {
  function runScrollBenchmark(mode: 'before-react' | 'after-native-pool') {
    const nodes = makeNodes(500)
    const wrapRef = createRef<HTMLDivElement>()
    const tableRef = createRef<HTMLTableElement>()
    const stageRef = createRef<HTMLDivElement>()
    const checkStackRef = createRef<HTMLDivElement>()
    const checkHoverRef = { current: null as string | 'head' | null }
    const colWindowRef = { current: { pin: 1, start: 1, end: COLUMNS.length, padLeft: 0, padRight: 0 } as TableColumnSlice }

    const poolHolder: { current: NativeRowPool | null } = { current: null }
    let reactCellCommits = 0
    let counting = false

    const paintBag: TablePaintBag = {
      colSpan: COLUMNS.length + 1,
      error: '',
      renderNode: () => null,
      renderRow: (node, cells) =>
        node.kind === 'row' ? (
          <tr key={node.key} data-record-id={node.row.id} data-row-key={node.key}>
            {cells}
          </tr>
        ) : null,
      renderCell: (node, colKey) => {
        if (node.kind !== 'row') return null
        if (counting) reactCellCommits += 1
        return (
          <td key={colKey} data-col-key={colKey}>
            <span className="fsdb-cell">{String(node.row[colKey] ?? '')}</span>
          </td>
        )
      },
      ...(mode === 'after-native-pool'
        ? {
            describeNativeCell: makeDescribe,
            renderPortalCellContent: (node: Extract<TablePaintNode, { kind: 'row' }>, colKey: string) => {
              if (counting) reactCellCommits += 1
              return colKey === 'title' ? (
                <span className="portal-title">{String(node.row.title)}</span>
              ) : (
                <button type="button" className="portal-act">
                  Act
                </button>
              )
            },
            onPoolReady: (pool: NativeRowPool | null) => {
              poolHolder.current = pool
            },
          }
        : {}),
    }

    const paintRef = { current: paintBag }
    const chromeRef = {
      current: {
        paintHeadTh: (col) => <th key={col.key}>{col.key}</th>,
        onPointerDown: undefined,
        onPointerMove: undefined,
        onClick: () => {},
        onMouseOver: undefined,
      } as TableChromeBag,
    }

    const view = render(
      <div className="fsdb-right-body" style={{ height: 600, width: 1600, overflow: 'auto' }}>
        <div ref={wrapRef} className="tasks-table-wrap" style={{ width: 1600, overflowX: 'auto' }}>
          <WindowedTable
            columns={COLUMNS}
            columnWidths={COLUMN_WIDTHS}
            columnPinCount={1}
            wrapCells={false}
            truncateCells={false}
            resizingCol={null}
            nodes={nodes}
            error=""
            pickMode={false}
            resetKey={`bench-${mode}`}
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
      </div>,
    )

    const page = view.container.querySelector<HTMLElement>('.fsdb-right-body')!
    expect(page).not.toBeNull()

    // Warm up 2 scroll steps so initial pool reaches steady-state capacity (viewport + lead/trail buffer)
    for (let w = 1; w <= 2; w += 1) {
      act(() => {
        page.scrollTop = w * 192
        page.dispatchEvent(new Event('scroll'))
      })
    }

    // Instrument document.createElement for steady-state scroll measurement
    let steadyTrCreated = 0
    let steadyTdCreated = 0
    const origCreateElement = document.createElement.bind(document)
    const createSpy = vi.spyOn(document, 'createElement').mockImplementation(((tagName: string, options?: ElementCreationOptions) => {
      const lower = tagName.toLowerCase()
      if (lower === 'tr') steadyTrCreated += 1
      else if (lower === 'td') steadyTdCreated += 1
      return origCreateElement(tagName, options)
    }) as typeof document.createElement)

    poolHolder.current?.resetStats()
    counting = true
    const steps = 30
    const t0 = performance.now()
    for (let s = 3; s < 3 + steps; s += 1) {
      act(() => {
        page.scrollTop = s * 192
        page.dispatchEvent(new Event('scroll'))
      })
    }
    const elapsedMs = performance.now() - t0
    counting = false
    createSpy.mockRestore()

    const poolStats = poolHolder.current
      ? { ...poolHolder.current.stats }
      : { rowsCreated: 0, rowsRecycled: 0, cellsCreated: 0, cellsRecycled: 0, nativeCellsPainted: 0, portalCellsMounted: 0 }

    cleanup()
    return {
      mode,
      steps,
      steadyTrCreated,
      steadyTdCreated,
      reactCellCommits,
      elapsedMs: Number(elapsedMs.toFixed(2)),
      avgMsPerStep: Number((elapsedMs / steps).toFixed(2)),
      poolStats,
    }
  }

  it('proves 0 steady-state <tr>/<td> DOM creations and >=75% fewer React cell renders vs pure React TableBody', () => {
    const before = runScrollBenchmark('before-react')
    const after = runScrollBenchmark('after-native-pool')

    console.info('[Table NativePool Benchmark]', JSON.stringify({ before, after }, null, 2))

    // Before (pure React TableBody) creates fresh <tr> and <td> nodes on every scroll step
    expect(before.steadyTrCreated).toBeGreaterThan(100)
    expect(before.steadyTdCreated).toBeGreaterThan(1000)

    // After (NativeRowPool + Portal hybrid) creates ZERO <tr> and ZERO <td> nodes during steady-state scroll
    expect(after.steadyTrCreated).toBe(0)
    expect(after.steadyTdCreated).toBe(0)
    expect(after.poolStats.rowsCreated).toBe(0)
    expect(after.poolStats.cellsCreated).toBe(0)
    expect(after.poolStats.rowsRecycled).toBeGreaterThan(100)

    // React cell renders drop by >=75% (only 2 portal cols vs 12 React cols = ~83% drop)
    expect(after.reactCellCommits).toBeLessThan(before.reactCellCommits * 0.25)
  })
})
