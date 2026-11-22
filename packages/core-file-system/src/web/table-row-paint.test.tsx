import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useRef, type ReactNode, type RefObject } from 'react'
import { WindowedTable } from './browser.tsx'
import { rowPaintStamp } from './windowed-table.tsx'
import { resetRememberedTableWrap, TABLE_ROW_PX } from './table-window.ts'
import { loadTags, pullTags } from './tag-catalog.ts'

const ROW_COUNT = 80
const columns = [{ key: 'title' }]
const nodes = Array.from({ length: ROW_COUNT }, (_, index) => ({
  kind: 'row' as const,
  key: `row-${index}`,
  row: { id: `row-${index}`, title: `Row ${index}` },
  depth: 0,
  hasKids: false,
  kidCount: 0,
}))

function Harness({
  paints,
  cells,
  nodes: input = nodes,
  columns: cols = columns,
  columnWidths = {},
  pin = 0,
}: {
  paints: string[]
  cells?: string[]
  nodes?: typeof nodes
  columns?: { key: string }[]
  columnWidths?: Record<string, number>
  pin?: number
}) {
  const paintRef = useRef({ colSpan: 1, error: '', renderNode: (_node: { key: string }) => null as ReactNode })
  const chromeRef = useRef({ paintHeadTh: () => null, onPointerDown: undefined, onPointerMove: undefined, onClick: () => {}, onMouseOver: () => {}, onContextMenu: undefined })
  const colWindowRef = useRef({ pin: 0, start: 0, end: 1, padLeft: 0, padRight: 0 })
  const tableRef = useRef<HTMLTableElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<HTMLDivElement>(null)
  const checkStackRef = useRef<HTMLDivElement>(null)
  const checkHoverRef = useRef<string | 'head' | null>(null)
  paintRef.current.renderNode = (node) => {
    paints.push(node.key)
    return <tr key={node.key} data-record-id={node.key}><td>{node.key}</td></tr>
  }
  paintRef.current.renderCell = cells
    ? (node, colKey) => {
        cells.push(`${node.key}:${colKey}`)
        return <td key={colKey} data-col-key={colKey} />
      }
    : undefined
  paintRef.current.renderRow = cells
    ? (node, kids) => <tr key={node.key} data-record-id={node.key}>{kids}</tr>
    : undefined
  return (
    <div className="fsdb-right-body">
      <div className="tasks-table-wrap" ref={wrapRef}>
        <WindowedTable
          columns={cols}
          columnWidths={columnWidths}
          columnPinCount={pin}
          wrapCells={false}
          truncateCells={false}
          resizingCol={null}
          nodes={input}
          error=""
          pickMode={false}
          resetKey="paint"
          forceLiveChecks={false}
          checkLayoutExtra=""
          paintRef={paintRef}
          chromeRef={chromeRef}
          colWindowRef={colWindowRef}
          tableRef={tableRef as RefObject<HTMLTableElement | null>}
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

beforeEach(() => {
  resetRememberedTableWrap()
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('fsdb-right-body') ? 400 : 37
  })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800)
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) {
    return this.classList.contains('fsdb-right-body') ? 400 : 37
  })
})
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

test('scroll rebuilds only new rows, and a parent rerender does not rebuild the window', () => {
  const before = { mountCalls: 53, scrollCalls: 19, selectCalls: 19 }
  const paints: string[] = []
  const view = render(<Harness paints={paints} />)
  const page = view.container.querySelector<HTMLElement>('.fsdb-right-body')!
  act(() => { page.dispatchEvent(new Event('scroll')) })

  const first = paints.splice(0, paints.length)
  const visible = new Set(first)
  expect(visible.size).toBeGreaterThan(1)
  expect(visible.size).toBeLessThan(ROW_COUNT)
  expect(first.length).toBeLessThan(before.mountCalls)

  act(() => {
    page.scrollTop = TABLE_ROW_PX * 12
    page.dispatchEvent(new Event('scroll'))
  })
  const scrolled = paints.splice(0, paints.length)
  const mounted = view.container.querySelectorAll('tbody tr[data-record-id]').length
  expect(scrolled.length).toBeLessThan(mounted)
  expect(scrolled.length).toBeLessThan(before.scrollCalls)

  act(() => { fireEvent.mouseOver(view.container.querySelector('tbody tr')!) })
  expect(paints).toEqual([])

  view.rerender(<Harness paints={paints} />)
  const selected = paints.splice(0, paints.length)
  expect(selected.length).toBeLessThan(before.selectCalls)
})

test('replacing one row repaints that row, and copying unchanged rows does not', () => {
  const paints: string[] = []
  const view = render(<Harness paints={paints} nodes={nodes} />)
  const page = view.container.querySelector<HTMLElement>('.fsdb-right-body')!
  act(() => { page.dispatchEvent(new Event('scroll')) })
  paints.splice(0, paints.length)

  const one = nodes.map((node, index) => index === 0 ? { ...node, row: { ...node.row, title: 'changed' } } : node)
  view.rerender(<Harness paints={paints} nodes={one} />)
  expect(paints).toEqual(['row-0'])

  paints.splice(0, paints.length)
  const all = one.map((node) => ({ ...node, row: { ...node.row } }))
  view.rerender(<Harness paints={paints} nodes={all} />)
  expect(paints.splice(0, paints.length)).toEqual([])
})

