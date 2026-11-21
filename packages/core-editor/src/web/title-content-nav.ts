import type { Editor } from '@tiptap/core'
import { Selection } from '@tiptap/pm/state'
import type { ResolvedPos } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

export const FOCUS_RECORD_TITLE = 'biu:focus-record-title'
export const FOCUS_RECORD_CONTENT = 'biu:focus-record-content'

export type FocusRecordContentDetail = {
  recordId?: string
  mode?: 'move' | 'enter'
  insertText?: string
}

export type FocusRecordTitleDetail = {
  recordId?: string
  appendText?: string
}

export function isDocStartSelection(from: number, empty: boolean, docStart: number) {
  return empty && from === docStart
}

/** 正文最开头空选区：上方向键或 Backspace 回到标题末尾。Delete 保留正常向后删字；嵌套块/标题块退格先降级，不直接跳标题。 */
export function shouldLeaveContentForTitle(
  key: string,
  flags: { shiftKey: boolean; altKey?: boolean; metaKey?: boolean; ctrlKey?: boolean; isComposing?: boolean },
  from: number,
  empty: boolean,
  docStart: number,
  nested = false,
) {
  if (flags.isComposing) return false
  if (flags.shiftKey || flags.altKey || flags.metaKey || flags.ctrlKey) return false
  if (key !== 'ArrowUp' && key !== 'Backspace') return false
  if (nested && key === 'Backspace') return false
  return isDocStartSelection(from, empty, docStart)
}

/** 从标题进入正文：ArrowDown 纯移光标；Enter 在首行非空时头部插空段，或在标题中间回车时把后半段拆成新首段。 */
export function enterContentFromTitle(editor: Editor, detail?: FocusRecordContentDetail) {
  if (editor.isDestroyed) return
  if (detail?.mode === 'enter') {
    const paragraphType = editor.state.schema.nodes.paragraph
    const first = editor.state.doc.firstChild
    if (paragraphType) {
      if (detail.insertText) {
        const node = paragraphType.create(null, editor.state.schema.text(detail.insertText))
        const tr = editor.state.tr.insert(0, node)
        tr.setSelection(Selection.near(tr.doc.resolve(1)))
        editor.view.dispatch(tr)
        editor.commands.focus(undefined, { scrollIntoView: false })
        return
      }
      const firstIsEmptyParagraph = first?.type.name === 'paragraph' && first.content.size === 0
      if (!firstIsEmptyParagraph) {
        const node = paragraphType.create()
        const tr = editor.state.tr.insert(0, node)
        tr.setSelection(Selection.near(tr.doc.resolve(1)))
        editor.view.dispatch(tr)
        editor.commands.focus(undefined, { scrollIntoView: false })
        return
      }
    }
  }
  editor.commands.focus('start', { scrollIntoView: false })
}

function hasHiddenClass(el: Element | null) {
  while (el) {
    const cls = el.getAttribute('class') ?? ''
    if (cls.split(/\s+/).includes('page-block-is-hidden')) return true
    el = el.parentElement
  }
  return false
}

function blockDomHidden(view: EditorView, pos: number) {
  const raw = view.nodeDOM(pos)
  const el = raw instanceof HTMLElement ? raw : raw instanceof Node ? raw.parentElement : null
  if (!el) return false
  if (hasHiddenClass(el)) return true
  try {
    return getComputedStyle(el).display === 'none'
  } catch {
    return false
  }
}

export function hasVisibleBlockBefore(view: EditorView, $from: ResolvedPos) {
  const doc = view.state.doc
  const index = $from.depth === 0 ? ($from.nodeAfter ? $from.index() : Math.max(0, $from.index() - 1)) : $from.index(0)
  let pos = 0
  for (let i = 0; i < index; i += 1) {
    if (!blockDomHidden(view, pos)) return true
    pos += doc.child(i).nodeSize
  }
  return false
}

function endOfTextblockSafe(view: EditorView, dir: 'up' | 'down') {
  try {
    return view.endOfTextblock(dir)
  } catch {
    return true
  }
}

