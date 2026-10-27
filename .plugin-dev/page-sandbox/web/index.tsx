import { Input, ReUI } from '@biu/reui'
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands'
import { javascript } from '@codemirror/lang-javascript'
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { EditorState } from '@codemirror/state'
import { EditorView, drawSelection, keymap, lineNumbers } from '@codemirror/view'
import {
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  CodeBracketIcon,
  CubeTransparentIcon,
  EyeIcon,
} from '@heroicons/react/16/solid'
import { tags } from '@lezer/highlight'
import { createPortal } from 'react-dom'
import { compileHtmlSource } from '../shared/compile.ts'
import { bindHtmlSlide, collectHtmlSlides, cssBoxSize, htmlDeckEnabled, htmlDeckIndex, htmlDeckKeyAction, htmlLooksFillLayout, stepHtmlDeck } from './html-deck.ts'
import { mountHtmlSandbox, unmountHtmlSandbox } from './sandbox.ts'
import { htmlBlockKey, stampHtmlPickSurfaces } from './stamp-picks.ts'

const React = globalThis.React
const { useEffect, useLayoutEffect, useMemo, useRef, useState } = React

function assetName(file: string) {
  return file.replace(/^assets\//, '')
}

function assetEtag(raw: string) {
  return raw.replace(/^W\//, '').replaceAll('"', '')
}

async function loadHtmlAsset(file: string, fallback: string, bust = false) {
  const name = assetName(file)
  const res = await fetch(`/api/page/file/${encodeURIComponent(name)}${bust ? `?t=${Date.now()}` : ''}`)
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
  const applyInline = (next: string) => {
    if (next === htmlRef.current) return
    htmlRef.current = next
    setHtml(next)
  }
  useEffect(() => {
    if (file) return
    applyInline(inline || sample)
  }, [file, inline, sample])
  useEffect(() => {
    if (!file) return
    let gone = false
    void loadHtmlAsset(file, htmlRef.current || inline || sample, rev > 0).then((loaded) => {
      if (gone) return
      etagRef.current = loaded.etag
      htmlRef.current = loaded.html
      setHtml(loaded.html)
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
  const reload = () => {
    if (file) {
      setRev((n) => n + 1)
      return
    }
    applyInline(inline || sample)
  }
  return { file, html, save, reload }
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
    let mo: MutationObserver | undefined
    try {
      mountHtmlSandbox(root, html, { live })
      setError('')
      onStamp?.(root)
      const target = root.querySelector('[data-html-sandbox-body], [data-html-react-root]')
      if (target && onStamp) {
        mo = new MutationObserver(() => onStamp(root))
        mo.observe(target, { childList: true, subtree: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    return () => {
      mo?.disconnect()
      unmountHtmlSandbox(root)
    }
  }, [html, live])
  return (
    <>
      <div
        ref={hostRef}
        data-testid="page-html-sandbox"
        data-html-sandbox=""
        data-page-block-capture=""
        style={{ display: 'block', width: '100%', height: '100%', minHeight: live ? 80 : undefined, overflow: 'auto' }}
      />
      {error ? (
        <div data-testid="html-sandbox-error" style={{ color: 'var(--biu-color-danger)', fontSize: 12, padding: 8 }}>
          {error}
        </div>
      ) : null}
    </>
  )
}

export const name = 'page-sandbox'
export const inject = ['pageEditor']

type BlockProps = {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
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

const cmHighlight = HighlightStyle.define([
  { tag: tags.heading, color: 'var(--biu-color-text)', fontWeight: '700' },
  { tag: tags.strong, fontWeight: '700' },
  { tag: tags.emphasis, fontStyle: 'italic' },
  { tag: tags.comment, color: 'var(--biu-color-text-muted)' },
  { tag: tags.keyword, color: 'var(--biu-color-emphasis)' },
  { tag: tags.string, color: 'var(--biu-color-ok)' },
  { tag: tags.number, color: 'var(--biu-color-warning)' },
  { tag: tags.bool, color: 'var(--biu-color-emphasis)' },
  { tag: tags.null, color: 'var(--biu-color-emphasis)' },
  { tag: tags.meta, color: 'var(--biu-color-text-muted)' },
  { tag: tags.className, color: 'var(--biu-color-ink-purple)' },
  { tag: tags.function(tags.variableName), color: 'var(--biu-color-ink-purple)' },
])

const cmTheme = EditorView.theme({
  '&': {
    background: 'transparent',
    color: 'var(--biu-color-text)',
    fontSize: '12px',
    height: '100%',
  },
  '&.cm-editor': { outline: 'none', height: '100%' },
  '.cm-scroller': { fontFamily: 'var(--font-mono)', lineHeight: '1.55', overflow: 'auto' },
  '.cm-content': { caretColor: 'var(--biu-color-text)', padding: '10px 8px 16px', minHeight: '160px' },
  '.cm-gutters': {
    background: 'transparent',
    border: 'none',
    color: 'var(--biu-color-text-muted)',
  },
  '.cm-activeLine': { background: 'color-mix(in srgb, var(--biu-color-bg-hover) 70%, transparent)' },
  '.cm-cursor': { borderLeftColor: 'var(--biu-color-text)' },
  '.cm-content ::selection': {
    background: 'color-mix(in srgb, var(--biu-color-emphasis) 40%, transparent)',
    color: 'inherit',
  },
})

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
  const host = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const focused = useRef(false)
  const draftRef = useRef(html)
  const htmlRef = useRef(html)
  const onChangeRef = useRef(onChange)
  htmlRef.current = html
  onChangeRef.current = onChange
  useEffect(() => {
    const el = host.current
    if (!el) return
    const view = new EditorView({
      parent: el,
      state: EditorState.create({
        doc: html,
        extensions: [
          history(),
          drawSelection(),
          lineNumbers(),
          EditorView.lineWrapping,
          cmTheme,
          syntaxHighlighting(cmHighlight),
          javascript({ jsx: true, typescript: true }),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged) return
            draftRef.current = update.state.doc.toString()
          }),
        ],
      }),
    })
    viewRef.current = view
    draftRef.current = view.state.doc.toString()
    return () => {
      if (draftRef.current !== htmlRef.current) onChangeRef.current(draftRef.current)
      view.destroy()
      viewRef.current = null
    }
  }, [])
  useEffect(() => {
    const view = viewRef.current
    if (!view || focused.current) return
    if (html === view.state.doc.toString()) return
    draftRef.current = html
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: html },
    })
  }, [html])
  const flush = () => {
    if (draftRef.current !== htmlRef.current) onChangeRef.current(draftRef.current)
  }
  return (
    <>
    <div
      ref={host}
      data-testid="html-source"
      data-page-block-capture=""
      data-biu-ignore
      className="cm-editor"
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
      style={{
        ...field,
        minHeight: 0,
        height: '100%',
        border: 'none',
        borderRadius: 0,
        overflow: 'hidden',
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

const chromeIcon = {
  width: 14,
  height: 14,
  flexShrink: 0,
  color: 'var(--biu-color-icon)',
} as const

function sandboxTitle(raw: unknown) {
  const text = typeof raw === 'string' ? raw.trim() : ''
  return text || 'Sandbox'
}

const barBtn: Record<string, unknown> = {
  cursor: 'pointer',
  border: 'none',
  borderRadius: 6,
  padding: '4px 8px',
  background: 'transparent',
  color: '#c9cdd6',
  fontWeight: 700,
  fontSize: 11,
  lineHeight: '16px',
  display: 'inline-flex',
  alignItems: 'center',
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
  const [navHot, setNavHot] = useState(false)
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
        <div data-testid="html-deck-slide" style={{ ...fill, background: 'var(--biu-color-bg)' }}>
          <HtmlSandbox html={slide.html} live />
        </div>
      </div>
      <div
        data-testid="html-deck-nav"
        onMouseEnter={() => setNavHot(true)}
        onMouseLeave={() => setNavHot(false)}
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 2,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          height: 96,
          padding: '0 16px 18px',
          background: navHot ? 'linear-gradient(transparent, rgba(0,0,0,.55))' : 'transparent',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            opacity: navHot ? 1 : 0,
            transition: 'opacity 160ms ease',
            pointerEvents: navHot ? 'auto' : 'none',
          }}
        >
          <button type="button" style={{ ...barBtn, ...(index <= 0 ? { opacity: 0.35, cursor: 'default' } : {}) }} disabled={index <= 0} onClick={() => onIndex(stepHtmlDeck(index, -1, total))} aria-label="上一张">
            上一张
          </button>
          <span data-testid="html-deck-index" style={{ color: '#8b93a7', minWidth: 64, textAlign: 'center' }}>
            {index + 1} / {total}
          </span>
          <button
            type="button"
            style={{ ...barBtn, ...(index >= total - 1 ? { opacity: 0.35, cursor: 'default' } : {}) }}
            disabled={index >= total - 1}
            onClick={() => onIndex(stepHtmlDeck(index, 1, total))}
            aria-label="下一张"
          >
            下一张
          </button>
          <button type="button" data-page-block-expand="" style={{ ...barBtn, marginLeft: 12 }} onClick={onClose} title="退出放映" aria-label="退出放映">
            <ArrowsPointingInIcon style={chromeIcon} />
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function useHtmlDeck(
  hostRef: { current: HTMLElement | null },
  kind: 'sandbox',
  html: string,
  opts?: { width?: unknown; height?: unknown; deck?: boolean },
) {
  const [open, setOpen] = useState(false)
  const [index, setIndex] = useState(0)
  const [slides, setSlides] = useState<ReturnType<typeof collectHtmlSlides>>([])
  const width = opts?.width
  const height = opts?.height
  const deck = htmlDeckEnabled(opts?.deck)

  useLayoutEffect(() => {
    const host = hostRef.current?.closest('[data-page-block]') ?? null
    bindHtmlSlide(host, {
      kind,
      html,
      deck,
      ...(width != null && width !== '' ? { width: width as number | string } : {}),
      ...(height != null && height !== '' ? { height: height as number | string } : {}),
    })
    return () => bindHtmlSlide(host, null)
  }, [hostRef, html, kind, width, height, deck])

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

const SANDBOX_DEFAULT_HEIGHT = 280

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
const chromeIconBtn: Record<string, unknown> = {
  cursor: 'pointer',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  margin: 0,
  border: 0,
  borderRadius: 6,
  padding: 0,
  background: 'transparent',
  color: 'var(--biu-color-text-subtle)',
  font: 'inherit',
}

function SandboxBar({
  title,
  onTitle,
  tab,
  onTab,
  ro,
  onRefresh,
  onExpand,
}: {
  title: string
  onTitle: (next: string) => void
  tab: 'preview' | 'code'
  onTab: (next: 'preview' | 'code') => void
  ro: boolean
  onRefresh: () => void
  onExpand: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  useEffect(() => {
    if (!editing) setDraft(title)
  }, [title, editing])
  const commit = () => {
    const next = sandboxTitle(draft)
    setDraft(next)
    setEditing(false)
    if (next !== title) onTitle(next)
  }
  const tabBtn = (id: 'preview' | 'code', label: string, Icon: typeof EyeIcon) => (
    <button
      type="button"
      tabIndex={-1}
      data-testid={id === 'preview' ? 'sandbox-tab-preview' : 'sandbox-tab-code'}
      aria-pressed={tab === id}
      onClick={() => onTab(id)}
      style={{
        ...chromeIconBtn,
        padding: '4px 10px',
        background: tab === id ? 'var(--biu-color-bg-hover)' : 'transparent',
        color: tab === id ? 'var(--biu-color-text)' : 'var(--biu-color-text-muted)',
        fontSize: 'var(--biu-font-size-3)',
        fontWeight: 'var(--biu-font-weight-medium)',
      }}
    >
      <Icon style={chromeIcon} />
      {label}
    </button>
  )
  return (
    <div
      data-testid="sandbox-bar"
      data-biu-ignore
      style={{
        display: 'grid',
        gridTemplateColumns: '1fr auto 1fr',
        alignItems: 'center',
        gap: 8,
        padding: '4px 8px',
        borderBottom: 'var(--biu-stroke-width) solid var(--biu-color-border)',
        background: 'var(--biu-color-bg)',
        color: 'var(--biu-color-text)',
      }}
    >
      {editing && !ro ? (
        <Input
          data-testid="sandbox-title-input"
          data-page-block-capture=""
          aria-label="Sandbox 名称"
          value={draft}
          autoFocus
          onChange={(event) => setDraft((event.target as HTMLInputElement).value)}
          onBlur={commit}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === 'Enter') {
              event.preventDefault()
              ;(event.target as HTMLInputElement).blur()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setDraft(title)
              setEditing(false)
            }
          }}
          style={{
            minWidth: 0,
            height: 'var(--biu-size-control-md)',
            margin: 0,
            border: 0,
            background: 'transparent',
            color: 'var(--biu-color-text)',
            fontSize: 'var(--biu-font-size-3)',
            fontWeight: 'var(--biu-font-weight-medium)',
            outline: 'none',
          }}
        />
      ) : (
        <button
          type="button"
          data-testid="sandbox-title"
          title={ro ? title : '改名称'}
          aria-label={ro ? title : '改名称'}
          disabled={ro}
          onClick={() => {
            if (ro) return
            setDraft(title)
            setEditing(true)
          }}
          style={{
            ...chromeIconBtn,
            justifyContent: 'flex-start',
            minWidth: 0,
            padding: 0,
            color: 'var(--biu-color-text-subtle)',
            fontSize: 'var(--biu-font-size-3)',
            fontWeight: 'var(--biu-font-weight-medium)',
            cursor: ro ? 'default' : 'text',
          }}
        >
          <CubeTransparentIcon style={{ ...chromeIcon, color: 'var(--biu-color-ink-purple)' }} />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</span>
        </button>
      )}
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }} role="tablist" aria-label="Sandbox 视图">
        {tabBtn('preview', '预览', EyeIcon)}
        {ro ? null : tabBtn('code', '代码', CodeBracketIcon)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
        <button
          type="button"
          tabIndex={-1}
          data-testid="sandbox-refresh"
          title="刷新"
          aria-label="刷新"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onRefresh}
          style={{
            ...chromeIconBtn,
            width: 'var(--biu-size-control-md)',
            height: 'var(--biu-size-control-md)',
          }}
        >
          <ArrowPathIcon style={chromeIcon} />
        </button>
        <button
          type="button"
          tabIndex={-1}
          data-page-block-expand=""
          data-testid="html-deck-expand"
          title="放大"
          aria-label="放大"
          onMouseDown={(event) => event.preventDefault()}
          onClick={onExpand}
          style={{
            ...chromeIconBtn,
            width: 'var(--biu-size-control-md)',
            height: 'var(--biu-size-control-md)',
          }}
        >
          <ArrowsPointingOutIcon style={chromeIcon} />
        </button>
      </div>
    </div>
  )
}

const HTML_SAMPLE = `export default function App() {
  const [n, setN] = React.useState(0)
  return (
    <div style={{
      minHeight: '100%',
      height: '100%',
      boxSizing: 'border-box',
      padding: 16,
      background: 'var(--biu-color-bg)',
      color: 'var(--biu-color-text)',
      border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
      font: 'inherit',
    }}>
      <div style={{ fontSize: 'var(--biu-font-size-2)', color: 'var(--biu-color-text-muted)' }}>Sandbox</div>
      <div style={{ margin: '8px 0', fontSize: 'var(--biu-font-size-5)', fontWeight: 'var(--biu-font-weight-medium)' }}>
        用组件写这块
      </div>
      <p style={{ margin: 0, fontSize: 'var(--biu-font-size-4)', lineHeight: 1.6 }}>
        沙箱跑 React。不要 import react，用宿主注入的 React。颜色和间距走 --biu-*。
      </p>
      <button
        type="button"
        onClick={() => setN((v) => v + 1)}
        style={{
          marginTop: 12,
          padding: '4px 10px',
          border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
          background: 'var(--biu-color-bg)',
          color: 'var(--biu-color-text)',
          font: 'inherit',
          fontWeight: 'var(--biu-font-weight-medium)',
          cursor: 'pointer',
        }}
      >
        点过 {n} 次
      </button>
    </div>
  )
}
`

function HtmlCard({ data, update, writable }: BlockProps) {
  const ro = !writable
  const title = sandboxTitle(data.title)
  const source = useHtmlSource(data, update, HTML_SAMPLE)
  const html = source.html
  const width = data.width
  const height = data.height == null || data.height === '' ? SANDBOX_DEFAULT_HEIGHT : data.height
  const fill = htmlLooksFillLayout(html)
  const deckOn = htmlDeckEnabled(data.deck)
  const [tab, setTab] = useState<'preview' | 'code'>('preview')
  const [frame, setFrame] = useState(0)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const deck = useHtmlDeck(hostRef, 'sandbox', html, { width, height, deck: deckOn })
  const compiled = useMemo(() => compileHtmlSource(html), [html])
  const editing = tab === 'code'

  return (
    <ReUI>
    <div
      ref={hostRef}
      data-testid="page-html-block"
      className={fill ? 'html-direct-fill' : undefined}
      style={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        width: cssBoxSize(width) ?? '100%',
        height: cssBoxSize(height) ?? SANDBOX_DEFAULT_HEIGHT,
        maxWidth: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
        border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
        borderRadius: 10,
        background: 'var(--biu-color-bg)',
      }}
    >
      <SandboxBar
        title={title}
        onTitle={(next) => update({ title: next })}
        tab={tab}
        onTab={setTab}
        ro={ro}
        onRefresh={() => {
          source.reload()
          setFrame((n) => n + 1)
        }}
        onExpand={deck.start}
      />
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'auto' }}>
        {editing ? (
          <SourceEditor html={html} onChange={source.save} compile={compiled} />
        ) : (
          <HtmlSandbox
            key={frame}
            html={html}
            live
            onStamp={(root) => {
              const host = hostRef.current?.closest('[data-page-block]') ?? null
              const key = htmlBlockKey(host, html)
              const body = root.querySelector('[data-html-sandbox-body], [data-html-react-root]')
              if (body instanceof HTMLElement) stampHtmlPickSurfaces(body, `${key}-doc`, { plugin: name })
            }}
          />
        )}
        {ro ? null : <HeightGrip boxRef={hostRef} onHeight={(next) => update({ height: next })} />}
      </div>
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
    kind: 'sandbox',
    plugin: name,
    label: 'Sandbox',
    blockType: 'sandbox',
    blockTypeLabel: 'Sandbox',
    hint: '沙箱里跑 React 组件，继承 --biu-*',
    aliases: ['sandbox', '沙箱'],
    assets: htmlBlockAssets,
    defaults: () => ({ html: HTML_SAMPLE, deck: true, title: 'Sandbox', height: SANDBOX_DEFAULT_HEIGHT }),
    View: HtmlCard,
  })
}
