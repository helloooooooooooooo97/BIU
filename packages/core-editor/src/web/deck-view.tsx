import { useEffect, useRef, useState } from 'react'
import { ArrowsPointingInIcon, ArrowsPointingOutIcon } from '@heroicons/react/16/solid'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import { DECK_LAYOUT_PRESETS, isDeckLayout, type DeckLayout } from './deck-md.ts'
import { LayoutPicker } from './layout-picker.tsx'

export function DeckView({ node, editor }: NodeViewProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const index = Math.min(Math.max(0, Number(node.attrs.index) || 0), Math.max(0, node.childCount - 1))
  const [focus, setFocus] = useState(false)
  const slide = node.childCount ? node.child(index) : null
  const layout = (slide && isDeckLayout(slide.attrs.layout) ? slide.attrs.layout : 'split') as DeckLayout

  useEffect(() => {
    if (!focus) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocus(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focus])

  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    root.querySelectorAll<HTMLElement>('[data-deck-slide]').forEach((el, i) => {
      if (i === index) el.setAttribute('data-on', '')
      else el.removeAttribute('data-on')
    })
  }, [index, node])

  return (
    <NodeViewWrapper
      ref={rootRef}
      className={`page-deck${focus ? ' is-focus' : ''}`}
      data-testid="page-deck"
      data-deck=""
      data-show={index}
      data-layout={layout}
    >
      <div className="page-deck-bar" data-biu-ignore contentEditable={false}>
        {editor.isEditable ? (
          <LayoutPicker
            value={layout}
            items={DECK_LAYOUT_PRESETS}
            onChange={(id) => {
              if (editor.isDestroyed) return
              editor.commands.setDeckLayout(id)
            }}
          />
        ) : null}
        <button
          type="button"
          className="page-deck-icon"
          data-testid="deck-focus-toggle"
          title={focus ? '退出放大' : '放大'}
          aria-label={focus ? '退出放大' : '放大'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setFocus((on) => !on)}
        >
          {focus ? <ArrowsPointingInIcon aria-hidden className="size-[14px]" /> : <ArrowsPointingOutIcon aria-hidden className="size-[14px]" />}
        </button>
      </div>
      <NodeViewContent className="page-deck-slides" />
    </NodeViewWrapper>
  )
}
