export const FOCUS_RECORD_TITLE = 'biu:focus-record-title'
export const FOCUS_RECORD_CONTENT = 'biu:focus-record-content'

export function isDocStartSelection(from: number, empty: boolean, docStart: number) {
  return empty && from === docStart
}

/** 正文最开头空选区：上方向键或再按一次回车，光标到标题末尾。 */
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
