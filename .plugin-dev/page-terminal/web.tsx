import { createPortal } from 'react-dom'
import {
  packSession,
  parseSession,
  runHostCommand,
  sameSession,
  stripDraft,
  type TerminalSession,
} from './shell.ts'
import { makeOverlay, relockAncestors, unlockAncestors, watchZoom } from './zoom.ts'

const React = globalThis.React
const { useEffect, useRef, useState } = React

export const name = 'page-terminal'
export const inject = ['pageEditor']

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const INK = '#0b0e14'
const PAPER = '#c9d1d9'
const GREEN = '#3fb950'
const ACCENT = '#e3b341'
const ERR = '#ff7b72'
const MAX_LINES = 400

const SAMPLE = {
  cwd: '.',
  prompt: '$',
  lines: ['工作区 shell。回车执行真实命令，例如 node -v 或 node -e "console.log(1)"。'],
}

type Line = { kind: 'in' | 'out' | 'err'; text: string }

function parseLines(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item ?? ''))
  const text = String(raw ?? '')
  return text ? text.split('\n') : []
}

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

/* ---------------- 终端界面（放大时复用同一份） ---------------- */

function TerminalSurface({
  cwd,
  prompt,
  sample,
  session,
  zoomed,
  onZoom,
  onClose,
  onChange,
}: {
  cwd: string
  prompt: string
  sample: string[]
  session: TerminalSession
  zoomed: boolean
  onZoom: () => void
  onClose?: () => void
  onChange: () => void
}) {
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const busyRef = useRef(false)
  const history = session.history
  const [draft, setDraft] = useState(session.input)

  useEffect(() => {
    const box = scrollRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [history.length, zoomed])

  const push = (line: Line) => {
    session.history = [...session.history, line].slice(-MAX_LINES)
    onChange()
  }

  const run = async (raw: string) => {
    if (busyRef.current) return
    const cmd = raw.trim()
    const echo = `${session.cwd} ${prompt}${cmd ? ` ${cmd}` : ''}`
    session.input = ''
    setDraft('')
    onChange()
    if (!cmd) {
      push({ kind: 'in', text: echo })
      return
    }
    if (cmd === 'clear') {
      session.history = []
      onChange()
      return
    }
    busyRef.current = true
    setBusy(true)
    push({ kind: 'in', text: echo })
    try {
      const result = await runHostCommand(cmd)
      const chunks = [
        ...String(result.stdout).split('\n').map((text) => ({ kind: 'out' as const, text })),
        ...String(result.stderr).split('\n').map((text) => ({ kind: 'err' as const, text })),
      ].filter((line) => line.text.length > 0)
      if (!chunks.length && result.code && result.code !== 0) {
        push({ kind: 'err', text: `exit ${result.code}` })
      } else {
        for (const line of chunks) push(line)
        if (result.code && result.code !== 0) push({ kind: 'err', text: `exit ${result.code}` })
      }
    } catch (error) {
      push({ kind: 'err', text: String(error) })
    }
    busyRef.current = false
    setBusy(false)
  }

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
        fontSize: 12.5,
        lineHeight: 1.6,
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
          padding: '4px 6px 4px 10px',
          borderBottom: '1px solid rgba(201,209,217,.14)',
          background: 'rgba(255,255,255,.02)',
        }}
      >
        <span style={{ color: 'rgba(201,209,217,.55)', fontSize: 10, letterSpacing: '.08em' }}>Terminal</span>
        <span style={{ display: 'inline-flex', alignItems: 'center' }}>
          <button
            type="button"
            tabIndex={-1}
            title="清屏"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              session.history = []
              onChange()
            }}
            style={btn}
          >
            clear
          </button>
          {zoomed ? (
            <button
              type="button"
              tabIndex={-1}
              data-testid="page-terminal-shrink"
              title="退出放大"
              aria-label="退出放大"
              onClick={() => onClose?.()}
              style={btn}
            >
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
        </span>
      </div>

      <div
        ref={scrollRef}
        data-testid="page-terminal-body"
        onClick={() => inputRef.current?.focus()}
        style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '10px 12px', cursor: 'text' }}
      >
        {history.map((line, i) => (
          <div
            key={`${i}-${line.text.slice(0, 10)}`}
            style={{
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-word',
              color: line.kind === 'in' ? ACCENT : line.kind === 'err' ? ERR : PAPER,
              fontWeight: line.kind === 'in' ? 700 : 400,
            }}
          >
            {line.text || ' '}
          </div>
        ))}
        <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ color: GREEN, fontWeight: 700, whiteSpace: 'nowrap' }}>
            {cwd} {prompt}
          </span>
          <input
            ref={inputRef}
            data-testid="page-terminal-input"
            data-page-block-capture=""
            spellCheck={false}
            value={draft}
            disabled={busy}
            aria-label="终端输入"
            onKeyDown={(event) => {
              event.stopPropagation()
              if (event.key === 'Enter') {
                event.preventDefault()
                void run(session.input)
              }
            }}
            onChange={(event) => {
              setDraft(event.currentTarget.value)
              session.input = event.currentTarget.value
            }}
            style={{
              flex: 1,
              minWidth: 40,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: '#e6edf3',
              font: 'inherit',
              caretColor: GREEN,
            }}
          />
        </div>
      </div>
    </div>
  )
}

