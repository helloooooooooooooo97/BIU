import { Button, ReUI } from '@biu/reui'
import { createPortal } from 'react-dom'
import {
  CELL_KINDS,
  DECK_LAYOUTS,
  LAYOUT_META,
  emptySlide,
  parseDeck,
  patchSlide,
  stepDeck,
  type CellKind,
  type DeckCell,
  type DeckData,
  type DeckSlide,
} from './model.ts'

const React = globalThis.React
const { useEffect, useMemo, useRef, useState } = React

export const name = 'page-deck'
export const inject = ['pageEditor']

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}

function CellFace({ cell, writable, onChange }: { cell: DeckCell; writable: boolean; onChange: (text: string) => void }) {
  const lines = cell.text.split('\n')
  if (!writable) {
    if (cell.kind === 'list') {
      return (
        <ul className="deck-list">
          {lines.filter(Boolean).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      )
    }
    if (cell.kind === 'stat') {
      return (
        <div className="deck-stat">
          <strong>{lines[0] || '—'}</strong>
          <span>{lines.slice(1).join(' ') || ''}</span>
        </div>
      )
    }
    if (cell.kind === 'quote') return <blockquote className="deck-quote">{cell.text}</blockquote>
    if (cell.kind === 'heading') return <h2 className="deck-heading">{cell.text}</h2>
    return <p className="deck-text">{cell.text}</p>
  }
  return (
    <textarea
      data-page-block-capture=""
      data-biu-ignore
      className={`deck-input is-${cell.kind}`}
      value={cell.text}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => event.stopPropagation()}
      placeholder={cell.kind === 'list' ? '一行一项' : cell.kind === 'stat' ? '数字\n说明' : '写点什么'}
    />
  )
}

function SlideCanvas({
  slide,
  writable,
  onPatch,
}: {
  slide: DeckSlide
  writable: boolean
  onPatch: (patch: Partial<DeckSlide>) => void
}) {
  const putCell = (id: string, text: string) => {
    onPatch({ cells: slide.cells.map((cell) => (cell.id === id ? { ...cell, text } : cell)) })
  }
  const putKind = (id: string, kind: CellKind) => {
    onPatch({ cells: slide.cells.map((cell) => (cell.id === id ? { ...cell, kind } : cell)) })
  }
  return (
    <div className={`deck-canvas is-${slide.layout}`} data-testid="deck-canvas" data-layout={slide.layout}>
      {slide.cells.map((cell) => (
        <section key={cell.id} className="deck-cell" data-kind={cell.kind}>
          {writable ? (
            <select
              data-page-block-capture=""
              data-biu-ignore
              className="deck-kind"
              value={cell.kind}
              onChange={(event) => putKind(cell.id, event.target.value as CellKind)}
            >
              {CELL_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind}
                </option>
              ))}
            </select>
          ) : null}
          <CellFace cell={cell} writable={writable} onChange={(text) => putCell(cell.id, text)} />
        </section>
      ))}
    </div>
  )
}

export function DeckCard({ data, update, writable }: BlockProps) {
  const deck = useMemo(() => parseDeck(data), [data])
  const slide = deck.slides[deck.index] ?? deck.slides[0]!
  const [focus, setFocus] = useState(false)
  const stageRef = useRef<HTMLDivElement | null>(null)

  const commit = (next: DeckData) => {
    update({ title: next.title, index: next.index, slides: next.slides })
  }

  const go = (delta: number) => commit({ ...deck, index: stepDeck(deck.index, delta, deck.slides.length) })

  useEffect(() => {
    if (!focus) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFocus(false)
        return
      }
      if (event.key === 'ArrowRight' || event.key === 'PageDown' || event.key === ' ') {
        event.preventDefault()
        go(1)
      }
      if (event.key === 'ArrowLeft' || event.key === 'PageUp') {
        event.preventDefault()
        go(-1)
      }
    }
    window.addEventListener('keydown', onKey)
    const root = stageRef.current
    void Promise.resolve(root?.requestFullscreen?.({ navigationUI: 'hide' })).catch(() => {})
    return () => {
      window.removeEventListener('keydown', onKey)
      if (document.fullscreenElement === root) void document.exitFullscreen?.()
    }
  }, [focus, deck.index, deck.slides.length])

  const body = (
    <div
      ref={stageRef}
      className={`deck-stage${focus ? ' is-focus' : ''}`}
      data-testid={focus ? 'deck-focus' : 'page-deck'}
    >
      <div className="deck-bar" data-biu-ignore>
        <span className="deck-kicker">{deck.title}</span>
        <span className="deck-count">
          {deck.index + 1}/{deck.slides.length}
        </span>
        {writable
          ? DECK_LAYOUTS.map((layout) => (
              <button
                key={layout}
                type="button"
                className={`deck-layout${slide.layout === layout ? ' is-on' : ''}`}
                data-testid={`deck-layout-${layout}`}
                onClick={() => commit(patchSlide(deck, slide.id, { layout }))}
              >
                {LAYOUT_META[layout].label}
              </button>
            ))
          : null}
        {writable ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={() => commit({ ...deck, slides: [...deck.slides, emptySlide('split')], index: deck.slides.length })}
          >
            加一页
          </Button>
        ) : null}
        <Button
          size="sm"
          data-testid="deck-focus-toggle"
          onClick={() => setFocus((on) => !on)}
        >
          {focus ? '退出' : '放大'}
        </Button>
      </div>
      <SlideCanvas
        slide={slide}
        writable={writable}
        onPatch={(patch) => commit(patchSlide(deck, slide.id, patch))}
      />
      <div className="deck-nav" data-biu-ignore>
        <button type="button" disabled={deck.index <= 0} onClick={() => go(-1)}>
          上一页
        </button>
        <div className="deck-dots">
          {deck.slides.map((item, i) => (
            <button
              key={item.id}
              type="button"
              className={i === deck.index ? 'is-on' : ''}
              aria-label={`第 ${i + 1} 页`}
              onClick={() => commit({ ...deck, index: i })}
            />
          ))}
        </div>
        <button type="button" disabled={deck.index >= deck.slides.length - 1} onClick={() => go(1)}>
          下一页
        </button>
      </div>
    </div>
  )

  return (
    <ReUI>
      <style>{DECK_CSS}</style>
      {focus && typeof document !== 'undefined' ? createPortal(body, document.body) : body}
    </ReUI>
  )
}

