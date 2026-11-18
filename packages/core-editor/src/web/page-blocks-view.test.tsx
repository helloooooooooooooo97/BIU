import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parsePageBlockRowData, mergeLiveBlockData, persistBlockDataPatch } from './page-blocks-view.tsx'

test('parsePageBlockRowData reads json string or object', () => {
  assert.deepEqual(parsePageBlockRowData('{"html":"<p>a</p>"}'), { html: '<p>a</p>' })
  assert.deepEqual(parsePageBlockRowData({ html: '<p>b</p>' }), { html: '<p>b</p>' })
  assert.deepEqual(parsePageBlockRowData(''), {})
})

test('parsePageBlockRowData unpacks slim index envelopes', () => {
  assert.deepEqual(
    parsePageBlockRowData({
      blockId: 'a1',
      kind: 'sandbox',
      plugin: 'page-sandbox',
      attrs: { deck: true },
      assets: ['hero.png'],
    }),
    { deck: true },
  )
  assert.deepEqual(
    parsePageBlockRowData(
      '{"blockId":"a1","kind":"excalidraw","plugin":"page-excalidraw","attrs":{"file":"assets/board.json"},"assets":[]}',
    ),
    { file: 'assets/board.json' },
  )
  assert.deepEqual(parsePageBlockRowData({ html: '<p>keep</p>', attrs: { deck: true }, assets: [] }), {
    html: '<p>keep</p>',
    attrs: { deck: true },
    assets: [],
  })
})

test('live block data keeps the record title and does not persist a stale one', () => {
  const live = mergeLiveBlockData({ title: '旧名', sid: 's1' }, { history: [] }, { title: '新名' })
  assert.equal(live.title, '新名')
  assert.deepEqual(live.history, [])
  assert.deepEqual(persistBlockDataPatch(live, { history: [] }), { sid: 's1', history: [] })
})

test('component gallery can scroll inside the collection stage', () => {
  const css = readFileSync(resolve(import.meta.dirname, './style.ts'), 'utf8')
  assert.match(css, /\.page-blocks-view\{[^}]*min-height:0/)
  assert.match(css, /\.page-blocks-view\{[^}]*overflow:auto/)
  assert.match(css, /\.page-blocks-view-head\{[^}]*display:flex/)
  assert.match(css, /\.page-blocks-view-meta\{[^}]*margin-left:auto/)
})

test('document block writes notify other surfaces', () => {
  const src = readFileSync(resolve(import.meta.dirname, './page-blocks-view.tsx'), 'utf8')
  assert.match(src, /window.dispatchEvent\(new Event\('fsdb:change'\)\)/)
  assert.match(src, /useBindPagePlugin/)
  assert.match(src, /PagePluginSurface/)
})
