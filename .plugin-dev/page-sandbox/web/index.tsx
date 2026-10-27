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
import { compileSandboxSource } from '../shared/compile.ts'
import { mountSandbox, unmountSandbox } from './sandbox.ts'
import { sandboxBlockKey, stampSandboxPickSurfaces } from './stamp-picks.ts'

const React = globalThis.React
const { useEffect, useLayoutEffect, useMemo, useRef, useState } = React

function sandboxSourceOf(data: Record<string, unknown>, sample: string) {
  if (typeof data.source === 'string' && data.source) return data.source
  if (typeof data.html === 'string' && data.html) return data.html
  return sample
}

function useSandboxSource(
  data: Record<string, unknown>,
  update: (patch: Record<string, unknown>) => void,
  sample: string,
) {
  const inline = sandboxSourceOf(data, sample)
  const [source, setSource] = useState(inline)
  const sourceRef = useRef(source)
  sourceRef.current = source
  const applyInline = (next: string) => {
    if (next === sourceRef.current) return
    sourceRef.current = next
    setSource(next)
  }
  useEffect(() => {
    applyInline(inline || sample)
  }, [inline, sample])
  const save = (next: string) => {
    setSource(next)
    sourceRef.current = next
    update({ source: next })
  }
  const reload = () => {
    applyInline(inline || sample)
  }
  return { source, save, reload }
}

