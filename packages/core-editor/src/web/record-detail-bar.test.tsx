import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { RecordDetailBar } from './record-detail-bar.tsx'
import { DEFAULT_RECORD_LAYOUT_ID, DEFAULT_RECORD_PROP_VIEW_ID } from '@biu/type-file-system/record-views'
import { getRecordViewCatalog, patchRecordViewCatalog } from '@biu/core-file-system/record-view-catalog'
import { getPageFind, patchPageFind } from './editor-view-state.ts'
import { getActiveRecordLayout, persistRecordLayoutDisplay } from '@biu/core-file-system/record-layouts'

afterEach(() => {
  cleanup()
  patchPageFind('p0133', { open: false, query: '', index: 0, total: 0 })
  persistRecordLayoutDisplay('/pages', 'p0133', DEFAULT_RECORD_LAYOUT_ID, { name: '默认视图' })
  patchRecordViewCatalog('/pages', 'p0133', {
    views: [],
    propViews: [],
    layouts: [],
    activeLayoutId: '',
    contentViewId: 'doc',
    propViewId: DEFAULT_RECORD_PROP_VIEW_ID,
  })
})

test('builtin default layout can be renamed', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  try {
    const { getByText, getByLabelText, getByTestId, findByDisplayValue } = render(<RecordDetailBar record={{ id: 'p0133', title: '演示' }} collectionPath="/pages" />)
    fireEvent.click(getByTestId('page-layout-tab'))
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
    const { getByText, getAllByTitle, findByText, getByTestId } = render(<RecordDetailBar record={{ id: 'p0133', title: '演示' }} collectionPath="/pages" />)
    fireEvent.click(getByTestId('page-layout-tab'))
    fireEvent.click(getAllByTitle('拷贝视图')[0])
    assert.ok(await findByText('默认视图 副本'))
    fireEvent.click(getAllByTitle('拷贝视图')[0])
    assert.ok(await findByText('默认视图 副本 2'))
  } finally {
    globalThis.fetch = original
  }
})

test('left view menu composes layouts and does not list content modes', () => {
  patchRecordViewCatalog('/pages', 'p0133', { contentViewId: 'doc' })
  patchRecordViewCatalog('/pages', 'p0133', {
    views: [{ id: 'site1', name: '官网', kind: 'sandbox', file: 'view-p0133-site1.jsx', dataFile: 'view-data-p0133-site1.json' }],
  })
  const { getByText, getByTestId, getByLabelText, queryByText } = render(<RecordDetailBar record={{ id: 'p0133', title: '演示' }} collectionPath="/pages" />)
  fireEvent.click(getByTestId('page-layout-tab'))
  assert.ok(getByText('添加视图'))
  assert.equal(queryByText('新建沙盒视图'), null)
  assert.equal(queryByText('新建内容视图'), null)
  assert.equal(queryByText('大纲'), null)
  assert.equal(queryByText('源码'), null)
  fireEvent.click(getByLabelText('查看模式'))
  assert.ok(getByText('新建内容视图'))
  fireEvent.click(getByTestId('page-view-site1'))
  assert.equal(getRecordViewCatalog('/pages', 'p0133').contentViewId || 'doc', 'site1')
})

test('detail bar deletes a content sandbox from the present-mode menu', async () => {
  patchRecordViewCatalog('/pages', 'p0133', { contentViewId: 'site1' })
  patchRecordViewCatalog('/pages', 'p0133', {
    views: [{ id: 'site1', name: '官网', kind: 'sandbox', file: 'view-p0133-site1.jsx', dataFile: 'view-data-p0133-site1.json' }],
  })
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  try {
    const { getByLabelText, getByText } = render(<RecordDetailBar record={{ id: 'p0133', title: '演示' }} collectionPath="/pages" />)
    fireEvent.click(getByLabelText('查看模式'))
    assert.ok(getByText('官网'))
    fireEvent.click(getByLabelText('删除 官网'))
    await waitFor(() => {
      assert.equal(getRecordViewCatalog('/pages', 'p0133').views.length, 0)
    })
    assert.equal(getRecordViewCatalog('/pages', 'p0133').contentViewId || 'doc', 'doc')
  } finally {
    globalThis.fetch = original
  }
})

