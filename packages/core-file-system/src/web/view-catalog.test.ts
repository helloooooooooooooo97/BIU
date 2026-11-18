import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Context } from 'cordis'
import {
  canCopyViewCatalogItem,
  deleteViewCatalog,
  isViewCatalogField,
  listViewCatalogOptions,
  registerViewCatalogHost,
  selectedViewCatalogOption,
  selectViewCatalog,
  selectedViewCatalogId,
} from './view-catalog.ts'
import { getRecordViewCatalog, patchRecordViewCatalog } from './record-view-catalog.ts'
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
    [DEFAULT_RECORD_PROP_VIEW_ID, 'source', 'hidden', 'wide'],
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
  assert.match(pick, /useOptionCursor/)
  assert.match(pick, /onKeyDown=\{\(event\) => onKeyDown\(event\)\}/)
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

test('registered hosts win over the default adapter', () => {
  const src = readFileSync(resolve(import.meta.dirname, './view-catalog.ts'), 'utf8')
  assert.doesNotMatch(src, /TAGS_COLLECTION_PATH/)
  assert.doesNotMatch(src, /PAGES_COLLECTION_PATH/)
  assert.doesNotMatch(src, /AGENTS_COLLECTION_PATH/)
  assert.doesNotMatch(src, /copyTagSandboxView/)
  const off = registerViewCatalogHost('/tasks', {
    options: () => [{ id: 'hosted', name: '托管' }],
    selectedId: () => 'hosted',
    select: () => undefined,
  })
  const record = { id: 't1', propViews: [] }
  assert.equal(listViewCatalogOptions('/tasks', record, 'propViews')[0]?.id, 'hosted')
  off()
  assert.equal(listViewCatalogOptions('/tasks', record, 'propViews')[0]?.id, DEFAULT_RECORD_PROP_VIEW_ID)
})

test('mcp page tag skill and task share the same builtin catalog ids', () => {
  const record = { id: 'same-1' }
  const content = ['doc', 'outline', 'table', 'source', 'hidden']
  const props = [DEFAULT_RECORD_PROP_VIEW_ID, 'source', 'hidden']
  for (const path of ['/mcp', '/pages', '/tags', '/skills', '/tasks'] as const) {
    assert.deepEqual(
      listViewCatalogOptions(path, record, 'views').filter((item) => item.builtin).map((item) => item.id),
      content,
    )
    assert.deepEqual(
      listViewCatalogOptions(path, record, 'propViews').filter((item) => item.builtin).map((item) => item.id),
      props,
    )
    assert.equal(listViewCatalogOptions(path, record, 'layouts')[0]?.id, DEFAULT_RECORD_LAYOUT_ID)
    selectViewCatalog(path, record, 'views', 'outline')
    assert.equal(selectedViewCatalogId(path, record, 'views'), 'outline')
    selectViewCatalog(path, record, 'propViews', 'source')
    assert.equal(selectedViewCatalogId(path, record, 'propViews'), 'source')
  }
})

afterEach(() => {
  Reflect.deleteProperty(globalThis, 'fetch')
})

test('deleting one live property view does not persist an empty stale record list', async () => {
  const bodies: string[] = []
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    bodies.push(String(init?.body ?? ''))
    return new Response('{}', { status: 200 })
  }) as typeof fetch
  const a = { id: 'a', name: '新视图', kind: 'sandbox' as const, file: 'prop-view-a.jsx', dataFile: 'prop-view-data-a.json' }
  const b = { id: 'b', name: '新视图 2', kind: 'sandbox' as const, file: 'prop-view-b.jsx', dataFile: 'prop-view-data-b.json' }
  patchRecordViewCatalog('/tags', 'need', { propViews: [a, b] })
  const record = { id: 'need', propViews: [] }
  deleteViewCatalog('/tags', record, 'propViews', 'b')
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.deepEqual(
    getRecordViewCatalog('/tags', 'need').propViews.map((item) => item.id),
    ['a'],
  )
  const sent = JSON.parse(bodies[0] ?? '{}') as { content?: { propViews?: string } }
  assert.deepEqual(
    JSON.parse(sent.content?.propViews ?? '[]').map((item: { id: string }) => item.id),
    ['a'],
  )
})

