import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { act, cleanup, render } from '@testing-library/react'
import { createPortal } from 'react-dom'
import { useRef, type RefObject } from 'react'
import { usePinnedTableHead } from './pinned-table-head.ts'

let scroll = 0
function box(top: number, height: number, width = 600): DOMRect {
  return { x: 0, y: top, top, bottom: top + height, left: 0, right: width, width, height, toJSON() {} }
}
function Table({ wrapRef }: { wrapRef: RefObject<HTMLDivElement | null> }) {
  const tableRef = useRef<HTMLTableElement>(null)
  const pinned = usePinnedTableHead(tableRef, wrapRef)
  return <>{pinned ? createPortal(<div data-testid="head" className="fsdb-pinned-head-viewport">标题 动作</div>, pinned.host) : null}
    <table ref={tableRef}><thead><tr><th>标题</th><th>动作</th></tr></thead><tbody><tr><td>记录</td></tr></tbody></table></>
}
function Fixture() {
  const wrapRef = useRef<HTMLDivElement>(null)
  return <div className="fsdb-right-body"><div className="app-pane-in"><main className="fsdb-main"><header className="tasks-toolbar">操作栏</header>
    <div ref={wrapRef} className="tasks-table-wrap"><Table wrapRef={wrapRef} /></div></main></div></div>
}

beforeEach(() => {
  scroll = 0
  vi.stubGlobal('ResizeObserver', class { observe() {} disconnect() {} })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
    if (this.matches('.fsdb-right-body')) return box(0, 600)
    if (this.matches('.tasks-toolbar')) return box(0, 40)
    if (this.matches('table')) return box(120 - scroll, 2000)
    return box(120 - scroll, 32)
  })
  vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(function (this: HTMLElement) { return this.tagName === 'THEAD' ? 32 : 40 })
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(600)
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals() })

test('initialises after the parent ref is attached, docks, and restores the natural header', () => {
  const view = render(<Fixture />)
  const page = view.container.querySelector<HTMLElement>('.fsdb-right-body')!
  const toolbar = view.container.querySelector('.tasks-toolbar')!
  expect(toolbar.querySelector('.fsdb-pinned-head-host')).not.toBeNull()
  expect(view.queryByTestId('head')).toBeNull()
  act(() => { scroll = 320; page.scrollTop = scroll; page.dispatchEvent(new Event('scroll')) })
  expect(view.getByTestId('head').parentElement?.parentElement).toBe(toolbar)
  expect(view.container.querySelector('thead')?.getAttribute('aria-hidden')).toBe('true')
  act(() => { scroll = 0; page.scrollTop = scroll; page.dispatchEvent(new Event('scroll')) })
  expect(view.queryByTestId('head')).toBeNull()
  expect(view.container.querySelector('thead')?.hasAttribute('aria-hidden')).toBe(false)
})

test('steady vertical scrolling does not remeasure layout or rebuild the pinned header', () => {
  const view = render(<Fixture />)
  const page = view.container.querySelector<HTMLElement>('.fsdb-right-body')!
  act(() => { scroll = 320; page.scrollTop = scroll; page.dispatchEvent(new Event('scroll')) })
  const head = view.getByTestId('head')
  const reads = vi.mocked(HTMLElement.prototype.getBoundingClientRect).mock.calls.length
  for (const value of [400, 600, 500]) act(() => { scroll = value; page.scrollTop = scroll; page.dispatchEvent(new Event('scroll')) })
  expect(HTMLElement.prototype.getBoundingClientRect).toHaveBeenCalledTimes(reads)
  expect(view.getByTestId('head')).toBe(head)
  const host = head.parentElement
  view.unmount()
  expect(host?.isConnected).toBe(false)
})
