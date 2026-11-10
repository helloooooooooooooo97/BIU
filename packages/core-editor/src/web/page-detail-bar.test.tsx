import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { PageDetailBar } from './page-detail-bar.tsx'
import { getPagePresentMode, isPageSourceMode, setPagePresentMode, setPageSourceMode } from './source-mode.ts'
import { getPageViews, setPageViews } from './page-views.ts'
import { getPagePropPresentMode, PAGE_PROP_TABLE_VIEW_ID, setPagePropPresentMode } from './page-prop-present.ts'
import { setPagePropViews } from './page-prop-views.ts'
import { getPageFind, getPageViewState, patchPageFind, patchPageViewState } from './page-view-state.ts'
import { resetPageLayoutState } from './page-layouts.ts'

afterEach(() => {
  cleanup()
  resetPageLayoutState('p0133')
  setPagePresentMode('p0133', 'doc')
  setPageSourceMode('p0133', false)
  setPagePropPresentMode('p0133', PAGE_PROP_TABLE_VIEW_ID)
})

test('builtin default layout can be renamed', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  try {
    const { getByText, getByLabelText, getByTestId, findByDisplayValue } = render(<PageDetailBar record={{ id: 'p0133', title: '演示' }} />)
    fireEvent.click(getByText('默认视图'))
    fireEvent.click(getByLabelText('重命名 默认视图'))
    const input = await findByDisplayValue('默认视图')
    fireEvent.change(input, { target: { value: '工作台' } })
    fireEvent.blur(input)
    await waitFor(() => {
      assert.ok(getByTestId('page-layout-tab').textContent?.includes('工作台'))
      assert.equal(getByTestId('page-layout-builtin-default').textContent, '工作台')
    })
  } finally {
    globalThis.fetch = original
  }
})

test('copying a layout uses unique 副本 names like table views', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  try {
    const { getByText, getAllByTitle, findByText } = render(<PageDetailBar record={{ id: 'p0133', title: '演示' }} />)
    fireEvent.click(getByText('默认视图'))
    fireEvent.click(getAllByTitle('拷贝视图')[0])
    assert.ok(await findByText('默认视图 副本'))
    fireEvent.click(getAllByTitle('拷贝视图')[0])
    assert.ok(await findByText('默认视图 副本 2'))
  } finally {
    globalThis.fetch = original
  }
})

test('left view menu composes layouts and does not list content modes', () => {
  setPagePresentMode('p0133', 'doc')
  setPageViews('p0133', [
    { id: 'site1', name: '官网', kind: 'sandbox', file: 'view-p0133-site1.jsx', dataFile: 'view-data-p0133-site1.json' },
  ])
  const { getByText, getByTestId, getByLabelText, queryByText } = render(<PageDetailBar record={{ id: 'p0133', title: '演示' }} />)
  fireEvent.click(getByText('默认视图'))
  assert.ok(getByText('添加视图'))
  assert.equal(queryByText('新建沙盒视图'), null)
  assert.equal(queryByText('新建内容视图'), null)
  assert.equal(queryByText('大纲'), null)
  assert.equal(queryByText('源码'), null)
  fireEvent.click(getByLabelText('查看模式'))
  assert.ok(getByText('新建内容视图'))
  fireEvent.click(getByTestId('page-view-site1'))
  assert.equal(getPagePresentMode('p0133'), 'site1')
})

test('detail bar deletes a content sandbox from the present-mode menu', async () => {
  setPagePresentMode('p0133', 'site1')
  setPageViews('p0133', [
    { id: 'site1', name: '官网', kind: 'sandbox', file: 'view-p0133-site1.jsx', dataFile: 'view-data-p0133-site1.json' },
  ])
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  try {
    const { getByLabelText, getByText } = render(<PageDetailBar record={{ id: 'p0133', title: '演示' }} />)
    fireEvent.click(getByLabelText('查看模式'))
    assert.ok(getByText('官网'))
    fireEvent.click(getByLabelText('删除 官网'))
    await waitFor(() => {
      assert.equal(getPageViews('p0133').length, 0)
    })
    assert.equal(getPagePresentMode('p0133'), 'doc')
  } finally {
    globalThis.fetch = original
  }
})