test('a column window move builds only the columns that entered', () => {
  const wide = Array.from({ length: 40 }, (_, index) => ({ key: `c${index}` }))
  const widths = Object.fromEntries(wide.map((col) => [col.key, 120]))
  const paints: string[] = []
  const cells: string[] = []
  const view = render(<Harness paints={paints} cells={cells} columns={wide} columnWidths={widths} />)
  const wrap = view.container.querySelector<HTMLElement>('.tasks-table-wrap')!
  let left = 0
  Object.defineProperty(wrap, 'scrollLeft', { configurable: true, get: () => left, set: (value) => { left = Number(value) || 0 } })
  act(() => { wrap.dispatchEvent(new Event('scroll')) })
  const first = cells.splice(0, cells.length)
  const perRow = first.length / new Set(first.map((item) => item.split(':')[0])).size
  expect(perRow).toBeGreaterThan(2)

  act(() => {
    wrap.scrollLeft = 480
    wrap.dispatchEvent(new Event('scroll'))
  })
  const next = cells.splice(0, cells.length)
  const rows = new Set(next.map((item) => item.split(':')[0])).size
  expect(next.length).toBeGreaterThan(0)
  expect(next.length / rows).toBeLessThan(perRow)
  expect(next.every((item) => !first.includes(item))).toBe(true)
})

test('group-head paint stamp changes when folded toggles', () => {
  const stamps = new Map()
  const open = rowPaintStamp({ kind: 'group-head', key: 'gh:2026-11-19', groupKey: '2026-11-19', label: '2026/11/19', count: 5, folded: false }, stamps)
  const folded = rowPaintStamp({ kind: 'group-head', key: 'gh:2026-11-19', groupKey: '2026-11-19', label: '2026/11/19', count: 5, folded: true }, stamps)
  expect(open).not.toBe(folded)
})

test('group-pager paint stamp changes when pageSize changes', () => {
  const stamps = new Map()
  const p50 = rowPaintStamp({ kind: 'group-pager', key: 'gp:done', groupKey: 'done', count: 86, pageIndex: 0, pageSize: 50 }, stamps)
  const p100 = rowPaintStamp({ kind: 'group-pager', key: 'gp:done', groupKey: 'done', count: 86, pageIndex: 0, pageSize: 100 }, stamps)
  expect(p50).not.toBe(p100)
})

test('repeated tag catalog renames repaint tag cells while keeping non-tag cells cached', async () => {
  const tagNodes = [
    {
      kind: 'row' as const,
      key: 'row-0',
      row: { id: 'row-0', title: 'Row 0', tag: { tags: ['tag-10'], values: {} } },
      depth: 0,
      hasKids: false,
      kidCount: 0,
    },
  ]
  const cols = [{ key: 'title' }, { key: 'tag' }]
  const painted: string[] = []
  let catalogTitle = '代码提交 1'
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
    tags: [{ id: 'tag-10', label: catalogTitle, fields: [] }],
  }), { status: 200, headers: { 'content-type': 'application/json' } })))

  await pullTags()

  function TagHarness() {
    const paintRef = useRef({
      colSpan: 2,
      error: '',
      renderNode: () => null as ReactNode,
      renderCell: (node: { key: string; row?: Record<string, unknown> }, colKey: string) => {
        painted.push(`${node.key}:${colKey}`)
        if (colKey === 'tag') {
          const label = loadTags().find((t) => t.id === 'tag-10')?.label ?? 'tag-10'
          return <td key={colKey} data-col-key={colKey}>{label}</td>
        }
        return <td key={colKey} data-col-key={colKey}>{String(node.row?.title ?? '')}</td>
      },
      renderRow: (node: { key: string }, kids: ReactNode[]) => <tr key={node.key} data-record-id={node.key}>{kids}</tr>,
    })
    const chromeRef = useRef({ paintHeadTh: () => null, onPointerDown: undefined, onPointerMove: undefined, onClick: () => {}, onMouseOver: () => {}, onContextMenu: undefined })
    const colWindowRef = useRef({ pin: 0, start: 0, end: 2, padLeft: 0, padRight: 0 })
    const tableRef = useRef<HTMLTableElement>(null)
    const wrapRef = useRef<HTMLDivElement>(null)
    const stageRef = useRef<HTMLDivElement>(null)
    const checkStackRef = useRef<HTMLDivElement>(null)
    const checkHoverRef = useRef<string | 'head' | null>(null)
    return (
      <div className="fsdb-right-body">
        <div className="tasks-table-wrap" ref={wrapRef}>
          <WindowedTable
            columns={cols}
            columnWidths={{ title: 200, tag: 200 }}
            columnPinCount={0}
            wrapCells={false}
            truncateCells={false}
            resizingCol={null}
            nodes={tagNodes}
            error=""
            pickMode={false}
            resetKey="tag-rename"
            forceLiveChecks={false}
            checkLayoutExtra=""
            paintRef={paintRef}
            chromeRef={chromeRef}
            colWindowRef={colWindowRef}
            tableRef={tableRef as RefObject<HTMLTableElement | null>}
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

  const view = render(<TagHarness />)
  const tagCell = () => view.container.querySelector('td[data-col-key="tag"]')?.textContent
  expect(tagCell()).toBe('代码提交 1')

  painted.length = 0
  catalogTitle = '代码提交 2'
  await act(async () => { await pullTags() })
  expect(tagCell()).toBe('代码提交 2')
  expect(painted).toEqual(['row-0:tag'])

  painted.length = 0
  catalogTitle = '代码提交 3'
  await act(async () => { await pullTags() })
  expect(tagCell()).toBe('代码提交 3')
  expect(painted).toEqual(['row-0:tag'])
})
