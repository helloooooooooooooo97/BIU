import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import type { Context } from 'cordis'
import { useSlotEntries, type SlotsService } from '@biu/web-slots'
import type { SlotProps } from '@biu/type-slots'

import { XMarkIcon, MinusIcon, ArrowsPointingOutIcon, ArrowsPointingInIcon, Bars2Icon } from '@heroicons/react/16/solid'
import type { DatabaseUi } from '@biu/type-file-system/ui'
import { pluginsChrome, PluginWorkbenchView } from './chrome.tsx'
import { listenEnablePageBlockPlugin, watchInstalledPageBlocks, watchRunningWindowPlugins } from './page-block-plugin.ts'
import { PluginTrayPortal, type PluginTrayItem } from './plugin-tray.tsx'
import {
  WIN_CHROME_H,
  centeredGeom,
  clampGeom,
  listingIsHeadless,
  storeShellFromRecord,
  type StoreShell,
  type WinGeom,
} from '../shell.ts'

export const name = 'core-plugin-system-ui'
export const inject = ['slots', 'databaseUi']

type StoreListing = { id: string; name: string; shell?: StoreShell; headless?: boolean }

async function readJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init)
  const body = (await res.json()) as T & { error?: string }
  if (!res.ok) throw new Error(body.error || res.statusText)
  return body
}

function resolveListing(extraId: string, items: StoreListing[]) {
  return (
    items.find((item) => item.id === extraId) ??
    items
      .filter((item) => extraId.startsWith(`${item.id}-`))
      .sort((a, b) => b.id.length - a.id.length)[0] ??
    null
  )
}

function viewport() {
  return { w: window.innerWidth, h: window.innerHeight }
}

let pluginWindowZ = 21

type ResizeEdge = { north?: boolean; south?: boolean; east?: boolean; west?: boolean }
type ResizeSession = WinGeom & ResizeEdge & { px: number; py: number }

