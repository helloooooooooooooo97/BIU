export type EditorTextLocus = { start_line: number; end_line: number; text: string; selection?: string; insert?: number }

export type EditorTextHost = {
  /** db_content 路径，如 /pages/p002 */
  path?: string
  /** 记录标题，如「爱乐之城」 */
  title?: string
  locusFromSelection: () => EditorTextLocus | null
  locusFromElement: (el: Element) => EditorTextLocus | null
}

const hosts = new WeakMap<Element, EditorTextHost>()

export function bindEditorTextHost(el: Element | null, host: EditorTextHost | null) {
  if (!el) return
  if (host) hosts.set(el, host)
  else hosts.delete(el)
}

function composedParent(node: Node | null): Element | null {
  if (!node) return null
  if (node.parentElement) return node.parentElement
  const root = node.parentNode
  return root instanceof ShadowRoot ? root.host : null
}

export function editorHostFromNode(node: Node | null): EditorTextHost | null {
  let el: Element | null = node instanceof Element ? node : composedParent(node)
  while (el) {
    const host = hosts.get(el)
    if (host) return host
    el = composedParent(el)
  }
  return null
}
