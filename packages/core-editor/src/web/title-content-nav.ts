import type { Editor } from '@tiptap/core'
import { Selection } from '@tiptap/pm/state'
import type { Node as PmNode, ResolvedPos } from '@tiptap/pm/model'
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
  rejected?: boolean
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

/**
 * 提取首段可无损并入纯文本标题的「第一行」：
 * - 遇到 hardBreak (<br>) 只切出第一行及该 <br>，保留 <br> 后面的行在首段内，绝不误删后续行；
 * - 遇到 mention / inlineMath / image 等非纯文本行内原子节点时返回 null，退化为纯移动光标到标题末尾，绝不吞掉富内容。
 */
export function extractMergeableFirstLine(parent: PmNode): {
  text: string
  deleteFrom: number
  deleteTo: number
  wholeParagraph: boolean
} | null {
  let text = ''
  let hitHardBreak = false
  let breakEndOffset = 0
  let hasNonTextAtom = false

  parent.forEach((child, offset) => {
    if (hitHardBreak || hasNonTextAtom) return
    if (child.isText) {
      text += child.text ?? ''
      return
    }
    if (child.type.name === 'hardBreak') {
      hitHardBreak = true
      breakEndOffset = offset + child.nodeSize
      return
    }
    hasNonTextAtom = true
  })

  if (hasNonTextAtom) return null
  if (hitHardBreak) {
    return {
      text,
      deleteFrom: 1,
      deleteTo: 1 + breakEndOffset,
      wholeParagraph: false,
    }
  }
  return {
    text,
    deleteFrom: 0,
    deleteTo: parent.nodeSize,
    wholeParagraph: true,
  }
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
  // 首行是普通段落按 Backspace（参考 Notion / Outline 的两阶段原子握手）：
  // 1. 先提取可无损并回标题的首行文本（含 hardBreak 时只取第一行，含富原子节点则仅移焦点不删正文）；
  // 2. 先派发 FOCUS_RECORD_TITLE 让标题同步接收，仅当未被拒绝（!detail.rejected）时才从编辑器删除对应区间。
  if (event.key === 'Backspace' && sel.$from.depth === 1 && sel.$from.parent.type.name === 'paragraph') {
    const parent = sel.$from.parent
    if (parent.content.size === 0) {
      if (view.state.doc.childCount > 1) {
        view.dispatch(view.state.tr.delete(0, parent.nodeSize))
      }
    } else {
      const slice = extractMergeableFirstLine(parent)
      if (slice) {
        if (slice.text.length > 0) {
          const detail: FocusRecordTitleDetail = {
            ...(recordId ? { recordId } : {}),
            appendText: slice.text,
            rejected: false,
          }
          window.dispatchEvent(new CustomEvent(FOCUS_RECORD_TITLE, { detail }))
          if (!detail.rejected) {
            if (!slice.wholeParagraph) {
              view.dispatch(view.state.tr.delete(slice.deleteFrom, slice.deleteTo))
            } else if (view.state.doc.childCount > 1) {
              view.dispatch(view.state.tr.delete(0, parent.nodeSize))
            } else {
              view.dispatch(view.state.tr.delete(1, parent.nodeSize - 1))
            }
          }
          return true
        }
        // hardBreak 首行为空（<p><br>后面的内容</p>）：仅删掉开头的空 <br> 并回标题，保留后面的内容！
        if (!slice.wholeParagraph) {
          view.dispatch(view.state.tr.delete(slice.deleteFrom, slice.deleteTo))
        }
      }
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
