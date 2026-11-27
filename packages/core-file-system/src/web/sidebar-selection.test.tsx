import { Component, Profiler, useState, type ReactNode } from 'react'
import { afterEach, beforeEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { act, cleanup, fireEvent, render, waitFor, within } from '@testing-library/react'
import { REQUIRED_RECORD_FIELDS, type CollectionInfo, type CollectionSchema } from '@biu/type-file-system'
import { invalidateListReads } from './db-client.ts'
import { CollectionBrowser } from './browser.tsx'
import { activeViewStorageKey, getStarredViews, persistStarredViews, upsertSavedView } from './view-storage.ts'
import { DataSidebar } from './data-sidebar.tsx'
import { DataSidebarSlot } from './data-sidebar-slot.tsx'
import { normalizeSavedView } from './saved-view.ts'

const schema: CollectionSchema = {
  labelField: 'title',
  fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string', writable: true } },
}
const tables: CollectionInfo[] = ['/selection-a', '/selection-b'].map((path) => ({
  id: path.slice(1), path, kind: 'collection', label: path.slice(1), view: null,
}))

class RenderBoundary extends Component<{ children: ReactNode }, { error: string }> {
  state = { error: '' }
  static getDerivedStateFromError(error: Error) { return { error: error.message } }
  render() {
    return this.state.error ? <div data-testid="render-error">{this.state.error}</div> : this.props.children
  }
}

const originalScrollIntoView = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView')

beforeEach(() => {
  vi.stubGlobal('CSS', { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, (char) => `\\${char}`) })
  vi.stubGlobal('ResizeObserver', class {
    observe() {}
    unobserve() {}
    disconnect() {}
  })
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', { configurable: true, value: vi.fn() })
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input), 'http://test.local')
    const path = url.searchParams.get('path') ?? ''
    const body = url.pathname === '/api/db/saved-views'
      ? {
          views: [
            { id: 'all', name: `全部${path.slice(1)}`, mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: ['title'], rank: 0 },
            ...(path === '/selection-views'
              ? [{ id: 'selection-target-view', name: '目标页面视图', mode: 'table', sortField: 'title', sortDir: 'asc', columns: ['title'], filters: {}, query: 'only-target', groupBy: '', rank: 1 }]
              : []),
          ],
        }
      : url.pathname === '/api/db/list' && path.startsWith('/selection-')
        ? { schema, items: [{ id: `${path}${url.searchParams.get('q') === 'only-target' ? '-target-row' : '-row'}`, title: `${path} content` }], total: 1 }
        : url.pathname === '/api/db/stat'
          ? { schema, total: 1 }
          : { items: [], total: 0 }
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
  }))
})