function SandboxPreview({
  source,
  onStamp,
}: {
  source: string
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
      mountSandbox(root, source)
      setError('')
      onStamp?.(root)
      const target = root.querySelector('[data-sandbox-root]')
      if (target && onStamp) {
        mo = new MutationObserver(() => onStamp(root))
        mo.observe(target, { childList: true, subtree: true })
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
    return () => {
      mo?.disconnect()
      unmountSandbox(root)
    }
  }, [source])
  return (
    <>
      <div
        ref={hostRef}
        data-testid="page-sandbox-preview"
        data-sandbox=""
        data-page-block-capture=""
        style={{ display: 'block', width: '100%', height: '100%', minHeight: 80, overflow: 'auto' }}
      />
      {error ? (
        <div data-testid="sandbox-error" style={{ color: 'var(--biu-color-danger)', fontSize: 12, padding: 8 }}>
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
  source,
  onChange,
  compile,
}: {
  source: string
  onChange: (v: string) => void
  compile?: ReturnType<typeof compileSandboxSource>
}) {
  const host = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const focused = useRef(false)
  const draftRef = useRef(source)
  const sourceRef = useRef(source)
  const onChangeRef = useRef(onChange)
  sourceRef.current = source
  onChangeRef.current = onChange
  useEffect(() => {
    const el = host.current
    if (!el) return
    const view = new EditorView({
      parent: el,
      state: EditorState.create({
        doc: source,
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
      if (draftRef.current !== sourceRef.current) onChangeRef.current(draftRef.current)
      view.destroy()
      viewRef.current = null
    }
  }, [])
  useEffect(() => {
    const view = viewRef.current
    if (!view || focused.current) return
    if (source === view.state.doc.toString()) return
    draftRef.current = source
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: source },
    })
  }, [source])
  const flush = () => {
    if (draftRef.current !== sourceRef.current) onChangeRef.current(draftRef.current)
  }
  return (
    <>
    <div
      ref={host}
      data-testid="sandbox-source"
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
        data-testid="sandbox-compile"
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

function cssBoxSize(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return `${Math.round(value)}px`
  if (typeof value !== 'string') return undefined
  const text = value.trim()
  return text || undefined
}

function sandboxLooksFillLayout(source: string) {
  const head = source.trim().slice(0, 1600)
  const pct = /\bheight\s*:\s*100%\b/i.test(head) || /\bheight\s*:\s*100vh\b/i.test(head)
  const clipped = /\boverflow\s*:\s*hidden\b/i.test(head)
  const abs = (source.match(/\bposition\s*:\s*absolute\b/gi) ?? []).length >= 3
  return (pct && clipped) || (pct && abs) || (clipped && abs)
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
      data-testid="sandbox-size-grip"
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
  expanded,
  onRefresh,
  onExpand,
}: {
  title: string
  onTitle: (next: string) => void
  tab: 'preview' | 'code'
  onTab: (next: 'preview' | 'code') => void
  ro: boolean
  expanded: boolean
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
          data-testid="sandbox-expand"
          title={expanded ? '缩小' : '放大'}
          aria-label={expanded ? '缩小' : '放大'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onExpand}
          style={{
            ...chromeIconBtn,
            width: 'var(--biu-size-control-md)',
            height: 'var(--biu-size-control-md)',
          }}
        >
          {expanded ? <ArrowsPointingInIcon style={chromeIcon} /> : <ArrowsPointingOutIcon style={chromeIcon} />}
        </button>
      </div>
    </div>
  )
}

const SANDBOX_SAMPLE = `export default function App() {
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

function SandboxCard({ data, update, writable }: BlockProps) {
  const ro = !writable
  const title = sandboxTitle(data.title)
  const live = useSandboxSource(data, update, SANDBOX_SAMPLE)
  const source = live.source
  const width = data.width
  const height = data.height == null || data.height === '' ? SANDBOX_DEFAULT_HEIGHT : data.height
  const fill = sandboxLooksFillLayout(source)
  const [tab, setTab] = useState<'preview' | 'code'>('preview')
  const [frame, setFrame] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const compiled = useMemo(() => compileSandboxSource(source), [source])
  const editing = tab === 'code'

  useEffect(() => {
    if (!expanded) return
    const root = hostRef.current
    void Promise.resolve(root?.requestFullscreen?.({ navigationUI: 'hide' })).catch(() => {})
    const onFs = () => {
      if (!document.fullscreenElement) setExpanded(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setExpanded(false)
    }
    document.addEventListener('fullscreenchange', onFs)
    window.addEventListener('keydown', onKey, true)
    return () => {
      document.removeEventListener('fullscreenchange', onFs)
      window.removeEventListener('keydown', onKey, true)
      if (document.fullscreenElement) void document.exitFullscreen?.()
    }
  }, [expanded])

  const card = (
    <div
      ref={hostRef}
      data-testid="page-sandbox-block"
      data-sandbox-expanded={expanded ? '1' : undefined}
      className={fill ? 'sandbox-fill' : undefined}
      style={{
        position: expanded ? 'fixed' : 'relative',
        inset: expanded ? 0 : undefined,
        zIndex: expanded ? 2147483646 : undefined,
        display: 'flex',
        flexDirection: 'column',
        width: expanded ? '100%' : cssBoxSize(width) ?? '100%',
        height: expanded ? '100%' : cssBoxSize(height) ?? SANDBOX_DEFAULT_HEIGHT,
        maxWidth: '100%',
        overflow: 'hidden',
        boxSizing: 'border-box',
        border: expanded ? 'none' : 'var(--biu-stroke-width) solid var(--biu-color-border)',
        borderRadius: expanded ? 0 : 10,
        background: 'var(--biu-color-bg)',
      }}
    >
      {expanded ? (
        <style>{`[data-testid="page-sandbox-block"]:fullscreen,[data-testid="page-sandbox-block"]:-webkit-full-screen{inset:0!important;width:100%!important;height:100%!important;max-width:none!important;max-height:none!important;display:flex!important;flex-direction:column!important}`}</style>
      ) : null}
      <SandboxBar
        title={title}
        onTitle={(next) => update({ title: next })}
        tab={tab}
        onTab={setTab}
        ro={ro}
        expanded={expanded}
        onRefresh={() => {
          live.reload()
          setFrame((n) => n + 1)
        }}
        onExpand={() => setExpanded((open) => !open)}
      />
      <div style={{ flex: 1, minHeight: 0, position: 'relative', overflow: 'auto' }}>
        {editing ? (
          <SourceEditor source={source} onChange={live.save} compile={compiled} />
        ) : (
          <SandboxPreview
            key={frame}
            source={source}
            onStamp={(root) => {
              const host = hostRef.current?.closest('[data-page-block]') ?? null
              const key = sandboxBlockKey(host, source)
              const body = root.querySelector('[data-sandbox-root]')
              if (body instanceof HTMLElement) stampSandboxPickSurfaces(body, `${key}-doc`, { plugin: name, includeRoot: false })
            }}
          />
        )}
        {ro || expanded ? null : <HeightGrip boxRef={hostRef} onHeight={(next) => update({ height: next })} />}
      </div>
    </div>
  )

  return <ReUI>{expanded ? createPortal(card, document.body) : card}</ReUI>
}

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
    defaults: () => ({ source: SANDBOX_SAMPLE, title: 'Sandbox', height: SANDBOX_DEFAULT_HEIGHT }),
    View: SandboxCard,
  })
}
