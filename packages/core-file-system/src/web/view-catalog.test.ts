import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  canCopyViewCatalogItem,
  isViewCatalogField,
  listViewCatalogOptions,
  selectedViewCatalogOption,
  selectViewCatalog,
  selectedViewCatalogId,
} from './view-catalog.ts'
import { DEFAULT_RECORD_LAYOUT_ID, DEFAULT_RECORD_PROP_VIEW_ID } from './record-layouts.ts'

test('catalog fields are views, propViews, and layouts', () => {
  assert.equal(isViewCatalogField('views'), true)
  assert.equal(isViewCatalogField('propViews'), true)
  assert.equal(isViewCatalogField('layouts'), true)
  assert.equal(isViewCatalogField('title'), false)
})

test('prop view catalog is a single current option plus a switcher list', () => {
  const record = {
    id: 'p1',
    propViews: [{ id: 'wide', name: '宽表', kind: 'sandbox', file: 'a.jsx' }],
  }
  const options = listViewCatalogOptions('/tasks', record, 'propViews')
  assert.deepEqual(
    options.map((item) => item.id),
    [DEFAULT_RECORD_PROP_VIEW_ID, 'wide'],
  )
  const current = selectedViewCatalogOption('/tasks', record, 'propViews')
  assert.equal(current?.id, DEFAULT_RECORD_PROP_VIEW_ID)
  assert.equal(current?.name, '表格')
  assert.equal(current?.icon, 'table')
  assert.equal(current?.builtin, true)
  assert.equal(options.find((item) => item.id === 'wide')?.icon, 'props')
  selectViewCatalog('/tasks', record, 'propViews', 'wide')
  assert.equal(selectedViewCatalogId('/tasks', record, 'propViews'), 'wide')
  assert.equal(selectedViewCatalogOption('/tasks', record, 'propViews')?.name, '宽表')
})

test('layout catalog starts on 默认视图', () => {
  const record = {
    id: 'p2',
    layouts: [{ id: 'need', name: '需求', contentViewId: 'doc', propViewId: 'table' }],
  }
  const options = listViewCatalogOptions('/tasks', record, 'layouts')
  assert.equal(options[0]?.id, DEFAULT_RECORD_LAYOUT_ID)
  assert.equal(options[0]?.name, '默认视图')
  assert.equal(options.some((item) => item.id === 'need'), true)
  assert.equal(selectedViewCatalogOption('/tasks', record, 'layouts')?.name, '默认视图')
})

test('property flyout uses the view switcher instead of a string textarea', () => {
  const draft = readFileSync(resolve(import.meta.dirname, './cell-pop-draft.tsx'), 'utf8')
  const cells = readFileSync(resolve(import.meta.dirname, './fsdb-cells.tsx'), 'utf8')
  const pop = readFileSync(resolve(import.meta.dirname, './field-value-pop.tsx'), 'utf8')
  assert.match(draft, /<ViewCatalogPickPanel/)
  assert.match(cells, /selectedViewCatalogOption/)
  assert.match(cells, /<ViewCatalogGlyph icon=\{option\.icon\}/)
  assert.match(pop, /isViewCatalogField\(fieldKey\) \? ' is-select is-view-catalog'/)
  const pick = readFileSync(resolve(import.meta.dirname, './view-catalog-pick.tsx'), 'utf8')
  assert.match(pick, /ViewCatalogGlyph/)
  assert.match(pick, /canCopyViewCatalogItem/)
  assert.match(pick, /copyViewCatalog/)
  assert.match(pick, /deleteViewCatalog/)
  assert.match(pick, /tasks-viewdd-act is-danger/)
})

test('only custom content and property views can be copied', () => {
  assert.equal(canCopyViewCatalogItem('views', { builtin: true }), false)
  assert.equal(canCopyViewCatalogItem('propViews', { builtin: true }), false)
  assert.equal(canCopyViewCatalogItem('layouts', { builtin: false }), false)
  assert.equal(canCopyViewCatalogItem('views', { builtin: false }), true)
  assert.equal(canCopyViewCatalogItem('propViews', { builtin: false }), true)
  const pick = readFileSync(resolve(import.meta.dirname, './view-catalog-pick.tsx'), 'utf8')
  assert.match(pick, /const canCopy = canCopyViewCatalogItem\(fieldKey, item\)/)
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(css, /\.fsdb-cell-pop \.tasks-viewdd-item\{[^}]*display:flex/)
  assert.match(css, /\.fsdb-cell-pop \.tasks-viewdd-item-actions\{[^}]*margin-left:auto/)
})
