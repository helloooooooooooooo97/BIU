import { useEffect, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  Bars3BottomLeftIcon,
  Bars3BottomRightIcon,
  Bars3CenterLeftIcon,
  ViewfinderCircleIcon,
} from '@heroicons/react/16/solid'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { clampImageWidth, pageImageAlign, type PageImageAlign } from './page-image-attrs.ts'

function hold(event: MouseEvent) {
  event.preventDefault()
}

function AlignBtn({
  value,
  current,
  label,
  Icon,
  onPick,
}: {
  value: PageImageAlign
  current: PageImageAlign
  label: string
  Icon: typeof Bars3BottomLeftIcon
  onPick: (next: PageImageAlign) => void
}) {
  return (
    <button
      type="button"
      className={`page-slide-icon${current === value ? ' is-on' : ''}`}
      title={label}
      aria-label={label}
      aria-pressed={current === value}
      onMouseDown={hold}
      onClick={() => onPick(value)}
    >
      <Icon aria-hidden className="page-slide-ico" />
    </button>
  )
}

export function PageImageView({ node, updateAttributes, selected, editor }: NodeViewProps) {
  const src = String(node.attrs.src ?? '')
  const alt = String(node.attrs.alt ?? '')
  const align = pageImageAlign(node.attrs.align)
  const width = clampImageWidth(node.attrs.width)
  const writable = editor.isEditable
  const [zoom, setZoom] = useState(false)
  const [bust, setBust] = useState(0)
  const frameRef = useRef<HTMLDivElement>(null)
  const shown = bust && src ? `${src}${src.includes('?') ? '&' : '?'}reload=${bust}` : src

  useEffect(() => {
    if (!zoom) return
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') setZoom(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [zoom])

  const startResize = (event: MouseEvent<HTMLSpanElement>) => {
    if (!writable) return
    event.preventDefault()
    event.stopPropagation()
    const startX = event.clientX
    const startW = frameRef.current?.getBoundingClientRect().width ?? width ?? 240
    const host = editor.view.dom.closest('.page-editor') ?? editor.view.dom
    const max = Math.max(120, host instanceof HTMLElement ? host.clientWidth : 720)
    const move = (next: PointerEvent) => {
      const raw = startW + (next.clientX - startX) * (align === 'right' ? -1 : 1)
      updateAttributes({ width: Math.min(max, clampImageWidth(raw) ?? 80) })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  const lightbox =
    zoom && src
      ? createPortal(
          <div
            className="page-image-lightbox"
            role="dialog"
            aria-modal="true"
            aria-label={alt || '图片'}
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) setZoom(false)
            }}
          >
            <img src={src} alt={alt} />
          </div>,
          document.body,
        )
      : null

  return (
    <NodeViewWrapper
      className={`page-image${selected ? ' is-selected' : ''}${zoom ? ' is-zoom' : ''}`}
      data-align={align}
      contentEditable={false}
    >
      <div className="page-image-shell" style={width ? { width } : undefined}>
        <div className="page-slide-bar" data-biu-ignore contentEditable={false}>
          {writable ? (
            <>
              <AlignBtn
                value="left"
                current={align}
                label="靠左"
                Icon={Bars3BottomLeftIcon}
                onPick={(next) => updateAttributes({ align: next })}
              />
              <AlignBtn
                value="center"
                current={align}
                label="居中"
                Icon={Bars3CenterLeftIcon}
                onPick={(next) => updateAttributes({ align: next })}
              />
              <AlignBtn
                value="right"
                current={align}
                label="靠右"
                Icon={Bars3BottomRightIcon}
                onPick={(next) => updateAttributes({ align: next })}
              />
              {width ? (
                <button
                  type="button"
                  className="page-slide-icon"
                  title="恢复自适应宽度"
                  aria-label="恢复自适应宽度"
                  onMouseDown={hold}
                  onClick={() => updateAttributes({ width: null })}
                >
                  <ViewfinderCircleIcon aria-hidden className="page-slide-ico" />
                </button>
              ) : null}
            </>
          ) : null}
          <button
            type="button"
            className="page-slide-icon"
            title={zoom ? '退出放大' : '放大'}
            aria-label={zoom ? '退出放大' : '放大'}
            onMouseDown={hold}
            onClick={() => src && setZoom((on) => !on)}
          >
            {zoom ? (
              <ArrowsPointingInIcon aria-hidden className="page-slide-ico" />
            ) : (
              <ArrowsPointingOutIcon aria-hidden className="page-slide-ico" />
            )}
          </button>
        </div>
        <div ref={frameRef} className="page-image-frame">
          {src ? (
            <img
              src={shown}
              alt={alt}
              draggable={false}
              onError={() => {
                if (!src || bust) return
                window.setTimeout(() => setBust(Date.now()), 80)
              }}
              onDoubleClick={(event) => {
                event.preventDefault()
                if (src) setZoom(true)
              }}
            />
          ) : (
            <div className="page-image-empty">图片</div>
          )}
          {writable ? <span className="page-image-resize" onMouseDown={startResize} /> : null}
        </div>
        <input
          className="page-image-caption"
          value={alt}
          readOnly={!writable}
          placeholder="图片名称"
          aria-label="图片名称"
          onChange={(event) => updateAttributes({ alt: event.target.value })}
          onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              ;(event.target as HTMLInputElement).blur()
            }
          }}
        />
      </div>
      {lightbox}
    </NodeViewWrapper>
  )
}
