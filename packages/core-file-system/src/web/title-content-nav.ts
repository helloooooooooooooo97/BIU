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
) {
  if (flags.isComposing) return false
  if (flags.shiftKey || flags.altKey || flags.metaKey || flags.ctrlKey) return false
  if (key !== 'ArrowUp' && key !== 'Enter') return false
  return isDocStartSelection(from, empty, docStart)
}
