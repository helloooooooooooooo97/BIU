export const FOCUS_RECORD_TITLE = 'biu:focus-record-title'
export const FOCUS_RECORD_CONTENT = 'biu:focus-record-content'

export function shouldLeaveTitleForContent(key: string, shiftKey: boolean, value: string, selectionEnd: number) {
  if (shiftKey) return false
  if (key === 'Enter') return true
  if (key === 'ArrowDown') return !value.slice(selectionEnd).includes('\n')
  return false
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
  if (key !== 'ArrowUp' && key !== 'Backspace' && key !== 'Delete') return false
  if (nested && (key === 'Backspace' || key === 'Delete')) return false
  return isDocStartSelection(from, empty, docStart)
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
