import { useEffect, useState } from 'react'
import { ArrowsPointingInIcon, ArrowsPointingOutIcon } from '@heroicons/react/16/solid'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import { SLIDE_LAYOUT_PRESETS, isSlideLayout, type SlideLayout } from './slide-md.ts'
import { LayoutPicker } from './layout-picker.tsx'

export function SlideView({ node, editor }: NodeViewProps) {
  const [focus, setFocus] = useState(false)
  const layout = (isSlideLayout(node.attrs.layout) ? node.attrs.layout : 'split') as SlideLayout

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
      className={`page-slide${focus ? ' is-focus' : ''}`}
      data-testid="page-slide"
      data-slide=""
      data-layout={layout}
    >
      <div className="page-slide-bar" data-biu-ignore contentEditable={false}>
        {editor.isEditable ? (
          <LayoutPicker
            value={layout}
            items={SLIDE_LAYOUT_PRESETS}
            onChange={(id) => {
              if (editor.isDestroyed) return
              editor.commands.setSlideLayout(id)
            }}
          />
        ) : null}
        <button
          type="button"
          className="page-slide-icon"
          data-testid="slide-focus-toggle"
          title={focus ? '退出放大' : '放大'}
          aria-label={focus ? '退出放大' : '放大'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setFocus((on) => !on)}
        >
          {focus ? <ArrowsPointingInIcon aria-hidden className="size-[14px]" /> : <ArrowsPointingOutIcon aria-hidden className="size-[14px]" />}
        </button>
      </div>
      <NodeViewContent className="page-slide-body" />
    </NodeViewWrapper>
  )
}
