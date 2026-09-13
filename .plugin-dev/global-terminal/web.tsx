import { TerminalSurface } from './terminal.tsx'

const React = globalThis.React
const { useState } = React

export const name = 'global-terminal'
export const inject = ['slots']

type Tab = { id: number; title: string }

function TerminalIcon({ size = 15 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m3 4 3.5 3.5L3 11M8 11h5" stroke="currentColor" strokeWidth="1.45" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function GlobalTerminal() {
  const [nextId, setNextId] = useState(2)
  const [tabs, setTabs] = useState<Tab[]>([{ id: 1, title: '终端 1' }])
  const [active, setActive] = useState(1)

  const addTab = () => {
    if (tabs.length >= 8) return
    const id = nextId
    setNextId(id + 1)
    setTabs((current) => [...current, { id, title: `终端 ${id}` }])
    setActive(id)
  }

  const closeTab = (id: number) => {
    const index = tabs.findIndex((tab) => tab.id === id)
    const remaining = tabs.filter((tab) => tab.id !== id)
    if (remaining.length === 0) {
      const replacement = nextId
      setNextId(replacement + 1)
      setTabs([{ id: replacement, title: `终端 ${replacement}` }])
      setActive(replacement)
      return
    }
    setTabs(remaining)
    if (active === id) setActive(remaining[Math.min(index, remaining.length - 1)]!.id)
  }

  return (
    <main
      data-testid="global-terminal"
      onKeyDown={(event) => event.stopPropagation()}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        minWidth: 0,
        minHeight: 0,
        overflow: 'hidden',
        color: '#d6d9df',
        background: '#111318',
      }}
    >
      <nav
        aria-label="终端标签"
        style={{
          height: 36,
          flex: '0 0 36px',
          display: 'flex',
          alignItems: 'stretch',
          overflowX: 'auto',
          overflowY: 'hidden',
          borderBottom: '1px solid #292d36',
          background: '#191c22',
          scrollbarWidth: 'none',
        }}
      >
        {tabs.map((tab) => {
          const selected = tab.id === active
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={selected}
              onClick={() => setActive(tab.id)}
              style={{
                position: 'relative',
                minWidth: 116,
                maxWidth: 180,
                display: 'flex',
                alignItems: 'center',
                gap: 7,
                padding: '0 7px 0 11px',
                cursor: 'default',
                borderRight: '1px solid #292d36',
                color: selected ? '#f0f2f5' : '#929aa8',
                background: selected ? '#111318' : 'transparent',
                font: '12px ui-sans-serif, system-ui, sans-serif',
              }}
            >
              <TerminalIcon size={13} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tab.title}</span>
              <button
                type="button"
                title={`关闭${tab.title}`}
                aria-label={`关闭${tab.title}`}
                onClick={(event) => {
                  event.stopPropagation()
                  closeTab(tab.id)
                }}
                style={iconButton}
              >
                ×
              </button>
              {selected ? <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, background: '#4f8cff' }} /> : null}
            </div>
          )
        })}
        <button
          type="button"
          title={tabs.length >= 8 ? '最多打开 8 个终端' : '新建终端'}
          aria-label="新建终端"
          disabled={tabs.length >= 8}
          onClick={addTab}
          style={{ ...iconButton, width: 36, height: 36, flex: '0 0 36px', fontSize: 18, opacity: tabs.length >= 8 ? 0.35 : 1 }}
        >
          ＋
        </button>
      </nav>
      <div style={{ position: 'relative', flex: 1, minHeight: 0 }}>
        {tabs.map((tab) => (
          <div
            key={tab.id}
            role="tabpanel"
            aria-hidden={tab.id !== active}
            style={{ position: 'absolute', inset: 0, display: tab.id === active ? 'block' : 'none' }}
          >
            <TerminalSurface endpoint="/ws/global-terminal" active={tab.id === active} autoFocus={tab.id === active} />
          </div>
        ))}
      </div>
    </main>
  )
}

const iconButton = {
  width: 23,
  height: 23,
  flex: '0 0 auto',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  cursor: 'pointer',
  border: 0,
  borderRadius: 5,
  padding: 0,
  color: 'inherit',
  background: 'transparent',
  font: '16px/1 ui-sans-serif, system-ui, sans-serif',
}

export function apply(ctx: {
  slots: {
    place(
      slot: string,
      Component: typeof GlobalTerminal,
      options: { key: string; props(): { Icon: typeof TerminalIcon } },
    ): void
  }
}) {
  ctx.slots.place('plugin-store-extras', GlobalTerminal, {
    key: name,
    props: () => ({ Icon: TerminalIcon }),
  })
}
