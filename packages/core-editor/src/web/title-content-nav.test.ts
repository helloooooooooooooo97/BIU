import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { Selection } from '@tiptap/pm/state'
import { pageEditorExtensions } from './kit.ts'
import {
  FOCUS_RECORD_TITLE,
  handleContentTitleNav,
  shouldLeaveContentForTitle,
} from './title-content-nav.ts'

const none = { shiftKey: false }

test('empty caret at doc start leaves for title on Enter and ArrowUp', () => {
  assert.equal(shouldLeaveContentForTitle('Enter', none, 1, true, 1), true)
  assert.equal(shouldLeaveContentForTitle('ArrowUp', none, 1, true, 1), true)
  assert.equal(shouldLeaveContentForTitle('Enter', { shiftKey: true }, 1, true, 1), false)
  assert.equal(shouldLeaveContentForTitle('Enter', none, 2, true, 1), false)
  assert.equal(shouldLeaveContentForTitle('Enter', none, 1, false, 1), false)
  assert.equal(shouldLeaveContentForTitle('ArrowDown', none, 1, true, 1), false)
})

function makeEditor(md: string) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const editor = new Editor({
    element: host,
    extensions: pageEditorExtensions(),
    content: md,
    contentType: 'markdown',
    editorProps: {
      handleKeyDown: handleContentTitleNav,
    },
  })
  return { editor, host }
}

function press(editor: Editor, key: string, extra: KeyboardEventInit = {}) {
  const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra })
  editor.view.dom.dispatchEvent(event)
  return event
}

test('Enter at the start of TipTap focuses the title and does not insert a paragraph', () => {
  const { editor, host } = makeEditor('hello')
  editor.chain().focus().setTextSelection(Selection.atStart(editor.state.doc)).run()
  assert.equal(editor.state.selection.empty, true)
  assert.equal(editor.state.selection.from, Selection.atStart(editor.state.doc).from)

  let hits = 0
  const onTitle = () => {
    hits += 1
  }
  window.addEventListener(FOCUS_RECORD_TITLE, onTitle)
  const before = editor.getMarkdown()
  const event = press(editor, 'Enter')
  window.removeEventListener(FOCUS_RECORD_TITLE, onTitle)

  assert.equal(event.defaultPrevented, true)
  assert.equal(hits, 1)
  assert.equal(editor.getMarkdown(), before)
  assert.doesNotMatch(editor.getHTML(), /<p><\/p><p>hello/)
  editor.destroy()
  host.remove()
})

test('Enter in the middle of a paragraph does not jump to the title', () => {
  const { editor, host } = makeEditor('hello')
  editor.commands.setTextSelection(3)
  let hits = 0
  const onTitle = () => {
    hits += 1
  }
  window.addEventListener(FOCUS_RECORD_TITLE, onTitle)
  press(editor, 'Enter')
  window.removeEventListener(FOCUS_RECORD_TITLE, onTitle)
  assert.equal(hits, 0)
  editor.destroy()
  host.remove()
})

test('Shift+Enter at the start of TipTap stays in the document', () => {
  const { editor, host } = makeEditor('hello')
  editor.chain().focus().setTextSelection(Selection.atStart(editor.state.doc)).run()
  let hits = 0
  window.addEventListener(FOCUS_RECORD_TITLE, () => {
    hits += 1
  })
  press(editor, 'Enter', { shiftKey: true })
  assert.equal(hits, 0)
  editor.destroy()
  host.remove()
})
