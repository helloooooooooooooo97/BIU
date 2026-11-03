import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { cleanup, fireEvent, render } from '@testing-library/react'
import { PageDetailBar } from './page-detail-bar.tsx'
import { getPagePresentMode, isPageSourceMode, setPageSourceMode } from './source-mode.ts'
import { getPageFind, getPageViewState, patchPageFind, patchPageViewState } from './page-view-state.ts'

afterEach(() => cleanup())

test('detail bar switches document and source modes', () => {
  setPageSourceMode('p0133', false)
  const { getByText, getByLabelText, container } = render(<PageDetailBar record={{ id: 'p0133' }} />)
  fireEvent.click(getByText('文档'))
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
