import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import { collapsedOutlineIndices, listOutlineBlocks } from './page-outline-plugin.ts'

test('outline indents h2/h3 and body under the last heading', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '# One\n\nbody\n\n## Two\n\nmore\n\n### Three\n\nend',
    contentType: 'markdown',
  })
  const blocks = listOutlineBlocks(editor.state.doc)
  const heads = blocks.filter((item) => item.heading)
  assert.equal(heads[0]?.level, 1)
  assert.equal(heads[0]?.depth, 0)
  assert.equal(heads[1]?.level, 2)
  assert.equal(heads[1]?.depth, 1)
  assert.equal(heads[2]?.level, 3)
  assert.equal(heads[2]?.depth, 2)
  const underH1 = blocks.find((item) => !item.heading && item.depth === 1)
  const underH3 = blocks.find((item) => !item.heading && item.depth === 3)
  assert.ok(underH1)
  assert.ok(underH3)
  editor.destroy()
})

test('folding a heading hides until the next same-or-higher heading', () => {
  const blocks = [
    { heading: true, level: 1, id: 'a' },
    { heading: false, level: 0, id: 'p1' },
    { heading: true, level: 2, id: 'b' },
    { heading: false, level: 0, id: 'p2' },
    { heading: true, level: 1, id: 'c' },
    { heading: false, level: 0, id: 'p3' },
  ]
  const hide = collapsedOutlineIndices(blocks, new Set(['a']))
  assert.deepEqual([...hide], [1, 2, 3])
})