function PluginAppWindow({
  extraId,
  title,
  pluginId,
  shell,
  fullscreen,
  minimized,
  onClose,
  onMinimize,
  onToggleFullscreen,
  children,
}: {
  extraId: string
  title: string
  pluginId: string
  shell: StoreShell
  fullscreen: boolean
  minimized: boolean
  onClose: () => void
  onMinimize: () => void
  onToggleFullscreen: () => void
  children: ReactNode
}) {
  const [geom, setGeom] = useState<WinGeom>(() => centeredGeom(shell, viewport(), extraId))
  const [userSized, setUserSized] = useState(false)
  const [z, setZ] = useState(() => ++pluginWindowZ)
  const [controlsOpen, setControlsOpen] = useState(false)
  const boxRef = useRef<HTMLElement>(null)
  const dragRef = useRef<{ px: number; py: number; x: number; y: number } | null>(null)
  const resizeRef = useRef<ResizeSession | null>(null)
  const leaveTimer = useRef(0)

  const openControls = () => {
    window.clearTimeout(leaveTimer.current)
    setControlsOpen(true)
  }
  const closeControlsSoon = () => {
    window.clearTimeout(leaveTimer.current)
    leaveTimer.current = window.setTimeout(() => setControlsOpen(false), 160)
  }
  useEffect(() => () => window.clearTimeout(leaveTimer.current), [])
  useEffect(() => {
    if (fullscreen) setControlsOpen(false)
  }, [fullscreen])

  useEffect(() => {
    if (userSized || fullscreen) return
    setGeom(centeredGeom(shell, viewport(), extraId))
  }, [extraId, fullscreen, shell.height, shell.minHeight, shell.minWidth, shell.width, userSized])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (drag) {
        setGeom((cur) =>
          clampGeom(
            {
              ...cur,
              x: drag.x + event.clientX - drag.px,
              y: drag.y + event.clientY - drag.py,
            },
            shell,
            viewport(),
          ),
        )
        return
      }
      if (!shell.resizable) return
      const resize = resizeRef.current
      if (!resize) return
      const dx = event.clientX - resize.px
      const dy = event.clientY - resize.py
      let { x, y, w, h } = resize
      if (resize.east) w = resize.w + dx
      if (resize.south) h = resize.h + dy
      const minW = shell.minWidth
      const minH = shell.minHeight + WIN_CHROME_H
      if (resize.west) {
        w = resize.w - dx
        x = resize.x + dx
        if (w < minW) {
          x = resize.x + resize.w - minW
          w = minW
        }
      }
      if (resize.north) {
        h = resize.h - dy
        y = resize.y + dy
        if (h < minH) {
          y = resize.y + resize.h - minH
          h = minH
        }
      }
      setUserSized(true)
      setGeom(clampGeom({ x, y, w, h }, shell, viewport()))
    }
    const onUp = () => {
      dragRef.current = null
      resizeRef.current = null
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [shell.minHeight, shell.minWidth, shell.resizable])

  const bringFront = () => setZ(++pluginWindowZ)

  const startDrag = (event: ReactPointerEvent) => {
    if (fullscreen) return
    event.preventDefault()
    event.stopPropagation()
    bringFront()
    dragRef.current = { px: event.clientX, py: event.clientY, x: geom.x, y: geom.y }
  }

  const startResize = (edge: ResizeEdge) => (event: ReactPointerEvent) => {
    if (fullscreen || !shell.resizable) return
    event.preventDefault()
    event.stopPropagation()
    bringFront()
    const el = boxRef.current
    const r = el?.getBoundingClientRect()
    const current = {
      ...geom,
      w: r?.width ?? geom.w,
      h: r?.height ?? geom.h,
    }
    resizeRef.current = { ...edge, ...current, px: event.clientX, py: event.clientY }
  }

  const style = fullscreen
    ? { top: 0, left: 0, width: '100vw', height: '100vh', zIndex: z + 8 }
    : { top: geom.y, left: geom.x, width: geom.w, height: geom.h, zIndex: z }

  if (minimized) {
    // 缩小只藏窗口，不卸 React：终端/画板卸掉会断连接、清掉内存里的历史。
    Object.assign(style, { visibility: 'hidden', pointerEvents: 'none' })
  }

  const handles: Array<{ key: string; className: string; edge: ResizeEdge }> = [
    { key: 'n', className: 'absolute inset-x-2 top-0 h-1.5 cursor-n-resize', edge: { north: true } },
    { key: 's', className: 'absolute inset-x-2 bottom-0 h-1.5 cursor-s-resize', edge: { south: true } },
    { key: 'e', className: 'absolute inset-y-2 right-0 w-1.5 cursor-e-resize', edge: { east: true } },
    { key: 'w', className: 'absolute inset-y-2 left-0 w-1.5 cursor-w-resize', edge: { west: true } },
    { key: 'ne', className: 'absolute top-0 right-0 size-3 cursor-nesw-resize', edge: { north: true, east: true } },
    { key: 'nw', className: 'absolute top-0 left-0 size-3 cursor-nwse-resize', edge: { north: true, west: true } },
    { key: 'se', className: 'absolute bottom-0 right-0 size-3 cursor-nwse-resize', edge: { south: true, east: true } },
    { key: 'sw', className: 'absolute bottom-0 left-0 size-3 cursor-nesw-resize', edge: { south: true, west: true } },
  ]

  return (
    <section
      ref={boxRef}
      className="group/win pointer-events-auto fixed flex min-h-0 min-w-0 flex-col overflow-visible bg-transparent text-(--dsw-label)"
      style={style}
      data-testid={`plugin-app-window-${extraId}`}
      data-plugin-id={pluginId}
      data-biu-plugin={pluginId}
      data-shell-width={shell.width}
      data-shell-height={shell.height}
      data-shell-resizable={shell.resizable ? '1' : '0'}
      data-fullscreen={fullscreen || undefined}
      data-controls={controlsOpen ? 'open' : undefined}
      data-minimized={minimized || undefined}
      aria-hidden={minimized || undefined}
      inert={minimized || undefined}
      onPointerDown={bringFront}
      onPointerEnter={fullscreen || minimized ? undefined : openControls}
      onPointerLeave={fullscreen || minimized ? undefined : closeControlsSoon}
    >
      <div className="plugin-store-window-body relative flex min-h-0 min-w-0 flex-1 overflow-hidden bg-transparent">
        {children}
      </div>
      <div
        className={
          fullscreen
            ? 'pointer-events-auto absolute top-1/2 right-2 z-20 flex -translate-y-1/2'
            : 'pointer-events-auto absolute top-1/2 left-full z-20 flex -translate-y-1/2 pl-1.5'
        }
        data-testid={`plugin-window-controls-${extraId}`}
        data-controls-place={fullscreen ? 'inside' : 'outside'}
        onPointerEnter={openControls}
        onPointerLeave={closeControlsSoon}
      >
        <nav
          className={`relative flex flex-col gap-1 rounded-lg bg-white/10 p-1 shadow-[0_1px_2px_rgba(15,15,15,.04)] backdrop-blur-sm transition-opacity duration-150 ${
            controlsOpen ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'
          }`}
          aria-label={`${title} 窗口`}
        >
        <button
          type="button"
          className="flex size-8 cursor-grab items-center justify-center rounded-md border-0 bg-transparent p-0 text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-800 active:cursor-grabbing"
          title="移动窗口"
          aria-label={`移动 ${title}`}
          data-plugin-move
          data-testid={`plugin-window-move-${extraId}`}
          disabled={fullscreen}
          onPointerDown={startDrag}
        >
          <Bars2Icon className="size-5" />
        </button>
        <button
          type="button"
          className="flex size-8 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-800"
          title="关闭"
          aria-label={`关闭 ${title}`}
          onClick={onClose}
        >
          <XMarkIcon className="size-5" />
        </button>
        <button
          type="button"
          className="flex size-8 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-800"
          title="最小化"
          aria-label={`最小化 ${title}`}
          onClick={onMinimize}
        >
          <MinusIcon className="size-5" />
        </button>
        {shell.resizable ? (
        <button
          type="button"
          className="flex size-8 cursor-pointer items-center justify-center rounded-md border-0 bg-transparent p-0 text-neutral-500 transition-colors hover:bg-black/5 hover:text-neutral-800"
          title={fullscreen ? '还原' : '全屏'}
          aria-label={fullscreen ? `还原 ${title}` : `全屏 ${title}`}
          onClick={onToggleFullscreen}
        >
          {fullscreen ? <ArrowsPointingInIcon className="size-5" /> : <ArrowsPointingOutIcon className="size-5" />}
        </button>
        ) : null}
        </nav>
      </div>
      {fullscreen || !shell.resizable
        ? null
        : handles.map((item) => (
            <div
              key={item.key}
              className={`${item.className} pointer-events-none z-10 opacity-0 group-hover/win:pointer-events-auto group-hover/win:opacity-100`}
              onPointerDown={startResize(item.edge)}
            />
          ))}
    </section>
  )
}

