import { Selection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

export const FOCUS_RECORD_TITLE = 'biu:focus-record-title'
export const FOCUS_RECORD_CONTENT = 'biu:focus-record-content'

export function isDocStartSelection(from: number, empty: boolean, docStart: number) {
  return empty && from === docStart
}

/** 正文最开头空选区：上方向键或退格（Mac 上的 Delete）回到标题末尾。回车只换行，不跳标题。嵌套块（空列表等）退格先拆块，不跳标题。 */
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
  if (key !== 'ArrowUp' && key !== 'Backspace' && key !== 'Delete') return false
  if (nested && (key === 'Backspace' || key === 'Delete')) return false
  return isDocStartSelection(from, empty, docStart)
}

export function handleContentTitleNav(view: EditorView, event: KeyboardEvent) {
  if (event.isComposing) return false
  const sel = view.state.selection
  const start = Selection.atStart(view.state.doc).from
  const nested = sel.$from.depth > 1
  if (!shouldLeaveContentForTitle(event.key, event, sel.from, sel.empty, start, nested)) return false
  event.preventDefault()
  if (!focusRecordTitleNear(view.dom)) {
    window.dispatchEvent(new Event(FOCUS_RECORD_TITLE))
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
  el.focus()
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
