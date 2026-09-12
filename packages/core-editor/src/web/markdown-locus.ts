import type { Editor } from '@tiptap/core'
import type { Node as PmNode } from '@tiptap/pm/model'

export type MarkdownLocus = {
  start_line: number
  end_line: number
  text: string
  selection?: string
  /** 0-based offset in this line's markdown source; caret sits between text[insert-1] and text[insert]. */
  insert?: number
}

function serialize(editor: Editor, doc: PmNode) {
  const manager = editor.storage.markdown?.manager as { serialize?: (json: unknown) => string } | undefined
  if (typeof manager?.serialize === 'function') return manager.serialize(doc.toJSON())
  return editor.getMarkdown()
}

export function markdownLineText(md: string, line: number) {
  return linesOf(md, line, line)
}

/** 当前文档里，该 1-based markdown 行开头的 ProseMirror 位置。 */
export function posAtMarkdownLine(editor: Editor, line: number): number {
  const doc = editor.state.doc
  const full = serialize(editor, doc)
  const target = clampLine(line, full)
  let lo = 0
  let hi = Math.max(0, doc.content.size)
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2)
    const prefix = serialize(editor, doc.cut(0, mid))
    if (lineFromPrefix(prefix, full) < target) lo = mid + 1
    else hi = mid
  }
  return lo
}

/** 该行之后（下一行开头；已是末行则文档末尾）。 */
export function posAfterMarkdownLine(editor: Editor, line: number): number {
  const doc = editor.state.doc
  const full = serialize(editor, doc)
  const last = clampLine(Number.MAX_SAFE_INTEGER, full)
  if (line >= last) return doc.content.size
  return posAtMarkdownLine(editor, line + 1)
}

function lineAtEnd(md: string) {
  if (!md) return 1
  return md.split('\n').length
}

function linesOf(md: string, start: number, end: number) {
  const lines = md.split('\n')
  const from = Math.min(Math.max(1, start), Math.max(lines.length, 1))
  const to = Math.min(Math.max(from, end), Math.max(lines.length, 1))
  return lines.slice(from - 1, to).join('\n')
}

function clampLine(line: number, full: string) {
  const total = Math.max(full.split('\n').length, 1)
  return Math.min(Math.max(1, line), total)
}

function lineFromPrefix(prefix: string, full: string) {
  let start_line = lineAtEnd(prefix)
  if (prefix.endsWith('\n')) start_line = Math.max(1, lineAtEnd(prefix.slice(0, -1)) + 1)
  return clampLine(start_line, full)
}

function insertInLine(prefix: string, full: string, line: number) {
  const text = linesOf(full, line, line)
  const before = line <= 1 ? '' : `${linesOf(full, 1, line - 1)}\n`
  return Math.min(Math.max(0, prefix.length - before.length), text.length)
}

/** 选区对应 Markdown 源码行号（1-based）。text 是整行源码，selection 是高亮；无选区时 insert 是该行源码插入点。 */
export function markdownLocusFromRange(editor: Editor, from: number, to: number): MarkdownLocus | null {
  const doc = editor.state.doc
  const a = Math.max(0, Math.min(from, to))
  const b = Math.max(a, Math.max(from, to))
  const full = serialize(editor, doc)
  if (a === b) {
    const prefix = serialize(editor, doc.cut(0, a))
    const start_line = lineFromPrefix(prefix, full)
    const end_line = start_line
    const text = linesOf(full, start_line, end_line)
    const insert = insertInLine(prefix, full, start_line)
    return { start_line, end_line, text, insert }
  }
  let selection = doc.textBetween(a, b, '\n').trim()
  if (!selection) {
    try {
      selection = serialize(editor, doc.cut(a, b)).trim()
    } catch {
      selection = ''
    }
  }
  if (!selection) return null
  const prefix = serialize(editor, doc.cut(0, a))
  const through = serialize(editor, doc.cut(0, b))
  const start_line = lineFromPrefix(prefix, full)
  const end_line = clampLine(lineAtEnd(through.replace(/\n$/, '')), full)
  const text = linesOf(full, start_line, Math.max(start_line, end_line))
  if (!text.trim()) return null
  return { start_line, end_line: Math.max(start_line, end_line), text, selection }
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