function PluginExtrasLayer(props: SlotProps) {
  const slots = props.slots as SlotsService
  const extras = useSlotEntries(slots, 'plugin-store-extras')
  const [listings, setListings] = useState<StoreListing[]>([])
  const [minimized, setMinimized] = useState<Record<string, boolean>>({})
  const [dismissed, setDismissed] = useState<Record<string, boolean>>({})
  const [fullscreenId, setFullscreenId] = useState<string | null>(null)

  useEffect(() => {
    if (extras.length === 0) return
    let cancelled = false
    const load = () => {
      void readJson<{ items: StoreListing[] }>('/api/db/list?path=/plugins')
        .then((data) => {
          if (!cancelled) setListings(data.items ?? [])
        })
        .catch(() => {
          if (!cancelled) setListings([])
        })
    }
    load()
    window.addEventListener('fsdb:change', load)
    return () => {
      cancelled = true
      window.removeEventListener('fsdb:change', load)
    }
  }, [extras.map((item) => item.id).join('|')])

  async function closePlugin(id: string) {
    try {
      await readJson('/api/db/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: `/plugins/${id}`, action: 'stop' }),
      })
    } catch {
      /* extras 卸载后窗口会消失 */
    }
  }

  function dismissAndStop(entryId: string, pluginId: string) {
    setDismissed((cur) => ({ ...cur, [entryId]: true }))
    setMinimized((cur) => {
      const next = { ...cur }
      delete next[entryId]
      return next
    })
    if (fullscreenId === entryId) setFullscreenId(null)
    void closePlugin(pluginId)
  }

  const sorted = [...extras].sort((a, b) => a.order - b.order)

  useEffect(() => {
    const live = new Set(sorted.map((entry) => entry.id))
    const prune = (cur: Record<string, boolean>) => {
      let changed = false
      const next = { ...cur }
      for (const id of Object.keys(next)) {
        if (live.has(id)) continue
        delete next[id]
        changed = true
      }
      return changed ? next : cur
    }
    setDismissed(prune)
    setMinimized(prune)
  }, [sorted.map((entry) => entry.id).join('|')])

  const windows = sorted.flatMap((entry) => {
    if (dismissed[entry.id]) return []
    const listing = resolveListing(entry.id, listings)
    const extraProps = entry.props?.() ?? {}
    if (listingIsHeadless(listing) || extraProps.headless === true) return []
    const pluginId = listing?.id ?? entry.id
    const title = listing?.name ?? (typeof extraProps.title === 'string' ? extraProps.title : entry.id)
    return [{ entry, listing, extraProps, pluginId, title }]
  })

  const trayItems: PluginTrayItem[] = windows.map(({ entry, extraProps, title }) => ({
    id: entry.id,
    title,
    Icon: typeof extraProps.Icon === 'function' ? (extraProps.Icon as PluginTrayItem['Icon']) : undefined,
  }))

  if (extras.length === 0) return null
  return (
    <div className="pointer-events-none fixed inset-0 z-20" data-testid="plugin-store-extras">
      {windows.map(({ entry, pluginId, title, listing }) => {
        const isMin = Boolean(minimized[entry.id])
        const shell = storeShellFromRecord(listing)
        const Component = entry.Component
        return (
          <PluginAppWindow
            key={entry.id}
            extraId={entry.id}
            title={title}
            pluginId={pluginId}
            shell={shell}
            fullscreen={!isMin && Boolean(shell.resizable) && fullscreenId === entry.id}
            minimized={isMin}
            onClose={() => dismissAndStop(entry.id, pluginId)}
            onMinimize={() => {
              if (fullscreenId === entry.id) setFullscreenId(null)
              setMinimized((cur) => ({ ...cur, [entry.id]: true }))
            }}
            onToggleFullscreen={() => {
              if (!shell.resizable) return
              setFullscreenId((cur) => (cur === entry.id ? null : entry.id))
            }}
          >
            <Component renderSlot={() => null} />
          </PluginAppWindow>
        )
      })}
      <PluginTrayPortal
        items={trayItems}
        minimized={minimized}
        onRestore={(id) => {
          setMinimized((cur) => {
            const next = { ...cur }
            delete next[id]
            return next
          })
        }}
        onMinimize={(id) => {
          if (fullscreenId === id) setFullscreenId(null)
          setMinimized((cur) => ({ ...cur, [id]: true }))
        }}
      />
    </div>
  )
}

