import type { PickRef } from './types.ts'
import { pickIdFromText, pickPreview, withHostSource, withPickLocus } from './types.ts'
import { editorHostFromNode } from './editor-host.ts'

const KIND = 'data-biu-kind'
const ID = 'data-biu-id'
const ACTION = 'data-biu-action'
const LABEL = 'data-biu-label'
const PLUGIN = 'data-biu-plugin'
const PATH = 'data-biu-path'
const TITLE = 'data-biu-title'
const TEXT = 'data-biu-text'
const FIELD = 'data-biu-field'

type ClientBox = { left: number; top: number; width: number; height: number }

function composedParent(node: Node | null): Element | null {
  if (!node) return null
  if (node.parentElement) return node.parentElement
  const root = node.parentNode
  return root instanceof ShadowRoot ? root.host : null
}

function composedClosest(start: Element | null, selector: string): Element | null {
  let node: Element | null = start
  while (node) {
    if (node.matches(selector)) return node
    node = composedParent(node)
  }
  return null
}

function composedContains(root: Node | null, node: Node | null) {
  if (!root || !node) return false
  if (root.contains(node)) return true
  let cur: Node | null = node
  while (cur) {
    if (cur === root) return true
    if (cur instanceof ShadowRoot) {
      cur = cur.host
      continue
    }
    cur = cur.parentNode
  }
  return false
}

function isPickIgnored(node: Element | null) {
  return Boolean(composedClosest(node, '[data-biu-ignore]'))
}

function inHiddenPane(node: Element | null) {
  return Boolean(
    composedClosest(
      node,
      '.inspector-stage-pane:not(.is-active), .app-stage-pane:not(.is-active), .session-inspector.is-closed, .app-side-bar.is-closed',
    ),
  )
}

function isOpenPickSurface(node: HTMLElement | null): node is HTMLElement {
  return Boolean(node && !node.classList.contains('is-closed'))
}

const PICK_SURFACE_SEL =
  '[data-testid="session-inspector"], .session-inspector, .app-side-bar, [data-testid="chat-overlay-panel"]'

/** 点落在哪一栏：检查器 / 侧栏 / 悬浮窗 / 中间台。框选和点选都不跨栏。 */
export function pickSurfaceFromNode(node: Element | null): HTMLElement | null {
  if (!node) return null
  const hit = composedClosest(node, PICK_SURFACE_SEL)
  return hit instanceof HTMLElement ? hit : null
}

function pointInBox(box: ClientBox, x: number, y: number) {
  return x >= box.left && y >= box.top && x <= box.left + box.width && y <= box.top + box.height
}

function read(el: Element, attr: string) {
  const value = el.getAttribute(attr)
  return value && value.trim() ? value.trim() : undefined
}

/** 从命中节点向上合并 data-biu-*，子覆盖父；必须同时有 kind 与 id。 */
export function resolvePickFromNode(
  start: Element | null,
  route: string,
  surface: Element | null = null,
): { el: HTMLElement; ref: PickRef } | null {
  if (!start || isPickIgnored(start) || inHiddenPane(start)) return null
  if (surface && !composedContains(surface, start)) return null
  let kind: string | undefined
  let id: string | undefined
  let action: string | undefined
  let label: string | undefined
  let plugin: string | undefined
  let path: string | undefined
  let title: string | undefined
  let text: string | undefined
  let field: string | undefined
  let highlight: HTMLElement | null = null
  let node: Element | null = start
  while (node && node !== document.documentElement) {
    if (surface && !composedContains(surface, node)) break
    if (node instanceof HTMLElement) {
      const nextKind = read(node, KIND)
      const nextId = read(node, ID)
      const nextAction = read(node, ACTION)
      const nextLabel = read(node, LABEL)
      const nextPlugin = read(node, PLUGIN) || read(node, 'data-page-block-plugin') || read(node, 'data-plugin-id')
      const nextPath = read(node, PATH)
      const nextTitle = read(node, TITLE)
      const nextText = read(node, TEXT)
      const nextField = read(node, FIELD)
      if (!highlight && (nextKind || nextId || nextAction || nextLabel || nextPlugin || nextPath || nextField)) highlight = node
      if (!kind) kind = nextKind
      if (!id) id = nextId
      if (!action) action = nextAction
      if (!label) label = nextLabel
      if (!plugin) plugin = nextPlugin
      if (!path) path = nextPath
      if (!title) title = nextTitle
      if (!text) text = nextText
      if (!field) field = nextField
    }
    if (kind && id && highlight) break
    node = composedParent(node)
  }
  if (!plugin) {
    const host = composedClosest(start, '[data-biu-plugin], [data-page-block-plugin], [data-plugin-id]')
    plugin =
      (host instanceof Element ? read(host, PLUGIN) || read(host, 'data-page-block-plugin') || read(host, 'data-plugin-id') : undefined)
  }
  if (!kind || !id || !highlight) return editorBlockPick(start, route, surface)
  return {
    el: highlight,
    ref: withEditorPickContext(
      {
        kind,
        id,
        ...(action ? { action } : {}),
        ...(plugin ? { plugin } : {}),
        ...(path ? { path } : {}),
        ...(field ? { field } : {}),
        ...(text ? { text } : {}),
        label: label || id,
        title: title || label || id,
        route,
      },
      highlight,
      start,
    ),
  }
}

