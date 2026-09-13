import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import './xterm-skin.css'
import { relockAncestors, unlockAncestors, watchZoom } from './zoom.ts'

const React = globalThis.React
const { useEffect, useRef, useState } = React
type CSSProperties = import('react').CSSProperties

export const name = 'page-terminal'
export const inject = ['pageEditor']

const UI = 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const MONO = 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace'
const LINE = 'color-mix(in srgb, var(--text) 8%, transparent)'
const MUTED = 'color-mix(in srgb, var(--text) 45%, transparent)'
const INK = 'var(--text)'
const CARD = 'var(--bg)'
const TAB_ON = 'color-mix(in srgb, var(--text) 6%, transparent)'
const TERM_BG = '#1c1c1e'
const TERM_FG = '#e8e8ed'
const TERM_CURSOR = '#e8e8ed'
const TERM_SEL = '#3a6ff0'

function blockHeight(data: Record<string, unknown>) {
  const n = Number(data.height)
  return Number.isFinite(n) && n >= 160 ? n : 360
}

function socketUrl(cols: number, rows: number) {
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}/ws/page-terminal?cols=${cols}&rows=${rows}`
}

function PtyPane({ active }: { active: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const term = new Terminal({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontSize: 13,
      fontFamily: MONO,
      lineHeight: 1.35,
      scrollback: 10_000,
      theme: {
        background: TERM_BG,
        foreground: TERM_FG,
        cursor: TERM_CURSOR,
        cursorAccent: TERM_BG,
        selectionBackground: TERM_SEL,
        selectionForeground: TERM_FG,
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    try {
      fit.fit()
    } catch {
      /* 折叠时尺寸为 0 */
    }
    termRef.current = term
    fitRef.current = fit
    const socket = new WebSocket(socketUrl(term.cols, term.rows))
    socket.binaryType = 'arraybuffer'
    const write = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data)
    })
    const resized = term.onResize(({ cols, rows }) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })
    socket.onopen = () => setReady(true)
    socket.onclose = () => setReady(false)
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') term.write(event.data)
      else term.write(new Uint8Array(event.data as ArrayBuffer))
    }
    const onFit = () => {
      try {
        fit.fit()
      } catch {
        /* ignore */
      }
    }
    window.addEventListener('resize', onFit)
    const ro = new ResizeObserver(onFit)
    ro.observe(el)
    return () => {
      write.dispose()
      resized.dispose()
      ro.disconnect()
      window.removeEventListener('resize', onFit)
      socket.close()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const id = requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* ignore */
      }
      termRef.current?.focus()
    })
    return () => cancelAnimationFrame(id)
  }, [active])

  return (
    <div
      className="page-terminal-pty"
      data-testid="page-terminal-xterm"
      data-page-block-capture=""
      style={{
        display: active ? 'block' : 'none',
        flex: 1,
        minHeight: 0,
        width: '100%',
        height: '100%',
        position: 'relative',
        background: TERM_BG,
      }}
    >
      <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
      {!ready ? (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            pointerEvents: 'none',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontFamily: UI,
            fontSize: 12,
            color: 'rgba(232,232,237,.45)',
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
      data-testid="page-terminal-surface"
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
        data-biu-ignore
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
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: TERM_BG }}>
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
