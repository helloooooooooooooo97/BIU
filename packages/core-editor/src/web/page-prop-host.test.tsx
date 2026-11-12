import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PAGE_EDITOR_STYLE } from './style.ts'
import { PagePropHostView, PageProperties } from './page-prop-host.tsx'
import { resetPageFileState } from './page-views.ts'
import { setPagePropViews } from './page-prop-views.ts'

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
  assert.match(getByTestId('page-prop-host-root').textContent ?? '', /属性视图 · 填写进度/)
  assert.match(getByTestId('page-prop-host-root').textContent ?? '', /属性视图介绍/)
  assert.match(getByTestId('page-prop-host-root').textContent ?? '', /演示页/)
  fireEvent.click([...getByTestId('page-prop-host-root').querySelectorAll('button')].find((btn) => btn.textContent === '编辑')!)
  await waitFor(() => {
    assert.ok(getByTestId('page-prop-field-title'))
  })
  assert.ok(getByTestId('page-prop-field-title').querySelector('.fsdb-pop-host'))
  const pane = getByTestId('page-prop-host-preview')
  assert.equal(pane.hasAttribute('data-sandbox'), true)
  assert.equal(pane.getAttribute('data-sandbox-pick'), '')
  assert.equal(pane.getAttribute('data-biu-kind'), 'sandbox')
  assert.equal(getByTestId('page-prop-host-root').getAttribute('data-sandbox-pick'), '')
})

test('page properties keep the default table until a custom view is selected', () => {
  cleanup()
  const { getByTestId, rerender } = render(
    <PageProperties record={{ id: 'home', title: '演示页', propViews: [] }} collectionPath="/pages">
      <div data-testid="prop-table">表格</div>
    </PageProperties>,
  )
  assert.equal(getByTestId('prop-table').textContent, '表格')
  rerender(
    <PageProperties
      record={{
        id: 'home',
        title: '演示页',
        propViews: [{ id: 'card1', name: '卡片', kind: 'sandbox', file: 'missing-prop.jsx', dataFile: 'missing-prop-data.json' }],
        layouts: [{ id: 'need', name: '需求', contentViewId: 'doc', propViewId: 'card1' }],
      }}
      collectionPath="/pages"
    >
      <div data-testid="prop-table">表格</div>
    </PageProperties>,
  )
  assert.ok(getByTestId('record-prop-host'))
})

test('hidden property view unmounts the properties region', () => {
  cleanup()
  const { queryByTestId } = render(
    <PageProperties
      record={{
        id: 'home',
        title: '演示页',
        layouts: [{ id: 'need', name: '需求', contentViewId: 'doc', propViewId: 'hidden' }],
      }}
      collectionPath="/pages"
    >
      <div data-testid="prop-table">表格</div>
    </PageProperties>,
  )
  assert.equal(queryByTestId('prop-table'), null)
  assert.equal(queryByTestId('record-prop-host'), null)
})

test('property host Field is read-only when the schema field is not writable', async () => {
  cleanup()
  resetPageFileState()
  setPagePropViews('home', [
    { id: 'card1', name: '卡片', kind: 'sandbox', file: 'missing-prop.jsx', dataFile: 'missing-prop-data.json' },
  ])
  const { getByTestId } = render(
    <PagePropHostView
      record={{ id: 'home', title: '演示页', createdAt: 1794305209473 }}
      viewId="card1"
      schema={{
        fields: {
          title: { type: 'string', label: '标题', writable: true },
          createdBy: { type: 'person', label: '创建人', writable: false },
          createdAt: { type: 'datetime', label: '创建时间', writable: false },
        },
      }}
    />,
  )
  await waitFor(() => {
    assert.ok(getByTestId('page-prop-host-root'))
  })
  fireEvent.click([...getByTestId('page-prop-host-root').querySelectorAll('button')].find((btn) => btn.textContent === '编辑')!)
  await waitFor(() => {
    assert.ok(getByTestId('page-prop-field-title'))
    assert.ok(getByTestId('page-prop-field-createdBy'))
    assert.ok(getByTestId('page-prop-field-createdAt'))
  })
  assert.ok(getByTestId('page-prop-field-title').querySelector('.fsdb-pop-host'))
  assert.equal(getByTestId('page-prop-field-createdBy').querySelector('.fsdb-pop-host'), null)
  assert.equal(getByTestId('page-prop-field-createdAt').querySelector('.fsdb-pop-host'), null)
  assert.doesNotMatch(getByTestId('page-prop-field-createdAt').textContent ?? '', /1794305209473/)
  assert.match(getByTestId('page-prop-field-createdAt').textContent ?? '', /\d{4}\/\d{2}\/\d{2}/)
})

test('property sandbox host shares the page-host sandbox pick entry', () => {
  const src = readFileSync(resolve(import.meta.dirname, './page-prop-host.tsx'), 'utf8')
  assert.match(src, /bindSandboxPickPane/)
  assert.match(src, /data-sandbox=""/)
  assert.match(src, /pickHost=\{\{/)
  assert.match(src, /page-prop-host-preview/)
  assert.match(readFileSync(resolve(import.meta.dirname, './host-field.tsx'), 'utf8'), /FieldValuePop/)
})

test('property sandbox nav tools use the same muted icon color as page chrome', () => {
  assert.match(
    PAGE_EDITOR_STYLE,
    /\.page-block-expand-nav \.page-slide-icon,.page-block-expand-nav \.layout-picker-btn\{[^}]*display:grid/,
  )
  assert.match(
    PAGE_EDITOR_STYLE,
    /\.page-block-expand-nav \.page-slide-icon,.page-block-expand-nav \.layout-picker-btn\{[^}]*place-items:center/,
  )
  assert.match(
    PAGE_EDITOR_STYLE,
    /\.page-block-expand-nav \.page-slide-icon,.page-block-expand-nav \.layout-picker-btn\{[^}]*line-height:0/,
  )
  assert.match(
    PAGE_EDITOR_STYLE,
    /\.page-block-expand-nav \.page-slide-icon,.page-block-expand-nav \.layout-picker-btn\{[^}]*color:var\(--biu-color-icon\)/,
  )
  assert.match(PAGE_EDITOR_STYLE, /\.page-block-expand-nav \.page-slide-icon:hover/)
})
