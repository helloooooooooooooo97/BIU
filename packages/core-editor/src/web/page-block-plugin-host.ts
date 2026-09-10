const PLUGIN_ATTR = 'data-biu-plugin'
const KIND_ATTR = 'data-biu-kind'
const ID_ATTR = 'data-biu-id'
const LABEL_ATTR = 'data-biu-label'
const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'BR', 'HR'])
const SURFACE = new Set([
  'DIV',
  'SPAN',
  'SECTION',
  'ARTICLE',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'BUTTON',
  'A',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'P',
  'PRE',
  'CODE',
  'LI',
  'TABLE',
  'IMG',
  'CANVAS',
  'IFRAME',
])

function surfaceLabel(el: HTMLElement) {
  return (
    el.getAttribute('aria-label') ||
    el.getAttribute('data-testid') ||
    el.getAttribute('title') ||
    el.tagName.toLowerCase()
  )
}

/** Page Block 宿主把登记插件 id 打进整棵子树；已有 kind 的内部节点只补 plugin。 */
export function injectPageBlockPlugin(host: HTMLElement, plugin: string) {
  const id = plugin.trim()
  if (!id) return
  host.setAttribute(PLUGIN_ATTR, id)
  host.setAttribute('data-page-block-plugin', id)
  const walk = (el: Element, path: string) => {
    if (!(el instanceof HTMLElement) || SKIP.has(el.tagName)) return
    if (el !== host) {
      el.setAttribute(PLUGIN_ATTR, id)
      if (!el.getAttribute(KIND_ATTR) && SURFACE.has(el.tagName)) {
        el.setAttribute(KIND_ATTR, 'plugin')
        el.setAttribute(ID_ATTR, `${id}:${path}`)
        if (!el.getAttribute(LABEL_ATTR)) el.setAttribute(LABEL_ATTR, surfaceLabel(el))
      }
    }
    let i = 0
    for (const child of el.children) {
      walk(child, `${path}/${i}`)
      i += 1
    }
  }
  walk(host, '0')
}

export function bindPageBlockPlugin(host: HTMLElement | null, plugin: string) {
  if (!host || typeof MutationObserver === 'undefined') {
    if (host) injectPageBlockPlugin(host, plugin)
    return () => {}
  }
  const run = () => injectPageBlockPlugin(host, plugin)
  run()
  const mo = new MutationObserver(run)
  mo.observe(host, { subtree: true, childList: true })
  return () => mo.disconnect()
}