test('detail bar switches document and source modes from the content icon', () => {
  patchRecordViewCatalog('/pages', 'p0133', { contentViewId: 'doc' })
  const { getByText, getByLabelText, container, queryByText, getByTestId } = render(<RecordDetailBar record={{ id: 'p0133' }} collectionPath="/pages" />)
  fireEvent.click(getByTestId('page-layout-tab'))
  assert.equal(queryByText('大纲'), null)
  fireEvent.click(getByLabelText('查看模式'))
  fireEvent.click(getByText('大纲'))
  assert.equal(getRecordViewCatalog('/pages', 'p0133').contentViewId || 'doc', 'outline')
  fireEvent.click(getByLabelText('查看模式'))
  fireEvent.click(getByText('表格'))
  assert.equal(getRecordViewCatalog('/pages', 'p0133').contentViewId || 'doc', 'table')
  fireEvent.click(getByLabelText('查看模式'))
  fireEvent.click(getByText('源码'))
  assert.equal(getRecordViewCatalog('/pages', 'p0133').contentViewId, 'source')
  assert.ok(getByLabelText('排序').querySelector('[data-icon="sort"]'))
  fireEvent.click(getByLabelText('查看模式'))
  assert.ok(container.querySelector('.tasks-viewdd-item-ico'))
})

test('detail bar config uses the table sliders icon and hosts extra menu', () => {
  const { getByLabelText, getByText, queryByText } = render(
    <RecordDetailBar record={{ id: 'p0133' }} collectionPath="/pages" configMenu={<button type="button">删除页面</button>} />,
  )
  fireEvent.click(getByLabelText('表格配置'))
  assert.ok(getByText('删除页面'))
  assert.equal(queryByText('切换标题大纲'), null)
})

test('detail bar search expands in the toolbar with prev and next', () => {
  patchPageFind('p0133', { open: false, query: '', index: 0, total: 0 })
  const { getByLabelText, getByTestId, queryByTestId } = render(<RecordDetailBar record={{ id: 'p0133' }} collectionPath="/pages" />)
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
  const { getByLabelText } = render(<RecordDetailBar record={{ id: 'p0133' }} collectionPath="/pages" onRetry={() => {}} />)
  fireEvent.click(getByLabelText('刷新'))
  assert.ok(getByLabelText('刷新').classList.contains('is-spinning'))
  assert.ok(getByLabelText('刷新').querySelector('.fsdb-spin'))
})

test('detail bar does not host previous and next', () => {
  const { getByLabelText, queryByLabelText } = render(
    <RecordDetailBar record={{ id: 'p0133' }} collectionPath="/pages" onRetry={() => {}} onPrev={() => {}} onNext={() => {}} canPrev canNext />,
  )
  assert.ok(getByLabelText('刷新'))
  assert.equal(queryByLabelText('上一条'), null)
  assert.equal(queryByLabelText('下一条'), null)
})

test('detail bar has no page insert or child-page create', () => {
  const { queryByLabelText, queryByText } = render(<RecordDetailBar record={{ id: 'p0133' }} collectionPath="/pages" />)
  assert.equal(queryByLabelText('插入'), null)
  assert.equal(queryByLabelText('新建归属'), null)
  assert.equal(queryByText('插入'), null)
  assert.equal(queryByText('新建子页面'), null)
})

