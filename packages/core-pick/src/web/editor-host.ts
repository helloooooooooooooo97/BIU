export type EditorTextLocus = { start_line: number; end_line: number; text: string }

export type EditorTextHost = {
  /** db_content 路径，如 /pages/p002 */
  path?: string
  /** 工作区 Markdown，页面为 .page/<id>.md */
  file?: string
  locusFromSelection: () => EditorTextLocus | null
  locusFromElement: (el: Element) => EditorTextLocus | null
}

export function pickContentFile(path: string) {
  const id = path.match(/^\/pages\/([^/]+)$/)?.[1]
  return id ? `.page/${id}.md` : undefined
}

const hosts = new WeakMap<Element, EditorTextHost>()

export function bindEditorTextHost(el: Element | null, host: EditorTextHost | null) {
  if (!el) return
  if (host) hosts.set(el, host)
  else hosts.delete(el)
}

export function editorHostFromNode(node: Node | null): EditorTextHost | null {
  let el: Element | null = node instanceof Element ? node : node?.parentElement ?? null
  while (el) {
    const host = hosts.get(el)
    if (host) return host
    el = el.parentElement
  }
  return null
}
