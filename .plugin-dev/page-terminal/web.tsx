import { TerminalSurface } from './terminal.tsx'

const React = globalThis.React
const { useState } = React

export const name = 'page-terminal'
export const inject = ['pageEditor']

const MIN_HEIGHT = 220
const MAX_HEIGHT = 900

function terminalHeight(value: unknown) {
  const height = Number(value)
  if (!Number.isFinite(height)) return 360
  return Math.max(MIN_HEIGHT, Math.min(MAX_HEIGHT, Math.round(height)))
}

function TerminalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m3 4 3.5 3.5L3 11M8 11h5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function PageTerminal({
  data,
  update,
  writable,
}: {
  data: Record<string, unknown>
  update(patch: Record<string, unknown>): void
  writable: boolean
}) {
  const [session, setSession] = useState(0)
  const height = terminalHeight(data.height)

  const changeHeight = (delta: number) => {
    if (writable) update({ height: terminalHeight(height + delta) })
  }

  return (
    <section
      data-testid="page-terminal"
      data-page-block-capture=""
      onKeyDown={(event) => event.stopPropagation()}
      style={{
        width: '100%',
        height,
        minHeight: MIN_HEIGHT,
        overflow: 'hidden',
        border: '1px solid rgba(15,23,42,.18)',
        borderRadius: 10,
        background: '#111318',
        boxShadow: '0 1px 2px rgba(15,23,42,.06)',
      }}
    >
      <header
        data-biu-ignore=""
        style={{
          height: 34,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '0 9px 0 11px',
          borderBottom: '1px solid #292d36',
          color: '#aeb5c2',
          background: '#1a1d24',
          font: '12px ui-sans-serif, system-ui, sans-serif',
          boxSizing: 'border-box',
        }}
      >
        <TerminalIcon />
        <span style={{ flex: 1, fontWeight: 650, color: '#d8dbe2' }}>终端</span>
        {writable ? (
          <>
            <button type="button" title="缩小高度" aria-label="缩小终端高度" onClick={() => changeHeight(-80)} style={toolButton}>−</button>
            <button type="button" title="增大高度" aria-label="增大终端高度" onClick={() => changeHeight(80)} style={toolButton}>＋</button>
          </>
        ) : null}
        <button
          type="button"
          title="重新打开 shell"
          aria-label="重新打开终端"
          onClick={() => setSession((value) => value + 1)}
          style={toolButton}
        >
          ↻
        </button>
      </header>
      <div style={{ height: 'calc(100% - 34px)', minHeight: 0 }}>
        <TerminalSurface key={session} endpoint="/ws/page-terminal" />
      </div>
    </section>
  )
}

const toolButton = {
  width: 25,
  height: 24,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 0,
  borderRadius: 5,
  padding: 0,
  color: '#aeb5c2',
  background: 'transparent',
  font: '15px/1 ui-sans-serif, system-ui, sans-serif',
}

export function apply(ctx: {
  pageEditor: {
    registerBlock(spec: {
      kind: string
      plugin: string
      label: string
      blockType: string
      blockTypeLabel: string
      hint: string
      aliases: string[]
      defaults(): Record<string, unknown>
      View: typeof PageTerminal
    }): void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'terminal',
    plugin: name,
    label: '终端',
    blockType: 'terminal',
    blockTypeLabel: '终端',
    hint: '嵌入真实工作区 shell，支持交互命令和 ANSI 输出',
    aliases: ['terminal', 'term', 'shell', 'bash', '终端', '命令行'],
    defaults: () => ({ height: 360 }),
    View: PageTerminal,
  })
}