test('detail bar never shows prev or next even when only one side is available', () => {
  const { queryByLabelText, rerender } = render(
    <RecordDetailBar record={{ id: 'p0133' }} collectionPath="/pages" onRetry={() => {}} onPrev={() => {}} onNext={() => {}} canNext />,
  )
  assert.equal(queryByLabelText('上一条'), null)
  assert.equal(queryByLabelText('下一条'), null)
  rerender(
    <RecordDetailBar record={{ id: 'p0133' }} collectionPath="/pages" onRetry={() => {}} onPrev={() => {}} onNext={() => {}} canPrev />,
  )
  assert.equal(queryByLabelText('上一条'), null)
  assert.equal(queryByLabelText('下一条'), null)
})

test('detail bar visible columns host the same flyout as the table view', () => {
  const { getByLabelText, getByText } = render(
    <RecordDetailBar
      record={{ id: 'p0133' }}
      collectionPath="/pages"
      columnMenu={<div data-testid="view-column-menu">视图列</div>}
    />,
  )
  const btn = getByLabelText('可见列')
  assert.equal(btn.getAttribute('title'), '可见列')
  fireEvent.click(btn)
  assert.ok(getByText('视图列'))
})

test('builtin property table view has no copy action', () => {
  patchRecordViewCatalog('/pages', 'p0133', {
    propViews: [{ id: 'card1', name: '卡片', kind: 'sandbox', file: 'prop-view-p0133-card1.jsx', dataFile: 'prop-view-data-p0133-card1.json' }],
  })
  const { getByLabelText, getByTestId, queryAllByTitle } = render(<RecordDetailBar record={{ id: 'p0133', title: '演示' }} collectionPath="/pages" />)
  fireEvent.click(getByLabelText('属性展示'))
  const table = getByTestId('page-prop-view-table')
  assert.equal(table.parentElement?.querySelector('[title="拷贝视图"]'), null)
  assert.ok(getByTestId('page-prop-view-card1').parentElement?.querySelector('[title="拷贝视图"]'))
  assert.ok(queryAllByTitle('拷贝视图').length >= 1)
})

test('detail bar new menu creates property and content views', () => {
  const { getByLabelText, getByText, queryByText } = render(<RecordDetailBar record={{ id: 'p0133', title: '演示' }} collectionPath="/pages" />)
  assert.ok(getByLabelText('新建'))
  fireEvent.click(getByLabelText('新建类型'))
  assert.equal(queryByText('全局视图'), null)
  const prop = getByText('属性视图')
  const content = getByText('内容视图')
  assert.equal(prop.querySelector('svg')?.innerHTML, content.querySelector('svg')?.innerHTML)
  assert.match(prop.querySelector('svg')?.getAttribute('fill') ?? '', /biu-color-ink-purple/)
})

test('toolbar icons match the selected flyout item', () => {
  patchRecordViewCatalog('/pages', 'p0133', {
    propViews: [{ id: 'card1', name: '卡片', kind: 'sandbox', file: 'prop-view-p0133-card1.jsx', dataFile: 'prop-view-data-p0133-card1.json' }],
  })
  patchRecordViewCatalog('/pages', 'p0133', {
    views: [{ id: 'site1', name: '官网', kind: 'sandbox', file: 'view-p0133-site1.jsx', dataFile: 'view-data-p0133-site1.json' }],
  })
  const { getByLabelText, getByTestId } = render(<RecordDetailBar record={{ id: 'p0133', title: '演示' }} collectionPath="/pages" />)
  fireEvent.click(getByLabelText('属性展示'))
  assert.ok(getByTestId('page-prop-view-source'))
  fireEvent.click(getByTestId('page-prop-view-source'))
  assert.equal(getRecordViewCatalog('/pages', 'p0133').propViewId, 'source')
  fireEvent.click(getByLabelText('属性展示'))
  assert.equal(
    getByTestId('page-prop-view').querySelector('svg')?.innerHTML,
    getByTestId('page-prop-view-source').querySelector('svg')?.innerHTML,
  )
  fireEvent.click(getByTestId('page-prop-view-hidden'))
  fireEvent.click(getByLabelText('属性展示'))
  assert.equal(
    getByTestId('page-prop-view').querySelector('svg')?.innerHTML,
    getByTestId('page-prop-view-hidden').querySelector('svg')?.innerHTML,
  )
  fireEvent.click(getByTestId('page-prop-view-card1'))
  fireEvent.click(getByLabelText('属性展示'))
  assert.equal(
    getByTestId('page-prop-view').querySelector('svg')?.innerHTML,
    getByTestId('page-prop-view-card1').querySelector('svg')?.innerHTML,
  )
  assert.match(getByTestId('page-prop-view-card1').querySelector('svg')?.getAttribute('fill') ?? '', /biu-color-ink-purple/)
  fireEvent.click(getByLabelText('查看模式'))
  fireEvent.click(getByTestId('page-view-hidden'))
  fireEvent.click(getByTestId('page-layout-tab'))
  assert.equal(
    getByTestId('page-layout-tab').querySelector('svg')?.innerHTML,
    getByTestId(`page-layout-${DEFAULT_RECORD_LAYOUT_ID}`).querySelector('svg')?.innerHTML,
  )
  fireEvent.click(getByLabelText('查看模式'))
  fireEvent.click(getByTestId('page-view-site1'))
  fireEvent.click(getByLabelText('查看模式'))
  assert.equal(
    getByLabelText('查看模式').querySelector('svg')?.innerHTML,
    getByTestId('page-view-site1').querySelector('svg')?.innerHTML,
  )
})

