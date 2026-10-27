import { useEffect, useState } from 'react'
import { ArrowsPointingInIcon, ArrowsPointingOutIcon } from '@heroicons/react/16/solid'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import { DECK_LAYOUT_PRESETS, isDeckLayout, type DeckLayout } from './deck-md.ts'
import { LayoutPicker } from './layout-picker.tsx'

export function DeckView({ node, editor }: NodeViewProps) {
  const [focus, setFocus] = useState(false)
  const layout = (isDeckLayout(node.attrs.layout) ? node.attrs.layout : 'split') as DeckLayout

  useEffect(() => {
    if (!focus) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocus(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [focus])

  return (
    <NodeViewWrapper
      className={`page-deck${focus ? ' is-focus' : ''}`}
      data-testid="page-deck"
      data-deck=""
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
      <NodeViewContent className="page-deck-body" />
    </NodeViewWrapper>
  )
}
