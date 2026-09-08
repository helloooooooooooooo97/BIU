import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { pageEditorExtensions } from './kit.ts'
import { markdownLocusFromRange, markdownLocusFromSelection } from './markdown-locus.ts'

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
  assert.match(locus.text, /UNIQUESEL/)
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
  editor.destroy()
})