const SANDBOX_BLOCK_SEL = '[data-page-block="sandbox"]'
const ELEMENT_HTML_CAP = 2000

function stripPickMarks(root: HTMLElement) {
  const nodes = [root, ...root.querySelectorAll('[data-sandbox-pick], [data-html-pick], [data-biu-kind], [data-biu-id]')]
  for (const node of nodes) {
    if (!(node instanceof HTMLElement)) continue
    node.removeAttribute('data-sandbox-pick')
    node.removeAttribute('data-html-pick')
    node.removeAttribute('data-biu-kind')
    node.removeAttribute('data-biu-id')
    node.removeAttribute('data-biu-label')
    node.removeAttribute('data-biu-plugin')
    node.removeAttribute('data-biu-path')
    node.removeAttribute('data-biu-title')
    node.removeAttribute('data-biu-text')
    node.removeAttribute('data-biu-field')
  }
}

/** 被点中的内部节点 HTML，去掉 pick 戳，方便 agent 在围栏里对这一段做替换。 */
export function serializeHtmlPickElement(el: HTMLElement) {
  const clone = el.cloneNode(true)
  if (!(clone instanceof HTMLElement)) return ''
  stripPickMarks(clone)
  const html = clone.outerHTML.replace(/\s+/g, ' ').trim()
  if (!html) return ''
  return html.length > ELEMENT_HTML_CAP ? `${html.slice(0, ELEMENT_HTML_CAP)}…` : html
}

function sandboxBlockFrom(node: Element | null) {
  return composedClosest(node, SANDBOX_BLOCK_SEL)
}

function isSandboxInnerEl(el: Element) {
  if (!(el instanceof HTMLElement)) return false
  return el.getAttribute('data-biu-kind') === 'sandbox' || el.hasAttribute('data-sandbox-pick')
}

