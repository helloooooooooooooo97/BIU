import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import {
  HIGHLIGHT_COLORS,
  INK_TONES,
  TEXT_COLORS,
  WASH_TONES,
  editorHighlightColor,
  editorTextColor,
  isLastColorHotkey,
  lastColorSwatch,
  readLastEditorColor,
  writeLastEditorColor,
} from './color-swatches.ts'

test('color palettes use global ink and wash tokens', () => {
  assert.ok(TEXT_COLORS.some((item) => item.value === ''))
  assert.ok(HIGHLIGHT_COLORS.some((item) => item.value === ''))
  assert.equal(INK_TONES[0]?.value, 'var(--biu-color-text)')
  assert.equal(INK_TONES.find((item) => item.id === 'blue')?.value, 'var(--biu-color-ink-blue)')
  assert.equal(WASH_TONES.find((item) => item.id === 'peach')?.value, 'var(--biu-color-wash-peach)')
  assert.equal(WASH_TONES.find((item) => item.id === 'lime')?.swatch, 'var(--biu-color-wash-lime-grad)')
  for (const tone of INK_TONES) {
    assert.ok(TEXT_COLORS.some((item) => item.value === editorTextColor(tone.value)))
    assert.equal(editorTextColor(tone.value), tone.value)
  }
  for (const tone of WASH_TONES) {
    assert.ok(HIGHLIGHT_COLORS.some((item) => item.value === editorHighlightColor(tone.value)))
    assert.equal(editorHighlightColor(tone.value), tone.value)
  }
})

test('last color storage and shortcut', () => {
  writeLastEditorColor(null)
  assert.equal(readLastEditorColor(), null)
  writeLastEditorColor({ kind: 'mark', value: 'var(--biu-color-wash-peach)' })
  assert.deepEqual(readLastEditorColor(), { kind: 'mark', value: 'var(--biu-color-wash-peach)' })
  assert.equal(lastColorSwatch({ kind: 'mark', value: 'var(--biu-color-wash-lime)' }), 'var(--biu-color-wash-lime-grad)')
  assert.equal(isLastColorHotkey({ key: 'h', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true }), true)
  assert.equal(isLastColorHotkey({ key: 'h', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }), false)
  writeLastEditorColor(null)
})

test('tiptap Color and Highlight apply palette tokens', () => {
  const text = editorTextColor('var(--biu-color-ink-blue)')
  const wash = editorHighlightColor('var(--biu-color-wash-sky)')
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '你好世界',
    contentType: 'markdown',
  })
  const from = 1
  const to = from + '你好'.length
  editor.commands.setTextSelection({ from, to })
  editor.commands.setColor(text)
  assert.equal(editor.isActive('textStyle', { color: text }), true)
  assert.match(editor.getHTML(), /style="color:/)
  editor.commands.setHighlight({ color: wash })
  assert.equal(editor.isActive('highlight', { color: wash }), true)
  assert.match(editor.getHTML(), /<(span|mark)[^>]*(data-color|background-color)/)
  const md = editor.getMarkdown()
  editor.destroy()

  const again = new Editor({
    extensions: pageEditorExtensions(),
    content: md,
    contentType: 'markdown',
  })
  again.commands.setTextSelection({ from, to })
  assert.equal(again.isActive('textStyle', { color: text }), true)
  assert.equal(again.isActive('highlight', { color: wash }), true)
  again.destroy()
})
