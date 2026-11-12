import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { recordEditorExtensions } from './kit.ts'
import { applyStoredBlockIds, listDocBlocks, markdownWithBlockIds, stripBlockIdStamps } from './block-id.ts'
import { comparePageBlocks } from './page-filter-plugin.ts'

function editorOf(markdown: string) {
  return new Editor({
    extensions: recordEditorExtensions(),
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

test('code fences keep id inside {} and still parse old backticks', () => {
  const fromTicks = editorOf('```ts\nconst a = 1\n```\n')
  const stamped = markdownWithBlockIds(fromTicks)
  assert.match(stamped, /:::code \{lang=ts id=[a-z0-9]{6,32}\}/)
  assert.doesNotMatch(stamped, /```/)
  assert.doesNotMatch(stamped, /<!-- biu:/)
  const again = editorOf(stamped)
  const code = [...listDocBlocks(again.state.doc)].find((item) => item.kind === 'codeBlock')
  assert.ok(code?.id)
  assert.match(again.getMarkdown(), /const a = 1/)
  fromTicks.destroy()
  again.destroy()
})

test('jsx in a code fence does not accumulate escapes on reload', () => {
  let md = '```ts\noptions.length ? <CellSelect /> : <input className="fsdb-query-input" />\n```\n'
  const counts: number[] = []
  for (let i = 0; i < 4; i++) {
    const editor = editorOf(md)
    md = markdownWithBlockIds(editor)
    counts.push((md.match(/\\/g) ?? []).length)
    editor.destroy()
  }
  assert.equal(counts[0], counts[3])
  assert.match(md, /<input className="fsdb-query-input" \/>/)
  assert.doesNotMatch(md, /&amp;lt;|&lt;input/)
})

test('page sort ranks blocks by title or kind without rewriting ids', () => {
  const a = { kind: 'paragraph', label: 'zeta', id: 'a' }
  const b = { kind: 'heading', label: 'alpha', id: 'b' }
  assert.equal(comparePageBlocks(a, b, 'title-asc') < 0, false)
  assert.equal(comparePageBlocks(a, b, 'title-desc') < 0, true)
  assert.equal(comparePageBlocks(b, a, 'kind') < 0, true)
})
