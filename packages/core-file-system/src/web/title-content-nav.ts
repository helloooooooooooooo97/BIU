import { FOCUS_RECORD_CONTENT, FOCUS_RECORD_TITLE } from './fsdb-events.ts'

export { FOCUS_RECORD_CONTENT, FOCUS_RECORD_TITLE }

export type FocusRecordContentDetail = {
  recordId?: string
  mode?: 'move' | 'enter'
  insertText?: string
}

export type FocusRecordTitleDetail = {
  recordId?: string
  appendText?: string
}

export function shouldLeaveTitleForContent(key: string, shiftKey: boolean, value: string, selectionEnd: number) {
  if (shiftKey) return false
  if (key === 'Enter') return true
  if (key === 'ArrowDown') return !value.slice(selectionEnd).includes('\n')
  return false
}

/** 检测自动换行的 textarea 光标是否已处于视觉最后一行（jsdom 无布局宽度时退回换行符判断）。 */
export function isTextareaAtLastVisualLine(el: HTMLTextAreaElement): boolean {
  const value = el.value
  const end = el.selectionEnd ?? value.length
  if (value.slice(end).includes('\n')) return false
  if (end >= value.length) return true
  if (el.clientWidth <= 0 || typeof document === 'undefined') return true
  try {
    const cs = getComputedStyle(el)
    const mirror = document.createElement('div')
    mirror.style.cssText = [
      'position:fixed',
      'top:-9999px',
      'left:-9999px',
      'visibility:hidden',
      'white-space:pre-wrap',
      'word-wrap:break-word',
      'overflow-wrap:break-word',
      `box-sizing:${cs.boxSizing}`,
      `width:${el.clientWidth}px`,
      `padding:${cs.padding}`,
      `border:${cs.border}`,
      `font:${cs.font}`,
      `letter-spacing:${cs.letterSpacing}`,
      `line-height:${cs.lineHeight}`,
    ].join(';')
    const before = document.createTextNode(value.slice(0, end))
    const caret = document.createElement('span')
    caret.textContent = '\u200B'
    const after = document.createTextNode(value.slice(end))
    const tail = document.createElement('span')
    tail.textContent = '\u200B'
    mirror.append(before, caret, after, tail)
    document.body.appendChild(mirror)
    const caretTop = caret.offsetTop
    const tailTop = tail.offsetTop
    mirror.remove()
    return caretTop >= tailTop - 2
  } catch {
    return true
  }
}

export function isDocStartSelection(from: number, empty: boolean, docStart: number) {
  return empty && from === docStart
}

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

function titleInputNear(from: Element | null | undefined) {
  const root =
    from?.closest('.fsdb-detail-main') ??
    from?.closest('.fsdb-detail-stage') ??
    from?.closest('.fsdb-page')
  return root?.querySelector<HTMLTextAreaElement | HTMLInputElement>('.fsdb-detail-title-input')
}

function placeTitleCaret(el: HTMLTextAreaElement | HTMLInputElement, caretPos?: number) {
  if (!el.isConnected) return
  el.focus({ preventScroll: true })
  try {
    el.scrollIntoView?.({ block: 'nearest' })
  } catch {
    /* ignore */
  }
  const n = caretPos != null ? Math.max(0, Math.min(caretPos, el.value.length)) : el.value.length
  try {
    el.setSelectionRange(n, n)
  } catch {
    /* ignore */
  }
}

/** 标题在属性上方：同一个详情主栏里的 `.fsdb-detail-title-input`，光标放到末尾或指定拼接位。 */
export function focusRecordTitleNear(from: Element | null | undefined, caretPos?: number) {
  const el = titleInputNear(from)
  if (!el) return false
  placeTitleCaret(el, caretPos)
  if (document.activeElement !== el) {
    requestAnimationFrame(() => placeTitleCaret(el, caretPos))
    setTimeout(() => placeTitleCaret(el, caretPos), 0)
  }
  return true
}

/** 进入详情后多拍几次，避开表格弹层卸载 / 正文编辑器抢焦点。 */
export function scheduleFocusRecordTitle(from: () => Element | null | undefined) {
  const go = () => focusRecordTitleNear(from())
  go()
  const frames: number[] = []
  frames.push(requestAnimationFrame(() => {
    go()
    frames.push(requestAnimationFrame(go))
  }))
  const t0 = window.setTimeout(go, 0)
  const t1 = window.setTimeout(go, 80)
  return () => {
    for (const id of frames) cancelAnimationFrame(id)
    window.clearTimeout(t0)
    window.clearTimeout(t1)
  }
}
