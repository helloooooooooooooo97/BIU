import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, expect, test } from 'vitest'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { useRef, useState, type ReactNode } from 'react'
import { InspectorStagePane } from './session-inspector.tsx'

/**
 * 右侧边栏的舞台和 session-inspector 一样：已打开的页面全部挂着，
 * 只有当前页带 is-active，其余用 aria-hidden 藏起来。
 */
const renders = new Map<string, number>()

function Page({ id }: { id: string }) {
  renders.set(id, (renders.get(id) ?? 0) + 1)
  return (
    <article data-page={id}>
      <h1>页面 {id}</h1>
      <p>正文正文正文正文正文</p>
    </article>
  )
}

function Stage({ ids, active, paintRef }: { ids: string[]; active: string; paintRef: { current: (id: string) => ReactNode } }) {
  return (
    <div className="inspector-stage">
      {ids.map((id) => (
        <InspectorStagePane key={id} paneId={id} active={id === active} paintRef={paintRef} />
      ))}
    </div>
  )
}

function Harness({ count }: { count: number }) {
  const [ids, setIds] = useState(() => Array.from({ length: count }, (_, index) => `page-${index}`))
  const [active, setActive] = useState(ids[0] ?? '')
  const [rev, setRev] = useState(0)
  // 和 closeOpenedTab 一样：先从打开列表拿掉，若关掉的是当前页，再落到剩下的最后一页。
  function close(id: string) {
    const next = ids.filter((item) => item !== id)
    setIds(next)
    if (active === id) setActive(next.at(-1) ?? '')
  }
  const paintRef = useRef<(id: string) => ReactNode>(() => null)
  paintRef.current = (id) => <Page id={id} />
  return (
    <div>
      <button type="button" onClick={() => setActive(ids[Math.min(ids.length - 1, 1)] ?? ids[0])}>switch</button>
      <button type="button" onClick={() => setRev((value) => value + 1)}>bump</button>
      <button type="button" onClick={() => close(active)}>close-active</button>
      <button type="button" onClick={() => close(ids.find((id) => id !== active) ?? '')}>close-hidden</button>
      <span data-rev={rev} />
      <Stage ids={ids} active={active} paintRef={paintRef} />
    </div>
  )
}

afterEach(() => {
  cleanup()
  renders.clear()
})

test('the inspector stage keeps every opened page mounted', () => {
  const source = readFileSync(resolve(import.meta.dirname, 'session-inspector.tsx'), 'utf8')
  const stage = source.slice(source.indexOf('export const InspectorStagePane'), source.indexOf('export type SessionInspectorProps'))
  expect(stage).toContain('aria-hidden={!active}')
  expect(source).toContain('<InspectorStagePane')
  expect(source).toContain('const next = opened.filter((item) => item !== id)')
  expect(source).toContain('if (tab === id) setTab(next.at(-1) ?? \'\')')
})

test('opening N pages mounts N panes, and a tab switch rerenders all of them', () => {
  const scales = [1, 8, 24]
  const report: Array<{ pages: number; mounted: number; hidden: number; switchRenders: number; bumpRenders: number }> = []
  for (const count of scales) {
    renders.clear()
    const view = render(<Harness count={count} />)
    const mounted = view.container.querySelectorAll('[data-page]').length
    const hidden = view.container.querySelectorAll('[aria-hidden="true"] [data-page]').length
    renders.clear()
    fireEvent.click(view.getByRole('button', { name: 'switch' }))
    const switchRenders = [...renders.values()].reduce((sum, value) => sum + value, 0)
    renders.clear()
    fireEvent.click(view.getByRole('button', { name: 'bump' }))
    const bumpRenders = [...renders.values()].reduce((sum, value) => sum + value, 0)
    report.push({ pages: count, mounted, hidden, switchRenders, bumpRenders })
    view.unmount()
  }
  for (const row of report) {
    expect(row.mounted).toBe(row.pages)
    expect(row.hidden).toBe(Math.max(0, row.pages - 1))
    expect(row.switchRenders).toBe(row.pages <= 1 ? 0 : 2)
    expect(row.bumpRenders).toBe(0)
  }
})

test('closing one page rerenders every page that stays open', () => {
  const view = render(<Harness count={24} />)
  renders.clear()
  fireEvent.click(view.getByRole('button', { name: 'close-hidden' }))
  const hiddenClose = [...renders.values()].reduce((sum, value) => sum + value, 0)
  expect(view.container.querySelectorAll('[data-page]').length).toBe(23)
  expect(hiddenClose).toBe(0)

  renders.clear()
  fireEvent.click(view.getByRole('button', { name: 'close-active' }))
  const activeClose = [...renders.values()].reduce((sum, value) => sum + value, 0)
  expect(view.container.querySelectorAll('[data-page]').length).toBe(22)
  expect(view.container.querySelectorAll('[aria-hidden="true"] [data-page]').length).toBe(21)
  expect(activeClose).toBe(1)
})
