import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import './xterm-skin.css'
import { relockAncestors, unlockAncestors, watchZoom } from './zoom.ts'

const React = globalThis.React
const { useEffect, useRef, useState } = React

export const name = 'page-terminal'
export const inject = ['pageEditor']

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const INK = '#0b0e14'
const PAPER = '#c9d1d9'
const GREEN = '#3fb950'

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

function PtyPane({ active }: { active: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const termRef = useRef<Terminal | null>(null)
  const fitRef = useRef<FitAddon | null>(null)

  useEffect(() => {
    const el = hostRef.current
    if (!el) return
    const term = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: MONO,
      scrollback: 10_000,
      allowProposedApi: false,
      theme: { background: INK, foreground: PAPER, cursor: GREEN },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(el)
    const helper = el.querySelector('textarea')
    if (helper instanceof HTMLTextAreaElement) {
      helper.setAttribute('tabindex', '-1')
      helper.setAttribute('aria-hidden', 'true')
      helper.style.cssText =
        'position:absolute;opacity:0;left:0;top:0;width:0;height:0;margin:0;padding:0;border:0;overflow:hidden;resize:none;pointer-events:none;color:transparent;caret-color:transparent;background:transparent'
    }
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey) return
      const dy = event.deltaY
      if (!dy) return
      const lines = Math.max(1, Math.round(Math.abs(dy) / 24)) * (dy > 0 ? 1 : -1)
      term.scrollLines(lines)
    }
    el.addEventListener('wheel', onWheel, { passive: true })
    fit.fit()
    termRef.current = term
    fitRef.current = fit
    const socket = new WebSocket(wsUrl(term.cols, term.rows))
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
    const onFit = () => {
      try {
        fit.fit()
      } catch {
        /* 折叠时尺寸为 0 */
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
      el.removeEventListener('wheel', onWheel)
      socket.close()
      term.dispose()
      termRef.current = null
      fitRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!active) return
    const id = window.requestAnimationFrame(() => {
      try {
        fitRef.current?.fit()
      } catch {
        /* ignore */
      }
      termRef.current?.focus()
    })
    return () => window.cancelAnimationFrame(id)
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
      }}
    >
      <div ref={hostRef} style={{ width: '100%', height: '100%' }} />
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
  const btn: Record<string, unknown> = {
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: PAPER,
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 9px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  }
  const tabBtn = (on: boolean): Record<string, unknown> => ({
    ...btn,
    color: on ? PAPER : 'rgba(201,209,217,.55)',
    background: on ? 'rgba(255,255,255,.08)' : 'transparent',
    borderRadius: 6,
    padding: '3px 8px',
  })

  return (
    <div
      data-testid="page-terminal-surface"
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
        fontFamily: MONO,
        color: PAPER,
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
          padding: '4px 6px 4px 8px',
          borderBottom: '1px solid rgba(201,209,217,.14)',
          background: 'rgba(255,255,255,.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
          <span style={{ color: 'rgba(201,209,217,.55)', fontSize: 10, letterSpacing: '.08em', marginRight: 4 }}>
            Terminal
          </span>
          {tabs.map((id, index) => (
            <span key={id} style={{ display: 'inline-flex', alignItems: 'center' }}>
              <button type="button" tabIndex={-1} data-testid={`page-terminal-tab-${index}`} onClick={() => onSelect(id)} style={tabBtn(id === active)}>
                {index + 1}
              </button>
              {tabs.length > 1 ? (
                <button
                  type="button"
                  tabIndex={-1}
                  title="关闭此 Tab"
                  aria-label="关闭此 Tab"
                  onClick={() => onRemove(id)}
                  style={{ ...btn, padding: '2px 4px', color: 'rgba(201,209,217,.45)' }}
                >
                  ×
                </button>
              ) : null}
            </span>
          ))}
          <button type="button" tabIndex={-1} data-testid="page-terminal-tab-add" title="新建 Tab" aria-label="新建 Tab" onClick={onAdd} style={btn}>
            +
          </button>
        </div>
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
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
    hint: '本机登录 SHELL 的真终端（PTY）。一张卡片可开多个 Tab。',
    aliases: ['terminal', 'shell', '终端', '命令行', 'console', 'cmd'],
    defaults: () => ({ height: 320 }),
    View: TerminalCard,
  })
}
