import type { Editor } from '@tiptap/core'
import type { Node, ResolvedPos } from '@tiptap/pm/model'
import { NodeSelection } from '@tiptap/pm/state'

export type HandleBlock = {
  pos: number
  node: Node
}

/** 所有块共用一条轨道，不跟列表缩进。 */
export const HANDLE_RAIL = 28

export function handleRailLeft(hostLeft: number, contentLeft: number, rail = HANDLE_RAIL) {
  return contentLeft - hostLeft - rail
}

export function isSlideInnerBlock(doc: { resolve: (pos: number) => ResolvedPos; content: { size: number } }, pos: number, typeName: string) {
  if (typeName === 'slide') return false
  const $pos = doc.resolve(Math.min(pos + 1, doc.content.size))
  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    if ($pos.node(depth).type.name === 'slideCell') return true
  }
  return false
}

export function handleLeftForBlock({
  hostLeft,
  contentLeft,
  boxLeft,
  nested,
}: {
  hostLeft: number
  contentLeft: number
  boxLeft: number
  nested: boolean
}) {
  return nested ? boxLeft - hostLeft - HANDLE_RAIL : handleRailLeft(hostLeft, contentLeft)
}

function enclosingSlidePos($pos: ResolvedPos) {
  for (let depth = $pos.depth; depth >= 1; depth -= 1) {
    if ($pos.node(depth).type.name === 'slide') return $pos.before(depth)
  }
  return $pos.nodeAfter?.type.name === 'slide' ? $pos.pos : -1
}

/** React 节点视图外层还有一层 renderer，把手要贴真正的块盒子，不然会悬在块上方。 */
export function visibleHandleEl(root: Node | null | undefined): HTMLElement | null {
  const el = root instanceof HTMLElement ? root : root instanceof Node ? root.parentElement : null
  if (!(el instanceof HTMLElement)) return null
  const inner = el.querySelector<HTMLElement>('[data-page-block], [data-slide]')
  return inner ?? el
}

function slideBlockForElement(editor: Editor, el: Element): HandleBlock | null {
  let found: HandleBlock | null = null
  editor.state.doc.descendants((node, pos) => {
    if (found || node.type.name !== 'slide') return !found
    const dom = editor.view.nodeDOM(pos)
    if (!(dom instanceof Node)) return true
    if (dom === el || el.contains(dom) || (dom instanceof Element && dom.contains(el))) found = { pos, node }
    return !found
  })
  return found
}

/** 列表项单独成块；slide 格子里跟内部块；其余取紧贴文档的顶层块。 */
export function resolveHandleBlock($pos: ResolvedPos): HandleBlock | null {
  for (let depth = $pos.depth; depth >= 1; depth--) {
    const node = $pos.node(depth)
    const parent = $pos.node(depth - 1)
    if (node.type.name === 'listItem') return { pos: $pos.before(depth), node }
    if (parent.type.name === 'slideCell') return { pos: $pos.before(depth), node }
    if (node.type.name === 'slide') return { pos: $pos.before(depth), node }
    if (parent.type.name === 'doc') return { pos: $pos.before(depth), node }
  }
  if ($pos.depth === 0) {
    const after = $pos.nodeAfter
    if (after?.isBlock) return { pos: $pos.pos, node: after }
    const before = $pos.nodeBefore
    if (before?.isBlock) return { pos: $pos.pos - before.nodeSize, node: before }
  }
  return null
}

function blockAtDocPos(editor: Editor, pos: number): HandleBlock | null {
  if (pos < 0 || pos > editor.state.doc.content.size) return null
  const node = editor.state.doc.nodeAt(pos)
  if (node?.type.name === 'slideCell') return resolveHandleBlock(editor.state.doc.resolve(pos + 1))
  if (node?.isBlock) return { pos, node }
  return resolveHandleBlock(editor.state.doc.resolve(pos))
}

