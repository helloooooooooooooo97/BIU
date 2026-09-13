const React = globalThis.React
const { useEffect, useRef, useState } = React
type CSSProperties = import('react').CSSProperties
import { EditorView, keymap, drawSelection } from '@codemirror/view'
import { Prec, EditorState } from '@codemirror/state'
import { StreamLanguage, HighlightStyle, syntaxHighlighting } from '@codemirror/language'
import { tags as t } from '@lezer/highlight'
import { TerminalBuffer, keyToPty } from './buffer.ts'
import { relockAncestors, unlockAncestors, watchZoom } from './zoom.ts'

export const name = 'page-terminal'
export const inject = ['pageEditor']

const UI = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
const LINE = 'color-mix(in srgb, var(--text) 8%, transparent)'
const MUTED = 'color-mix(in srgb, var(--text) 45%, transparent)'
const INK = 'var(--text)'
const CARD = 'var(--bg)'
const BODY = 'color-mix(in srgb, var(--text) 3.5%, var(--bg))'
const TAB_ON = 'color-mix(in srgb, var(--text) 6%, transparent)'
const CH = 8.4
const LH = 18

function socketUrl() {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws/page-terminal`
}

function blockHeight(data: Record<string, unknown>) {
  const n = Number(data.height)
  return Number.isFinite(n) && n >= 160 ? n : 360
}

const termLang = StreamLanguage.define({
  token(stream) {
    if (stream.match(/^\$ |^% |^# |^❯ |^➜ /)) return 'meta'
    if (stream.match(/^(error|Error|ERROR|fatal|Fatal)\b/)) return 'invalid'
    if (stream.match(/^(warning|Warning|WARN)\b/)) return 'keyword'
    if (stream.match(/^(\/|[A-Za-z]:\\)[^\s]+/)) return 'string'
    if (stream.match(/^[0-9]+/)) return 'number'
    stream.next()
    return null
  },
})

const termHighlight = HighlightStyle.define([
  { tag: t.meta, color: '#7aa2f7' },
  { tag: t.invalid, color: '#f7768e' },
  { tag: t.keyword, color: '#e0af68' },
  { tag: t.string, color: '#9ece6a' },
  { tag: t.number, color: '#bb9af7' },
])

const termTheme = EditorView.theme({
  '&': {
    height: '100%',
    background: 'transparent',
    fontFamily: MONO,
    fontSize: '12.5px',
    color: INK,
  },
  '.cm-scroller': {
    overflow: 'auto',
    fontFamily: MONO,
    lineHeight: `${LH}px`,
    padding: '10px 14px 14px',
  },
  '.cm-content': { caretColor: INK, padding: 0, minHeight: '100%' },
  '.cm-gutters': { display: 'none' },
  '.cm-cursor': { borderLeftWidth: '2px', borderLeftColor: INK },
  '&.cm-focused .cm-cursor': { borderLeftColor: INK },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': {
    background: 'color-mix(in srgb, #2f6fed 28%, transparent) !important',
  },
})

function PtyPane({ active }: { active: boolean }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const viewRef = useRef<EditorView | null>(null)
  const bufRef = useRef(new TerminalBuffer(80, 24))
  const sockRef = useRef<WebSocket | null>(null)
  const sizeRef = useRef({ cols: 80, rows: 24 })
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const host = wrapRef.current
    if (!host) return
    const buf = bufRef.current

    const sendKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'c' && !event.shiftKey) {
        const sel = viewRef.current?.state.selection.main
        if (sel && !sel.empty) return false
      }
      if (event.metaKey && event.key.toLowerCase() === 'v') return false
      const bytes = keyToPty(event)
      if (bytes == null) return false
      event.preventDefault()
      sockRef.current?.readyState === 1 && sockRef.current.send(bytes)
      return true
    }

    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: '',
        extensions: [
          EditorView.editable.of(true),
          EditorView.lineWrapping,
          drawSelection(),
          syntaxHighlighting(termHighlight),
          termLang,
          termTheme,
          Prec.highest(
            keymap.of([
              {
                any: (_view, event) => sendKey(event),
              },
            ]),
          ),
          EditorView.inputHandler.of(() => true),
          EditorView.domEventHandlers({
            paste(event) {
              const text = event.clipboardData?.getData('text') ?? ''
              if (!text) return false
              event.preventDefault()
              sockRef.current?.readyState === 1 && sockRef.current.send(text)
              return true
            },
          }),
        ],
      }),
    })
    viewRef.current = view

    const paint = () => {
      const next = buf.text()
      const cur = buf.cursor()
      const pos = Math.min(next.length, cur)
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: next },
        selection: { anchor: pos, head: pos },
        scrollIntoView: true,
      })
    }

    const open = () => {
      const sock = new WebSocket(socketUrl())
      sock.binaryType = 'arraybuffer'
      sockRef.current = sock
      sock.onopen = () => {
        setReady(true)
        sock.send(JSON.stringify({ type: 'resize', cols: sizeRef.current.cols, rows: sizeRef.current.rows }))
      }
      sock.onclose = () => setReady(false)
      sock.onmessage = (event) => {
        const data = event.data
        if (typeof data === 'string') {
          if (data.startsWith('{"type":"exit"')) {
            try {
              const msg = JSON.parse(data) as { reason?: string }
              buf.write(`\r\n[进程结束${msg.reason ? `: ${msg.reason}` : ''}]\r\n`)
              paint()
              return
            } catch {
              /* pty text */
            }
          }
          buf.write(data)
          paint()
          return
        }
        buf.write(new TextDecoder().decode(data instanceof ArrayBuffer ? data : new Uint8Array(data)))
        paint()
      }
    }
    open()

    const fit = () => {
      const scroller = view.scrollDOM
      const w = scroller.clientWidth
      const h = scroller.clientHeight
      if (w < 40 || h < 40) return
      const cols = Math.max(20, Math.floor((w - 8) / CH))
      const rows = Math.max(8, Math.floor(h / LH))
      if (cols === sizeRef.current.cols && rows === sizeRef.current.rows) return
      sizeRef.current = { cols, rows }
      buf.resize(cols, rows)
      sockRef.current?.readyState === 1 && sockRef.current.send(JSON.stringify({ type: 'resize', cols, rows }))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(host)

    return () => {
      ro.disconnect()
      sockRef.current?.close()
      sockRef.current = null
      view.destroy()
      viewRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const id = requestAnimationFrame(() => viewRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [active])

  return (
    <div
      ref={wrapRef}
      data-testid="page-terminal-xterm"
      onMouseDown={() => viewRef.current?.focus()}
      style={{
        display: active ? 'flex' : 'none',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        position: 'relative',
        cursor: 'text',
      }}
    >
      {!ready ? (
        <div
          style={{
            position: 'absolute',
            zIndex: 1,
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: UI,
            fontSize: 12,
            color: MUTED,
          }}
        >
          连接中…
        </div>
      ) : null}
    </div>
  )
}

function TerminalSurface({
  tabs,
  active,
  zoomed,
  onZoom,
  onClose,
  onSelect,
  onAdd,
  onRemove,
}: {
  tabs: string[]
  active: string
  zoomed: boolean
  onZoom: () => void
  onClose?: () => void
  onSelect: (id: string) => void
  onAdd: () => void
  onRemove: (id: string) => void
}) {
  const quiet: CSSProperties = {
    appearance: 'none',
    border: 'none',
    background: 'transparent',
    color: MUTED,
    fontFamily: UI,
    fontSize: 12,
    fontWeight: 500,
    lineHeight: 1,
    padding: '4px 8px',
    borderRadius: 6,
    cursor: 'pointer',
  }
  return (
    <div
      style={{
        flex: 1,
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        background: CARD,
        border: `1px solid ${LINE}`,
        borderRadius: zoomed ? 0 : 10,
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          minHeight: 36,
          padding: '4px 8px 4px 12px',
          borderBottom: `1px solid ${LINE}`,
          background: 'rgba(255,255,255,.03)',
        }}
      >
        <span style={{ fontFamily: UI, fontSize: 12, fontWeight: 500, color: MUTED, letterSpacing: '-0.01em', flexShrink: 0 }}>
          终端
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, minWidth: 0, flex: 1, overflow: 'auto' }}>
          {tabs.map((id, index) => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center', flexShrink: 0 }}>
              <button
                type="button"
                tabIndex={-1}
                data-testid={`page-terminal-tab-${index}`}
                onClick={() => onSelect(id)}
                style={{
                  ...quiet,
                  color: id === active ? INK : MUTED,
                  background: id === active ? TAB_ON : 'transparent',
                  boxShadow: id === active ? `inset 0 -2px 0 ${INK}` : 'none',
                  borderRadius: 0,
                  padding: '6px 10px',
                }}
              >
                {index === 0 ? '会话' : `会话 ${index + 1}`}
              </button>
              {tabs.length > 1 ? (
                <button type="button" tabIndex={-1} title="关闭" aria-label="关闭" onClick={() => onRemove(id)} style={{ ...quiet, padding: '2px 6px' }}>
                  ×
                </button>
              ) : null}
            </span>
          ))}
          <button type="button" tabIndex={-1} data-testid="page-terminal-tab-add" title="新建会话" aria-label="新建会话" onClick={onAdd} style={quiet}>
            +
          </button>
        </div>
        <button
          type="button"
          tabIndex={-1}
          data-testid={zoomed ? 'page-terminal-shrink' : 'page-terminal-zoom'}
          title={zoomed ? '退出全屏' : '全屏'}
          aria-label={zoomed ? '退出全屏' : '全屏'}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => (zoomed ? onClose?.() : onZoom())}
          style={quiet}
        >
          {zoomed ? '收起' : '全屏'}
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: BODY }}>
        {tabs.map((id) => (
          <PtyPane key={id} active={id === active} />
        ))}
      </div>
    </div>
  )
}

function newTabId() {
  return crypto.randomUUID().slice(0, 8)
}

function TerminalCard({ data }: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; writable: boolean }) {
  const [zoom, setZoom] = useState(false)
  const height = blockHeight(data)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [tabs, setTabs] = useState<string[]>(() => [newTabId()])
  const [active, setActive] = useState(() => tabs[0] ?? newTabId())

  useEffect(() => {
    const host = hostRef.current
    if (!host || !zoom) {
      relockAncestors()
      return
    }
    unlockAncestors(host)
    const stop = watchZoom(() => setZoom(false), host)
    return () => {
      stop()
      relockAncestors()
    }
  }, [zoom])

  const addTab = () => {
    const id = newTabId()
    setTabs((list) => [...list, id])
    setActive(id)
  }

  const removeTab = (id: string) => {
    setTabs((list) => {
      if (list.length <= 1) return list
      const next = list.filter((item) => item !== id)
      if (id === active) setActive(next[next.length - 1] ?? next[0])
      return next
    })
  }

  return (
    <div
      ref={hostRef}
      data-testid="page-terminal"
      style={{
        position: zoom ? 'fixed' : 'relative',
        inset: zoom ? 0 : undefined,
        zIndex: zoom ? 2147483000 : undefined,
        width: '100%',
        height: zoom ? '100%' : height,
        display: 'flex',
        padding: zoom ? 0 : '2px 0 4px',
        boxSizing: 'border-box',
      }}
    >
      <TerminalSurface
        tabs={tabs}
        active={active}
        zoomed={zoom}
        onZoom={() => setZoom(true)}
        onClose={() => setZoom(false)}
        onSelect={setActive}
        onAdd={addTab}
        onRemove={removeTab}
      />
    </div>
  )
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
      View: (props: {
        data: Record<string, unknown>
        update: (patch: Record<string, unknown>) => void
        writable: boolean
      }) => unknown
    }) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'terminal',
    plugin: name,
    label: '终端',
    blockType: 'terminal',
    blockTypeLabel: '终端',
    hint: '本机 SHELL。点进窗口打字，多会话 Tab。',
    aliases: ['terminal', 'shell', '终端', '命令行', 'console', 'cmd'],
    defaults: () => ({ height: 360 }),
    View: TerminalCard,
  })
}