export function apply(ctx: Context) {
  const slots = ctx.get('slots') as SlotsService | undefined
  if (!slots) throw new Error('slots service required')
  const ui = ctx.get('databaseUi') as DatabaseUi
  ctx.effect(() => ui.decorate('/plugins', pluginsChrome).dispose)
  ctx.effect(() =>
    ui
      .registerView('/plugins', {
        id: 'workbench',
        label: '工作台',
        plugin: name,
        View: PluginWorkbenchView,
      })
      .dispose,
  )
  ctx.effect(() => listenEnablePageBlockPlugin())
  ctx.effect(() => watchInstalledPageBlocks())
  ctx.effect(() => watchRunningWindowPlugins())
  slots.place('root-overlays', PluginExtrasLayer, {
    key: 'plugin-store-extras-layer',
    order: 20,
    props: () => ({ slots }),
    children: {
      'plugin-store-extras': { kind: 'list' },
    },
  })
}

if (typeof document !== 'undefined') {
  const id = 'biu-plugin-store-window-style'
  const style = document.getElementById(id) ?? document.createElement('style')
  style.id = id
  style.textContent = `
.plugin-store-window-body > * { box-sizing:border-box; width:100%; height:100%; min-width:0; min-height:0; }
.plugin-wb-board{display:flex;flex-direction:column;gap:10px;margin:8px 0 14px}
.plugin-wb-steps{display:flex;flex-wrap:wrap;gap:6px;margin:0;padding:0;list-style:none}
.plugin-wb-steps li{font-size:12px;color:var(--dsw-label-3);padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--dsw-border) 55%,transparent)}
.plugin-wb-steps li[data-on]{color:var(--dsw-label);background:color-mix(in srgb,var(--dsw-business) 16%,transparent)}
.plugin-wb-brief{margin:0;font-size:13px;color:var(--dsw-label-2)}
.plugin-wb-pill{flex:none;font-size:11px;font-weight:600;color:var(--dsw-label-3);padding:1px 6px;border-radius:999px;background:color-mix(in srgb,var(--dsw-border) 55%,transparent)}
.plugin-wb-demo{--wb-bg:#fff;--wb-ink:#171717;--wb-muted:#737373;--wb-accent:#171717;background:var(--wb-bg);color:var(--wb-ink);border:1px solid color-mix(in srgb,var(--wb-ink) 12%,transparent);border-radius:10px;padding:12px;font-size:13px}
.plugin-wb-card,.plugin-wb-stack{display:flex;flex-direction:column;gap:8px}
.plugin-wb-row,.plugin-wb-tabs{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.plugin-wb-list{display:flex;flex-direction:column;border:1px solid color-mix(in srgb,var(--wb-ink) 10%,transparent);border-radius:8px;overflow:hidden}
.plugin-wb-list > *{padding:8px 10px;border-bottom:1px solid color-mix(in srgb,var(--wb-ink) 8%,transparent)}
.plugin-wb-list > *:last-child{border-bottom:0}
.plugin-wb-btn{height:28px;padding:0 10px;border:0;border-radius:6px;background:var(--wb-accent);color:var(--wb-bg);font:inherit;cursor:pointer}
.plugin-wb-btn[data-on]{outline:2px solid var(--wb-ink)}
.plugin-wb-field{border:1px dashed color-mix(in srgb,var(--wb-muted) 70%,transparent);border-radius:6px;padding:6px 8px;color:var(--wb-muted)}
.plugin-wb-text{color:var(--wb-ink)}
.plugin-wb-stat{font-weight:600;font-variant-numeric:tabular-nums}
.plugin-wb-view{display:flex;flex-direction:column;gap:8px;padding:12px}
.plugin-wb-card-btn{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;text-align:left;padding:10px 12px;border:1px solid var(--dsw-border);border-radius:10px;background:var(--dsw-bg);color:inherit;font:inherit;cursor:pointer}
`
  document.documentElement.appendChild(style)
}
