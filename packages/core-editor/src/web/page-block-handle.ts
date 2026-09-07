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
  return null
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