function rawBox(el: Element): ClientBox {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

/** 事件路径上最里层的 sandbox 戳。指针在哪个节点上，就选哪个。 */
export function sandboxInnerFromEvent(event?: Event | null): HTMLElement | null {
  if (!event || typeof event.composedPath !== 'function') return null
  for (const node of event.composedPath()) {
    if (!(node instanceof HTMLElement)) continue
    if (isSandboxInnerEl(node)) return node
    if (node.hasAttribute('data-sandbox')) break
  }
  return null
}

function sandboxInnerAtPoint(x: number, y: number): HTMLElement | null {
  let best: HTMLElement | null = null
  let bestArea = Infinity
  for (const host of document.querySelectorAll('[data-sandbox]')) {
    if (!(host instanceof HTMLElement) || !host.shadowRoot) continue
    try {
      for (const el of host.shadowRoot.elementsFromPoint(x, y)) {
        if (isSandboxInnerEl(el)) return el
      }
    } catch {
      /* jsdom */
    }
    for (const el of host.shadowRoot.querySelectorAll('[data-sandbox-pick], [data-biu-kind="sandbox"]')) {
      if (!(el instanceof HTMLElement) || !isSandboxInnerEl(el)) continue
      const box = rawBox(el)
      if (box.width <= 0 || box.height <= 0 || !pointInBox(box, x, y)) continue
      const area = box.width * box.height
      if (area < bestArea) {
        best = el
        bestArea = area
      }
    }
  }
  return best
}

function refineSandboxPick(
  hit: { el: HTMLElement; ref: PickRef } | null,
  stacked: Element[],
  route: string,
  surface: Element | null,
) {
  if (!hit) return null
  const block = sandboxBlockFrom(hit.el)
  if (!block) return hit
  if (isSandboxInnerEl(hit.el) && hit.ref.kind === 'sandbox') return hit
  for (const el of stacked) {
    if (!(el instanceof HTMLElement) || el === block) continue
    if (!composedContains(block, el)) continue
    if (!isSandboxInnerEl(el)) continue
    const inner = resolvePickFromNode(el, route, surface)
    if (inner && inner.ref.kind === 'sandbox') return inner
  }
  return hit
}

function innermostHtmlTarget(start: Element, highlight: HTMLElement) {
  const block = sandboxBlockFrom(start) || sandboxBlockFrom(highlight)
  let stamped: HTMLElement | null = null
  let node: Element | null = start
  const stop = block ?? highlight
  while (node && node !== stop && composedContains(stop, node)) {
    if (isSandboxInnerEl(node)) {
      stamped = node
      break
    }
    node = composedParent(node)
  }
  if (stamped) return stamped
  if (isSandboxInnerEl(highlight)) return highlight
  if (block && start instanceof HTMLElement && block.contains(start) && start !== block) return start
  return null
}

function withHtmlElement(ref: PickRef, start: Element, highlight: HTMLElement): PickRef {
  const target = innermostHtmlTarget(start, highlight)
  if (!target) return ref
  const element = serializeHtmlPickElement(target)
  return element ? { ...ref, element } : ref
}

function liveHighlightIn(el: HTMLElement): string {
  const sel = typeof window === 'undefined' ? null : window.getSelection()
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return ''
  const raw = pickPreview(sel.toString(), 120)
  if (!raw) return ''
  const anchor = sel.anchorNode
  if (!composedContains(el, anchor) && !(el.shadowRoot && anchor && el.shadowRoot.contains(anchor))) return ''
  return raw
}

function withoutFenceLocus(ref: PickRef): PickRef {
  if (ref.kind !== 'html' && ref.kind !== 'sandbox') return ref
  if (!ref.element && !ref.selection) return ref
  const { text: _t, start_line: _s, end_line: _e, insert: _i, ...rest } = ref
  return rest
}

/** 内部节点只挂页面 path，不把整块围栏行号/正文当成选区。 */
function withEditorPickContext(ref: PickRef, el: HTMLElement, start: Element = el): PickRef {
  const sourced = withHtmlElement(withHostSource(ref, el), start, el)
  if (ref.kind === 'html' || ref.kind === 'sandbox') {
    const inner = liveHighlightIn(el) || pickPreview(el.textContent ?? '', 120)
    const next = inner && !sourced.selection ? { ...sourced, selection: inner } : sourced
    return withoutFenceLocus(next)
  }
  const locus = editorLocusFromNode(el)
  return locus ? { ...withPickLocus(sourced, locus), id: ref.id, ...(sourced.element ? { element: sourced.element } : {}) } : sourced
}

function editorLocusFromNode(el: HTMLElement) {
  const host = editorHostFromNode(el)
  if (!host) return null
  const direct = host.locusFromElement(el)
  if (direct) return direct
  const block = composedClosest(el, '[data-page-block], .page-block')
  if (block instanceof Element && block !== el) return host.locusFromElement(block)
  return null
}

const EDITOR_ROOT = '.tiptap, [data-testid="page-editor"]'

function isEditorBlockEl(el: HTMLElement) {
  if (el.classList.contains('page-block') || el.hasAttribute('data-page-block')) return true
  if (el.getAttribute('data-type') === 'block-math') return true
  return /^(P|H1|H2|H3|LI|BLOCKQUOTE|PRE|HR|IMG|TABLE)$/.test(el.tagName)
}

/** 编辑器顶层块：列表项、引用、插件块、段落/标题。 */
export function editorBlockElFromNode(start: Element | null): HTMLElement | null {
  const root = composedClosest(start, EDITOR_ROOT)
  if (!root || !(start instanceof Element)) return null
  let found: HTMLElement | null = null
  let el: Element | null = start
  while (el && el !== root) {
    if (el instanceof HTMLElement && isEditorBlockEl(el)) found = el
    el = composedParent(el)
  }
  return found
}

function editorBlockPick(
  start: Element | null,
  route: string,
  surface: Element | null,
): { el: HTMLElement; ref: PickRef } | null {
  const el = editorBlockElFromNode(start)
  if (!el || isPickIgnored(el) || inHiddenPane(el)) return null
  if (surface && !composedContains(surface, el)) return null
  const taggedKind = read(el, KIND)
  const taggedId = read(el, ID)
  const taggedPlugin = read(el, PLUGIN) || read(el, 'data-page-block-plugin') || read(el, 'data-plugin-id')
  if (taggedKind && taggedId) {
    return {
      el,
      ref: withEditorPickContext(
        {
          kind: taggedKind,
          id: taggedId,
          ...(read(el, ACTION) ? { action: read(el, ACTION) } : {}),
          ...(taggedPlugin ? { plugin: taggedPlugin } : {}),
          label: read(el, LABEL) || taggedId,
          route,
        },
        el,
        start instanceof Element ? start : el,
      ),
    }
  }
  const tag = (el.getAttribute('data-page-block') || el.tagName).toLowerCase()
  const text = pickPreview(el.textContent ?? '', 80)
  const hostPlugin = read(el, 'data-page-block-plugin') || taggedPlugin
  return {
    el,
    ref: withPickLocus(
      withHostSource(
        {
          kind: 'block',
          id: `${tag}:${pickIdFromText(text || tag)}`,
          ...(hostPlugin ? { plugin: hostPlugin } : {}),
          label: text || tag,
          route,
        },
        el,
      ),
      editorHostFromNode(el)?.locusFromElement(el) ?? null,
    ),
  }
}

function unignoredAncestor(node: Element, surface: Element | null) {
  let current: Element | null = node
  while (current && isPickIgnored(current)) current = composedParent(current)
  if (!current || inHiddenPane(current)) return null
  if (surface && !composedContains(surface, current)) return null
  return current
}

/** 指针所在栏：检查器或侧栏。中间栏溢出盒可以盖住检查器坐标，不能靠命中栈单独判断。 */
function elementsFromPointDeep(x: number, y: number): Element[] {
  const seen = new Set<Element>()
  const out: Element[] = []
  const dive = (root: Document | ShadowRoot) => {
    let list: Element[]
    try {
      list = [...root.elementsFromPoint(x, y)]
    } catch {
      return
    }
    for (const el of list) {
      if (!(el instanceof Element) || seen.has(el)) continue
      if (el.shadowRoot) {
        dive(el.shadowRoot)
        for (const inner of el.shadowRoot.querySelectorAll('[data-sandbox-pick], [data-biu-kind="sandbox"]')) {
          if (!(inner instanceof HTMLElement) || seen.has(inner)) continue
          const box = rawBox(inner)
          if (box.width <= 0 || box.height <= 0 || !pointInBox(box, x, y)) continue
          seen.add(inner)
          out.push(inner)
        }
      }
      if (seen.has(el)) continue
      seen.add(el)
      out.push(el)
    }
  }
  dive(document)
  return out
}

function queryAllDeep(root: ParentNode, selector: string): HTMLElement[] {
  const out: HTMLElement[] = []
  const seen = new Set<Element>()
  const walk = (node: ParentNode) => {
    for (const el of node.querySelectorAll(selector)) {
      if (el instanceof HTMLElement && !seen.has(el)) {
        seen.add(el)
        out.push(el)
      }
    }
    for (const el of node.querySelectorAll('*')) {
      if (el instanceof Element && el.shadowRoot) walk(el.shadowRoot)
    }
  }
  walk(root)
  return out
}

export function pickSurfaceAtPoint(x: number, y: number): HTMLElement | null {
  for (const el of elementsFromPointDeep(x, y)) {
    if (!(el instanceof Element)) continue
    const surface = pickSurfaceFromNode(el)
    if (isOpenPickSurface(surface)) return surface
  }
  for (const el of document.querySelectorAll(PICK_SURFACE_SEL)) {
    if (!(el instanceof HTMLElement) || !isOpenPickSurface(el)) continue
    if (pointInBox(boxOf(el), x, y)) return el
  }
  return null
}

/** 选取：事件路径上的内部节点优先，没有再退回坐标命中。 */
export function resolvePickFromEvent(event: Event, route: string) {
  const inner = sandboxInnerFromEvent(event)
  if (inner && !isPickIgnored(inner) && !inHiddenPane(inner)) {
    const hit = resolvePickFromNode(inner, route, null)
    if (hit) return hit
  }
  const x = 'clientX' in event ? Number((event as PointerEvent).clientX) : 0
  const y = 'clientY' in event ? Number((event as PointerEvent).clientY) : 0
  return resolvePickAtPoint(x, y, route)
}

export function resolvePickAtPoint(x: number, y: number, route: string) {
  const stacked = elementsFromPointDeep(x, y)
  const inner = sandboxInnerAtPoint(x, y)
  if (inner && !isPickIgnored(inner) && !inHiddenPane(inner)) {
    const surface = pickSurfaceAtPoint(x, y)
    const hit = resolvePickFromNode(inner, route, surface)
    if (hit) return hit
    const raw = resolvePickFromNode(inner, route, null)
    if (raw?.ref.kind === 'sandbox') return raw
  }
  const surface = pickSurfaceAtPoint(x, y)
  const pool = surface
    ? stacked.filter((el): el is Element => el instanceof Element && composedContains(surface, el))
    : stacked.filter((el): el is Element => el instanceof Element && !pickSurfaceFromNode(el))
  for (const el of pool) {
    if (inHiddenPane(el)) continue
    const start = unignoredAncestor(el, surface)
    if (!start) continue
    const hit = refineSandboxPick(resolvePickFromNode(start, route, surface), pool, route, surface)
    if (!hit) continue
    const vis = visiblePickBox(hit.el)
    if (!vis || !pointInBox(vis, x, y)) continue
    return hit
  }
  return null
}

export function boxFromPoints(ax: number, ay: number, bx: number, by: number): ClientBox {
  const left = Math.min(ax, bx)
  const top = Math.min(ay, by)
  return { left, top, width: Math.abs(bx - ax), height: Math.abs(by - ay) }
}

function boxesOverlap(a: ClientBox, b: ClientBox) {
  return a.left < b.left + b.width && a.left + a.width > b.left && a.top < b.top + b.height && a.top + a.height > b.top
}

function boxOf(el: Element): ClientBox {
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

function intersectBoxes(a: ClientBox, b: ClientBox): ClientBox | null {
  const left = Math.max(a.left, b.left)
  const top = Math.max(a.top, b.top)
  const width = Math.min(a.left + a.width, b.left + b.width) - left
  const height = Math.min(a.top + a.height, b.top + b.height) - top
  if (width <= 0 || height <= 0) return null
  return { left, top, width, height }
}

function axisClips(computed: string, inline: string) {
  const value = computed && computed !== 'visible' ? computed : inline
  return Boolean(value && value !== 'visible')
}

function clipsOverflow(node: HTMLElement) {
  const style = getComputedStyle(node)
  return (
    axisClips(style.overflowX, node.style.overflowX || node.style.overflow) ||
    axisClips(style.overflowY, node.style.overflowY || node.style.overflow)
  )
}

/** 框选只看露在本栏里的那一块。宽表格行的布局盒会伸进检查器，不能拿来当命中。 */
export function visiblePickBox(el: Element): ClientBox | null {
  let box: ClientBox | null = boxOf(el)
  let node: Element | null = composedParent(el)
  while (box && node && node !== document.documentElement) {
    if (node instanceof HTMLElement && clipsOverflow(node)) {
      box = intersectBoxes(box, boxOf(node))
    }
    node = composedParent(node)
  }
  return box
}

export const EDITOR_BLOCK_SEL =
  '.tiptap > p, .tiptap > h1, .tiptap > h2, .tiptap > h3, .tiptap > blockquote, .tiptap > pre, .tiptap > hr, .tiptap > img, .tiptap img, .tiptap table, .tiptap [data-type="block-math"], .tiptap .page-block, .tiptap [data-page-block], .tiptap li'

/**
 * 框选：命中所有带 kind+id 的对象节点，以及编辑器里的段落/标题/列表/插件块。
 */
export function resolvePicksInRect(box: ClientBox, route: string, root: ParentNode = document) {
  const nodes = queryAllDeep(root, `[data-biu-kind][data-biu-id], ${EDITOR_BLOCK_SEL}`)
  const seen = new Set<string>()
  const hits: { el: HTMLElement; ref: PickRef }[] = []
  for (const node of nodes) {
    if (!(node instanceof HTMLElement) || isPickIgnored(node) || inHiddenPane(node)) continue
    const vis = visiblePickBox(node)
    if (!vis || !boxesOverlap(box, vis)) continue
    const hit = resolvePickFromNode(node, route)
    if (!hit) continue
    const key = `${hit.ref.kind}:${hit.ref.id}:${hit.ref.field ?? ''}`
    if (seen.has(key)) continue
    seen.add(key)
    hits.push(hit)
  }
  return dropAncestorPicks(hits)
}

/** 框选同时碰到行和格子时只留格子，避免整行把 cell 吃掉。 */
function dropAncestorPicks(hits: { el: HTMLElement; ref: PickRef }[]) {
  return hits.filter((hit, index) => {
    return !hits.some((other, otherIndex) => otherIndex !== index && composedContains(hit.el, other.el) && hit.el !== other.el)
  })
}
