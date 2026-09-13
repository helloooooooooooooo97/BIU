import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import './terminal.css'
import { ensureXtermRuntimeStyle } from './runtime-style.ts'

const React = globalThis.React
const { useCallback, useEffect, useLayoutEffect, useRef, useState } = React

type ConnectionState = 'connecting' | 'open' | 'closed' | 'error'

function socketUrl(path: string, cols: number, rows: number) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  const url = new URL(path, `${protocol}//${window.location.host}`)
  url.searchParams.set('cols', String(cols))
  url.searchParams.set('rows', String(rows))
  return url.toString()
}

export function TerminalSurface({
  endpoint,
  className = '',
  autoFocus = false,
  active = true,
}: {
  endpoint: string
  className?: string
  autoFocus?: boolean
  active?: boolean
}) {
  const host = useRef<HTMLDivElement | null>(null)
  const instance = useRef<Terminal | null>(null)
  const layout = useRef<() => void>(() => {})
  const activeRef = useRef(active)
  activeRef.current = active
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<ConnectionState>('connecting')

  const reconnect = useCallback(() => {
    setState('connecting')
    setAttempt((value) => value + 1)
  }, [])

  useLayoutEffect(() => {
    const element = host.current
    if (!element) return

    let disposed = false
    let frame = 0
    let secondFrame = 0
    let terminal: Terminal | null = null
    let fit: FitAddon | null = null
    let socket: WebSocket | null = null
    let input: { dispose(): void } | null = null
    let resize: { dispose(): void } | null = null
    setState('connecting')

    const isVisible = () => {
      if (disposed || !element.isConnected) return
      const bounds = element.getBoundingClientRect()
      if (!activeRef.current || bounds.width < 20 || bounds.height < 20) return false
      const style = window.getComputedStyle(element)
      return style.display !== 'none' && style.visibility !== 'hidden' && style.contentVisibility !== 'hidden'
    }

    const send = (message: Record<string, unknown>) => {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message))
    }

    const openVisibleTerminal = () => {
      if (!isVisible()) return
      if (!terminal) {
        ensureXtermRuntimeStyle()
        terminal = new Terminal({
          allowProposedApi: false,
          convertEol: false,
          cursorBlink: true,
          cursorStyle: 'block',
          fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace',
          fontSize: 13,
          lineHeight: 1.18,
          scrollback: 5000,
          theme: {
            background: '#111318',
            foreground: '#d6d9df',
            cursor: '#f2f4f8',
            cursorAccent: '#111318',
            selectionBackground: '#355070aa',
            black: '#20242c',
            red: '#ff6b6b',
            green: '#8bd49c',
            yellow: '#e5c07b',
            blue: '#61afef',
            magenta: '#c678dd',
            cyan: '#56b6c2',
            white: '#d6d9df',
            brightBlack: '#626a78',
            brightRed: '#ff8787',
            brightGreen: '#b2f2bb',
            brightYellow: '#ffe066',
            brightBlue: '#74c0fc',
            brightMagenta: '#da77f2',
            brightCyan: '#66d9e8',
            brightWhite: '#ffffff',
          },
        })
        fit = new FitAddon()
        terminal.loadAddon(fit)
        terminal.open(element)
        instance.current = terminal
        if (!terminal.element || !terminal.textarea) {
          instance.current = null
          terminal.dispose()
          terminal = null
          fit = null
          setState('error')
          return
        }
        terminal.textarea.setAttribute('aria-label', '页面终端输入')
        terminal.textarea.setAttribute('autocomplete', 'off')
        Object.assign(terminal.element.style, {
          width: '100%',
          height: '100%',
          padding: '9px 8px 5px 10px',
          overflow: 'hidden',
          boxSizing: 'border-box',
        })
        socket = new WebSocket(socketUrl(endpoint, terminal.cols, terminal.rows))
        input = terminal.onData((data) => send({ type: 'input', data }))
        resize = terminal.onResize(({ cols, rows }) => send({ type: 'resize', cols, rows }))
        socket.addEventListener('open', () => {
          if (disposed || !terminal) return
          setState('open')
          scheduleFit()
          send({ type: 'resize', cols: terminal.cols, rows: terminal.rows })
          if (autoFocus && activeRef.current) terminal.focus()
        })
        socket.addEventListener('message', (event) => {
          if (!disposed && terminal) terminal.write(typeof event.data === 'string' ? event.data : '')
        })
        socket.addEventListener('error', () => {
          if (!disposed) setState('error')
        })
        socket.addEventListener('close', () => {
          if (!disposed) setState((current) => (current === 'error' ? current : 'closed'))
        })
      }
      try {
        fit?.fit()
        terminal.refresh(0, terminal.rows - 1)
      } catch {
        // Ignore transient zero-size layouts while the page is switching.
      }
    }
    const scheduleFit = () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(secondFrame)
      frame = requestAnimationFrame(() => {
        openVisibleTerminal()
        // Font metrics and the xterm viewport settle one frame after the first fit.
        secondFrame = requestAnimationFrame(openVisibleTerminal)
      })
    }
    layout.current = scheduleFit
    const observer = new ResizeObserver(scheduleFit)
    observer.observe(element)
    const intersection = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver(scheduleFit)
    intersection?.observe(element)
    document.addEventListener('visibilitychange', scheduleFit)
    scheduleFit()

    return () => {
      disposed = true
      cancelAnimationFrame(frame)
      cancelAnimationFrame(secondFrame)
      observer.disconnect()
      intersection?.disconnect()
      document.removeEventListener('visibilitychange', scheduleFit)
      input?.dispose()
      resize?.dispose()
      socket?.close()
      layout.current = () => {}
      if (instance.current === terminal) instance.current = null
      terminal?.dispose()
    }
  }, [endpoint, attempt])

  useEffect(() => {
    layout.current()
    if (active && autoFocus && state === 'open') instance.current?.focus()
  }, [active, autoFocus, state])

  return (
    <div
      className={`biu-terminal-surface ${className}`}
      data-terminal-state={state}
      style={{
        position: 'relative',
        display: 'block',
        width: '100%',
        height: '100%',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        background: '#111318',
        boxSizing: 'border-box',
        contain: 'strict',
      }}
      onMouseDown={(event) => {
        event.stopPropagation()
        instance.current?.focus()
      }}
      onWheel={(event) => event.stopPropagation()}
    >
      <div ref={host} className="biu-terminal-mount" style={{ position: 'absolute', inset: 0, overflow: 'hidden', boxSizing: 'border-box' }} />
      {state === 'connecting' ? <div className="biu-terminal-status" style={statusStyle}>正在连接终端…</div> : null}
      {state === 'closed' || state === 'error' ? (
        <div className="biu-terminal-status biu-terminal-status-error" style={{ ...statusStyle, background: 'rgb(17 19 24 / 92%)' }}>
          <span>{state === 'error' ? '终端连接失败' : '终端已退出'}</span>
          <button type="button" onClick={reconnect}>重新打开</button>
        </div>
      ) : null}
    </div>
  )
}

const statusStyle = {
  position: 'absolute',
  inset: 0,
  zIndex: 2,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 10,
  color: '#9ba3b2',
  background: '#111318',
  font: '12px ui-sans-serif, system-ui, sans-serif',
}
