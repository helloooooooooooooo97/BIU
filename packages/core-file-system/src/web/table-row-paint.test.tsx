import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useMemo, useRef, type ReactNode, type RefObject } from 'react'
import { WindowedTable } from './browser.tsx'
import { resetRememberedTableWrap, TABLE_ROW_PX } from './table-window.ts'

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

function Harness({ paints }: { paints: string[] }) {
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
  const stableNodes = useMemo(() => nodes, [])
  return (
    <div className="fsdb-right-body">
      <div className="tasks-table-wrap" ref={wrapRef}>
        <WindowedTable
          columns={columns}
          columnWidths={{}}
          columnPinCount={0}
          wrapCells={false}
          truncateCells={false}
          resizingCol={null}
          nodes={stableNodes}
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
