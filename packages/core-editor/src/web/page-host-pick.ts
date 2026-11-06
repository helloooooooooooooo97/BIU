const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'BR', 'HR'])
const HIT = new Set([
  'DIV',
  'SPAN',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'P',
  'BUTTON',
  'A',
  'IMG',
  'TABLE',
  'VIDEO',
  'AUDIO',
  'FIGURE',
  'LI',
  'ARTICLE',
  'SECTION',
])

export const PAGE_HOST_PICK_KIND = 'sandbox'
export const PAGE_HOST_PICK_MARK = 'data-sandbox-pick'

function surfaceLabel(el: HTMLElement) {
  const named =
    el.getAttribute('alt') ||
    el.getAttribute('title') ||
    el.getAttribute('aria-label') ||
    (el instanceof HTMLAnchorElement ? el.textContent : '')
  const short = [...el.querySelectorAll('div, span, h1, h2, h3, h4, p, button, a')]
    .map((node) => (node.childElementCount === 0 ? (node.textContent ?? '').replace(/\s+/g, ' ').trim() : ''))
    .find((text) => text.length >= 2 && text.length <= 40)
  return (named || short || el.textContent || el.tagName.toLowerCase()).replace(/\s+/g, ' ').trim().slice(0, 80)
}

function isNestedHost(el: HTMLElement, root: HTMLElement) {
  if (el === root) return false
  if (el.hasAttribute('data-sandbox')) return true
  if (el.hasAttribute('data-page-block') || el.classList.contains('page-block')) return true
  if (el.hasAttribute('data-biu-ignore')) return true
  return false
}

function isSurface(el: HTMLElement) {
  if (SKIP.has(el.tagName)) return false
  const kind = el.getAttribute('data-biu-kind')
  if (kind && kind !== PAGE_HOST_PICK_KIND) return false
  return HIT.has(el.tagName) || el.childElementCount === 0 || Boolean(el.textContent?.trim())
}

export function pageHostPickKey(pageId: string, viewId: string) {
  return `page-host-${String(pageId ?? '').trim()}-${String(viewId ?? '').trim()}`
}

export function stampPageHostPickSurfaces(
  root: HTMLElement,
  blockKey: string,
  source?: { path?: string; name?: string; title?: string },
) {
  const prefix = `${PAGE_HOST_PICK_KIND}:${blockKey}`
  const walkClear = (el: Element) => {
    if (!(el instanceof HTMLElement)) return
    if (isNestedHost(el, root)) return
    if (el.hasAttribute(PAGE_HOST_PICK_MARK) && (el.getAttribute('data-biu-id') || '').startsWith(prefix)) {
      if (el !== root) {
        el.removeAttribute(PAGE_HOST_PICK_MARK)
        if (el.getAttribute('data-biu-kind') === PAGE_HOST_PICK_KIND) {
          el.removeAttribute('data-biu-kind')
          el.removeAttribute('data-biu-id')
          el.removeAttribute('data-biu-label')
        }
      }
    }
    for (const child of el.children) walkClear(child)
  }
  walkClear(root)

  const stamp = (el: HTMLElement, path: string) => {
    const label = surfaceLabel(el)
    el.setAttribute(PAGE_HOST_PICK_MARK, '')
    el.setAttribute('data-biu-kind', PAGE_HOST_PICK_KIND)
    el.setAttribute('data-biu-id', `${prefix}:${path}`)
    if (label) el.setAttribute('data-biu-label', label)
    if (source?.path) el.setAttribute('data-biu-path', source.path)
    if (source?.name) el.setAttribute('data-biu-name', source.name)
    if (source?.title) el.setAttribute('data-biu-title', source.title)
  }
  stamp(root, 'root')
  const walk = (el: Element, path: string) => {
    let i = 0
    for (const child of el.children) {
      const next = `${path}/${i}`
      if (child instanceof HTMLElement && !isNestedHost(child, root) && isSurface(child)) stamp(child, next)
      if (child instanceof HTMLElement && !isNestedHost(child, root)) walk(child, next)
      i += 1
    }
  }
  walk(root, '0')
}