test('content and property menus include a builtin hidden view', () => {
  patchRecordViewCatalog('/pages', 'p0133', { contentViewId: 'doc' })
  patchRecordViewCatalog('/pages', 'p0133', { propViewId: DEFAULT_RECORD_PROP_VIEW_ID })
  const { getByLabelText, getByTestId, getByText } = render(<RecordDetailBar record={{ id: 'p0133', title: '演示' }} collectionPath="/pages" />)
  fireEvent.click(getByLabelText('属性展示'))
  fireEvent.click(getByTestId('page-prop-view-hidden'))
  assert.equal(getRecordViewCatalog('/pages', 'p0133').propViewId, 'hidden')
  assert.equal(getRecordViewCatalog('/pages', 'p0133').contentViewId || 'doc', 'doc')
  fireEvent.click(getByLabelText('查看模式'))
  fireEvent.click(getByTestId('page-view-hidden'))
  assert.equal(getRecordViewCatalog('/pages', 'p0133').contentViewId || 'doc', 'hidden')
  assert.equal(getRecordViewCatalog('/pages', 'p0133').propViewId, 'hidden')
  fireEvent.click(getByLabelText('查看模式'))
  fireEvent.click(getByText('文档'))
  assert.equal(getRecordViewCatalog('/pages', 'p0133').contentViewId || 'doc', 'doc')
  fireEvent.click(getByLabelText('属性展示'))
  fireEvent.click(getByTestId('page-prop-view-table'))
  assert.equal(getRecordViewCatalog('/pages', 'p0133').propViewId, DEFAULT_RECORD_PROP_VIEW_ID)
})

test('property and content presentation bind to the active layout independently', () => {
  patchRecordViewCatalog('/pages', 'p0133', { contentViewId: 'doc' })
  patchRecordViewCatalog('/pages', 'p0133', { propViewId: DEFAULT_RECORD_PROP_VIEW_ID })
  patchRecordViewCatalog('/pages', 'p0133', {
    propViews: [{ id: 'card1', name: '卡片', kind: 'sandbox', file: 'prop-view-p0133-card1.jsx', dataFile: 'prop-view-data-p0133-card1.json' }],
  })
  const { getByLabelText, getByTestId, getByText } = render(<RecordDetailBar record={{ id: 'p0133', title: '演示' }} collectionPath="/pages" />)
  fireEvent.click(getByLabelText('属性展示'))
  assert.ok(getByText('新建属性视图'))
  fireEvent.click(getByTestId('page-prop-view-card1'))
  assert.equal(getRecordViewCatalog('/pages', 'p0133').propViewId, 'card1')
  assert.equal(getRecordViewCatalog('/pages', 'p0133').contentViewId || 'doc', 'doc')
  fireEvent.click(getByLabelText('查看模式'))
  fireEvent.click(getByText('大纲'))
  assert.equal(getRecordViewCatalog('/pages', 'p0133').contentViewId || 'doc', 'outline')
  assert.equal(getRecordViewCatalog('/pages', 'p0133').propViewId, 'card1')
})

