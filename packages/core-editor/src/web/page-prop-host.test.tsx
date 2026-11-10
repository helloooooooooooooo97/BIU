import { cleanup, render, waitFor } from '@testing-library/react'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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
  const pane = getByTestId('page-prop-host-preview')
  assert.equal(pane.hasAttribute('data-sandbox'), true)
  assert.equal(pane.getAttribute('data-sandbox-pick'), '')
  assert.equal(pane.getAttribute('data-biu-kind'), 'sandbox')
  assert.equal(getByTestId('page-prop-host-root').getAttribute('data-sandbox-pick'), '')
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

test('property host Field is read-only when the schema field is not writable', async () => {
  cleanup()
  resetPageFileState()
  setPagePropViews('home', [
    { id: 'card1', name: '卡片', kind: 'sandbox', file: 'missing-prop.jsx', dataFile: 'missing-prop-data.json' },
  ])
  const { getByTestId } = render(
    <PagePropHostView
      record={{ id: 'home', title: '演示页' }}
      viewId="card1"
      schema={{
        fields: {
          title: { type: 'string', label: '标题', writable: true },
          createdBy: { type: 'person', label: '创建人', writable: false },
        },
      }}
    />,
  )
  await waitFor(() => {
    assert.ok(getByTestId('page-prop-field-title'))
    assert.ok(getByTestId('page-prop-field-createdBy'))
  })
  assert.equal((getByTestId('page-prop-field-title') as HTMLInputElement).readOnly, false)
  assert.equal((getByTestId('page-prop-field-createdBy') as HTMLInputElement).readOnly, true)
})

test('property sandbox host shares the page-host sandbox pick entry', () => {
  const src = readFileSync(resolve(import.meta.dirname, './page-prop-host.tsx'), 'utf8')
  assert.match(src, /bindSandboxPickPane/)
  assert.match(src, /data-sandbox=""/)
  assert.match(src, /pickHost=\{\{/)
  assert.match(src, /page-prop-host-preview/)
})

test('property sandbox nav tools use the same muted icon color as page chrome', () => {
  assert.match(
    PAGE_EDITOR_STYLE,
    /\.page-block-expand-nav \.page-slide-icon,.page-block-expand-nav \.layout-picker-btn\{[^}]*color:var\(--biu-color-icon\)/,
  )
  assert.match(PAGE_EDITOR_STYLE, /\.page-block-expand-nav \.page-slide-icon:hover/)
})
