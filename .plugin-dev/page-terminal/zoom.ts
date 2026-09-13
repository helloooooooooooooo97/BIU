/**
 * 窗口内全屏（不触发浏览器 Fullscreen API）：
 * 把块用 position:fixed 铺满视口，同时临时解开沿途祖先的限制。
 *
 * 为什么要解锁祖先：
 *  1. 祖先的 overflow:hidden 会把 fixed 元素裁掉；
 *  2. 祖先的 transform / filter / backdrop-filter / will-change / contain
 *     等会创建「层叠上下文」，把子元素的 z-index 锁在里面，导致盖不住顶层 UI。
 * 只改内联样式，退出时原样还原。
 */

const PREV = 'data-zoom-prev-style'

type Prev = Record<string, string>

const restored = new WeakMap<HTMLElement, Prev>()
const watched = new Set<HTMLElement>()

/** 会创建层叠上下文的属性，全屏期间要临时清掉。 */
const CONTEXT_PROPS = [
  'transform',
  'filter',
  'backdrop-filter',
  '-webkit-backdrop-filter',
  'will-change',
  'contain',
  'perspective',
  'isolation',
] as const

const ALL_PROPS = [...CONTEXT_PROPS, 'overflow', 'position'] as const

function shouldPatch(el: HTMLElement) {
  if (el === document.body || el === document.documentElement) return false
  return true
}

export function unlockAncestors(from: HTMLElement) {
  const chain: HTMLElement[] = []
  let el: HTMLElement | null = from.parentElement
  while (el && el !== document.body && el !== document.documentElement) {
    if (shouldPatch(el) && !watched.has(el)) chain.push(el)
    el = el.parentElement
  }
  for (const node of chain) {
    const prev: Prev = {}
    for (const prop of ALL_PROPS) prev[prop] = node.style.getPropertyValue(prop)
    restored.set(node, prev)
    node.setAttribute(PREV, JSON.stringify(prev))
    watched.add(node)

    node.style.setProperty('overflow', 'visible', 'important')
    node.style.setProperty('position', 'static', 'important')
    node.style.setProperty('transform', 'none', 'important')
    node.style.setProperty('filter', 'none', 'important')
    node.style.setProperty('backdrop-filter', 'none', 'important')
    node.style.setProperty('-webkit-backdrop-filter', 'none', 'important')
    node.style.setProperty('will-change', 'auto', 'important')
    node.style.setProperty('contain', 'none', 'important')
    node.style.setProperty('perspective', 'none', 'important')
    node.style.setProperty('isolation', 'auto', 'important')
  }
}

export function relockAncestors() {
  for (const node of [...watched]) {
    const prev = restored.get(node)
    for (const prop of ALL_PROPS) node.style.removeProperty(prop)
    if (prev) {
      for (const prop of ALL_PROPS) {
        const value = prev[prop]
        if (value) node.style.setProperty(prop, value)
      }
    }
    node.removeAttribute(PREV)
    restored.delete(node)
    watched.delete(node)
  }
}
