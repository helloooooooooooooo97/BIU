/** 列表不再定时整表刷新。检查器里的表和主区表都是 0。 */
export function listReloadInterval(_nested = false) {
  return 0
}

/** 藏在检查器里的页不接键盘。主区表始终接。 */
export function inspectorPaneAcceptsKeys(embed: boolean, node: Node | null) {
  if (!embed) return true
  const stage = node instanceof Element ? node.closest('.inspector-stage-pane') : null
  return stage?.classList.contains('is-active') === true
}
