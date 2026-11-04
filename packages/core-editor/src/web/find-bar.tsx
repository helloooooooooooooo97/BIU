export function isFindHotkey(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean }) {
  if (event.isComposing) return false
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  return event.key === 'f' || event.key === 'F'
}