test('detail bar switches document and source modes from the content icon', () => {
  setPageSourceMode('p0133', false)
  const { getByText, getByLabelText, container, queryByText } = render(<PageDetailBar record={{ id: 'p0133' }} />)
  fireEvent.click(getByText('默认视图'))
  assert.equal(queryByText('大纲'), null)
  fireEvent.click(getByLabelText('查看模式'))
  fireEvent.click(getByText('大纲'))
  assert.equal(getPagePresentMode('p0133'), 'outline')
  fireEvent.click(getByLabelText('查看模式'))
  fireEvent.click(getByText('表格'))
  assert.equal(getPagePresentMode('p0133'), 'table')
  fireEvent.click(getByLabelText('查看模式'))
  fireEvent.click(getByText('源码'))
  assert.equal(isPageSourceMode('p0133'), true)
  assert.equal(getPagePresentMode('p0133'), 'source')
  assert.ok(getByLabelText('排序').querySelector('[data-icon="sort"]'))
  fireEvent.click(getByLabelText('查看模式'))
  assert.ok(container.querySelector('.tasks-viewdd-item-ico'))
})

test('detail bar config uses the table sliders icon and hosts extra menu', () => {
  const { getByLabelText, getByText, queryByText } = render(
    <PageDetailBar record={{ id: 'p0133' }} configMenu={<button type="button">删除页面</button>} />,
  )
  fireEvent.click(getByLabelText('表格配置'))
  assert.ok(getByText('删除页面'))
  assert.equal(queryByText('切换标题大纲'), null)
})

test('detail bar search expands in the toolbar with prev and next', () => {
  patchPageFind('p0133', { open: false, query: '', index: 0, total: 0 })
  const { getByLabelText, getByTestId, queryByTestId } = render(<PageDetailBar record={{ id: 'p0133' }} />)
  assert.equal(queryByTestId('page-find'), null)
  fireEvent.click(getByLabelText('搜索'))
  assert.equal(getPageFind('p0133').open, true)
  assert.ok(getByTestId('page-find'))
  assert.ok(getByLabelText('上一个'))
  assert.ok(getByLabelText('下一个'))
  fireEvent.change(getByTestId('page-find'), { target: { value: 'hello' } })
  assert.equal(getPageFind('p0133').query, 'hello')
  fireEvent.click(getByLabelText('下一个'))
  assert.equal(getPageFind('p0133').index, 1)
})

test('detail bar refresh spins the icon', () => {
  const { getByLabelText } = render(<PageDetailBar record={{ id: 'p0133' }} onRetry={() => {}} />)
  fireEvent.click(getByLabelText('刷新'))
  assert.ok(getByLabelText('刷新').classList.contains('is-spinning'))
  assert.ok(getByLabelText('刷新').querySelector('.fsdb-spin'))
})

test('detail bar hosts previous and next after refresh', () => {
  const { getByLabelText } = render(
    <PageDetailBar record={{ id: 'p0133' }} onRetry={() => {}} onPrev={() => {}} onNext={() => {}} canPrev canNext />,
  )
  const refresh = getByLabelText('刷新')
  const prev = getByLabelText('上一条')
  const next = getByLabelText('下一条')
  const create = getByLabelText('新建')
  assert.ok(refresh.compareDocumentPosition(prev) & Node.DOCUMENT_POSITION_FOLLOWING)
  assert.ok(prev.compareDocumentPosition(next) & Node.DOCUMENT_POSITION_FOLLOWING)
  assert.ok(next.compareDocumentPosition(create) & Node.DOCUMENT_POSITION_FOLLOWING)
})

test('detail bar has no page insert or child-page create', () => {
  const { queryByLabelText, queryByText } = render(<PageDetailBar record={{ id: 'p0133' }} />)
  assert.equal(queryByLabelText('插入'), null)
  assert.equal(queryByLabelText('新建归属'), null)
  assert.equal(queryByText('插入'), null)
  assert.equal(queryByText('新建子页面'), null)
})

test('detail bar hides missing prev or next', () => {
  const { queryByLabelText, rerender } = render(
    <PageDetailBar record={{ id: 'p0133' }} onRetry={() => {}} onPrev={() => {}} onNext={() => {}} canNext />,
  )
  assert.equal(queryByLabelText('上一条'), null)
  assert.ok(queryByLabelText('下一条'))
  rerender(
    <PageDetailBar record={{ id: 'p0133' }} onRetry={() => {}} onPrev={() => {}} onNext={() => {}} canPrev />,
  )
  assert.ok(queryByLabelText('上一条'))
  assert.equal(queryByLabelText('下一条'), null)
})

test('detail bar visible columns host the same flyout as the table view', () => {
  const { getByLabelText, getByText } = render(
    <PageDetailBar
      record={{ id: 'p0133' }}
      columnMenu={<div data-testid="view-column-menu">视图列</div>}
    />,
  )
  const btn = getByLabelText('可见列')
  assert.equal(btn.getAttribute('title'), '可见列')
  fireEvent.click(btn)
  assert.ok(getByText('视图列'))
})

