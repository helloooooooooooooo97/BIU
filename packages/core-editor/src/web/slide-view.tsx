import { useEffect, useState, type MouseEvent } from 'react'
import { ArrowsPointingInIcon, ArrowsPointingOutIcon, SwatchIcon, ViewColumnsIcon } from '@heroicons/react/16/solid'
import { HeadlessPopover } from '@biu/biu-ui'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react'
import { WASH_TONES } from './color-swatches.ts'
import { ExpandNavTitle } from './expand-nav-title.tsx'
import { LayoutPicker } from './layout-picker.tsx'
import { SLIDE_LAYOUT_PRESETS, isSlideLayout, parseSlideBg, type SlideLayout } from './slide-md.ts'

function hold(event: MouseEvent) {
  event.preventDefault()
}

function SlideKindIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
      <rect x="1.75" y="3.25" width="12.5" height="9.5" rx="1.75" stroke="var(--biu-color-ink-purple)" strokeWidth="1.35" />
      <path d="M1.75 6.25h12.5" stroke="var(--biu-color-ink-purple)" strokeWidth="1.35" />
    </svg>
  )
}

function SlideBgPicker({
  value,
  disabled,
  onChange,
}: {
  value: string
  disabled?: boolean
  onChange: (bg: string) => void
}) {
  const [open, setOpen] = useState(false)
  return (
    <HeadlessPopover
      open={open}
      onOpenChange={setOpen}
      side="left"
      align="start"
      sideOffset={8}
      alignOffset={-4}
      avoidCollisions={false}
      trigger={
        <button
          type="button"
          className={`page-slide-icon page-slide-bg-btn${open ? ' is-on' : ''}${value ? ' has-bg' : ''}`}
          disabled={disabled}
          title="背景色"
          aria-label="背景色"
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid="slide-bg-picker"
          onMouseDown={hold}
        >
          <SwatchIcon aria-hidden className="page-slide-ico" />
          {value ? <span className="page-slide-bg-dot" style={{ background: value }} /> : null}
        </button>
      }
    >
      <div className="page-color-menu page-slide-bg-menu" role="menu" data-biu-ignore onMouseDown={hold}>
        <div className="page-color-menu-h">背景</div>
        <div className="page-color-grid">
          <button
            type="button"
            role="menuitemradio"
            className={!value ? 'page-color-none is-on' : 'page-color-none'}
            aria-checked={!value}
            aria-label="默认背景"
            data-testid="slide-bg-none"
            onMouseDown={hold}
            onClick={() => {
              onChange('')
              setOpen(false)
            }}
          />
          {WASH_TONES.map((tone) => {
            const on = value === tone.value
            return (
              <button
                key={tone.id}
                type="button"
                role="menuitemradio"
                className={on ? 'page-color-wash is-on' : 'page-color-wash'}
                aria-checked={on}
                aria-label={tone.label}
                data-testid={`slide-bg-${tone.id}`}
                style={{ background: tone.swatch ?? tone.value }}
                onMouseDown={hold}
                onClick={() => {
                  onChange(tone.value)
                  setOpen(false)
                }}
              />
            )
          })}
        </div>
      </div>
    </HeadlessPopover>
  )
}

export function SlideView({ node, editor, getPos, selected, updateAttributes }: NodeViewProps) {
  const [focus, setFocus] = useState(false)
  const [inside, setInside] = useState(false)
  const layout = (isSlideLayout(node.attrs.layout) ? node.attrs.layout : 'split') as SlideLayout
  const bg = parseSlideBg(node.attrs.bg)

  useEffect(() => {
    const sync = () => {
      const pos = getPos()
      if (typeof pos !== 'number') {
        setInside(false)
        return
      }
      const { from, to } = editor.state.selection
      const end = pos + node.nodeSize
      setInside(from >= pos && to <= end)
    }
    sync()
    editor.on('selectionUpdate', sync)
    return () => {
      editor.off('selectionUpdate', sync)
    }
  }, [editor, getPos, node.nodeSize])

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
      className={`page-slide${focus ? ' is-focus' : ''}${bg ? ' has-bg' : ''}${selected || inside ? ' is-selected' : ''}`}
      data-testid="page-slide"
      data-slide=""
      data-slide-selected={selected || inside ? '1' : undefined}
      data-layout={layout}
      data-bg={bg || undefined}
      style={bg ? { background: bg } : undefined}
    >
      <div className="page-block-expand-nav" data-testid="slide-expand-nav" data-biu-ignore contentEditable={false}>
        <div className="page-block-expand-nav-type" data-testid="slide-type-icon" title="幻灯片" aria-label="幻灯片">
          <SlideKindIcon />
        </div>
        <ExpandNavTitle
          value={String(node.attrs.title ?? '').trim() || '幻灯片'}
          readOnly={!editor.isEditable}
          testId="slide-title"
          onCommit={(next) => {
            if (editor.isDestroyed) return
            updateAttributes({ title: next })
          }}
        />
        <div className="page-block-expand-nav-tools">
          {editor.isEditable ? (
            <>
              <LayoutPicker
                side="left"
                sideOffset={8}
                alignOffset={-4}
                avoidCollisions={false}
                icon={<ViewColumnsIcon aria-hidden className="page-slide-ico" />}
                value={layout}
                items={SLIDE_LAYOUT_PRESETS}
                onChange={(id) => {
                  if (editor.isDestroyed) return
                  editor.commands.setSlideLayout(id)
                }}
              />
              <SlideBgPicker
                value={bg}
                onChange={(next) => {
                  if (editor.isDestroyed) return
                  editor.commands.setSlideBg(next)
                }}
              />
            </>
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
            {focus ? <ArrowsPointingInIcon aria-hidden className="page-slide-ico" /> : <ArrowsPointingOutIcon aria-hidden className="page-slide-ico" />}
          </button>
        </div>
      </div>
      <NodeViewContent className="page-slide-body" />
    </NodeViewWrapper>
  )
}
