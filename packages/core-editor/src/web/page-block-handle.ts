import type { Editor } from '@tiptap/core'
import type { Node, ResolvedPos } from '@tiptap/pm/model'

export type HandleBlock = {
  pos: number
  node: Node
}

/** 列表项单独成块；其余取紧贴文档的顶层块（引用整段、段落、插件块等）。 */
export function resolveHandleBlock($pos: ResolvedPos): HandleBlock | null {
  for (let depth = $pos.depth; depth >= 1; depth--) {
    const node = $pos.node(depth)
    const parent = $pos.node(depth - 1)
    if (parent.type.name === 'doc' || node.type.name === 'listItem') {
      return { pos: $pos.before(depth), node }
    }
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
  if (node?.isBlock) return { pos, node }
  return resolveHandleBlock(editor.state.doc.resolve(pos))
}

/** React 插件块 / iframe：从 DOM 反查 pageBlock。 */
export function handleBlockFromDom(editor: Editor, start: EventTarget | null): HandleBlock | null {
  let el = start instanceof Element ? start : null
  const root = editor.view.dom
  while (el && el !== root) {
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
  const content = view.dom.getBoundingClientRect()
  const probeX = Math.min(Math.max(clientX, content.left + 8), content.right - 8)
  const coords = view.posAtCoords({ left: probeX, top: clientY })
  if (coords) {
    const fromPos = resolveHandleBlock(editor.state.doc.resolve(coords.pos))
    if (fromPos) return fromPos
    if (coords.inside >= 0) {
      const inner = blockAtDocPos(editor, coords.inside)
      if (inner) return inner
    }
  }
  return handleBlockFromDom(editor, document.elementFromPoint(clientX, clientY))
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
