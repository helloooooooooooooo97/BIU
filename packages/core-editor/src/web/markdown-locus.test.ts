import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import { markdownLocusFromRange, markdownLocusFromSelection, posAtMarkdownLine } from './markdown-locus.ts'

function editorOf(markdown: string) {
  return new Editor({
    extensions: pageEditorExtensions(),
    content: markdown,
    contentType: 'markdown',
  })
}

function posOf(editor: Editor, needle: string) {
  let found: number | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found != null || !node.isText || !node.text) return
    const idx = node.text.indexOf(needle)
    if (idx >= 0) found = pos + idx
  })
  return found
}

test('selection maps to markdown source lines, not visual blocks', () => {
  const md = '# 欢迎\n\n第一段\n\nUNIQUESEL\n\n末段'
  const editor = editorOf(md)
  const from = posOf(editor, 'UNIQUESEL')
  assert.ok(from != null)
  editor.commands.setTextSelection({ from, to: from + 'UNIQUESEL'.length })
  const locus = markdownLocusFromSelection(editor)
  assert.ok(locus)
  assert.equal(locus.start_line, 5)
  assert.equal(locus.end_line, 5)
  assert.equal(locus.text, 'UNIQUESEL')
  assert.equal(locus.selection, 'UNIQUESEL')
  editor.destroy()
})

test('multi-line selection spans markdown source lines', () => {
  const md = 'alpha\n\nbravo\n\ncharlie'
  const editor = editorOf(md)
  const from = posOf(editor, 'bravo')
  const to = posOf(editor, 'charlie')
  assert.ok(from != null && to != null)
  const locus = markdownLocusFromRange(editor, from, to + 'charlie'.length)
  assert.ok(locus)
  assert.equal(locus.start_line, 3)
  assert.equal(locus.end_line, 5)
  assert.match(locus.text, /bravo/)
  assert.match(locus.text, /charlie/)
  assert.match(locus.selection ?? '', /bravo/)
  assert.match(locus.selection ?? '', /charlie/)
  editor.destroy()
})

test('heading selection uses the heading markdown line', () => {
  const md = '# Hello title\n\nbody'
  const editor = editorOf(md)
  const from = posOf(editor, 'Hello title')
  assert.ok(from != null)
  const locus = markdownLocusFromRange(editor, from, from + 'Hello title'.length)
  assert.ok(locus)
  assert.equal(locus.start_line, 1)
  assert.match(locus.text, /Hello title/)
  assert.equal(locus.selection, 'Hello title')
  editor.destroy()
})

test('locus keeps source lines in text and the highlight in selection', () => {
  const md = '勃，三尺微命，一介书生。'
  const editor = editorOf(md)
  const from = posOf(editor, '三尺微命')
  assert.ok(from != null)
  editor.commands.setTextSelection({ from, to: from + '三尺微命'.length })
  const locus = markdownLocusFromSelection(editor)
  assert.ok(locus)
  assert.equal(locus.start_line, 1)
  assert.equal(locus.end_line, 1)
  assert.equal(locus.text, '勃，三尺微命，一介书生。')
  assert.equal(locus.selection, '三尺微命')
  editor.destroy()
})

test('caret maps insert to markdown source offset, not visual marks', () => {
  const md = '前 **粗体** 后'
  const editor = editorOf(md)
  const from = posOf(editor, '粗体')
  assert.ok(from != null)
  editor.commands.setTextSelection(from + '粗体'.length)
  const locus = markdownLocusFromSelection(editor)
  assert.ok(locus)
  assert.equal(locus.start_line, 1)
  assert.equal(locus.end_line, 1)
  assert.equal(locus.text, '前 **粗体** 后')
  assert.equal(locus.selection, undefined)
  assert.equal(locus.insert, '前 **粗体**'.length)
  editor.destroy()
})

test('caret in a heading uses the heading markdown line', () => {
  const md = '# Hello title\n\nbody'
  const editor = editorOf(md)
  const from = posOf(editor, 'Hello title')
  assert.ok(from != null)
  editor.commands.setTextSelection(from + 'Hello'.length)
  const locus = markdownLocusFromSelection(editor)
  assert.ok(locus)
  assert.equal(locus.start_line, 1)
  assert.equal(locus.text, '# Hello title')
  assert.equal(locus.insert, '# Hello'.length)
  editor.destroy()
})

test('block math node selection still has a markdown locus for ⌘L', () => {
  const md = '前言\n\n$$\\sum x$$\n\n后记'
  const editor = editorOf(md)
  let pos = -1
  editor.state.doc.descendants((node, p) => {
    if (node.type.name === 'blockMath') pos = p
  })
  assert.ok(pos >= 0)
  editor.chain().setNodeSelection(pos).run()
  const locus = markdownLocusFromSelection(editor)
  assert.ok(locus)
  assert.match(locus.selection ?? locus.text, /\\sum x/)
  editor.destroy()
})

test('posAtMarkdownLine inverts locus line numbers', () => {
  const md = '# 欢迎\n\n第一段\n\nUNIQUESEL\n\n末段'
  const editor = editorOf(md)
  const pos = posAtMarkdownLine(editor, 5)
  editor.commands.setTextSelection(Math.max(1, pos))
  const locus = markdownLocusFromSelection(editor)
  assert.equal(locus?.start_line, 5)
  assert.match(locus?.text ?? '', /UNIQUESEL/)
  editor.destroy()
})