afterEach(() => {
  cleanup()
  invalidateListReads()
  if (originalScrollIntoView) Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScrollIntoView)
  else delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

test('switching collections after selecting a cell paints the destination without an update loop', async () => {
  let commits = 0
  const view = (path: string) => (
    <RenderBoundary>
      <Profiler id="table" onRender={() => {
        if (++commits > 80) throw new Error('table selection triggered an update loop')
      }}>
        <CollectionBrowser collectionPath={path} routeViewId="all"
          title={path} blurb="" tables={tables} />
      </Profiler>
    </RenderBoundary>
  )
  const result = render(view('/selection-a'))
  await waitFor(() => assert.ok(result.container.querySelector('tr[data-record-id="/selection-a-row"] td.is-cell-on')))
  result.rerender(view('/selection-b'))
  await waitFor(() => {
    assert.equal(result.queryByTestId('render-error')?.textContent ?? '', '')
    assert.ok(result.container.querySelector('tr[data-record-id="/selection-b-row"]'))
    assert.equal(result.container.querySelector('tr[data-record-id="/selection-a-row"]'), null)
  })
  assert.ok(commits < 80)
})


test('sidebar view clicks do not close a record through the previous view route', async () => {
  const path = '/selection-views'
  const target = normalizeSavedView({
    id: 'selection-target-view', name: '目标页面视图', mode: 'table',
    sortField: 'title', sortDir: 'asc', columns: ['title'], filters: {}, query: 'only-target', groupBy: '',
  })
  upsertSavedView(path, target)
  const viewTables: CollectionInfo[] = [{ id: path.slice(1), path, kind: 'collection', label: '页面', view: null }]
  const closeRecord = vi.fn()
  function RoutedCollection() {
    const [routeView, setRouteView] = useState('all')
    return <>
      <output data-testid="route-view">{routeView}</output>
      <DataSidebarSlot renderSlot={() => null} />
      <CollectionBrowser collectionPath={path} routeViewId={routeView} title="页面" blurb="" tables={viewTables}
        onOpenView={setRouteView}
        onOpenTable={(_path, id) => setRouteView(id!)}
        onCloseRecord={() => { closeRecord(); setRouteView(routeView) }} />
    </>
  }
  const result = render(<RoutedCollection />)
  const button = await result.findByRole('button', { name: target.name })
  await waitFor(() => assert.ok(result.container.querySelector('tr[data-record-id="/selection-views-row"]')))
  fireEvent.click(button)
  await act(async () => { await Promise.resolve() })
  assert.equal(result.getByTestId('route-view').textContent, target.id, 'the selected view route must survive queued callbacks')
  assert.equal(closeRecord.mock.calls.length, 0, 'a view switch must not navigate back through onCloseRecord')
  await waitFor(() => {
    assert.equal(result.getByTestId('route-view').textContent, target.id)
    assert.ok(result.getAllByRole('button', { name: target.name }).some((button) => button.closest('.chat-session-row')?.classList.contains('is-active')))
    assert.ok(result.container.querySelector('tr[data-record-id="/selection-views-target-row"]'))
    assert.equal(Boolean(result.container.querySelector('tr[data-record-id="/selection-views-row"]')), false)
    assert.ok(result.getByTestId('fsdb-view-tab').textContent?.includes(target.name))
  })
})


test('sidebar collection and icon navigation open the first remaining view after deleting the seed view', () => {
  const path = '/selection-deleted-builtin'
  const first = normalizeSavedView({ id: 'first-remaining', name: '第一个视图', rank: 0 } as unknown as Parameters<typeof normalizeSavedView>[0])
  const second = normalizeSavedView({ id: 'second-remaining', name: '第二个视图', rank: 1 } as unknown as Parameters<typeof normalizeSavedView>[0])
  upsertSavedView(path, second)
  upsertSavedView(path, first)
  const onOpenTable = vi.fn()
  const result = render(<DataSidebar collectionPath="/selection-other" title="其他表"
    tables={[{ id: path.slice(1), path, kind: 'collection', label: '删除后的页面', view: null }]}
    views={[]} activeViewId={null} onOpenTable={onOpenTable}
    onApplyView={vi.fn()} onDeleteView={vi.fn()} onAddView={vi.fn()} />)
  const heading = result.getAllByRole('button', { name: '删除后的页面' })
    .find((button) => button.closest('.sidebar-group-head'))!
  fireEvent.click(heading)
  fireEvent.click(within(result.getByTestId('data-icon-rail')).getByRole('button', { name: '删除后的页面' }))
  assert.deepEqual(onOpenTable.mock.calls, [[path, first.id], [path, first.id]])
})

test('sidebar collection navigation follows the displayed view order', () => {
  const path = '/selection-ranked-views'
  const first = normalizeSavedView({ id: 'ranked-first', name: '排在最前', rank: 0 } as unknown as Parameters<typeof normalizeSavedView>[0])
  const seedAll = normalizeSavedView({ id: 'all', name: '全部排序后的页面', rank: 1 } as unknown as Parameters<typeof normalizeSavedView>[0])
  upsertSavedView(path, first)
  upsertSavedView(path, seedAll)
  const onOpenTable = vi.fn()
  const result = render(<DataSidebar collectionPath="/selection-other" title="其他表"
    tables={[{ id: path.slice(1), path, kind: 'collection', label: '排序后的页面', view: null }]}
    views={[]} activeViewId={null} onOpenTable={onOpenTable}
    onApplyView={vi.fn()} onDeleteView={vi.fn()} onAddView={vi.fn()} />)
  const heading = result.getAllByRole('button', { name: '排序后的页面' })
    .find((button) => button.closest('.sidebar-group-head'))!
  fireEvent.click(heading)
  fireEvent.click(within(result.getByTestId('data-icon-rail')).getByRole('button', { name: '排序后的页面' }))
  assert.deepEqual(onOpenTable.mock.calls, [[path, first.id], [path, first.id]])
})

test('sidebar collection navigation remembers the last active view for each collection', () => {
  const path = '/selection-remembered-view'
  const first = normalizeSavedView({ id: 'view-first', name: '需求列表', rank: 0 } as unknown as Parameters<typeof normalizeSavedView>[0])
  const second = normalizeSavedView({ id: 'view-second', name: '新视图', rank: 1 } as unknown as Parameters<typeof normalizeSavedView>[0])
  upsertSavedView(path, first)
  upsertSavedView(path, second)
  localStorage.setItem(activeViewStorageKey(path), second.id)
  const onOpenTable = vi.fn()
  const result = render(<DataSidebar collectionPath="/selection-other" title="其他表"
    tables={[{ id: path.slice(1), path, kind: 'collection', label: '页面', view: null }]}
    views={[]} activeViewId={null} onOpenTable={onOpenTable}
    onApplyView={vi.fn()} onDeleteView={vi.fn()} onAddView={vi.fn()} />)
  const heading = result.getAllByRole('button', { name: '页面' })
    .find((button) => button.closest('.sidebar-group-head'))!
  fireEvent.click(heading)
  fireEvent.click(within(result.getByTestId('data-icon-rail')).getByRole('button', { name: '页面' }))
  assert.deepEqual(onOpenTable.mock.calls, [[path, second.id], [path, second.id]])
})

test('highlighted sidebar row backgrounds activate the title action without hijacking controls', () => {
  const path = '/selection-hit-area'
  const target = normalizeSavedView({
    id: 'hit-area-view', name: '整行可点击视图', mode: 'table',
    sortField: 'title', sortDir: 'asc', columns: ['title'], filters: {}, groupBy: '',
  })
  upsertSavedView(path, target)
  const starredBefore = getStarredViews()
  const onOpenTable = vi.fn(), onApplyView = vi.fn()
  const onDeleteView = vi.fn(), onAddView = vi.fn(), onExpandedViewKeyChange = vi.fn()
  const result = render(<DataSidebar collectionPath={path} title="点击区域表"
    tables={[{ id: path.slice(1), path, kind: 'collection', label: '点击区域表', view: null }]}
    views={[target]} activeViewId="all" onOpenTable={onOpenTable}
    onApplyView={onApplyView} onDeleteView={onDeleteView}
    onAddView={onAddView} onExpandedViewKeyChange={onExpandedViewKeyChange} />)
  try {
    const label = result.getByRole('button', { name: target.name })
    const row = label.closest<HTMLElement>('.chat-session-row')!
    for (const hit of [row, row.querySelector('.chat-session-row-main')!, label]) {
      onOpenTable.mockClear()
      onApplyView.mockClear()
      fireEvent.click(hit)
      assert.equal(onOpenTable.mock.calls.length, 1)
      assert.deepEqual(onOpenTable.mock.calls[0], [path, target.id])
      assert.equal(onApplyView.mock.calls.length, 1)
    }
    onOpenTable.mockClear()
    onApplyView.mockClear()
    fireEvent.click(within(row).getByRole('button', { name: `删除 ${target.name}` }))
    fireEvent.click(within(row).getByRole('button', { name: `收藏 ${target.name}` }))
    assert.equal(onExpandedViewKeyChange.mock.calls.length, 0)
    assert.equal(onDeleteView.mock.calls.length, 1)
    assert.equal(onApplyView.mock.calls.length, 0)
    assert.equal(onOpenTable.mock.calls.length, 0)

    const starredLabel = result.getAllByRole('button', { name: target.name })
      .find((button) => button.closest('.chat-session-row') !== row)!
    fireEvent.click(starredLabel.closest('.chat-session-row')!)
    assert.deepEqual(onOpenTable.mock.calls, [[path, target.id]])

    onOpenTable.mockClear()
    const head = result.getAllByRole('button', { name: '点击区域表' })
      .find((button) => button.closest('.sidebar-group-head'))!.closest('.sidebar-group-head')!
    fireEvent.click(head)
    assert.deepEqual(onOpenTable.mock.calls, [[path, target.id]])
    onOpenTable.mockClear()
    fireEvent.click(result.getByTestId(`sidebar-add-view-${path}`))
    assert.equal(onOpenTable.mock.calls.length, 0)
    assert.equal(onAddView.mock.calls.length, 1)
  } finally {
    result.unmount()
    persistStarredViews(starredBefore)
  }
})