/** 大纲会藏住上方块，或在标题头插折叠钮：第一个可见块首行的 ↑ 也要回到页面标题。 */
export function atFirstVisibleLine(view: EditorView) {
  const sel = view.state.selection
  if (!sel.empty) return false
  if (sel.from === 0) return true
  const start = Selection.atStart(view.state.doc).from
  if (sel.from === start) return true
  const $from = sel.$from
  const firstLine =
    $from.parent.isTextblock && ($from.parentOffset === 0 || endOfTextblockSafe(view, 'up'))
  if (!firstLine) return false
  return !hasVisibleBlockBefore(view, $from)
}

export function handleContentTitleNav(view: EditorView, event: KeyboardEvent) {
  if (event.isComposing) return false
  const sel = view.state.selection
  const start = Selection.atStart(view.state.doc).from
  const nested = sel.$from.depth > 1 || sel.$from.parent.type.name === 'heading'
  const leave =
    shouldLeaveContentForTitle(event.key, event, sel.from, sel.empty, start, nested) ||
    (event.key === 'ArrowUp' &&
      !event.shiftKey &&
      !event.altKey &&
      !event.metaKey &&
      !event.ctrlKey &&
      atFirstVisibleLine(view))
  if (!leave) return false
  event.preventDefault()
  const recordId = view.dom.closest('[data-page-record]')?.getAttribute('data-page-record') || undefined
  // 首行是普通段落按 Backspace：
  // - 若首行非空：把首行文字并回标题末尾（光标停在拼接处），并移除/清空该首行；
  // - 若首行为空且后面还有其他块：顺手删掉该空行并回到标题末尾。
  if (event.key === 'Backspace' && sel.$from.depth === 1 && sel.$from.parent.type.name === 'paragraph') {
    const parent = sel.$from.parent
    const tailText = parent.textContent
    if (tailText.length > 0) {
      if (view.state.doc.childCount > 1) {
        view.dispatch(view.state.tr.delete(0, parent.nodeSize))
      } else {
        view.dispatch(view.state.tr.delete(1, parent.nodeSize - 1))
      }
      const detail: FocusRecordTitleDetail = {
        ...(recordId ? { recordId } : {}),
        appendText: tailText,
      }
      window.dispatchEvent(new CustomEvent(FOCUS_RECORD_TITLE, { detail }))
      return true
    }
    if (view.state.doc.childCount > 1) {
      view.dispatch(view.state.tr.delete(0, parent.nodeSize))
    }
  }
  if (!focusRecordTitleNear(view.dom)) {
    const detail: FocusRecordTitleDetail = recordId ? { recordId } : {}
    window.dispatchEvent(new CustomEvent(FOCUS_RECORD_TITLE, { detail }))
  }
  return true
}

function titleInputNear(from: Element | null | undefined) {
  const root =
    from?.closest('.fsdb-detail-main') ??
    from?.closest('.fsdb-detail-stage') ??
    from?.closest('.fsdb-page')
  return root?.querySelector<HTMLTextAreaElement | HTMLInputElement>('.fsdb-detail-title-input')
}

function placeTitleCaret(el: HTMLTextAreaElement | HTMLInputElement) {
  if (!el.isConnected) return
  el.focus({ preventScroll: true })
  try {
    el.scrollIntoView?.({ block: 'nearest' })
  } catch {
    /* ignore */
  }
  const n = el.value.length
  try {
    el.setSelectionRange(n, n)
  } catch {
    /* ignore */
  }
}

/** 标题在属性上方：同一个详情主栏里的 `.fsdb-detail-title-input`，光标放到末尾。 */
export function focusRecordTitleNear(from: Element | null | undefined) {
  const el = titleInputNear(from)
  if (!el) return false
  placeTitleCaret(el)
  if (document.activeElement !== el) {
    requestAnimationFrame(() => placeTitleCaret(el))
    setTimeout(() => placeTitleCaret(el), 0)
  }
  return true
}
