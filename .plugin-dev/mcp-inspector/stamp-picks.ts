/**
 * 给主文档里的报告 DOM 盖上 data-biu-*，让「选取」能命中块内部的单元。
 * 抄 page-html-blocks/stamp-picks.ts 的路子：盖进 HTML 字符串，
 * 而不是渲染后再爬 DOM——否则 React 重绘 innerHTML 时会把属性冲掉。
 */

const SKIP = new Set(['SCRIPT', 'STYLE', 'LINK', 'META', 'NOSCRIPT', 'BR', 'HR'])

/** 表格整块可选，不下到 tr/td：一个 processlist 几百行会把选取列表冲爆。 */
const HIT = new Set([
  'ARTICLE',
  'DETAILS',
  'SECTION',
  'DIV',
  'SPAN',
  'H1',
  'H2',
  'H3',
  'H4',
  'P',
  'PRE',
  'TABLE',
  'SVG',
  'A',
  'IMG',
  'LI',
])

export const PICK_KIND = 'mcp-call'
export const PICK_MARK = 'data-mcpi-pick'

function hashText(value: string) {
  let hash = 2166136261
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).slice(0, 8)
}

/** 选取要的是「这块是什么」，所以优先读我们自己写的 kicker/工具名，最后才退到正文。 */
function surfaceLabel(el: Element): string {
  const named = el.getAttribute('aria-label') || el.getAttribute('title') || ''
  if (named.trim()) return named.replace(/\s+/g, ' ').trim().slice(0, 80)
  if (el.tagName === 'DETAILS') {
    const name = el.querySelector('.name')?.textContent ?? ''
    if (name.trim()) return name.replace(/\s+/g, ' ').trim().slice(0, 80)
  }
  const kicker = el.querySelector(':scope > .skin-kicker')?.textContent ?? ''
  if (kicker.trim()) return kicker.replace(/\s+/g, ' ').trim().slice(0, 80)
  const text = (el.textContent ?? '').replace(/\s+/g, ' ').trim()
  return (text || el.tagName.toLowerCase()).slice(0, 80)
}

/** 靠 CSS ::before 出内容的装饰元素（.chev 之类）没什么可选的，盖了只是噪音。 */
function hasContent(el: Element): boolean {
  if ((el.textContent ?? '').trim()) return true
  return Boolean(el.querySelector('img, svg, canvas, video'))
}

export function isPickSurface(el: Element): boolean {
  // svg 是 SVGElement 而不是 HTMLElement，且 tagName 保留小写——两处都得放宽，否则图表选不到
  const tag = el.tagName.toUpperCase()
  if (SKIP.has(tag)) return false
  if (el.hasAttribute('data-biu-ignore')) return false
  if (!HIT.has(tag)) return false
  return hasContent(el)
}

export function reportBlockKey(sessionId: string, turn: number | null, html: string) {
  return `${sessionId.slice(0, 8)}-${turn ?? 'all'}-${hashText(html)}`
}

function stamp(el: Element, id: string) {
  const label = surfaceLabel(el)
  el.setAttribute(PICK_MARK, '')
  el.setAttribute('data-biu-kind', PICK_KIND)
  el.setAttribute('data-biu-id', id)
  if (label) el.setAttribute('data-biu-label', label)
}

/** 盖在容器内的每个可选单元上；路径当 id，保证同一份报告里稳定且唯一。 */
export function stampPickSurfaces(root: HTMLElement, blockKey: string) {
  const prefix = `${PICK_KIND}:${blockKey}`
  const walk = (el: Element, path: string) => {
    let i = 0
    for (const child of el.children) {
      const next = `${path}/${i}`
      if (isPickSurface(child)) stamp(child, `${prefix}:${next}`)
      walk(child, next)
      i += 1
    }
  }
  walk(root, '0')
}

/** 把 pick 盖进 HTML 字符串，交给 dangerouslySetInnerHTML。 */
export function stampReportHtml(html: string, blockKey: string): string {
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  stampPickSurfaces(wrap, blockKey)
  return wrap.innerHTML
}
