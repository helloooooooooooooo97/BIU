import type { ResolvedPos } from '@tiptap/pm/model'
import { NodeSelection, Selection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'

export function adjacentPageBlockPos($pos: ResolvedPos, dir: 1 | -1): number | null {
  for (let depth = $pos.depth; depth >= 1; depth--) {
    const parent = $pos.node(depth - 1)
    const index = dir > 0 ? $pos.indexAfter(depth - 1) : $pos.index(depth - 1) - 1
    if (index < 0 || index >= parent.childCount) continue
    const child = parent.child(index)
    if (child.type.name !== 'pageBlock') return null
    return dir > 0 ? $pos.after(depth) : $pos.before(depth) - child.nodeSize
  }
  return null
}

function atTextblockEdge($pos: ResolvedPos, dir: 1 | -1) {
  return dir > 0 ? $pos.parentOffset === $pos.parent.content.size : $pos.parentOffset === 0
}

/** 上下键会跳过 atom。贴着 sandbox 时改成 NodeSelection，外框才能变蓝。 */
export function handlePageBlockArrow(view: EditorView, event: KeyboardEvent): boolean {
  if (event.shiftKey || event.altKey || event.metaKey || event.ctrlKey || event.isComposing) return false
  const dir = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0
  if (!dir) return false
  const { state } = view
  const sel = state.selection
  if (sel instanceof NodeSelection && sel.node.type.name === 'pageBlock') {
    const next = Selection.near(state.doc.resolve(dir > 0 ? sel.to : sel.from), dir)
    if (next.eq(sel)) return false
    event.preventDefault()
    view.dispatch(state.tr.setSelection(next).scrollIntoView())
    return true
  }
  if (!sel.empty) return false
  const $pos = dir > 0 ? sel.$to : sel.$from
  if (!atTextblockEdge($pos, dir) && !view.endOfTextblock(dir > 0 ? 'down' : 'up')) return false
  const pos = adjacentPageBlockPos($pos, dir)
  if (pos == null) return false
  event.preventDefault()
  view.dispatch(state.tr.setSelection(NodeSelection.create(state.doc, pos)).scrollIntoView())
  return true
}