/** React 插件块 / iframe：从 DOM 反查 pageBlock。 */
export function handleBlockFromDom(editor: Editor, start: EventTarget | null): HandleBlock | null {
  let el = start instanceof Element ? start : null
  const root = editor.view.dom
  const cell = el?.closest('[data-slide-cell]')
  if (cell instanceof HTMLElement && root.contains(cell)) {
    try {
      const pos = editor.view.posAtDOM(el && cell.contains(el) ? el : cell, 0)
      const found = resolveHandleBlock(editor.state.doc.resolve(pos))
      if (found && found.node.type.name !== 'slide') return found
    } catch {
      /* fall through */
    }
  }
  while (el && el !== root) {
    if (el instanceof HTMLElement && (el.hasAttribute('data-slide') || el.classList.contains('node-slide'))) {
      const slide = slideBlockForElement(editor, el)
      if (slide) return slide
    }
    if (el instanceof HTMLElement && (el.hasAttribute('data-page-block') || el.classList.contains('page-block') || el.hasAttribute('data-node-view-wrapper'))) {
      try {
        const pos = editor.view.posAtDOM(el, 0)
        const found = blockAtDocPos(editor, pos)
        if (found) return found
      } catch {
        /* keep walking */
      }
    }
    el = el.parentElement
  }
  return null
}

/** 鼠标下的顶层块：坐标、atom 的 inside、再退回 DOM。 */
export function handleBlockAtPointer(editor: Editor, clientX: number, clientY: number): HandleBlock | null {
  const view = editor.view
  const fromDom = handleBlockFromDom(editor, document.elementFromPoint(clientX, clientY))
  const content = view.dom.getBoundingClientRect()
  const probeX = Math.min(Math.max(clientX, content.left + 8), content.right - 8)
  const coords = view.posAtCoords({ left: probeX, top: clientY })
  const fromPos = coords ? resolveHandleBlock(editor.state.doc.resolve(coords.pos)) ?? (coords.inside >= 0 ? blockAtDocPos(editor, coords.inside) : null) : null
  if (fromPos && fromDom) {
    const slideFromDom = fromDom.node.type.name === 'slide' ? fromDom.pos : enclosingSlidePos(editor.state.doc.resolve(fromDom.pos + 1))
    const slideFromPos = fromPos.node.type.name === 'slide' ? fromPos.pos : enclosingSlidePos(editor.state.doc.resolve(fromPos.pos + 1))
    if (slideFromDom >= 0 && slideFromDom !== slideFromPos) return fromDom
  }
  if (fromPos && fromPos.node.type.name !== 'slide') return fromPos
  if (fromDom && fromDom.node.type.name !== 'slide') return fromDom
  return fromPos ?? fromDom
}

export function deleteHandleBlock(editor: Editor, pos: number, node: Node) {
  editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run()
}

export function insertParagraphBefore(editor: Editor, pos: number) {
  editor.chain().focus().insertContentAt(pos, { type: 'paragraph' }).run()
}

export function insertParagraphAfter(editor: Editor, pos: number, node: Node) {
  editor.chain().focus().insertContentAt(pos + node.nodeSize, { type: 'paragraph' }).run()
}

export function duplicateHandleBlock(editor: Editor, pos: number, node: Node) {
  editor.chain().focus().insertContentAt(pos + node.nodeSize, node.toJSON()).run()
}

/** 左侧把手拖块：整块 NodeSelection + move，避免 HTML5 默认复制。 */
export function beginHandleDrag(
  editor: Editor,
  pos: number,
  dataTransfer: { effectAllowed: string; setData: (type: string, data: string) => void } | null,
) {
  const { view } = editor
  const node = view.state.doc.nodeAt(pos)
  if (!node) return false
  const selection = NodeSelection.create(view.state.doc, pos)
  view.dispatch(view.state.tr.setSelection(selection))
  view.dragging = { slice: selection.content(), move: true }
  if (dataTransfer) {
    dataTransfer.effectAllowed = 'move'
    dataTransfer.setData('text/plain', '\u00a0')
  }
  return true
}
