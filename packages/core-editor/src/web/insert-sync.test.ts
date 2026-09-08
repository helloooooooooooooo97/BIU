import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import { recentlyLocalEdit, shouldApplyRemoteMarkdown } from './page-editor.tsx'

function insertAfter(text: string, insertLine: number, newStr: string) {
  const lines = text.split('\n')
  lines.splice(insertLine, 0, newStr)
  return lines.join('\n')
}

test('insert writes the new line into markdown source', () => {
  const before = '# 欢迎\n\n第一段\n\n末段'
  const next = insertAfter(before, 2, '你好')
  assert.match(next, /你好/)
  assert.equal(next.split('\n')[2], '你好')
})

test('tiptap paints an inserted markdown line as a paragraph', () => {
  const md = insertAfter('# 欢迎\n\n第一段\n\n末段', 2, '你好')
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: md,
    contentType: 'markdown',
  })
  assert.match(editor.getHTML(), /你好/)
  assert.match(editor.getMarkdown(), /你好/)
  editor.destroy()
})

test('remote insert applies when the wysiwyg editor is not live', () => {
  assert.equal(
    shouldApplyRemoteMarkdown({ focused: true, live: false, hasJump: false, recentlyLocal: false }),
    true,
  )
  assert.equal(
    shouldApplyRemoteMarkdown({ focused: true, live: true, hasJump: false, recentlyLocal: true }),
    false,
  )
  assert.equal(
    shouldApplyRemoteMarkdown({ focused: true, live: true, hasJump: false, recentlyLocal: false }),
    true,
  )
  assert.equal(
    shouldApplyRemoteMarkdown({ focused: true, live: true, hasJump: true, recentlyLocal: true }),
    true,
  )
  assert.equal(
    shouldApplyRemoteMarkdown({ focused: false, live: true, hasJump: false, recentlyLocal: true }),
    true,
  )
  assert.equal(recentlyLocalEdit(Date.now()), true)
  assert.equal(recentlyLocalEdit(Date.now() - 2000), false)
})
