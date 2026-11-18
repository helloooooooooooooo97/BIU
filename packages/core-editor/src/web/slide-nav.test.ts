import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { TextSelection } from '@tiptap/pm/state'
import { recordEditorExtensions } from './kit.ts'
import { adjacentSlideCellPos, atSlideCellEdge, enterSlideFromOutside, moveSlideCellSelection, slideCellDepth } from './slide-nav.ts'

function editorOf() {
  return new Editor({
    extensions: recordEditorExtensions(),
    content: '',
    contentType: 'markdown',
  })
}

function cellStarts(editor: Editor) {
  const starts: number[] = []
  editor.state.doc.descendants((node, pos) => {
    if (node.type.name === 'slideCell') starts.push(pos + 1)
  })
  return starts
}

test('slide cells refuse gap cursor like table cells', () => {
  assert.equal(recordEditorExtensions().find((ext) => ext.name === 'slideCell')?.config.allowGapCursor, false)
  assert.equal(recordEditorExtensions().find((ext) => ext.name === 'slide')?.config.allowGapCursor, false)
})

test('arrow down at the end of a slide cell enters the next cell', () => {
  const editor = editorOf()
  editor.commands.insertSlide('stack')
  const starts = cellStarts(editor)
  assert.ok(starts.length >= 2)
  editor.commands.setTextSelection(starts[0]!)
  const $from = editor.state.selection.$from
  assert.equal(slideCellDepth($from) > 0, true)
  assert.equal(atSlideCellEdge($from, 1), true)
  const next = adjacentSlideCellPos($from, 1)
  assert.equal(next, starts[1]! + 1)
  const tr = moveSlideCellSelection(editor.state, 1)
  assert.ok(tr)
  editor.view.dispatch(tr!)
  assert.equal(editor.state.selection.$from.start(slideCellDepth(editor.state.selection.$from)), starts[1])
  editor.destroy()
})

test('arrow down does not jump past the last slide cell', () => {
  const editor = editorOf()
  editor.commands.insertSlide('stack')
  const starts = cellStarts(editor)
  editor.commands.setTextSelection(starts[starts.length - 1]!)
  assert.equal(moveSlideCellSelection(editor.state, 1), null)
  editor.destroy()
})

test('selection inside a slide cell is a text caret, not a node gap', () => {
  const editor = editorOf()
  editor.commands.insertSlide('stack')
  assert.equal(editor.state.selection instanceof TextSelection, true)
  assert.equal(slideCellDepth(editor.state.selection.$from) > 0, true)
  assert.equal(editor.state.selection.empty, true)
  editor.destroy()
})

test('arrow down from the block above a slide enters the first cell', () => {
  const editor = new Editor({
    extensions: recordEditorExtensions(),
    content: `上面

:::slide {layout=stack}

:::cell

:::

:::
`,
    contentType: 'markdown',
  })
  editor.commands.setTextSelection(1)
  assert.equal(slideCellDepth(editor.state.selection.$from), -1)
  const tr = enterSlideFromOutside(editor.state, 1)
  assert.ok(tr)
  editor.view.dispatch(tr!)
  assert.equal(slideCellDepth(editor.state.selection.$from) > 0, true)
  editor.destroy()
})
