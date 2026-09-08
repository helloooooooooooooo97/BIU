const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'BR', 'HR'])
const SURFACE = new Set([
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

export const HTML_PICK_KIND = 'html'
export const HTML_PICK_MARK = 'data-html-pick'

function hashText(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).slice(0, 8)
}

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

function isPeerChunk(el: HTMLElement) {
  const parent = el.parentElement
  if (!parent) return false
  const peers = [...parent.children].filter(
    (node): node is HTMLElement =>
      node instanceof HTMLElement && node.tagName !== 'SPAN' && node.childElementCount >= 1,
  )
  if (peers.length < 2 || !peers.includes(el)) return false
  const lengths = peers.map((node) => (node.textContent ?? '').replace(/\s+/g, ' ').trim().length)
  const max = Math.max(...lengths)
  const min = Math.min(...lengths)
  if (max > 0 && min < max * 0.25) return false
  return (el.textContent ?? '').replace(/\s+/g, ' ').trim().length >= 12
}

/** 整块根、语义块、带 id、并列卡片。不给每个 span/内层排版 div 盖章。 */
export function isHtmlPickSurface(el: Element, root: Element) {
  if (!(el instanceof HTMLElement)) return false
  if (el === root) return true
  if (SKIP.has(el.tagName) || el.tagName === 'SPAN') return false
  if (SURFACE.has(el.tagName)) return true
  if (el.id.trim()) return true
  const role = el.getAttribute('role')
  if (role === 'button' || role === 'link' || role === 'img') return true
  if (el.parentElement === root) return true
  return isPeerChunk(el)
}

export function htmlBlockKey(host: Element | null, html: string) {
  const scope = host?.closest('.tiptap, [data-testid="page-editor"]') ?? host?.parentElement
  const blocks = scope?.querySelectorAll('[data-page-block="html"], [data-page-block="htmlframe"]')
  const index = host && blocks ? [...blocks].indexOf(host as Element) : 0
  return `${Math.max(0, index)}-${hashText(html)}`
}

export function clearHtmlPickSurfaces(root: ParentNode) {
  const nodes = 'querySelectorAll' in root ? [...root.querySelectorAll(`[${HTML_PICK_MARK}]`)] : []
  if (root instanceof Element && root.hasAttribute(HTML_PICK_MARK)) nodes.push(root)
  for (const el of nodes) {
    el.removeAttribute(HTML_PICK_MARK)
    el.removeAttribute('data-biu-kind')
    el.removeAttribute('data-biu-id')
    el.removeAttribute('data-biu-label')
  }
}

export function stampHtmlPickSurfaces(root: HTMLElement, blockKey: string, opts?: { includeRoot?: boolean }) {
  clearHtmlPickSurfaces(root)
  const prefix = `${HTML_PICK_KIND}:${blockKey}`
  const stamp = (el: HTMLElement, path: string) => {
    const label = surfaceLabel(el)
    el.setAttribute(HTML_PICK_MARK, '')
    el.setAttribute('data-biu-kind', HTML_PICK_KIND)
    el.setAttribute('data-biu-id', `${prefix}:${path}`)
    if (label) el.setAttribute('data-biu-label', label)
  }
  if (opts?.includeRoot !== false) stamp(root, 'root')
  const walk = (el: Element, path: string) => {
    let i = 0
    for (const child of el.children) {
      const next = `${path}/${i}`
      if (child instanceof HTMLElement && isHtmlPickSurface(child, root)) stamp(child, next)
      walk(child, next)
      i += 1
    }
  }
  walk(root, '0')
}

/** 把 pick 写进 HTML 字符串，避免 React 重绘 innerHTML 时冲掉内部属性。 */
export function stampHtmlSource(html: string, blockKey: string) {
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  stampHtmlPickSurfaces(wrap, blockKey, { includeRoot: false })
  return wrap.innerHTML
}
