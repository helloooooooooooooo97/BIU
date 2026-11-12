import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Context } from 'cordis'
import {
  canCopyViewCatalogItem,
  isViewCatalogField,
  listViewCatalogOptions,
  selectedViewCatalogOption,
  selectViewCatalog,
  selectedViewCatalogId,
} from './view-catalog.ts'
import { DEFAULT_RECORD_LAYOUT_ID, DEFAULT_RECORD_PROP_VIEW_ID } from './record-layouts.ts'
import { DatabaseUiService } from './database-ui.ts'

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
    [DEFAULT_RECORD_PROP_VIEW_ID, 'source', 'wide'],
  )
  const current = selectedViewCatalogOption('/tasks', record, 'propViews')
  assert.equal(current?.id, DEFAULT_RECORD_PROP_VIEW_ID)
  assert.equal(current?.name, '表格')
  assert.equal(current?.icon, 'table')
  assert.equal(current?.builtin, true)
  assert.equal(options.find((item) => item.id === 'wide')?.icon, 'sandbox')
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
  assert.match(cells, /<TagChip/)
  assert.match(cells, /tone=\{option\.icon === 'sandbox' \? TAG_TONE_PURPLE : undefined\}/)
  assert.match(cells, /<ViewCatalogGlyph icon=\{option\.icon\} Icon=\{option\.Icon\}/)
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  assert.match(browser, /isViewCatalogField\(key\)/)
  assert.match(browser, /selectedViewCatalogOption\(collectionPath, row, key\)/)
  assert.match(pop, /isViewCatalogField\(fieldKey\) \? ' is-select is-view-catalog'/)
  const pick = readFileSync(resolve(import.meta.dirname, './view-catalog-pick.tsx'), 'utf8')
  assert.match(pick, /ViewCatalogGlyph/)
  assert.match(pick, /canCopyViewCatalogItem/)
  assert.match(pick, /copyViewCatalog/)
  assert.match(pick, /deleteViewCatalog/)
  assert.match(pick, /tasks-viewdd-act is-danger/)
  assert.match(pick, /fsdb-viewcat-pick-row/)
  assert.match(pick, /ensureDbSearchStyle/)
})

test('hidden content view chip uses 隐藏, not the id', () => {
  const record = { id: 'skill-1', views: [] }
  selectViewCatalog('/skills', record, 'views', 'hidden')
  const current = selectedViewCatalogOption('/skills', record, 'views')
  assert.equal(current?.id, 'hidden')
  assert.equal(current?.name, '隐藏')
  assert.equal(current?.icon, 'hidden')
  const options = listViewCatalogOptions('/skills', record, 'views')
  assert.equal(options.find((item) => item.id === 'hidden')?.name, '隐藏')
})

test('content catalog uses the Icon from registerContentView', () => {
  function ChatIcon({ className }: { className?: string }) {
    void className
    return null
  }
  const ui = new DatabaseUiService(new Context())
  ui.registerContentView('/agents', { id: 'chat', label: '聊天', Icon: ChatIcon })
  const record = { id: 'agent-1', views: [] }
  const options = listViewCatalogOptions('/agents', record, 'views')
  assert.equal(options.find((item) => item.id === 'chat')?.name, '聊天')
  assert.equal(options.find((item) => item.id === 'chat')?.Icon, ChatIcon)
  assert.equal(options.find((item) => item.id === 'hidden')?.name, '隐藏')
  selectViewCatalog('/agents', record, 'views', 'chat')
  assert.equal(selectedViewCatalogOption('/agents', record, 'views')?.Icon, ChatIcon)
  const glyph = readFileSync(resolve(import.meta.dirname, './view-catalog-glyph.tsx'), 'utf8')
  assert.match(glyph, /if \(Icon\) return <Icon/)
  assert.doesNotMatch(glyph, /ChatBubbleLeftRightIcon/)
  const pick = readFileSync(resolve(import.meta.dirname, './view-catalog-pick.tsx'), 'utf8')
  assert.match(pick, /Icon=\{item\.Icon\}/)
})

test('content catalog chips keep Chinese labels even when the stored name is the id', () => {
  const record = { id: 'agent-2', views: [{ id: 'chat', name: 'chat', kind: 'sandbox', file: 'x.jsx' }] }
  const options = listViewCatalogOptions('/agents', record, 'views')
  assert.equal(options.find((item) => item.id === 'chat')?.name, '聊天')
  assert.ok(options.length >= 2)
})

test('only custom content and property views can be copied', () => {
  assert.equal(canCopyViewCatalogItem('views', { id: 'doc' }), false)
  assert.equal(canCopyViewCatalogItem('views', { id: 'outline' }), false)
  assert.equal(canCopyViewCatalogItem('views', { id: 'table' }), false)
  assert.equal(canCopyViewCatalogItem('views', { id: 'source' }), false)
  assert.equal(canCopyViewCatalogItem('views', { id: 'hidden' }), false)
  assert.equal(canCopyViewCatalogItem('views', { id: 'chat' }), false)
  assert.equal(canCopyViewCatalogItem('propViews', { id: 'table' }), false)
  assert.equal(canCopyViewCatalogItem('propViews', { id: 'source' }), false)
  assert.equal(canCopyViewCatalogItem('propViews', { id: 'hidden' }), false)
  assert.equal(canCopyViewCatalogItem('layouts', { id: 'need', builtin: false }), false)
  assert.equal(canCopyViewCatalogItem('views', { id: 'sandbox-1' }), true)
  assert.equal(canCopyViewCatalogItem('propViews', { id: 'wide' }), true)
  const pick = readFileSync(resolve(import.meta.dirname, './view-catalog-pick.tsx'), 'utf8')
  assert.match(pick, /const canCopy = canCopyViewCatalogItem\(fieldKey, item\)/)
  assert.match(pick, /flexDirection: 'row'/)
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(css, /\.fsdb-viewcat-pick-row\{[^}]*flex-direction:row/)
  assert.match(css, /\.fsdb-viewcat-pick \.db-search-field[\s\S]*?border:0/)
  assert.match(css, /\.fsdb-viewcat-pick input\{[^}]*border:0/)
  assert.match(css, /\.fsdb-viewcat-pick-main\{[^}]*flex-direction:row/)
  assert.match(css, /\.fsdb-fileview:empty\{display:none\}/)
})
