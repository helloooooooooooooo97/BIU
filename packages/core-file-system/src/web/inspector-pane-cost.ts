/** 检查器里的表是 embed，不跑 20 秒整表轮询。主区列表仍是 20 秒。 */
export function listReloadInterval(nested: boolean) {
  return nested ? 0 : 20_000
}

/** 藏在检查器里的页不接键盘。主区表始终接。 */
export function inspectorPaneAcceptsKeys(embed: boolean, node: Node | null) {
  if (!embed) return true
  const stage = node instanceof Element ? node.closest('.inspector-stage-pane') : null
  return stage?.classList.contains('is-active') === true
}
