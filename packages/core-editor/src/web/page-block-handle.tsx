import { useCallback, useEffect, useRef, useState, type DragEvent, type MouseEvent as ReactMouseEvent } from 'react'
import type { Editor } from '@tiptap/core'
import { NodeSelection } from '@tiptap/pm/state'
import { HeadlessDismiss } from '@biu/public-ui'
import {
  deleteHandleBlock,
  duplicateHandleBlock,
  handleBlockAtPointer,
  insertParagraphAfter,
  insertParagraphBefore,
  type HandleBlock,
} from './page-block-handle.ts'

const HANDLE_RAIL = 28
const GRIP_H = 26

type HandleTarget = HandleBlock & { top: number; left: number; height: number; gripTop: number }

function lineCoords(editor: Editor, found: HandleBlock) {
  const inside = found.node.isAtom || found.node.isLeaf || found.node.nodeSize < 2 ? found.pos : found.pos + 1
  try {
    return editor.view.coordsAtPos(inside)
  } catch {
    return null
  }
}

function readTarget(editor: Editor, host: HTMLElement, clientX: number, clientY: number): HandleTarget | null {
  const found = handleBlockAtPointer(editor, clientX, clientY)
  if (!found) return null
  const content = editor.view.dom.getBoundingClientRect()
  const raw = editor.view.nodeDOM(found.pos)
  const el = raw instanceof HTMLElement ? raw : raw?.parentElement
  if (!(el instanceof HTMLElement)) return null
  const hostBox = host.getBoundingClientRect()
  const box = el.getBoundingClientRect()
  const line = lineCoords(editor, found) ?? { top: box.top, bottom: box.top + GRIP_H }
  const gripTop = (line.top + line.bottom) / 2 - box.top - GRIP_H / 2
  return {
    ...found,
    top: box.top - hostBox.top,
    left: content.left - hostBox.left - HANDLE_RAIL,
    height: Math.max(box.height, GRIP_H),
    gripTop: Math.max(0, gripTop),
  }
}

export function PageBlockHandle({ editor }: { editor: Editor }) {
  const [target, setTarget] = useState<HandleTarget | null>(null)
  const [menuOpen, setMenuOpen] = useState(false)
  const dragged = useRef(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  const hide = useCallback(() => {
    setMenuOpen(false)
    setTarget(null)
  }, [])

  useEffect(() => {
    const root = editor.view.dom
    const wrap = root.closest('.page-editor')
    if (!(wrap instanceof HTMLElement)) return

    const onMove = (event: MouseEvent) => {
      if (menuOpen) return
      if (!editor.isEditable) {
        setTarget(null)
        return
      }
      if (event.target instanceof Element && event.target.closest('.page-block-handle')) return
      const next = readTarget(editor, wrap, event.clientX, event.clientY)
      setTarget(next)
    }

    const onLeave = (event: MouseEvent) => {
      if (menuOpen) return
      const to = event.relatedTarget
      if (to instanceof Node && wrap.contains(to)) return
      setTarget(null)
    }

    wrap.addEventListener('mousemove', onMove)
    wrap.addEventListener('mouseleave', onLeave)
    return () => {
      wrap.removeEventListener('mousemove', onMove)
      wrap.removeEventListener('mouseleave', onLeave)
    }
  }, [editor, menuOpen])

  if (!target || !editor.isEditable) return null

  const run = (fn: () => void) => (event: ReactMouseEvent) => {
    event.preventDefault()
    fn()
    hide()
  }

  const onDragStart = (event: DragEvent) => {
    dragged.current = true
    setMenuOpen(false)
    const { view } = editor
    const selection = NodeSelection.create(view.state.doc, target.pos)
    view.dispatch(view.state.tr.setSelection(selection))
    view.dragging = { slice: selection.content(), move: true }
    event.dataTransfer.effectAllowed = 'move'
    event.dataTransfer.setData('text/plain', '')
  }

  const onDragEnd = () => {
    editor.view.dragging = null
  }

  const onGripClick = (event: ReactMouseEvent) => {
    event.preventDefault()
    event.stopPropagation()
    if (dragged.current) {
      dragged.current = false
      return
    }
    setMenuOpen((open) => !open)
  }

  return (
    <div
      className="page-block-handle"
      style={{ top: target.top, left: target.left, height: target.height }}
      data-testid="page-block-handle"
    >
      <button
        type="button"
        className="page-block-handle-grip"
        style={{ marginTop: target.gripTop }}
        draggable
        aria-label="拖拽或打开块菜单"
        data-testid="page-block-handle-grip"
        onClick={onGripClick}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
      >
        <span className="page-block-handle-dots" aria-hidden />
      </button>
      {menuOpen ? (
        <HeadlessDismiss onDismiss={() => setMenuOpen(false)} insideRef={menuRef}>
          <div
            ref={menuRef}
            className="page-block-handle-menu"
            style={{ top: target.gripTop }}
            role="menu"
            data-testid="page-block-handle-menu"
          >
            <button type="button" role="menuitem" onMouseDown={run(() => insertParagraphBefore(editor, target.pos))}>
              向上插入
            </button>
            <button type="button" role="menuitem" onMouseDown={run(() => insertParagraphAfter(editor, target.pos, target.node))}>
              向下插入
            </button>
            <button type="button" role="menuitem" onMouseDown={run(() => duplicateHandleBlock(editor, target.pos, target.node))}>
              复制
            </button>
            <button type="button" role="menuitem" onMouseDown={run(() => deleteHandleBlock(editor, target.pos, target.node))}>
              删除
            </button>
          </div>
        </HeadlessDismiss>
      ) : null}
    </div>
  )
}
