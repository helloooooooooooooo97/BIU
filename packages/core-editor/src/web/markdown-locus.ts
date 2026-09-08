import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'

export type MarkdownLocus = { start_line: number; end_line: number; text: string; selection?: string }

function serialize(editor: Editor, doc: PmNode) {
  const manager = editor.storage.markdown?.manager as { serialize?: (json: unknown) => string } | undefined
  if (typeof manager?.serialize === 'function') return manager.serialize(doc.toJSON())
  return editor.getMarkdown()
}

function lineAtEnd(md: string) {
  if (!md) return 1
  return md.slice(0, md.length).split('\n').length
}

function linesOf(md: string, start: number, end: number) {
  const lines = md.split('\n')
  const from = Math.min(Math.max(1, start), Math.max(lines.length, 1))
  const to = Math.min(Math.max(from, end), Math.max(lines.length, 1))
  return lines.slice(from - 1, to).join('\n')
}

/** 选区对应 Markdown 源码行号（1-based）。text 是整行源码，selection 是高亮片段。 */
export function markdownLocusFromRange(editor: Editor, from: number, to: number): MarkdownLocus | null {
  const doc = editor.state.doc
  const a = Math.max(0, Math.min(from, to))
  const b = Math.max(a, Math.max(from, to))
  if (a === b) return null
  const selection = doc.textBetween(a, b, '\n').trim()
  if (!selection) return null
  const full = serialize(editor, doc)
  const prefix = serialize(editor, doc.cut(0, a))
  const through = serialize(editor, doc.cut(0, b))
  let start_line = lineAtEnd(prefix)
  if (prefix.endsWith('\n')) start_line = Math.max(1, lineAtEnd(prefix.slice(0, -1)) + 1)
  let end_line = lineAtEnd(through.replace(/\n$/, ''))
  const total = Math.max(full.split('\n').length, 1)
  start_line = Math.min(Math.max(1, start_line), total)
  end_line = Math.min(Math.max(start_line, end_line), total)
  const text = linesOf(full, start_line, end_line)
  if (!text.trim()) return null
  return { start_line, end_line, text, selection }
}

export function markdownLocusFromSelection(editor: Editor): MarkdownLocus | null {
  const { from, to } = editor.state.selection
  return markdownLocusFromRange(editor, from, to)
}

export function markdownLocusFromElement(editor: Editor, el: Element): MarkdownLocus | null {
  const view = editor.view
  if (!view.dom.contains(el)) return null
  try {
    const from = view.posAtDOM(el, 0)
    const to = view.posAtDOM(el, el.childNodes.length)
    return markdownLocusFromRange(editor, from, to)
  } catch {
    return null
  }
}
