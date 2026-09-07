import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import {
  deleteHandleBlock,
  duplicateHandleBlock,
  insertParagraphAfter,
  insertParagraphBefore,
  resolveHandleBlock,
} from './page-block-handle.ts'
import { pageEditorExtensions } from './kit.ts'

function editorOf(markdown: string) {
  return new Editor({
    extensions: pageEditorExtensions(),
    content: markdown,
    contentType: 'markdown',
  })
}

test('resolveHandleBlock picks top-level paragraph', () => {
  const editor = editorOf('你好\n\n世界')
  const first = editor.state.doc.child(0)
  const $pos = editor.state.doc.resolve(2)
  const found = resolveHandleBlock($pos)
  assert.ok(found)
  assert.equal(found!.pos, 0)
  assert.equal(found!.node.type.name, 'paragraph')
  assert.equal(found!.node.textContent, first.textContent)
  editor.destroy()
})

test('resolveHandleBlock picks listItem inside a list', () => {
  const editor = editorOf('- 甲\n- 乙')
  let itemPos = -1
  editor.state.doc.descendants((node, pos) => {
    if (itemPos < 0 && node.type.name === 'listItem') itemPos = pos
  })
  assert.ok(itemPos >= 0)
  const $pos = editor.state.doc.resolve(itemPos + 2)
  const found = resolveHandleBlock($pos)
  assert.ok(found)
  assert.equal(found!.node.type.name, 'listItem')
  editor.destroy()
})

test('insert before / after / duplicate / delete a paragraph', () => {
  const editor = editorOf('第一段\n\n第二段')
  const firstText = editor.state.doc.child(0).textContent
  insertParagraphBefore(editor, 0)
  assert.equal(editor.state.doc.child(0).textContent, '')
  assert.equal(editor.state.doc.child(1).textContent, firstText)

  const firstPos = editor.state.doc.child(0).nodeSize
  const firstNode = editor.state.doc.child(1)
  insertParagraphAfter(editor, firstPos, firstNode)
  assert.equal(editor.state.doc.child(2).textContent, '')

  duplicateHandleBlock(editor, firstPos, firstNode)
  const texts: string[] = []
  for (let i = 0; i < editor.state.doc.childCount; i++) texts.push(editor.state.doc.child(i).textContent)
  assert.equal(texts.filter((t) => t === firstText).length, 2)

  deleteHandleBlock(editor, 0, editor.state.doc.child(0))
  assert.notEqual(editor.state.doc.child(0).textContent, '')
  editor.destroy()
})
