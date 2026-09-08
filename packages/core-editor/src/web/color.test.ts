import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import { HIGHLIGHT_COLORS, TEXT_COLORS } from './color-swatches.ts'

test('color and highlight palettes have defaults plus hues', () => {
  assert.ok(TEXT_COLORS.some((item) => item.value === ''))
  assert.ok(TEXT_COLORS.some((item) => item.value === '#E11D48'))
  assert.ok(HIGHLIGHT_COLORS.some((item) => item.value === ''))
  assert.ok(HIGHLIGHT_COLORS.some((item) => item.value === '#FEF08A'))
})

test('tiptap Color and Highlight apply to a selection', () => {
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '你好世界',
    contentType: 'markdown',
  })
  const from = 1
  const to = from + '你好'.length
  editor.commands.setTextSelection({ from, to })
  editor.commands.setColor('#E11D48')
  assert.equal(editor.isActive('textStyle', { color: '#E11D48' }), true)
  assert.match(editor.getHTML(), /style="color:/)
  editor.commands.setHighlight({ color: '#FEF08A' })
  assert.equal(editor.isActive('highlight', { color: '#FEF08A' }), true)
  assert.match(editor.getHTML(), /<(span|mark)[^>]*(data-color|#FEF08A|background-color)/)
  const md = editor.getMarkdown()
  editor.destroy()

  const again = new Editor({
    extensions: pageEditorExtensions(),
    content: md,
    contentType: 'markdown',
  })
  again.commands.setTextSelection({ from, to })
  assert.equal(again.isActive('textStyle', { color: '#E11D48' }), true)
  assert.equal(again.isActive('highlight', { color: '#FEF08A' }), true)
  again.destroy()
})