/* ---------------- 页面块 ---------------- */

function TerminalCard({
  data,
  update,
  writable,
}: {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}) {
  const cwd = String(data.cwd ?? '.')
  const prompt = String(data.prompt ?? '$')
  const sample = parseLines(data.lines)
  const [zoom, setZoom] = useState(false)
  const [hover, setHover] = useState(false)
  const height = blockHeight(data)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [overlayEl, setOverlayEl] = useState<HTMLElement | null>(null)

  // 会话存在块 data 里（详情可见），刷新/换设备都还在
  const savedKey = JSON.stringify(data.session ?? null)
  const sessionRef = useRef<TerminalSession | null>(null)
  if (!sessionRef.current) {
    const restored = parseSession(data.session)
    restored.cwd = restored.cwd || cwd
    // 首次打开：把围栏里的 lines 当开场输出灌一次
    if (!restored.seeded) {
      restored.seeded = true
      if (!restored.history.length && sample.length) {
        restored.history = sample.map((text) => ({ kind: 'out' as const, text }))
      }
    }
    sessionRef.current = restored
  }
  const session = sessionRef.current
  const timer = useRef<number | undefined>(undefined)
  const savedRef = useRef(savedKey)
  const dataRef = useRef(data)
  dataRef.current = data
  const [nonce, setNonce] = useState(0)

  const pack = () => packSession(stripDraft({ ...session, cwd: session.cwd || cwd }))

  // 攒一下再写：连续输出不会把文档刷爆；内容没变就不写
  const flush = (delay = 350) => {
    if (!writable) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const packed = pack()
      if (sameSession(packed, packSession(parseSession(dataRef.current.session)))) return
      update({ session: packed })
    }, delay)
  }

  // 围栏里还没落过会话：挂上就立刻写一次，之后刷新才不会又拿 lines 重灌
  useEffect(() => {
    if (!writable) return
    const packed = pack()
    if (sameSession(packed, packSession(parseSession(dataRef.current.session)))) return
    update({ session: packed })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // 外部改了 data.session（另一个窗口 / agent 改的）才重新灌
  useEffect(() => {
    if (savedKey === savedRef.current) return
    savedRef.current = savedKey
    const next = parseSession(data.session)
    next.cwd = next.cwd || cwd
    if (!next.seeded) next.seeded = true
    sessionRef.current = next
    setNonce((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey])

  // 关掉块之前把还在攒的改动落下去
  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (!writable) return
      const packed = pack()
      if (!sameSession(packed, packSession(parseSession(dataRef.current.session)))) update({ session: packed })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

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

  const surface = (zoomed: boolean) => (
    <TerminalSurface
      key={`${zoomed ? 'zoom' : 'card'}-${nonce}`}
      cwd={session.cwd || cwd}
      prompt={prompt}
      sample={sample}
      session={session}
      zoomed={zoomed}
      onZoom={() => setZoom(true)}
      onClose={() => setZoom(false)}
      onChange={() => {
        setNonce((n) => n + 1)
        flush()
      }}
    />
  )

  return (
    <div
      ref={hostRef}
      data-testid="page-terminal"
      style={{ position: 'relative', width: '100%', height, display: 'flex' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {surface(false)}
      {hover && !writable ? (
        <span
          data-biu-ignore
          style={{
            position: 'absolute',
            right: 10,
            bottom: 4,
            fontFamily: MONO,
            fontSize: 10,
            color: 'rgba(201,209,217,.4)',
          }}
        >
          workspace shell · node
        </span>
      ) : null}
      {overlayEl ? createPortal(surface(true), overlayEl) : null}
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
    hint: '工作区真 shell：回车在宿主执行命令（node / ls 等），右上角可放大',
    aliases: ['terminal', 'shell', '终端', '命令行', 'console', 'cmd'],
    defaults: () => ({ ...SAMPLE }),
    View: TerminalCard,
  })
}
