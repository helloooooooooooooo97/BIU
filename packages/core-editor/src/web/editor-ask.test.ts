import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import { isSendChatHotkey, pickFromEditor, pickFromLocus } from './editor-ask.ts'

test('chat hotkey is command/ctrl l', () => {
  assert.equal(isSendChatHotkey({ key: 'l', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false }), true)
  assert.equal(isSendChatHotkey({ key: 'l', metaKey: true, ctrlKey: false, altKey: true, shiftKey: false }), false)
  assert.equal(isSendChatHotkey({ key: 'k', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }), false)
})

test('pickFromLocus keeps path and markdown lines', () => {
  const ref = pickFromLocus('/pages/p1', { start_line: 3, end_line: 4, text: 'hello block' }, '/pages/p1')
  assert.ok(ref)
  assert.equal(ref?.kind, 'text')
  assert.equal(ref?.path, '/pages/p1')
  assert.equal(ref?.start_line, 3)
  assert.equal(ref?.end_line, 4)
  assert.equal(ref?.text, 'hello block')
  assert.equal(pickFromLocus('/pages/p1', { start_line: 1, end_line: 1, text: '   ' }), null)
})

test('pickFromEditor uses the current selection', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '你好世界',
    contentType: 'markdown',
  })
  editor.commands.setTextSelection({ from: 1, to: 1 + '你好'.length })
  const ref = pickFromEditor(editor, '/pages/home')
  assert.ok(ref)
  assert.equal(ref?.path, '/pages/home')
  assert.match(ref?.text ?? '', /你好/)
  assert.equal(ref?.selection, '你好')
  editor.commands.setTextSelection(1)
  const caret = pickFromEditor(editor, '/pages/home')
  assert.ok(caret)
  assert.equal(caret?.selection, undefined)
  assert.equal(typeof caret?.insert, 'number')
  assert.match(caret?.text ?? '', /你好世界/)
  editor.destroy()
})
