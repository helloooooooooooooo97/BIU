import { ReUI, Textarea } from '@biu/reui'
import {
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CodeBracketIcon,
  EyeIcon,
  PlayCircleIcon,
  ViewfinderCircleIcon,
} from '@heroicons/react/16/solid'
import { createPortal } from 'react-dom'
import { compileHtmlSource } from '../shared/compile.ts'
import { bindHtmlSlide, collectHtmlSlides, cssBoxSize, htmlDeckEnabled, htmlDeckIndex, htmlDeckKeyAction, htmlLooksFillLayout, HTML_FILL_HOST_PX, stepHtmlDeck } from './html-deck.ts'
import { mountHtmlSandbox, unmountHtmlSandbox } from './sandbox.ts'
import { htmlBlockKey, stampHtmlPickSurfaces, stampHtmlSource } from './stamp-picks.ts'

const React = globalThis.React
const { useEffect, useLayoutEffect, useMemo, useRef, useState } = React

function assetName(file: string) {
  return file.replace(/^assets\//, '')
}

function newHtmlFile() {
  return `assets/html-${crypto.randomUUID().slice(0, 8)}.html`
}

function assetEtag(raw: string) {
  return raw.replace(/^W\//, '').replaceAll('"', '')
}

async function loadHtmlAsset(file: string, fallback: string, bust = false) {
  const name = assetName(file)
  const res = await fetch(`/api/page/file/${encodeURIComponent(name)}${bust ? `?t=${Date.now()}` : ''}`)
  if (res.status === 404) {
    if (bust) return { html: fallback, etag: '' }
    const created = await fetch(`/api/page/file/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
      body: fallback,
    })
    return { html: fallback, etag: assetEtag(String(created.headers.get('etag') ?? '')) }
  }
  if (!res.ok) return { html: fallback, etag: '' }
  return { html: await res.text(), etag: assetEtag(String(res.headers.get('etag') ?? '')) }
}

async function saveHtmlAsset(file: string, html: string, etag: string) {
  const name = assetName(file)
  const headers: Record<string, string> = { 'Content-Type': 'text/html; charset=utf-8' }
  if (etag) headers['If-Match'] = etag
  const res = await fetch(`/api/page/file/${encodeURIComponent(name)}`, { method: 'PUT', headers, body: html })
  return assetEtag(String(res.headers.get('etag') ?? etag))
}

function useHtmlSource(
  data: Record<string, unknown>,
  update: (patch: Record<string, unknown>) => void,
  sample: string,
) {
  const file = typeof data.file === 'string' ? data.file.trim() : ''
  const inline = typeof data.html === 'string' ? data.html : ''
  const [html, setHtml] = useState(inline || sample)
  const [rev, setRev] = useState(0)
  const etagRef = useRef('')
  const htmlRef = useRef(html)
  const fileRef = useRef(file)
  const quietUntil = useRef(0)
  htmlRef.current = html
  fileRef.current = file
  useEffect(() => {
    if (file) return
    update({ file: newHtmlFile(), html: undefined })
  }, [file, update])
  useEffect(() => {
    if (!file) return
    let gone = false
    void loadHtmlAsset(file, htmlRef.current || inline || sample, rev > 0).then((loaded) => {
      if (gone) return
      etagRef.current = loaded.etag
      setHtml(loaded.html)
      if (inline) update({ html: undefined })
    })
    return () => {
      gone = true
    }
  }, [file, rev])
  useEffect(() => {
    const onAsset = (event: Event) => {
      const detail = (event as CustomEvent<{ name?: string; etag?: string }>).detail
      const name = String(detail?.name ?? '')
      const current = fileRef.current
      if (!name || !current) return
      if (assetName(current) !== name && current !== name) return
      if (Date.now() < quietUntil.current) return
      const nextEtag = assetEtag(String(detail?.etag ?? ''))
      if (nextEtag && nextEtag === etagRef.current) return
      setRev((n) => n + 1)
    }
    window.addEventListener('biu:asset-changed', onAsset)
    return () => window.removeEventListener('biu:asset-changed', onAsset)
  }, [])
  const save = (next: string) => {
    setHtml(next)
    htmlRef.current = next
    if (!file) {
      update({ html: next })
      return
    }
    quietUntil.current = Date.now() + 1200
    void saveHtmlAsset(file, next, etagRef.current).then((etag) => {
      etagRef.current = etag
    })
  }
  return { file, html, save }
}

function HtmlSandbox({
  html,
  live,
  onStamp,
}: {
  html: string
  live: boolean
  onStamp?: (root: ShadowRoot) => void
}) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState('')
  useLayoutEffect(() => {
    const host = hostRef.current
    if (!host) return
    const root = host.shadowRoot ?? host.attachShadow({ mode: 'open' })
    try {
      mountHtmlSandbox(root, html, { live })
      setError('')
      onStamp?.(root)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    return () => unmountHtmlSandbox(root)
  }, [html, live])
  return (
    <>
      <div
        ref={hostRef}
        data-testid={live ? 'page-html-sandbox' : 'page-html-static-host'}
        data-html-sandbox=""
        data-page-block-capture=""
        style={{ display: 'block', flex: 1, minHeight: live ? 80 : 0, width: '100%', height: '100%' }}
      />
      {error ? (
        <div data-testid="html-sandbox-error" style={{ color: 'var(--biu-color-danger)', fontSize: 12, padding: 8 }}>
          {error}
        </div>
      ) : null}
    </>
  )
}

export const name = 'page-html-blocks'
export const inject = ['pageEditor']

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
  selected?: boolean
}

function selectBorder(_on?: boolean) {
  return 'none'
}

/* ---------------- shared bits ---------------- */

const field = {
  width: '100%',
  boxSizing: 'border-box' as const,
  border: 'none',
  outline: 'none',
  background: 'transparent',
  color: 'inherit',
  font: 'inherit',
}

/** 源码编辑区。草稿在本地，避免每次回车写回 pageBlock 把光标甩到最后。 */
function SourceEditor({
  html,
  onChange,
  compile,
}: {
  html: string
  onChange: (v: string) => void
  compile?: ReturnType<typeof compileHtmlSource>
}) {
  const [draft, setDraft] = useState(html)
  const focused = useRef(false)
  const draftRef = useRef(draft)
  const htmlRef = useRef(html)
  const onChangeRef = useRef(onChange)
  draftRef.current = draft
  htmlRef.current = html
  onChangeRef.current = onChange
  useEffect(() => {
    if (!focused.current) setDraft(html)
  }, [html])
  useEffect(
    () => () => {
      if (draftRef.current !== htmlRef.current) onChangeRef.current(draftRef.current)
    },
    [],
  )
  const flush = () => {
    if (draftRef.current !== htmlRef.current) onChangeRef.current(draftRef.current)
  }
  return (
    <>
    <Textarea
      data-testid="html-source"
      data-page-block-capture=""
      data-biu-ignore
      spellCheck={false}
      value={draft}
      onFocus={() => {
        focused.current = true
      }}
      onBlur={() => {
        focused.current = false
        flush()
      }}
      onKeyDown={(event) => {
        event.stopPropagation()
      }}
      onChange={(e) => setDraft(e.target.value)}
      placeholder={'<div style="...">…</div>'}
      style={{
        ...field,
        width: '100%',
        minHeight: 160,
        padding: 10,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
        fontSize: 12,
        lineHeight: 1.55,
        color: 'var(--biu-color-text)',
        background: 'var(--biu-color-bg)',
        border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
        borderRadius: 10,
        resize: 'vertical',
      }}
    />
    {compile ? (
      <div
        data-testid="html-compile"
        data-ok={compile.ok ? '1' : '0'}
        style={{ marginTop: 6, fontSize: 11, color: compile.ok ? 'var(--biu-color-ok)' : 'var(--biu-color-danger)' }}
      >
        {compile.ok ? `编译通过 · ${compile.mode}` : `编译失败 · ${compile.error}`}
      </div>
    ) : null}
    </>
  )
}

const MAG_INK = '#0a0a0a'
const MAG_PAPER = '#ece7dc'
const MAG_BLUE = '#1c7cff'

function HtmlKindIcon() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="var(--biu-color-ink-purple)" aria-hidden>
      <path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M5.4 3.55 1.85 8l3.55 4.45a.75.75 0 0 1-1.18.9L.32 8.48a.75.75 0 0 1 0-.96L4.22 2.65a.75.75 0 1 1 1.18.9Zm5.2 0 3.55 4.45-3.55 4.45a.75.75 0 0 0 1.18.9l3.9-4.87a.75.75 0 0 0 0-.96L11.78 2.65a.75.75 0 1 0-1.18.9ZM9.7 2.48a.75.75 0 0 1 .32 1.01L7.08 12.7a.75.75 0 1 1-1.34-.7L8.68 2.8a.75.75 0 0 1 1.02-.32Z"
      />
    </svg>
  )
}

function hold(event: { preventDefault: () => void }) {
  event.preventDefault()
}

function htmlBlockTitle(data: Record<string, unknown>, fallback: string) {
  return String(data.title ?? '').trim() || fallback
}

function NavTitle({
  value,
  readOnly,
  testId,
  onCommit,
}: {
  value: string
  readOnly?: boolean
  testId: string
  onCommit?: (next: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])
  const commit = () => {
    const next = draft.trim()
    if (!next || next === value) {
      setDraft(value)
      return
    }
    onCommit?.(next)
  }
  return (
    <input
      className="page-block-expand-nav-title"
      data-testid={testId}
      data-biu-ignore
      readOnly={readOnly || !onCommit}
      value={draft}
      placeholder="标题"
      aria-label="标题"
      onMouseDown={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}

function HtmlDeckOverlay({
  slides,
  index,
  onIndex,
  onClose,
}: {
  slides: ReturnType<typeof collectHtmlSlides>
  index: number
  onIndex: (next: number) => void
  onClose: () => void
}) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const boxRef = useRef<HTMLDivElement | null>(null)
  const slide = slides[index]
  const total = slides.length
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const action = htmlDeckKeyAction(event.key)
      if (action == null) return
      if (action === 'close') {
        closeRef.current()
        return
      }
      event.preventDefault()
      event.stopPropagation()
      if (action === 'first') onIndex(0)
      else if (action === 'last') onIndex(Math.max(0, total - 1))
      else onIndex(stepHtmlDeck(index, action, total))
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [index, onIndex, total])

  useEffect(() => {
    const root = document.documentElement
    let gone = false
    void Promise.resolve(root.requestFullscreen?.({ navigationUI: 'hide' })).catch(() => {})
    const onFs = () => {
      if (gone) return
      if (document.fullscreenElement) return
      closeRef.current()
    }
    document.addEventListener('fullscreenchange', onFs)
    return () => {
      gone = true
      document.removeEventListener('fullscreenchange', onFs)
      if (document.fullscreenElement) void document.exitFullscreen?.()
    }
  }, [])

  if (!slide) return null
  const stamped = slide.kind === 'html' ? stampHtmlSource(slide.html, `deck-${index}`, name) : ''
  const fill = {
    position: 'absolute' as const,
    inset: 0,
    width: '100%',
    height: '100%',
    maxWidth: 'none',
    maxHeight: 'none',
    minWidth: 0,
    minHeight: 0,
    border: 'none',
    boxSizing: 'border-box' as const,
  }
  return createPortal(
    <div
      ref={boxRef}
      data-testid="html-deck"
      data-biu-ignore
      tabIndex={0}
      style={{
        position: 'fixed',
        inset: 0,
        width: '100%',
        height: '100%',
        maxWidth: 'none',
        zIndex: 2147483646,
        display: 'flex',
        flexDirection: 'column',
        background: '#0b0b12',
        color: '#e6edf3',
        font: '13px/1.4 ui-sans-serif, system-ui, sans-serif',
      }}
    >
      <style>{`[data-testid="html-deck"]:fullscreen,[data-testid="html-deck"]:-webkit-full-screen{inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important}[data-testid="html-deck-slide"]>*{width:100%!important;height:100%!important;max-width:none!important;box-sizing:border-box}`}</style>
      <div className="page-block-expand-nav" data-testid="html-deck-expand-nav" data-biu-ignore>
        <div className="page-block-expand-nav-type" data-testid="html-deck-type-icon" title="HTML" aria-label="HTML">
          <HtmlKindIcon />
        </div>
        <NavTitle
          value={String(slide?.title ?? '').trim() || (slide?.kind === 'htmlframe' ? '动态HTML' : '静态HTML')}
          testId="html-deck-title"
        />
        <div className="page-block-expand-nav-tools">
          <button
            type="button"
            className="page-slide-icon"
            disabled={index <= 0}
            style={index <= 0 ? { opacity: 0.35, cursor: 'default' } : undefined}
            onClick={() => onIndex(stepHtmlDeck(index, -1, total))}
            aria-label="上一张"
          >
            <ChevronLeftIcon aria-hidden className="page-slide-ico" />
          </button>
          <span data-testid="html-deck-index" style={{ minWidth: 48, textAlign: 'center', fontSize: 12, color: 'var(--biu-color-text-muted)' }}>
            {index + 1} / {total}
          </span>
          <button
            type="button"
            className="page-slide-icon"
            disabled={index >= total - 1}
            style={index >= total - 1 ? { opacity: 0.35, cursor: 'default' } : undefined}
            onClick={() => onIndex(stepHtmlDeck(index, 1, total))}
            aria-label="下一张"
          >
            <ChevronRightIcon aria-hidden className="page-slide-ico" />
          </button>
          <button
            type="button"
            className="page-slide-icon"
            data-page-block-expand=""
            data-testid="html-deck-exit"
            title="退出放映"
            aria-label="退出放映"
            onClick={onClose}
          >
            <ArrowsPointingInIcon aria-hidden className="page-slide-ico" />
          </button>
        </div>
      </div>
      <div
        data-testid="html-deck-stage"
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          width: '100%',
          height: '100%',
          overflow: 'hidden',
          boxSizing: 'border-box',
        }}
      >
        {slide.kind === 'htmlframe' ? (
          <div data-testid="html-deck-slide" style={{ ...fill, background: MAG_INK }}>
            <HtmlSandbox html={slide.html} live />
          </div>
        ) : (
          <div
            data-testid="html-deck-slide"
            style={{ ...fill, overflow: 'auto', background: 'transparent' }}
            dangerouslySetInnerHTML={{ __html: stamped }}
          />
        )}
      </div>
    </div>,
    document.body,
  )
}

function useHtmlDeck(
  hostRef: { current: HTMLElement | null },
  kind: 'html' | 'htmlframe',
  html: string,
  opts?: { width?: unknown; height?: unknown; deck?: boolean; title?: string },
) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [slides, setSlides] = useState<ReturnType<typeof collectHtmlSlides>>([])
  const width = opts?.width
  const height = opts?.height
  const title = opts?.title
  const deck = htmlDeckEnabled(opts?.deck)

  useLayoutEffect(() => {
    const host = hostRef.current?.closest('[data-page-block]') ?? null
    bindHtmlSlide(host, {
      kind,
      html,
      deck,
      ...(title ? { title } : {}),
      ...(width != null && width !== '' ? { width: width as number | string } : {}),
      ...(height != null && height !== '' ? { height: height as number | string } : {}),
    })
    return () => bindHtmlSlide(host, null)
  }, [hostRef, html, kind, width, height, deck, title])

  const start = () => {
    const host = hostRef.current?.closest('[data-page-block]') ?? null
    const list = collectHtmlSlides(host)
    if (!list.length) return
    setSlides(list)
    setIndex(htmlDeckIndex(list, host))
    setOpen(true)
  }

  const overlay = open ? (
    <HtmlDeckOverlay
      slides={slides.length ? slides : collectHtmlSlides(hostRef.current?.closest('[data-page-block]') ?? null)}
      index={index}
      onIndex={(next) => {
        const host = hostRef.current?.closest('[data-page-block]') ?? null
        setSlides(collectHtmlSlides(host))
        setIndex(next)
      }}
      onClose={() => setOpen(false)}
    />
  ) : null

  return { start, overlay }
}

function HeightGrip({
  boxRef,
  onHeight,
}: {
  boxRef: { current: HTMLElement | null }
  onHeight: (height: number) => void
}) {
  const drag = useRef<{ y: number; h: number } | null>(null)
  const onHeightRef = useRef(onHeight)
  onHeightRef.current = onHeight
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const start = drag.current
      if (!start) return
      event.preventDefault()
      onHeightRef.current(Math.max(160, Math.round(start.h + event.clientY - start.y)))
    }
    const up = () => {
      drag.current = null
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
  }, [])
  return (
    <button
      type="button"
      data-testid="html-size-grip"
      data-biu-ignore
      tabIndex={-1}
      title="拖动调整高度"
      aria-label="拖动调整高度"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const box = boxRef.current
        if (!box) return
        drag.current = { y: event.clientY, h: box.offsetHeight }
      }}
      style={{
        appearance: 'none',
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 18,
        height: 10,
        margin: 0,
        padding: 0,
        cursor: 'ns-resize',
        border: 'none',
        borderRadius: 0,
        background: 'transparent',
      }}
    />
  )
}
function HtmlSideBar({
  editing,
  setEditing,
  ro,
  onExpand,
  deck,
  onDeck,
  sized,
  onResetSize,
  title,
  onTitle,
}: {
  editing: boolean
  setEditing: (v: boolean) => void
  ro: boolean
  onExpand: () => void
  deck: boolean
  onDeck?: (next: boolean) => void
  sized?: boolean
  onResetSize?: () => void
  title: string
  onTitle: (next: string) => void
}) {
  return (
    <div className="page-block-expand-nav" data-testid="html-side-bar" data-biu-ignore>
      <div className="page-block-expand-nav-type" data-testid="html-type-icon" title="HTML" aria-label="HTML">
        <HtmlKindIcon />
      </div>
      <NavTitle value={title} readOnly={ro} testId="html-title" onCommit={onTitle} />
      <div className="page-block-expand-nav-tools">
      {ro ? null : (
        <>
          <button
            type="button"
            className={`page-slide-icon${editing ? ' is-on' : ''}`}
            title={editing ? '预览' : '编辑'}
            aria-label={editing ? '预览' : '编辑'}
            aria-pressed={editing}
            data-testid="html-edit"
            onMouseDown={hold}
            onClick={() => setEditing(!editing)}
          >
            {editing ? (
              <EyeIcon aria-hidden className="page-slide-ico" />
            ) : (
              <CodeBracketIcon aria-hidden className="page-slide-ico" />
            )}
          </button>
          {sized ? (
            <button
              type="button"
              className="page-slide-icon"
              data-testid="html-size-auto"
              title="恢复自适应宽高"
              aria-label="恢复自适应宽高"
              onMouseDown={hold}
              onClick={() => onResetSize?.()}
            >
              <ViewfinderCircleIcon aria-hidden className="page-slide-ico" />
            </button>
          ) : null}
          <button
            type="button"
            className={`page-slide-icon${deck ? ' is-on' : ''}`}
            data-testid="html-deck-toggle"
            title={deck ? '已加入演示，点击移出' : '未加入演示，点击加入'}
            aria-label={deck ? '移出演示' : '加入演示'}
            aria-pressed={deck}
            onMouseDown={hold}
            onClick={() => onDeck?.(!deck)}
          >
            <PlayCircleIcon aria-hidden className="page-slide-ico" />
          </button>
        </>
      )}
      <button
        type="button"
        className="page-slide-icon"
        data-page-block-expand=""
        data-testid="html-deck-expand"
        title="放大放映"
        aria-label="放大放映"
        onMouseDown={hold}
        onClick={onExpand}
      >
        <ArrowsPointingOutIcon aria-hidden className="page-slide-ico" />
      </button>
      </div>
    </div>
  )
}

/* ============================================================
   1) kind=html：直接渲染（无 iframe，无脚本）——内容裸渲染，无外框
   ============================================================ */

const HTML_EDITORIAL_SAMPLE = `<div style="box-sizing:border-box;min-height:100%;height:100%;width:100%;font-family:'Helvetica Neue','Arial',sans-serif;background:${MAG_INK};border:2px solid ${MAG_PAPER};color:${MAG_PAPER};margin:0;display:flex;flex-direction:column">
  <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${MAG_PAPER};padding:8px 12px;padding-right:220px;font-size:11px;letter-spacing:.15em">
    <span style="font-weight:700">现代 ・ 美式</span><span style="font-weight:800">创立 2024</span>
  </div>
  <div style="background:${MAG_BLUE};color:#fff;font-size:34px;font-weight:900;line-height:1.05;padding:16px;letter-spacing:-.02em">丰富<br>排版，<br>不跑脚本。</div>
  <div style="display:flex;gap:0;flex:1">
    <div style="flex:1.4;padding:12px;font-size:13px;line-height:1.7;font-weight:500">夜间美式杂志网格。静态富排版，不执行脚本。纯 HTML / CSS，用来做卡片、表格、配色和干净的刊头。</div>
    <div style="flex:1;border-left:2px solid ${MAG_PAPER};display:flex;flex-direction:column;gap:6px;padding:12px;font-size:10px;font-weight:800">
      <span style="background:#ffd400;color:#0a0a0a;padding:2px 6px">静态</span>
      <span style="background:#ff2a6d;color:#fff;padding:2px 6px">无脚本</span>
      <span style="border:1.5px solid ${MAG_PAPER};padding:2px 6px">直出</span>
    </div>
  </div>
</div>`

const HTML_DIRECT_SAMPLE = HTML_EDITORIAL_SAMPLE

const HTML_FILL_CSS = `.html-direct-fill-inner{height:100%;min-height:100%}.html-direct-fill-inner>:first-child{height:100%!important;min-height:100%;box-sizing:border-box}`

function HtmlDirectCard({ data, update, writable, selected }: BlockProps) {
  const ro = !writable
  const source = useHtmlSource(data, update, HTML_DIRECT_SAMPLE)
  const html = source.html
  const width = data.width
  const height = data.height
  const fill = htmlLooksFillLayout(html)
  const fillHost = fill && (height == null || height === '')
  const sized = (width != null && width !== '') || (height != null && height !== '') || fillHost
  const deckOn = htmlDeckEnabled(data.deck)
  const title = htmlBlockTitle(data, '静态HTML')
  const [editing, setEditing] = useState(false)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const deck = useHtmlDeck(hostRef, 'html', html, { width, height, deck: deckOn, title })
  const stamped = useMemo(
    () => stampHtmlSource(html, htmlBlockKey(hostRef.current?.closest('[data-page-block]') ?? null, html), name),
    [html],
  )
  const compiled = useMemo(() => compileHtmlSource(html), [html])

  return (
    <ReUI>
    <div
      ref={hostRef}
      data-testid="page-html-direct"
      data-html-selected={selected ? '1' : undefined}
      className={fill ? 'html-direct-fill' : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: cssBoxSize(width) ?? '100%',
        height: cssBoxSize(height) ?? (fillHost ? HTML_FILL_HOST_PX : undefined),
        maxWidth: '100%',
        overflow: 'visible',
        boxSizing: 'border-box',
        border: selectBorder(selected),
        borderRadius: 0,
      }}
    >
      {fill ? <style>{HTML_FILL_CSS}</style> : null}
      <HtmlSideBar
        editing={editing}
        setEditing={setEditing}
        ro={ro}
        onExpand={deck.start}
        deck={deckOn}
        onDeck={(next) => update({ deck: next })}
        sized={sized}
        onResetSize={() => update({ width: undefined, height: undefined })}
        title={title}
        onTitle={(next) => update({ title: next })}
      />
      {editing ? (
        <SourceEditor html={html} onChange={source.save} compile={compiled} />
      ) : (
        <div
          className={fill ? 'html-direct-fill-inner' : undefined}
          style={{ flex: 1, minHeight: 0, overflow: sized ? 'auto' : undefined, overflowX: sized ? undefined : 'auto', height: fill || sized ? '100%' : undefined }}
          dangerouslySetInnerHTML={{ __html: stamped }}
        />
      )}
      {ro || editing ? null : <HeightGrip boxRef={hostRef} onHeight={(height) => update({ height })} />}
      {deck.overlay}
    </div>
    </ReUI>
  )
}

/* ============================================================
   2) kind=htmlframe：文档内 Shadow 沙箱（可跑脚本 / React），继承全局 --biu-* 与样式表
   ============================================================ */

const HTML_FRAME_SAMPLE = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:${MAG_INK};color:${MAG_PAPER}}
@keyframes mag-pulse{50%{opacity:.35}}
@keyframes mag-rail{from{transform:translateX(0)}to{transform:translateX(-50%)}}
.mag{font-family:'Helvetica Neue',Arial,sans-serif;background:${MAG_INK};border:2px solid ${MAG_PAPER};color:${MAG_PAPER};margin:0;min-height:100%;box-sizing:border-box;display:flex;flex-direction:column}
.mag-head{display:flex;justify-content:space-between;align-items:center;border-bottom:2px solid ${MAG_PAPER};padding:8px 12px;padding-right:220px;font-size:11px;letter-spacing:.15em}
.mag-hero{background:${MAG_BLUE};color:#fff;font-size:34px;font-weight:900;line-height:1.05;padding:16px;letter-spacing:-.02em}
.mag-body{display:flex;gap:0;flex:1}
.mag-copy{flex:1.4;padding:12px;font-size:13px;line-height:1.7;font-weight:500}
.mag-side{flex:1;border-left:2px solid ${MAG_PAPER};display:flex;flex-direction:column;gap:6px;padding:12px;font-size:10px;font-weight:800}
.mag-live{display:inline-flex;align-items:center;gap:6px}
.mag-dot{width:7px;height:7px;border-radius:50%;background:#ff2a6d;animation:mag-pulse 1.1s ease-in-out infinite}
.mag-rail-wrap{overflow:hidden;border-top:2px solid ${MAG_PAPER}}
.mag-rail{display:flex;width:max-content;animation:mag-rail 12s linear infinite;font-size:10px;font-weight:800;letter-spacing:.18em;padding:6px 0}
.mag-rail span{padding:0 18px;white-space:nowrap}
.mag-hit{cursor:pointer;background:#ffd400;color:#0a0a0a;padding:2px 6px;border:0;font:inherit;font-weight:800}
</style></head><body>
<div class="mag">
  <div class="mag-head"><span style="font-weight:700">现代 ・ 美式</span><span class="mag-live"><span class="mag-dot"></span><span id="mag-clock" style="font-weight:800">创立 2024</span></span></div>
  <div class="mag-hero">丰富<br>排版，<br><span id="mag-line">会跑脚本。</span></div>
  <div class="mag-body">
    <div class="mag-copy">同一夜间刊头，沙箱里跑脚本：时钟、词条轮播、点击计数。版式与静态块一致，只是内容会动。</div>
    <div class="mag-side">
      <button type="button" class="mag-hit" id="mag-hit">动态 · 点我 <span id="mag-n">0</span></button>
      <span style="background:#ff2a6d;color:#fff;padding:2px 6px">有脚本</span>
      <span style="border:1.5px solid ${MAG_PAPER};padding:2px 6px">沙箱</span>
    </div>
  </div>
  <div class="mag-rail-wrap"><div class="mag-rail" id="mag-rail"><span>NIGHT ISSUE</span><span>LIVE TYPE</span><span>NEW YORK GRID</span><span>NIGHT ISSUE</span><span>LIVE TYPE</span><span>NEW YORK GRID</span></div></div>
</div>
<script>
(function(){
  var lines=['会跑脚本。','会动。','夜间刊。'];
  var i=0,n=0;
  var clock=document.getElementById('mag-clock');
  var line=document.getElementById('mag-line');
  var hit=document.getElementById('mag-hit');
  var count=document.getElementById('mag-n');
  function tick(){
    var d=new Date();
    var hh=String(d.getHours()).padStart(2,'0');
    var mm=String(d.getMinutes()).padStart(2,'0');
    var ss=String(d.getSeconds()).padStart(2,'0');
    if(clock) clock.textContent=hh+':'+mm+':'+ss;
  }
  tick();
  setInterval(tick,1000);
  setInterval(function(){
    i=(i+1)%lines.length;
    if(line) line.textContent=lines[i];
  },1800);
  if(hit) hit.addEventListener('click',function(){
    n+=1;
    if(count) count.textContent=String(n);
  });
})();
</script>
</body></html>`

function HtmlFrameCard({ data, update, writable, selected }: BlockProps) {
  const ro = !writable
  const source = useHtmlSource(data, update, HTML_FRAME_SAMPLE)
  const html = source.html
  const height = Number(data.height) || 300
  const deckOn = htmlDeckEnabled(data.deck)
  const title = htmlBlockTitle(data, '动态HTML')
  const [editing, setEditing] = useState(false)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const deck = useHtmlDeck(hostRef, 'htmlframe', html, { height, deck: deckOn, title })
  const compiled = useMemo(() => compileHtmlSource(html), [html])

  return (
    <ReUI>
    <div
      ref={hostRef}
      data-testid="page-html-frame"
      data-html-selected={selected ? '1' : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: '100%',
        height,
        overflow: 'visible',
        boxSizing: 'border-box',
        border: selectBorder(selected),
        borderRadius: 0,
      }}
    >
      <HtmlSideBar
        editing={editing}
        setEditing={setEditing}
        ro={ro}
        onExpand={deck.start}
        deck={deckOn}
        onDeck={(next) => update({ deck: next })}
        title={title}
        onTitle={(next) => update({ title: next })}
      />
      {editing ? (
        <SourceEditor html={html} onChange={source.save} compile={compiled} />
      ) : (
        <HtmlSandbox
          html={html}
          live
          onStamp={(root) => {
            const host = hostRef.current?.closest('[data-page-block]') ?? null
            const key = htmlBlockKey(host, html)
            const body = root.querySelector('[data-html-sandbox-body]')
            if (body instanceof HTMLElement) stampHtmlPickSurfaces(body, `${key}-doc`, { plugin: name })
          }}
        />
      )}
      {ro || editing ? null : <HeightGrip boxRef={hostRef} onHeight={(height) => update({ height })} />}
      {deck.overlay}
    </div>
    </ReUI>
  )
}

function htmlBlockAssets(data: Record<string, unknown>) {
  const out: string[] = []
  if (typeof data.file === 'string') out.push(data.file)
  const html = String(data.html ?? '')
  for (const match of html.matchAll(/<(?:img|a|source|video|audio)\b[^>]*?\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
    out.push(match[1] ?? '')
  }
  return out
}

/* ---------------- apply ---------------- */

export function apply(ctx: {
  pageEditor: {
    registerBlock: (spec: {
      kind: string
      plugin: string
      label: string
      blockType?: string
      blockTypeLabel?: string
      hint?: string
      aliases?: string[]
      defaults?: Record<string, unknown> | (() => Record<string, unknown>)
      View: (props: BlockProps) => unknown
    }) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'html',
    plugin: name,
    label: '静态HTML',
    blockType: 'html',
    blockTypeLabel: 'HTML',
    hint: 'HTML/CSS 卡片和刊头，不跑脚本；源码必须 db_doc 附件，围栏只写 {"file":"assets/….html"}，写进围栏会被覆盖',
    aliases: ['html', 'html直', '静态html', '排版', '直接渲染', '静态渲染', '静态演示'],
    assets: htmlBlockAssets,
    defaults: () => ({ file: newHtmlFile(), deck: true, title: '静态HTML' }),
    View: HtmlDirectCard,
  })
  ctx.pageEditor.registerBlock({
    kind: 'htmlframe',
    plugin: name,
    label: '动态HTML',
    blockType: 'html',
    blockTypeLabel: 'HTML',
    hint: '文档内沙箱跑脚本/React，继承全局样式；源码必须 db_doc 附件，围栏只写 {"file":"assets/….html"}，写进围栏会被覆盖',
    aliases: ['iframe', 'htmlf', 'frame', '幻灯片', 'slide', '沙箱', '小网页', '动态演示'],
    assets: htmlBlockAssets,
    defaults: () => ({ file: newHtmlFile(), height: 300, deck: true, title: '动态HTML' }),
    View: HtmlFrameCard,
  })
}