test('builtin property table view has no copy action', () => {
  setPagePropViews('p0133', [
    { id: 'card1', name: '卡片', kind: 'sandbox', file: 'prop-view-p0133-card1.jsx', dataFile: 'prop-view-data-p0133-card1.json' },
  ])
  const { getByLabelText, getByTestId, queryAllByTitle } = render(<PageDetailBar record={{ id: 'p0133', title: '演示' }} />)
  fireEvent.click(getByLabelText('属性展示'))
  const table = getByTestId('page-prop-view-table')
  assert.equal(table.parentElement?.querySelector('[title="拷贝视图"]'), null)
  assert.ok(getByTestId('page-prop-view-card1').parentElement?.querySelector('[title="拷贝视图"]'))
  assert.ok(queryAllByTitle('拷贝视图').length >= 1)
})

test('detail bar new menu creates global, property, and content views', () => {
  const { getByLabelText, getByText } = render(<PageDetailBar record={{ id: 'p0133', title: '演示' }} collectionPath="/pages" />)
  assert.ok(getByLabelText('新建'))
  fireEvent.click(getByLabelText('新建类型'))
  const layout = getByText('全局视图')
  const prop = getByText('属性视图')
  const content = getByText('内容视图')
  assert.ok(layout.querySelector('svg'))
  assert.ok(prop.querySelector('svg'))
  assert.ok(content.querySelector('svg'))
})

test('content and property menus include a builtin hidden view', () => {
  setPagePresentMode('p0133', 'doc')
  setPagePropPresentMode('p0133', PAGE_PROP_TABLE_VIEW_ID)
  const { getByLabelText, getByTestId, getByText } = render(<PageDetailBar record={{ id: 'p0133', title: '演示' }} collectionPath="/pages" />)
  fireEvent.click(getByLabelText('属性展示'))
  fireEvent.click(getByTestId('page-prop-view-hidden'))
  assert.equal(getPagePropPresentMode('p0133'), 'hidden')
  assert.equal(getPagePresentMode('p0133'), 'doc')
  fireEvent.click(getByLabelText('查看模式'))
  fireEvent.click(getByTestId('page-view-hidden'))
  assert.equal(getPagePresentMode('p0133'), 'hidden')
  assert.equal(getPagePropPresentMode('p0133'), 'hidden')
  fireEvent.click(getByLabelText('查看模式'))
  fireEvent.click(getByText('文档'))
  assert.equal(getPagePresentMode('p0133'), 'doc')
  fireEvent.click(getByLabelText('属性展示'))
  fireEvent.click(getByTestId('page-prop-view-table'))
  assert.equal(getPagePropPresentMode('p0133'), PAGE_PROP_TABLE_VIEW_ID)
})

test('property and content presentation bind to the active layout independently', () => {
  setPagePresentMode('p0133', 'doc')
  setPagePropPresentMode('p0133', PAGE_PROP_TABLE_VIEW_ID)
  setPagePropViews('p0133', [
    { id: 'card1', name: '卡片', kind: 'sandbox', file: 'prop-view-p0133-card1.jsx', dataFile: 'prop-view-data-p0133-card1.json' },
  ])
  const { getByLabelText, getByTestId, getByText } = render(<PageDetailBar record={{ id: 'p0133', title: '演示' }} collectionPath="/pages" />)
  fireEvent.click(getByLabelText('属性展示'))
  assert.ok(getByText('新建属性视图'))
  fireEvent.click(getByTestId('page-prop-view-card1'))
  assert.equal(getPagePropPresentMode('p0133'), 'card1')
  assert.equal(getPagePresentMode('p0133'), 'doc')
  fireEvent.click(getByLabelText('查看模式'))
  fireEvent.click(getByText('大纲'))
  assert.equal(getPagePresentMode('p0133'), 'outline')
  assert.equal(getPagePropPresentMode('p0133'), 'card1')
})

test('detail bar sort and filter write page view state', () => {
  patchPageViewState('p0133', { filterKinds: [], sort: 'doc' })
  const { getByLabelText, getByText, queryByText } = render(<PageDetailBar record={{ id: 'p0133' }} />)
  fireEvent.click(getByLabelText('排序'))
  assert.ok(getByText('原文顺序'))
  assert.ok(getByText('按块类型'))
  assert.equal(queryByText('段落'), null)
  fireEvent.click(getByText('按标题 A→Z'))
  assert.equal(getPageViewState('p0133').sort, 'title-asc')
  fireEvent.click(getByLabelText('筛选'))
  fireEvent.click(getByText('标题'))
  assert.deepEqual(getPageViewState('p0133').filterKinds, ['heading'])
})
