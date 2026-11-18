import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { recordEditorExtensions } from './kit.ts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { collapsedOutlineIndices, listFoldableItems, listOutlineBlocks, outlineFoldGutterHit } from './page-outline-plugin.ts'

test('outline indents h2/h3 and body under the last heading', () => {
  const editor = new Editor({
    extensions: recordEditorExtensions(),
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

test('outline keeps quote and code at the heading nest depth', () => {
  const editor = new Editor({
    extensions: recordEditorExtensions(),
    content: '## Two\n\n> quote\n\n```\ncode\n```\n',
    contentType: 'markdown',
  })
  const blocks = listOutlineBlocks(editor.state.doc)
  const kinds = [...editor.state.doc.content.content].map((node) => node.type.name)
  const quote = blocks[kinds.indexOf('blockquote')]
  const code = blocks[kinds.indexOf('codeBlock')]
  assert.equal(quote?.heading, false)
  assert.equal(quote?.depth, 2)
  assert.equal(code?.heading, false)
  assert.equal(code?.depth, 2)
  editor.destroy()
})

test('folding a heading hides quote and code until the next heading', () => {
  const editor = new Editor({
    extensions: recordEditorExtensions(),
    content: '## Two\n\n> quote\n\n```\ncode\n```\n\n# Next\n\nkeep',
    contentType: 'markdown',
  })
  const blocks = listOutlineBlocks(editor.state.doc).map((item, index) => ({
    ...item,
    id: item.id || `b${index}`,
  }))
  const head = blocks.find((item) => item.heading && item.level === 2)
  assert.ok(head)
  const hide = collapsedOutlineIndices(blocks, new Set([head.id]))
  const kinds = [...editor.state.doc.content.content].map((node) => node.type.name)
  assert.ok(hide.has(kinds.indexOf('blockquote')))
  assert.ok(hide.has(kinds.indexOf('codeBlock')))
  assert.equal(hide.has(kinds.lastIndexOf('heading')), false)
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

test('nested list items can fold', () => {
  const editor = new Editor({
    extensions: recordEditorExtensions(),
    content: '- a\n  - b\n- c\n\n1. d\n   1. e',
    contentType: 'markdown',
  })
  const items = listFoldableItems(editor.state.doc)
  assert.equal(items.length, 2)
  editor.destroy()
})

test('outline fold lives on the heading node, not an inline widget', () => {
  const src = readFileSync(resolve(import.meta.dirname, './page-outline-plugin.ts'), 'utf8')
  assert.doesNotMatch(src, /Decoration\.widget/)
  assert.match(src, /data-outline-id/)
  assert.match(src, /outlineFoldGutterHit/)
})

test('fold gutter is left of the heading box', () => {
  const heading = document.createElement('h1')
  heading.style.position = 'absolute'
  heading.style.left = '40px'
  heading.style.top = '10px'
  heading.style.width = '200px'
  heading.style.height = '24px'
  heading.style.setProperty('--page-outline-icon', '14px')
  heading.style.setProperty('--page-outline-gap', '8px')
  document.body.appendChild(heading)
  heading.getBoundingClientRect = () => ({ left: 40, top: 10, right: 240, bottom: 34, width: 200, height: 24, x: 40, y: 10, toJSON() {} })
  assert.equal(outlineFoldGutterHit(heading, { clientX: 20, clientY: 16 }), true)
  assert.equal(outlineFoldGutterHit(heading, { clientX: 48, clientY: 16 }), false)
  heading.remove()
})