const DECK_CSS = `
.deck-stage{position:relative;width:100%;border:1px solid var(--rui-border);border-radius:12px;background:var(--rui-bg);overflow:hidden}
.deck-stage.is-focus{position:fixed;inset:0;z-index:80;border:0;border-radius:0;display:flex;flex-direction:column;background:var(--rui-bg)}
.deck-bar{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:8px 10px;border-bottom:1px solid var(--rui-border);color:var(--rui-muted);font-size:11px}
.deck-kicker{font-weight:700;color:var(--rui-fg);letter-spacing:.04em;text-transform:uppercase}
.deck-count{margin-right:4px}
.deck-layout{border:0;background:transparent;color:var(--rui-muted);border-radius:6px;padding:3px 7px;font:inherit;cursor:pointer}
.deck-layout.is-on,.deck-layout:hover{background:var(--rui-hover);color:var(--rui-fg)}
.deck-canvas{aspect-ratio:16/9;display:grid;gap:10px;padding:16px;box-sizing:border-box;background:var(--rui-soft)}
.deck-stage.is-focus .deck-canvas{flex:1;aspect-ratio:auto;padding:28px;gap:16px}
.deck-canvas.is-title{grid-template-rows:1.2fr .8fr}
.deck-canvas.is-split{grid-template-columns:1fr 1fr}
.deck-canvas.is-hero{grid-template-columns:1.4fr 1fr}
.deck-canvas.is-trio{grid-template-columns:1fr 1fr 1fr}
.deck-canvas.is-stack{grid-template-rows:auto 1fr auto}
.deck-cell{position:relative;min-width:0;min-height:0;display:flex;flex-direction:column;gap:6px;padding:12px;border-radius:10px;background:var(--rui-bg);border:1px solid var(--rui-border)}
.deck-kind{align-self:flex-start;border:0;background:var(--rui-accent);color:var(--rui-muted);border-radius:4px;font:10px/1.2 ui-sans-serif,system-ui,sans-serif;padding:2px 4px}
.deck-input{flex:1;width:100%;min-height:0;border:0;resize:none;background:transparent;color:var(--rui-fg);font:inherit;outline:none}
.deck-input.is-heading{font-size:22px;font-weight:700;letter-spacing:-.03em}
.deck-input.is-stat{font-size:28px;font-weight:650;letter-spacing:-.04em}
.deck-input.is-quote{font-style:italic}
.deck-heading{margin:0;font-size:28px;line-height:1.15;letter-spacing:-.03em}
.deck-text,.deck-quote,.deck-list{margin:0;font-size:15px;line-height:1.45;white-space:pre-wrap}
.deck-quote{color:var(--rui-muted)}
.deck-list{padding-left:1.1em}
.deck-stat{display:flex;flex-direction:column;gap:4px;min-height:100%;justify-content:center}
.deck-stat strong{font-size:32px;letter-spacing:-.04em}
.deck-stat span{color:var(--rui-muted);font-size:13px}
.deck-nav{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 10px}
.deck-nav button{border:0;background:transparent;color:var(--rui-muted);cursor:pointer;font:inherit}
.deck-nav button:disabled{opacity:.35;cursor:default}
.deck-dots{display:flex;gap:6px}
.deck-dots button{width:7px;height:7px;padding:0;border-radius:99px;background:var(--rui-border)}
.deck-dots button.is-on{background:var(--rui-fg)}
`

export function apply(ctx: {
  pageEditor: {
    registerBlock: (spec: {
      kind: string
      plugin: string
      label: string
      blockType?: string
      hint?: string
      aliases?: string[]
      assets?: unknown
      defaults?: Record<string, unknown>
      View: (props: BlockProps) => unknown
    }) => void
  }
}) {
  const demo = parseDeck({})
  ctx.pageEditor.registerBlock({
    kind: 'deck',
    plugin: name,
    label: 'Deck',
    blockType: 'basic',
    hint: '幻灯片：一页多块，换网格排版，放大专注编辑',
    aliases: ['deck', 'ppt', 'gamma', '幻灯片', '演示', '卡片'],
    assets: [],
    defaults: { title: demo.title, index: 0, slides: demo.slides },
    View: DeckCard,
  })
}
