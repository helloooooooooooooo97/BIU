import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import { pageEditorExtensions } from './kit.ts'
import { adjacentPageBlockPos, handlePageBlockArrow } from './page-block-arrow.ts'

function editorOf(md: string) {
  const host = document.createElement('div')
  document.body.append(host)
  return new Editor({
    element: host,
    extensions: pageEditorExtensions(),
    content: md,
    contentType: 'markdown',
  })
}

function pageBlockPos(editor: Editor) {
  let pos = -1
  editor.state.doc.descendants((node, p) => {
    if (node.type.name === 'pageBlock') pos = p
  })
  return pos
}

function key(name: string) {
  return new KeyboardEvent('keydown', { key: name, bubbles: true, cancelable: true })
}

const DOC = `hello

:::pageBlock {kind=sandbox plugin=page-sandbox}
export default function App(){return <div/>}
:::

world
`

test('adjacentPageBlockPos finds the sandbox beside a paragraph', () => {
  const editor = editorOf(DOC)
  const block = pageBlockPos(editor)
  const hello = editor.state.doc.child(0)
  const $end = editor.state.doc.resolve(hello.nodeSize - 1)
  assert.equal(adjacentPageBlockPos($end, 1), block)
  const worldStart = block + editor.state.doc.nodeAt(block)!.nodeSize + 1
  assert.equal(adjacentPageBlockPos(editor.state.doc.resolve(worldStart), -1), block)
  editor.destroy()
})

test('ArrowDown from the paragraph before a pageBlock selects it', () => {
  const editor = editorOf(DOC)
  const hello = editor.state.doc.child(0)
  editor.chain().setTextSelection(hello.nodeSize - 1).run()
  assert.equal(handlePageBlockArrow(editor.view, key('ArrowDown')), true)
  assert.equal(editor.state.selection instanceof NodeSelection, true)
  if (editor.state.selection instanceof NodeSelection) {
    assert.equal(editor.state.selection.node.type.name, 'pageBlock')
  }
  editor.destroy()
})

test('ArrowUp from the paragraph after a pageBlock selects it', () => {
  const editor = editorOf(DOC)
  const block = pageBlockPos(editor)
  const after = block + editor.state.doc.nodeAt(block)!.nodeSize + 1
  editor.chain().setTextSelection(after).run()
  assert.equal(handlePageBlockArrow(editor.view, key('ArrowUp')), true)
  assert.equal(editor.state.selection instanceof NodeSelection, true)
  editor.destroy()
})

test('ArrowDown from a selected pageBlock moves into the next paragraph', () => {
  const editor = editorOf(DOC)
  const block = pageBlockPos(editor)
  editor.chain().setNodeSelection(block).run()
  assert.equal(handlePageBlockArrow(editor.view, key('ArrowDown')), true)
  assert.equal(editor.state.selection instanceof TextSelection, true)
  assert.equal(editor.state.selection.$from.parent.textContent, 'world')
  editor.destroy()
})

test('ArrowDown does not skip a pageBlock when the next sibling is text', () => {
  const editor = editorOf('hello\n\nworld\n')
  editor.chain().setTextSelection(6).run()
  assert.equal(handlePageBlockArrow(editor.view, key('ArrowDown')), false)
  editor.destroy()
})
