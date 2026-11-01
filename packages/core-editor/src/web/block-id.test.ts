import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import { applyStoredBlockIds, listDocBlocks, markdownWithBlockIds, stripBlockIdStamps } from './block-id.ts'
import { comparePageBlocks } from './page-filter-plugin.ts'

function editorOf(markdown: string) {
  return new Editor({
    extensions: pageEditorExtensions(),
    content: markdown,
    contentType: 'markdown',
  })
}

test('stripBlockIdStamps pulls ids and leaves source text', () => {
  const { text, ids } = stripBlockIdStamps('Hello <!-- biu:abc12345 -->\n\n## Title <!-- biu:def67890 -->')
  assert.deepEqual(ids, ['abc12345', 'def67890'])
  assert.equal(text.includes('<!--'), false)
  assert.match(text, /Hello/)
  assert.match(text, /## Title/)
})

test('editor assigns and serializes a stable id per top-level block', () => {
  const editor = editorOf('Hello\n\n## Title')
  const stamped = markdownWithBlockIds(editor)
  assert.match(stamped, /<!-- biu:[a-z0-9]{6,32} -->/)
  const { ids } = stripBlockIdStamps(stamped)
  assert.equal(ids.length >= 2, true)
  assert.equal(new Set(ids).size, ids.length)
  const again = editorOf('para')
  applyStoredBlockIds(again, ['aabbccdd'])
  const blocks = listDocBlocks(again.state.doc)
  assert.equal(blocks[0]?.id, 'aabbccdd')
  editor.destroy()
  again.destroy()
})

test('page sort ranks blocks by title or kind without rewriting ids', () => {
  const a = { kind: 'paragraph', label: 'zeta', id: 'a' }
  const b = { kind: 'heading', label: 'alpha', id: 'b' }
  assert.equal(comparePageBlocks(a, b, 'title-asc') < 0, false)
  assert.equal(comparePageBlocks(a, b, 'title-desc') < 0, true)
  assert.equal(comparePageBlocks(b, a, 'kind') < 0, true)
})
