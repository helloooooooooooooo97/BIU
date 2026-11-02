import { NodeSelection, TextSelection } from '@tiptap/pm/state'
import type { EditorState, Transaction } from '@tiptap/pm/state'
import type { Node as PmNode, ResolvedPos } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'

export function slideCellDepth($pos: ResolvedPos) {
  for (let d = $pos.depth; d > 0; d -= 1) {
    if ($pos.node(d).type.name === 'slideCell') return d
  }
  return -1
}

export function atSlideCellEdge($from: ResolvedPos, dir: 1 | -1) {
  const depth = slideCellDepth($from)
  if (depth < 0) return false
  const cell = $from.node(depth)
  if (dir > 0) {
    return $from.index(depth) === cell.childCount - 1 && $from.parentOffset >= $from.parent.content.size
  }
  return $from.index(depth) === 0 && $from.parentOffset <= 0
}

export function adjacentSlideCellPos($from: ResolvedPos, dir: 1 | -1) {
  const depth = slideCellDepth($from)
  if (depth < 1) return null
  if ($from.node(depth - 1).type.name !== 'slide') return null
  const slide = $from.node(depth - 1)
  const next = $from.index(depth - 1) + dir
  if (next < 0 || next >= slide.childCount) return null
  let pos = $from.start(depth - 1)
  for (let i = 0; i < next; i += 1) pos += slide.child(i).nodeSize
  const cell = slide.child(next)
  return dir > 0 ? pos + 2 : pos + cell.nodeSize - 2
}

export function firstCellCaret(slidePos: number) {
  return slidePos + 3
}

export function lastCellCaret(slidePos: number, slide: PmNode) {
  return slidePos + slide.nodeSize - 3
}

function textCaret(state: EditorState, pos: number) {
  const max = state.doc.content.size
  const next = Math.max(1, Math.min(pos, max))
  const $pos = state.doc.resolve(next)
  if ($pos.parent.isTextblock) return TextSelection.create(state.doc, next)
  if ($pos.nodeAfter?.isTextblock) return TextSelection.create(state.doc, next + 1)
  if ($pos.nodeBefore?.isTextblock) return TextSelection.create(state.doc, next - 1)
  return TextSelection.create(state.doc, $pos.start($pos.depth))
}

export function selectionInSlide(state: EditorState, slidePos: number, slide: PmNode, at: 'first' | 'last') {
  const pos = at === 'first' ? firstCellCaret(slidePos) : lastCellCaret(slidePos, slide)
  return state.tr.setSelection(textCaret(state, pos))
}

export function enterSlideFromOutside(state: EditorState, dir: 1 | -1): Transaction | null {
  const sel = state.selection
  if (sel instanceof NodeSelection && sel.node.type.name === 'slide') {
    return selectionInSlide(state, sel.from, sel.node, dir > 0 ? 'first' : 'last')
  }
  const $from = sel.$from
  if (slideCellDepth($from) >= 0) return null
  if (dir > 0) {
    if ($from.nodeAfter?.type.name === 'slide') return selectionInSlide(state, $from.pos, $from.nodeAfter, 'first')
    const nextPos = $from.after(1)
    const next = state.doc.nodeAt(nextPos)
    if (next?.type.name === 'slide') return selectionInSlide(state, nextPos, next, 'first')
    return null
  }
  if ($from.nodeBefore?.type.name === 'slide') {
    return selectionInSlide(state, $from.pos - $from.nodeBefore.nodeSize, $from.nodeBefore, 'last')
  }
  const before = $from.before(1)
  if (before <= 0) return null
  const prev = state.doc.resolve(before).nodeBefore
  if (prev?.type.name === 'slide') return selectionInSlide(state, before - prev.nodeSize, prev, 'last')
  return null
}

export function moveSlideCellSelection(state: EditorState, dir: 1 | -1): Transaction | null {
  if (!state.selection.empty && !(state.selection instanceof NodeSelection)) return null
  const entered = enterSlideFromOutside(state, dir)
  if (entered) return entered
  if (!atSlideCellEdge(state.selection.$from, dir)) return null
  const pos = adjacentSlideCellPos(state.selection.$from, dir)
  if (pos == null) return null
  return state.tr.setSelection(textCaret(state, pos))
}

export function slidePosForElement(view: EditorView, el: Element) {
  const root = el.closest('[data-slide], .react-renderer.node-slide')
  if (!(root instanceof HTMLElement) || !view.dom.contains(root)) return -1
  let found = -1
  view.state.doc.descendants((node, pos) => {
    if (found >= 0 || node.type.name !== 'slide') return found < 0
    const dom = view.nodeDOM(pos)
    if (!(dom instanceof Node)) return true
    if (dom === root || root.contains(dom) || (dom instanceof Element && dom.contains(root))) found = pos
    return found < 0
  })
  return found
}

export function cellIndexFromPoint(root: Element, x: number, y: number) {
  const cells = [...root.querySelectorAll('[data-slide-cell]')]
  if (!cells.length) return 0
  const hit = cells.findIndex((cell) => {
    const box = cell.getBoundingClientRect()
    return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom
  })
  if (hit >= 0) return hit
  let best = 0
  let dist = Number.POSITIVE_INFINITY
  cells.forEach((cell, index) => {
    const box = cell.getBoundingClientRect()
    const dx = x < box.left ? box.left - x : x > box.right ? x - box.right : 0
    const dy = y < box.top ? box.top - y : y > box.bottom ? y - box.bottom : 0
    const next = dx * dx + dy * dy
    if (next < dist) {
      dist = next
      best = index
    }
  })
  return best
}

export function caretInSlideCell(state: EditorState, slidePos: number, index: number) {
  const slide = state.doc.nodeAt(slidePos)
  if (!slide || slide.type.name !== 'slide') return null
  const i = Math.max(0, Math.min(index, slide.childCount - 1))
  let pos = slidePos + 1
  for (let n = 0; n < i; n += 1) pos += slide.child(n).nodeSize
  return textCaret(state, pos + 2)
}

export function selectionFromSlideClick(view: EditorView, event: MouseEvent) {
  const target = event.target
  if (!(target instanceof Element) || target.closest('[data-biu-ignore]')) return null
  const root = target.closest('[data-slide], .react-renderer.node-slide')
  if (!(root instanceof HTMLElement)) return null
  const slidePos = slidePosForElement(view, root)
  if (slidePos < 0) return null
  const index = cellIndexFromPoint(root, event.clientX, event.clientY)
  const sel = caretInSlideCell(view.state, slidePos, index)
  if (!sel) return null
  if (slideCellDepth(view.state.selection.$from) >= 0 && view.state.selection.from === sel.from) return null
  return view.state.tr.setSelection(sel)
}
