import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  listPageBlockFences,
  pageBlockData,
  pageBlockRecordId,
  parsePageBlockRecordId,
  patchPageBlockMarkdown,
} from './page-block-fence.ts'

const doc = `前言

:::pageBlock {kind=html plugin=page-html-blocks id=ab12cd34 deck=true}
<div>旧</div>
:::

中间

:::pageBlock {kind=excalidraw plugin=page-excalidraw id=ef90ab12}
{"file":"assets/board.json"}
:::
`

test('listPageBlockFences reads id kind plugin and body', () => {
  const fences = listPageBlockFences(doc)
  assert.equal(fences.length, 2)
  assert.equal(fences[0]?.id, 'ab12cd34')
  assert.equal(fences[0]?.kind, 'html')
  assert.equal(pageBlockData(fences[0]!).html, '<div>旧</div>')
  assert.equal(pageBlockData(fences[0]!).deck, true)
  assert.equal(fences[1]?.id, 'ef90ab12')
  assert.equal(pageBlockData(fences[1]!).file, 'assets/board.json')
})

test('patchPageBlockMarkdown merges attrs of one id and leaves the rest', () => {
  const next = patchPageBlockMarkdown(doc, 'ab12cd34', { data: { html: '<div>新</div>', deck: false } })
  assert.match(next, /id=ab12cd34 deck=false/)
  assert.match(next, /<div>新<\/div>/)
  assert.match(next, /id=ef90ab12/)
  assert.match(next, /assets\/board.json/)
  assert.match(next, /前言/)
})

test('patchPageBlockMarkdown can replace data and change plugin', () => {
  const next = patchPageBlockMarkdown(doc, 'ef90ab12', {
    plugin: 'page-excalidraw',
    replace: true,
    data: { file: 'assets/other.json' },
  })
  assert.match(next, /id=ef90ab12/)
  assert.match(next, /"file": "assets\/other.json"/)
  assert.doesNotMatch(next, /board.json/)
})

test('patchPageBlockMarkdown rejects missing or duplicate ids', () => {
  assert.throws(() => patchPageBlockMarkdown(doc, 'nope', { data: {} }), /unknown pageBlock/)
  const dup = `:::pageBlock {kind=html id=ab12cd34}\na\n:::\n\n:::pageBlock {kind=html id=ab12cd34}\nb\n:::\n`
  assert.throws(() => patchPageBlockMarkdown(dup, 'ab12cd34', { data: { html: 'x' } }), /not unique/)
})

test('pageBlock record id is page::block', () => {
  assert.equal(pageBlockRecordId('p001', 'ab12cd34'), 'p001::ab12cd34')
  assert.deepEqual(parsePageBlockRecordId('p001::ab12cd34'), { pageId: 'p001', blockId: 'ab12cd34' })
  assert.equal(parsePageBlockRecordId('p001'), null)
})
