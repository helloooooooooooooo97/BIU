import { useEffect, useState, type ComponentType } from 'react'
import { createPortal } from 'react-dom'

export type PluginTrayItem = {
  id: string
  title: string
  Icon?: ComponentType<{ size?: number }>
}

type Props = {
  items: PluginTrayItem[]
  minimized: Record<string, boolean>
  onRestore: (id: string) => void
  onMinimize: (id: string) => void
}

export function PluginTray({ items, minimized, onRestore, onMinimize }: Props) {
  if (items.length === 0) return null
  return (
    <div className="plugin-tray" role="toolbar" aria-label="已启用插件" data-testid="plugin-tray">
      {items.map((item) => {
        const isMin = Boolean(minimized[item.id])
        const letter = (item.title || item.id).slice(0, 1).toUpperCase() || 'P'
        const Icon = item.Icon
        return (
          <button
            key={item.id}
            type="button"
            className={`plugin-tray-btn${isMin ? ' is-min' : ''}`}
            title={isMin ? `还原 ${item.title}` : `缩小 ${item.title}`}
            aria-label={isMin ? `还原 ${item.title}` : `缩小 ${item.title}`}
            data-testid={`plugin-tray-${item.id}`}
            onClick={() => {
              if (isMin) onRestore(item.id)
              else onMinimize(item.id)
            }}
          >
            {Icon ? <Icon size={16} /> : <span className="plugin-tray-letter">{letter}</span>}
          </button>
        )
      })}
      <style>{TRAY_CSS}</style>
    </div>
  )
}

export function PluginTrayPortal(props: Props) {
  const [host, setHost] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const pick = () => document.querySelector('[data-plugin-tray]') as HTMLElement | null
    setHost(pick())
    const ob = new MutationObserver(() => setHost(pick()))
    ob.observe(document.body, { childList: true, subtree: true })
    return () => ob.disconnect()
  }, [])
  if (!host || props.items.length === 0) return null
  return createPortal(<PluginTray {...props} />, host)
}

const TRAY_CSS = `
.plugin-tray {
  display: flex;
  flex-direction: row;
  align-items: center;
  gap: 6px;
  pointer-events: auto;
}
.plugin-tray-btn {
  width: 32px;
  height: 32px;
  padding: 0;
  border: none;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: var(--dsw-label, var(--text));
  background: color-mix(in srgb, var(--dsw-sidebar, var(--surface, #1c1c1c)) 88%, transparent);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--dsw-bubble, var(--line, #333)) 55%, transparent);
  transition: transform 0.15s ease, background 0.15s ease, opacity 0.15s ease;
}
.plugin-tray-btn:hover {
  transform: translateY(-1px);
}
.plugin-tray-btn.is-min {
  opacity: 0.55;
}
.plugin-tray-letter {
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
}
`
