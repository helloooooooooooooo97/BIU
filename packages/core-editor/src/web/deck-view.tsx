import { useEffect, useState } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import { DECK_LAYOUTS, DECK_LAYOUT_META, type DeckLayout } from './deck-md.ts'

export function DeckView({ node, editor, getPos }: NodeViewProps) {
  const index = Math.min(Math.max(0, Number(node.attrs.index) || 0), Math.max(0, node.childCount - 1))
  const [focus, setFocus] = useState(false)
  const slide = node.childCount ? node.child(index) : null
  const layout = (slide && String(slide.attrs.layout)) || 'split'

  const run = (fn: () => boolean) => {
    if (!editor.isEditable || editor.isDestroyed) return
    fn()
  }

  useEffect(() => {
    if (!focus) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFocus(false)
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'PageDown') {
        event.preventDefault()
        editor.commands.stepDeck(1)
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        editor.commands.stepDeck(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focus, editor])

  return (
    <NodeViewWrapper
      className={`page-deck${focus ? ' is-focus' : ''}`}
      data-testid="page-deck"
      data-deck=""
      data-show={index}
      data-layout={layout}
    >
      <div className="page-deck-bar" data-biu-ignore contentEditable={false}>
        <span className="page-deck-kicker">Deck</span>
        <span className="page-deck-count">
          {index + 1}/{Math.max(1, node.childCount)}
        </span>
        {editor.isEditable
          ? DECK_LAYOUTS.map((id) => (
              <button
                key={id}
                type="button"
                className={layout === id ? 'is-on' : ''}
                data-testid={`deck-layout-${id}`}
                onClick={() => run(() => editor.commands.setDeckLayout(id as DeckLayout))}
              >
                {DECK_LAYOUT_META[id].label}
              </button>
            ))
          : null}
        {editor.isEditable ? (
          <button type="button" onClick={() => run(() => editor.commands.addDeckSlide())}>
            加一页
          </button>
        ) : null}
        <button type="button" data-testid="deck-focus-toggle" onClick={() => setFocus((on) => !on)}>
          {focus ? '退出' : '放大'}
        </button>
      </div>
      <NodeViewContent className="page-deck-slides" />
      <div className="page-deck-nav" data-biu-ignore contentEditable={false}>
        <button type="button" disabled={index <= 0} onClick={() => editor.commands.stepDeck(-1)}>
          上一页
        </button>
        <div className="page-deck-dots">
          {Array.from({ length: node.childCount }, (_, i) => (
            <button
              key={i}
              type="button"
              className={i === index ? 'is-on' : ''}
              onClick={() => {
                const pos = typeof getPos === 'function' ? getPos() : undefined
                if (typeof pos !== 'number') return
                editor.chain().setNodeSelection(pos).updateAttributes('deck', { index: i }).run()
              }}
            />
          ))}
        </div>
        <button type="button" disabled={index >= node.childCount - 1} onClick={() => editor.commands.stepDeck(1)}>
          下一页
        </button>
      </div>
    </NodeViewWrapper>
  )
}