test('tag property view switch writes catalog like pages', async () => {
  const original = globalThis.fetch
  globalThis.fetch = async () => new Response('{}', { status: 200 })
  try {
    const propViews = [{ id: 'p1', name: '新视图', kind: 'sandbox' as const, file: 'prop-view-need-p1.jsx' }]
    const { getByLabelText, getByTestId } = render(
      <RecordDetailBar record={{ id: 'need', title: '需求', propViews }} collectionPath="/tags" />,
    )
    fireEvent.click(getByLabelText('属性展示'))
    fireEvent.click(getByTestId('page-prop-view-p1'))
    assert.equal(getRecordViewCatalog('/tags', 'need').propViewId, 'p1')
    fireEvent.click(getByLabelText('属性展示'))
    fireEvent.click(getByTestId('page-prop-view-table'))
    assert.equal(getRecordViewCatalog('/tags', 'need').propViewId, 'table')
  } finally {
    globalThis.fetch = original
  }
})

test('tag detail bar deletes property and content views against /tags', async () => {
  const original = globalThis.fetch
  const bodies: string[] = []
  globalThis.fetch = async (_input, init) => {
    bodies.push(String(init?.body ?? ''))
    return new Response('{}', { status: 200 })
  }
  try {
    const views = [{ id: 'v1', name: '卡片', kind: 'sandbox' as const, file: 'view-need-v1.jsx', dataFile: 'view-data-need-v1.json' }]
    const propViews = [{ id: 'p1', name: '宽表', kind: 'sandbox' as const, file: 'prop-view-need-p1.jsx', dataFile: 'prop-view-data-need-p1.json' }]
    const { getByLabelText, getByTestId, queryByTestId } = render(
      <RecordDetailBar record={{ id: 'need', title: '需求', views, propViews }} collectionPath="/tags" />,
    )
    fireEvent.click(getByLabelText('属性展示'))
    fireEvent.click(getByTestId('page-prop-view-delete-p1'))
    await waitFor(() => assert.equal(queryByTestId('page-prop-view-p1'), null))
    fireEvent.click(getByLabelText('查看模式'))
    fireEvent.click(getByTestId('page-view-delete-v1'))
    await waitFor(() => assert.equal(queryByTestId('page-view-v1'), null))
    assert.ok(bodies.some((item) => item.includes('/tags/need') && item.includes('propViews')))
    assert.ok(bodies.some((item) => item.includes('/tags/need') && item.includes('"views"')))
    assert.equal(bodies.some((item) => item.includes('/pages/need')), false)
  } finally {
    globalThis.fetch = original
  }
})

test('detail bar sort and filter write page view state', async () => {
  const { getByLabelText, getByText, queryByText } = render(<RecordDetailBar record={{ id: 'p0133' }} collectionPath="/pages" />)
  fireEvent.click(getByLabelText('排序'))
  assert.ok(getByText('原文顺序'))
  assert.ok(getByText('按块类型'))
  assert.equal(queryByText('段落'), null)
  fireEvent.click(getByText('按标题 A→Z'))
  await waitFor(() => assert.equal(getActiveRecordLayout('/pages', 'p0133', 'doc').sort, 'title-asc'))
  fireEvent.click(getByLabelText('筛选'))
  fireEvent.click(getByText('标题'))
  await waitFor(() => assert.deepEqual(getActiveRecordLayout('/pages', 'p0133', 'doc').filterKinds, ['heading']))
})
