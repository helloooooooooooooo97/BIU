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

export const SANDBOX_PICK_KIND = 'sandbox'
export const SANDBOX_PICK_MARK = 'data-sandbox-pick'

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

export function isSandboxPickSurface(el: Element, _root?: Element) {
  if (!(el instanceof HTMLElement)) return false
  if (SKIP.has(el.tagName)) return false
  return HIT.has(el.tagName) || el.childElementCount === 0 || Boolean(el.textContent?.trim())
}

export function sandboxBlockKey(host: Element | null, source: string) {
  const scope = host?.closest('.tiptap, [data-testid="page-editor"]') ?? host?.parentElement
  const blocks = scope?.querySelectorAll('[data-page-block="sandbox"]')
  const index = host && blocks ? [...blocks].indexOf(host as Element) : 0
  return `${Math.max(0, index)}-${hashText(source)}`
}

export function clearSandboxPickSurfaces(root: ParentNode) {
  const nodes = 'querySelectorAll' in root ? [...root.querySelectorAll(`[${SANDBOX_PICK_MARK}]`)] : []
  if (root instanceof Element && root.hasAttribute(SANDBOX_PICK_MARK)) nodes.push(root)
  for (const el of nodes) {
    el.removeAttribute(SANDBOX_PICK_MARK)
    el.removeAttribute('data-biu-kind')
    el.removeAttribute('data-biu-id')
    el.removeAttribute('data-biu-label')
    el.removeAttribute('data-biu-plugin')
  }
}

export function stampSandboxPickSurfaces(root: HTMLElement, blockKey: string, opts?: { includeRoot?: boolean; plugin?: string }) {
  clearSandboxPickSurfaces(root)
  const prefix = `${SANDBOX_PICK_KIND}:${blockKey}`
  const plugin =
    opts?.plugin?.trim() ||
    root.closest('[data-biu-plugin], [data-page-block-plugin], [data-plugin-id]')?.getAttribute('data-biu-plugin') ||
    root.closest('[data-page-block-plugin]')?.getAttribute('data-page-block-plugin') ||
    root.closest('[data-plugin-id]')?.getAttribute('data-plugin-id') ||
    ''
  const stamp = (el: HTMLElement, path: string) => {
    const label = surfaceLabel(el)
    el.setAttribute(SANDBOX_PICK_MARK, '')
    el.setAttribute('data-biu-kind', SANDBOX_PICK_KIND)
    el.setAttribute('data-biu-id', `${prefix}:${path}`)
    if (label) el.setAttribute('data-biu-label', label)
    if (plugin) el.setAttribute('data-biu-plugin', plugin)
  }
  if (opts?.includeRoot !== false && isSandboxPickSurface(root)) stamp(root, 'root')
  const walk = (el: Element, path: string) => {
    let i = 0
    for (const child of el.children) {
      const next = `${path}/${i}`
      if (child instanceof HTMLElement && isSandboxPickSurface(child, root)) stamp(child, next)
      walk(child, next)
      i += 1
    }
  }
  walk(root, '0')
}
