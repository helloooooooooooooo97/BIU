/** ⌘⇧F always opens global search. ⌘F does too, except inside the page editor. */
export function isGlobalSearchHotkey(
  event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean },
  opts?: { inPageEditor?: boolean },
) {
  if (event.isComposing) return false
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return false
  if (event.key !== 'f' && event.key !== 'F') return false
  if (event.shiftKey) return true
  return !opts?.inPageEditor
}
