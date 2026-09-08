import type { Node as PmNode } from '@tiptap/pm/model'
import type { Editor } from '@tiptap/core'
import { CONTENT_JUMP_EVENT, parseContentJump, type ContentJump } from '@biu/type-file-system'
import { editorHostIsLive } from './editor-live.ts'
import { scrollOutlineTarget } from '@biu/public-ui'

let pending: ContentJump | null = null
let consumeTimer = 0

function jumpMatchesRecord(jump: ContentJump, recordId: string) {
  const id = String(recordId ?? '').trim()
  const path = String(jump.path ?? '').trim()
  if (!id || !path) return true
  return path === `/${id}` || path.endsWith(`/${id}`)
}

export function rememberContentJump(raw: unknown) {
  const jump = parseContentJump(raw)
  if (!jump) return
  pending = jump
  if (consumeTimer && typeof window !== 'undefined') {
    window.clearTimeout(consumeTimer)
    consumeTimer = 0
  }
}

export function consumeContentJump(recordId: string): ContentJump | null {
  if (!pending) return null
  if (!jumpMatchesRecord(pending, recordId)) return null
  const jump = pending
  pending = null
  if (consumeTimer && typeof window !== 'undefined') {
    window.clearTimeout(consumeTimer)
    consumeTimer = 0
  }
  return jump
}

export function peekContentJump() {
  return pending
}

export function contentJumpForRecord(recordId: string) {
  if (!pending || !jumpMatchesRecord(pending, recordId)) return null
  return pending
}

export function clearContentJump() {
  pending = null
  if (consumeTimer && typeof window !== 'undefined') {
    window.clearTimeout(consumeTimer)
    consumeTimer = 0
  }
}

function jumpHostOk(editor: Editor) {
  const el = editor.view?.dom
  if (!(el instanceof HTMLElement) || !el.isConnected) return true
  return editorHostIsLive(editor)
}

function scheduleConsume() {
  if (typeof window === 'undefined') {
    pending = null
    return
  }
  if (consumeTimer) return
  consumeTimer = window.setTimeout(() => {
    consumeTimer = 0
    pending = null
  }, 0)
}

export function stripMarkdownLine(line: string) {
  return line
    .replace(/^#{1,6}\s+/, '')
    .replace(/^>\s+/, '')
    .replace(/^[-*+]\s+/, '')
    .replace(/^\d+\.\s+/, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/`+/g, '')
    .trim()
}

export function snippetAtLine(markdown: string, line: number) {
  const lines = markdown.split('\n')
  const i = Math.min(Math.max(1, line), Math.max(lines.length, 1)) - 1
  for (let k = i; k < lines.length; k++) {
    const text = stripMarkdownLine(lines[k] ?? '')
    if (text) return text
  }
  for (let k = i - 1; k >= 0; k--) {
    const text = stripMarkdownLine(lines[k] ?? '')
    if (text) return text
  }
  return ''
}

export function posAtSnippet(doc: PmNode, snippet: string): number | null {
  const needle = snippet.slice(0, Math.min(48, snippet.length))
  if (!needle) return null
  let found: number | null = null
  doc.descendants((node, pos) => {
    if (found != null || !node.isText || !node.text) return
    const idx = node.text.indexOf(needle)
    if (idx >= 0) found = pos + idx
  })
  return found
}

export function tryContentJump(editor: Editor, markdown: string, recordId: string, force = false) {
  if (!pending || editor.isDestroyed) return false
  if (!jumpMatchesRecord(pending, recordId)) return false
  if (!jumpHostOk(editor)) return false
  const snippet = snippetAtLine(markdown, pending.start_line)
  if (!force && snippet && posAtSnippet(editor.state.doc, snippet) == null) return false
  applyContentJump(editor, markdown, pending)
  scheduleConsume()
  return true
}

export function applyContentJump(editor: Editor, markdown: string, jump: ContentJump) {
  const startSnippet = snippetAtLine(markdown, jump.start_line)
  const found = posAtSnippet(editor.state.doc, startSnippet)
  const pos = safeTextPos(editor.state.doc, found ?? 1)
  try {
    editor.chain().focus().setTextSelection(pos).run()
  } catch {
    editor.commands.focus()
  }
  try {
    editor.commands.scrollIntoView()
  } catch {
    /* jsdom 没有 layout */
  }
  scrollCaret(editor, pos)
}

function scrollCaret(editor: Editor, pos: number) {
  const mapped = editor.view.domAtPos(pos)
  const node = mapped.node
  const el = node instanceof Element ? node : node.parentElement
  if (!(el instanceof HTMLElement)) return
  const block =
    el.closest('h1, h2, h3, p, li, blockquote, pre, table, .page-block') ?? el
  scrollOutlineTarget(block)
}

function safeTextPos(doc: PmNode, pos: number) {
  const size = doc.content.size
  const clamped = Math.min(Math.max(1, pos), Math.max(1, size))
  try {
    const $pos = doc.resolve(clamped)
    if ($pos.parent.inlineContent) return $pos.pos
  } catch {
    /* fall through */
  }
  let found = 1
  doc.descendants((node, at) => {
    if (node.isTextblock) {
      found = Math.min(at + 1, size)
      return false
    }
  })
  return found
}

if (typeof window !== 'undefined') {
  window.addEventListener(CONTENT_JUMP_EVENT, (event) => {
    rememberContentJump((event as CustomEvent).detail)
  })
}
