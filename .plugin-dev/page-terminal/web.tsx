import { createPortal } from 'react-dom'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { makeOverlay, relockAncestors, unlockAncestors, watchZoom } from './zoom.ts'

const React = globalThis.React
const { useEffect, useRef, useState } = React

export const name = 'page-terminal'
export const inject = ['pageEditor']

const INK = '#0b0e14'
const PAPER = '#c9d1d9'

function blockHeight(data: Record<string, unknown>) {
  const n = Number(data.height)
  return Number.isFinite(n) && n >= 120 ? Math.round(n) : 320
}

function Glyph({ shrink }: { shrink?: boolean }) {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      {shrink ? (
        <path d="M6 2h1.6v3.4H11V7H6V2Zm4 12H8.4V10.6H5V9h5v5Z" />
      ) : (
        <path d="M9 2h5v5h-1.5V4.56L8.78 8.28 7.72 7.22 11.44 3.5H9V2ZM2 9h1.5v2.44l3.72-3.72 1.06 1.06L4.56 12.5H7V14H2V9Z" />
      )}
    </svg>
  )
}

function wsUrl(cols: number, rows: number) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws/page-terminal?cols=${cols}&rows=${rows}`
}

function LiveTerm({ zoomed }: { zoomed: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
      theme: { background: INK, foreground: PAPER, cursor: '#3fb950' },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    fit.fit()
    const socket = new WebSocket(wsUrl(term.cols, term.rows))
    socket.binaryType = 'arraybuffer'
    const write = term.onData((data) => {
      if (socket.readyState === WebSocket.OPEN) socket.send(data)
    })
    const resized = term.onResize(({ cols, rows }) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols, rows }))
      }
    })
    socket.onmessage = (event) => {
      if (typeof event.data === 'string') term.write(event.data)
      else term.write(new Uint8Array(event.data as ArrayBuffer))
    }
    const onFit = () => fit.fit()
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
    }
  }, [zoomed])

  return <div ref={hostRef} data-testid="page-terminal-xterm" style={{ flex: 1, minHeight: 0, width: '100%' }} />
}

function TerminalSurface({
  zoomed,
  onZoom,
  onClose,
}: {
  zoomed: boolean
  onZoom: () => void
  onClose?: () => void
}) {
  const btn: Record<string, unknown> = {
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: PAPER,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 9px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  }

  return (
    <div
      data-testid="page-terminal-surface"
      data-page-block-capture=""
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        width: '100%',
        background: INK,
        border: zoomed ? 'none' : '1px solid rgba(201,209,217,.18)',
        borderRadius: zoomed ? 0 : 8,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div
        data-biu-ignore
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '4px 6px 4px 10px',
          borderBottom: '1px solid rgba(201,209,217,.14)',
          background: 'rgba(255,255,255,.02)',
        }}
      >
        <span style={{ color: 'rgba(201,209,217,.55)', fontSize: 10, letterSpacing: '.08em' }}>Terminal</span>
        {zoomed ? (
          <button type="button" tabIndex={-1} data-testid="page-terminal-shrink" title="退出放大" aria-label="退出放大" onClick={() => onClose?.()} style={btn}>
            <Glyph shrink />
          </button>
        ) : (
          <button
            type="button"
            tabIndex={-1}
            data-testid="page-terminal-zoom"
            title="放大终端"
            aria-label="放大终端"
            onMouseDown={(event) => event.preventDefault()}
            onClick={onZoom}
            style={btn}
          >
            <Glyph />
          </button>
        )}
      </div>
      <LiveTerm zoomed={zoomed} />
    </div>
  )
}

function TerminalCard({ data }: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; writable: boolean }) {
  const [zoom, setZoom] = useState(false)
  const height = blockHeight(data)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [overlayEl, setOverlayEl] = useState<HTMLElement | null>(null)

  useEffect(() => {
    if (!zoom) {
      setOverlayEl(null)
      return
    }
    const host = hostRef.current
    if (host) unlockAncestors(host)
    const el = makeOverlay('page-terminal-zoom-host', INK)
    setOverlayEl(el)
    const stop = watchZoom(() => setZoom(false), el)
    return () => {
      stop()
      el.remove()
      relockAncestors()
      setOverlayEl(null)
    }
  }, [zoom])

  return (
    <div ref={hostRef} data-testid="page-terminal" style={{ position: 'relative', width: '100%', height, display: 'flex' }}>
      <TerminalSurface zoomed={false} onZoom={() => setZoom(true)} />
      {overlayEl ? createPortal(<TerminalSurface zoomed onZoom={() => setZoom(true)} onClose={() => setZoom(false)} />, overlayEl) : null}
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
    hint: '登录你本机 SHELL 的真终端（PTY），和系统终端一样',
    aliases: ['terminal', 'shell', '终端', '命令行', 'console', 'cmd'],
    defaults: () => ({ height: 320 }),
    View: TerminalCard,
  })
}
