import { applyPtyChunk, keyToPty } from './buffer.ts'
import { relockAncestors, unlockAncestors, watchZoom } from './zoom.ts'

const React = globalThis.React
const { useEffect, useRef, useState } = React

export const name = 'page-terminal'
export const inject = ['pageEditor']

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const UI = 'ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
const BODY = '#202020'
const INK = 'rgba(255,255,255,.86)'
const MUTED = 'rgba(255,255,255,.45)'
const LINE = 'rgba(255,255,255,.08)'
const TAB_ON = 'rgba(255,255,255,.08)'

function blockHeight(data: Record<string, unknown>) {
  const n = Number(data.height)
  return Number.isFinite(n) && n >= 160 ? Math.round(n) : 360
}

function wsUrl(cols: number, rows: number) {
  const proto = location.protocol === 'https:' ? 'wss' : 'ws'
  return `${proto}://${location.host}/ws/page-terminal?cols=${cols}&rows=${rows}`
}

function measure(el: HTMLElement) {
  const cs = getComputedStyle(el)
  const padX = Number.parseFloat(cs.paddingLeft) + Number.parseFloat(cs.paddingRight)
  const padY = Number.parseFloat(cs.paddingTop) + Number.parseFloat(cs.paddingBottom)
  const probe = document.createElement('span')
  probe.textContent = '0'
  probe.style.cssText = `position:absolute;visibility:hidden;font:${cs.font}`
  el.appendChild(probe)
  const cw = probe.getBoundingClientRect().width || 8
  const ch = Number.parseFloat(cs.lineHeight) || 18
  probe.remove()
  const cols = Math.max(20, Math.floor((el.clientWidth - padX) / cw))
  const rows = Math.max(8, Math.floor((el.clientHeight - padY) / ch))
  return { cols, rows }
}

function PtyPane({ active }: { active: boolean }) {
  const paneRef = useRef<HTMLDivElement | null>(null)
  const stick = useRef(true)
  const socketRef = useRef<WebSocket | null>(null)
  const [text, setText] = useState('')

  useEffect(() => {
    const el = paneRef.current
    if (!el) return
    const size = measure(el)
    const socket = new WebSocket(wsUrl(size.cols, size.rows))
    socketRef.current = socket
    const decode = (data: unknown) => {
      if (typeof data === 'string') return data
      return new TextDecoder().decode(data as ArrayBuffer)
    }
    socket.onmessage = (event) => {
      setText((prev) => applyPtyChunk(prev, decode(event.data)))
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey && event.key.toLowerCase() === 'v') return
      const seq = keyToPty(event)
      if (seq == null) return
      event.preventDefault()
      event.stopPropagation()
      if (socket.readyState === WebSocket.OPEN) socket.send(seq)
    }
    const onPaste = (event: ClipboardEvent) => {
      const paste = event.clipboardData?.getData('text')
      if (!paste) return
      event.preventDefault()
      if (socket.readyState === WebSocket.OPEN) socket.send(paste)
    }
    const onFit = () => {
      if (socket.readyState !== WebSocket.OPEN) return
      const next = measure(el)
      socket.send(JSON.stringify({ type: 'resize', cols: next.cols, rows: next.rows }))
    }
    el.addEventListener('keydown', onKey)
    el.addEventListener('paste', onPaste)
    const ro = new ResizeObserver(onFit)
    ro.observe(el)
    return () => {
      el.removeEventListener('keydown', onKey)
      el.removeEventListener('paste', onPaste)
      ro.disconnect()
      socket.close()
      socketRef.current = null
    }
  }, [])

  useEffect(() => {
    const el = paneRef.current
    if (!el || !active) return
    if (stick.current) el.scrollTop = el.scrollHeight
    el.focus()
  }, [text, active])

  return (
    <div
      ref={paneRef}
      data-testid="page-terminal-body"
      data-page-block-capture=""
      tabIndex={0}
      spellCheck={false}
      onClick={() => paneRef.current?.focus()}
      onScroll={(event) => {
        const box = event.currentTarget
        stick.current = box.scrollHeight - box.scrollTop - box.clientHeight < 28
      }}
      style={{
        display: active ? 'block' : 'none',
        flex: 1,
        minHeight: 0,
        width: '100%',
        overflow: 'auto',
        outline: 'none',
        padding: '12px 14px 16px',
        boxSizing: 'border-box',
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        fontFamily: MONO,
        fontSize: 13,
        lineHeight: 1.45,
        color: INK,
        background: BODY,
        cursor: 'text',
        caretColor: 'transparent',
      }}
    >
      {text}
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
  const quiet: Record<string, unknown> = {
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: MUTED,
    fontFamily: UI,
    fontSize: 12,
    fontWeight: 500,
    padding: '4px 8px',
    borderRadius: 6,
  }

  return (
    <div
      data-testid="page-terminal-surface"
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        width: '100%',
        background: BODY,
        border: zoomed ? 'none' : `1px solid ${LINE}`,
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
