import { cleanup, render, waitFor } from '@testing-library/react'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { PAGE_EDITOR_STYLE } from './style.ts'
import { PagePropHostView, PageProperties } from './page-prop-host.tsx'
import { resetPageFileState } from './page-views.ts'
import { setPagePropViews } from './page-prop-views.ts'
import { PAGE_PROP_HIDDEN_VIEW_ID, PAGE_PROP_TABLE_VIEW_ID, setPagePropPresentMode } from './page-prop-present.ts'

test('property host paints Field sandbox when the view file is missing', async () => {
  cleanup()
  resetPageFileState()
  setPagePropViews('home', [
    { id: 'card1', name: '卡片', kind: 'sandbox', file: 'missing-prop.jsx', dataFile: 'missing-prop-data.json' },
  ])
  const { getByTestId } = render(
    <PagePropHostView
      record={{ id: 'home', title: '演示页' }}
      viewId="card1"
      schema={{ fields: { title: { type: 'string', label: '标题', writable: true } } }}
    />,
  )
  await waitFor(() => {
    assert.ok(getByTestId('page-prop-host-root'))
  })
  assert.match(getByTestId('page-prop-host-root').textContent ?? '', /属性沙盒/)
  assert.ok(getByTestId('page-prop-field-title'))
})

test('page properties keep the default table until a custom view is selected', () => {
  cleanup()
  setPagePropPresentMode('home', PAGE_PROP_TABLE_VIEW_ID)
  setPagePropViews('home', [])
  const { getByTestId, rerender } = render(
    <PageProperties record={{ id: 'home', title: '演示页' }} collectionPath="/pages">
      <div data-testid="prop-table">表格</div>
    </PageProperties>,
  )
  assert.equal(getByTestId('prop-table').textContent, '表格')
  setPagePropViews('home', [
    { id: 'card1', name: '卡片', kind: 'sandbox', file: 'missing-prop.jsx', dataFile: 'missing-prop-data.json' },
  ])
  setPagePropPresentMode('home', 'card1')
  rerender(
    <PageProperties record={{ id: 'home', title: '演示页' }} collectionPath="/pages">
      <div data-testid="prop-table">表格</div>
    </PageProperties>,
  )
  assert.ok(getByTestId('page-prop-host'))
})

test('hidden property view unmounts the properties region', () => {
  cleanup()
  setPagePropPresentMode('home', PAGE_PROP_HIDDEN_VIEW_ID)
  setPagePropViews('home', [])
  const { queryByTestId } = render(
    <PageProperties record={{ id: 'home', title: '演示页' }} collectionPath="/pages">
      <div data-testid="prop-table">表格</div>
    </PageProperties>,
  )
  assert.equal(queryByTestId('prop-table'), null)
  assert.equal(queryByTestId('page-prop-host'), null)
})

test('property sandbox nav tools use the same muted icon color as page chrome', () => {
  assert.match(
    PAGE_EDITOR_STYLE,
    /\.page-block-expand-nav \.page-slide-icon,.page-block-expand-nav \.layout-picker-btn\{[^}]*color:var\(--biu-color-icon\)/,
  )
  assert.match(PAGE_EDITOR_STYLE, /\.page-block-expand-nav \.page-slide-icon:hover/)
})
