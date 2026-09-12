/**
 * 页面块 wrapper 带 draggable=true，而 HTML5 拖拽源取的是最近的 draggable 祖先，
 * 所以在块里拖选文字会被劫持成「拖整个块」。
 *
 * dragstart 只在拖拽源节点上触发、不会经过内部的展示区，所以拦事件没用；
 * 唯一可靠的办法是按下时临时摘掉祖先的 draggable，松手再还原——
 * 还原是必须的，否则块的拖拽排序会被永久关掉。
 */
export function suspendAncestorDrag(
  from: Element,
  target: { addEventListener: Window['addEventListener']; removeEventListener: Window['removeEventListener'] } = window,
): () => void {
  const host = from.closest('[draggable="true"]')
  if (!host) return () => {}
  host.setAttribute('draggable', 'false')
  const restore = () => {
    host.setAttribute('draggable', 'true')
    target.removeEventListener('mouseup', restore)
    target.removeEventListener('dragend', restore)
  }
  target.addEventListener('mouseup', restore)
  target.addEventListener('dragend', restore)
  return restore
}
