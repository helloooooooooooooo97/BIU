import { ArrowsPointingInIcon, ArrowsPointingOutIcon } from '@heroicons/react/16/solid'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import { createPortal } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export const name = 'page-excalidraw'
export const inject = ['pageEditor']

type PageEditor = {
    registerBlock: (spec: {
      kind: string
      plugin: string
      label: string
      blockType?: string
      blockTypeLabel?: string
      hint?: string
      aliases?: string[]
      defaults?: () => Record<string, unknown>
      View: (props: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void; writable: boolean }) => unknown
    }) => void
}

type Scene = {
  elements?: unknown[]
  appState?: Record<string, unknown>
  files?: Record<string, unknown>
}

type DrawApi = {
  refresh: () => void
  scrollToContent?: (target?: unknown, opts?: { fitToContent?: boolean; animate?: boolean }) => void
  updateScene?: (data: {
    elements?: unknown
    appState?: Record<string, unknown>
    captureUpdate?: unknown
  }) => void
  addFiles?: (files: unknown[]) => void
}

function emptyScene(): Scene {
  return { elements: [], appState: { showWelcomeScreen: false }, files: {} }
}

function withoutCollab(appState: unknown): Record<string, unknown> {
  if (!appState || typeof appState !== 'object' || Array.isArray(appState)) return {}
  const { collaborators: _c, ...rest } = appState as Record<string, unknown>
  return rest
}

function parseScene(raw: unknown): Scene {
  if (!raw || typeof raw !== 'object') return emptyScene()
  const o = raw as Scene
  return {
    elements: Array.isArray(o.elements) ? o.elements : [],
    appState: withoutCollab(o.appState),
    files: o.files && typeof o.files === 'object' ? o.files : {},
  }
}

function assetName(file: string) {
  return file.replace(/^assets\//, '')
}

async function loadScene(file: string, bust = false): Promise<{ scene: Scene; etag: string }> {
  const name = assetName(file)
  const res = await fetch(`/api/page/file/${encodeURIComponent(name)}${bust ? `?t=${Date.now()}` : ''}`)
  if (res.status === 404) {
    const scene = emptyScene()
    const created = await fetch(`/api/page/file/${encodeURIComponent(name)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(scene),
    })
    const etag = etagFromResponse(created)
    return { scene, etag }
  }
  if (!res.ok) return { scene: emptyScene(), etag: '' }
  try {
    return { scene: parseScene(JSON.parse(await res.text())), etag: etagFromResponse(res) }
  } catch {
    return { scene: emptyScene(), etag: etagFromResponse(res) }
  }
}

function etagFromResponse(res: Response) {
  return String(res.headers.get('etag') ?? '').replace(/^W\//, '').replaceAll('"', '')
}

async function saveScene(file: string, scene: Scene, etag: string) {
  const name = assetName(file)
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (etag) headers['If-Match'] = `"${etag}"`
  const res = await fetch(`/api/page/file/${encodeURIComponent(name)}`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(scene),
  })
  if (res.status === 409) return { ok: false as const, etag: etagFromResponse(res) }
  if (!res.ok) return { ok: false as const, etag }
  return { ok: true as const, etag: etagFromResponse(res) || etag }
}

function fitView(api: DrawApi | null) {
  if (!api) return
  api.refresh?.()
  api.scrollToContent?.(undefined, { fitToContent: true, animate: false })
}

function readAppTheme(): 'light' | 'dark' {
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

function useAppTheme() {
  const [theme, setTheme] = useState(readAppTheme)
  useEffect(() => {
    const observer = new MutationObserver(() => setTheme(readAppTheme()))
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return theme
}

const UI_OPTIONS = { canvasActions: { loadScene: false, saveToActiveFile: false } } as const

type Host = {
  file: string
  el: HTMLDivElement
  root: Root | null
  refs: number
  ready: Promise<Host>
  initialData: { elements: never; appState: Record<string, unknown>; files: never } | null
  lastScene: Scene | null
  etag: string
  pending: ReturnType<typeof setTimeout> | null
  quietUntil: number
  appliedEtag: string
  api: DrawApi | null
  expanded: boolean
  sync?: () => void
  onCollapse?: () => void
}

const hosts = new Map<string, Host>()
let syncQueued = false

function cancelPending(host: Host) {
  if (!host.pending) return
  clearTimeout(host.pending)
  host.pending = null
}

function sceneData(scene: Scene) {
  return {
    elements: (scene.elements ?? []) as never,
    appState: { ...withoutCollab(scene.appState), isLoading: false, showWelcomeScreen: false, collaborators: new Map() },
    files: (scene.files ?? {}) as never,
  }
}

function applyScene(host: Host, scene: Scene, etag: string) {
  if (etag && host.appliedEtag === etag) return
  host.etag = etag
  host.appliedEtag = etag
  host.lastScene = scene
  host.initialData = sceneData(scene)
  host.quietUntil = Date.now() + 1200
  const data = host.initialData
  if (host.api?.updateScene) {
    host.api.updateScene({
      elements: data.elements,
      appState: withoutCollab(scene.appState),
      captureUpdate: 'NEVER',
    })
    const files = scene.files && typeof scene.files === 'object' ? Object.values(scene.files) : []
    if (files.length) host.api.addFiles?.(files)
    return
  }
  paintHost(host)
}

async function reloadHost(file: string) {
  const host = hosts.get(file)
  if (!host) return
  cancelPending(host)
  const loaded = await loadScene(file, true)
  if (hosts.get(file) !== host) return
  applyScene(host, loaded.scene, loaded.etag)
}

if (typeof window !== 'undefined') {
  window.addEventListener('biu:asset-changed', ((event: Event) => {
    const detail = (event as CustomEvent<{ name?: string; etag?: string }>).detail
    const name = String(detail?.name ?? '')
    if (!name) return
    for (const [file, host] of hosts) {
      if (assetName(file) !== name && file !== name) continue
      if (Date.now() < host.quietUntil) continue
      if (detail?.etag && (host.appliedEtag === detail.etag || host.etag === detail.etag)) continue
      cancelPending(host)
      void reloadHost(file)
    }
  }) as EventListener)
}

function queueHostSync() {
  if (syncQueued) return
  syncQueued = true
  requestAnimationFrame(() => {
    syncQueued = false
    for (const host of hosts.values()) host.sync?.()
  })
}

/** 卸下或卸载时先藏起来再挂到 body，避免 inset:0 铺满视口闪一下全屏。 */
function parkHost(host: Host) {
  host.expanded = false
  const el = host.el
  el.style.cssText =
    'position:fixed;width:0;height:0;overflow:hidden;visibility:hidden;pointer-events:none;inset:auto'
  if (el.parentElement !== document.body) document.body.appendChild(el)
}

function placeHost(host: Host, slot: HTMLElement | null) {
  const el = host.el
  if (host.expanded) {
    if (el.parentElement !== document.body) document.body.appendChild(el)
    el.style.cssText =
      'position:fixed;inset:12px;width:auto;height:auto;z-index:9992;pointer-events:auto;visibility:visible;overflow:hidden;isolation:isolate;background:var(--biu-color-bg)'
    return
  }
  if (!slot?.isConnected) {
    parkHost(host)
    return
  }
  if (el.parentElement !== slot) slot.appendChild(el)
  el.style.cssText =
    'position:absolute;inset:0;width:100%;height:100%;z-index:2;pointer-events:none;visibility:visible;overflow:hidden;isolation:isolate;background:var(--biu-color-bg)'
  requestAnimationFrame(() => fitView(host.api))
}

function paintHost(host: Host) {
  if (!host.root || !host.initialData) return
  host.root.render(
    <PersistentDraw file={host.file} initialData={host.initialData} expanded={host.expanded} />,
  )
}

function retainHost(file: string) {
  const current = hosts.get(file)
  if (current) {
    current.refs += 1
    return current
  }
  const el = document.createElement('div')
  el.dataset.excalidrawHost = file
  document.body.appendChild(el)
  const host: Host = {
    file,
    el,
    root: null,
    refs: 1,
    ready: Promise.resolve(null as unknown as Host),
    initialData: null,
    lastScene: null,
    etag: '',
    pending: null,
    quietUntil: 0,
    appliedEtag: '',
    api: null,
    expanded: false,
  }
  host.ready = loadScene(file).then((loaded) => {
    if (hosts.get(file) !== host) return host
    const scene = loaded.scene
    host.etag = loaded.etag
    host.appliedEtag = loaded.etag
    host.quietUntil = Date.now() + 1200
    host.initialData = sceneData(scene)
    host.lastScene = scene
    host.root = createRoot(el)
    paintHost(host)
    return host
  })
  hosts.set(file, host)
  if (hosts.size === 1) {
    window.addEventListener('scroll', queueHostSync, true)
    window.addEventListener('resize', queueHostSync)
  }
  return host
}

function releaseHost(file: string) {
  const host = hosts.get(file)
  if (!host) return
  host.refs -= 1
  if (host.refs > 0) return
  queueMicrotask(() => {
    if (host.refs > 0) return
    host.root?.unmount()
    host.el.remove()
    hosts.delete(file)
    if (!hosts.size) {
      window.removeEventListener('scroll', queueHostSync, true)
      window.removeEventListener('resize', queueHostSync)
    }
  })
}

function PersistentDraw(props: {
  file: string
  initialData: NonNullable<Host['initialData']>
  expanded: boolean
}) {
  const file = props.file
  const theme = useAppTheme()
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSaved = useRef('')
  const etagRef = useRef(hosts.get(file)?.etag ?? '')
  const apiRef = useRef<DrawApi | null>(null)
  const bindApi = useCallback((api: DrawApi | null) => {
    apiRef.current = api
    const hosted = hosts.get(file)
    if (hosted) hosted.api = api
  }, [file])
  const onChange = useCallback((elements: unknown[], appState: Record<string, unknown>, files: Record<string, unknown>) => {
    if (!file) return
    const next: Scene = {
      elements,
      appState: withoutCollab(appState),
      files,
    }
    const raw = JSON.stringify(next)
    const hosted = hosts.get(file)
    if (hosted) {
      etagRef.current = hosted.etag
      hosted.lastScene = next
    }
    if (hosted && Date.now() < hosted.quietUntil) {
      lastSaved.current = raw
      return
    }
    if (raw === lastSaved.current) return
    lastSaved.current = raw
    if (pending.current) clearTimeout(pending.current)
    pending.current = setTimeout(() => {
      const hostedNow = hosts.get(file)
      if (hostedNow) hostedNow.pending = null
      void saveScene(file, next, etagRef.current).then((result) => {
        if (result.ok) {
          etagRef.current = result.etag
          const live = hosts.get(file)
          if (live) {
            live.etag = result.etag
            live.appliedEtag = result.etag
            live.quietUntil = Date.now() + 1200
          }
          return
        }
        void reloadHost(file)
      })
    }, 400)
    const hostedPending = hosts.get(file)
    if (hostedPending) hostedPending.pending = pending.current
  }, [file])

  useEffect(() => {
    if (!props.expanded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') hosts.get(props.file)?.onCollapse?.()
    }
    window.addEventListener('keydown', onKey)
    const id = requestAnimationFrame(() => fitView(apiRef.current))
    return () => {
      window.removeEventListener('keydown', onKey)
      cancelAnimationFrame(id)
    }
  }, [props.expanded, props.file])

  return (
    <div style={{ height: '100%', width: '100%', isolation: 'isolate', overflow: 'hidden' }}>
      <Excalidraw
        theme={theme}
        initialData={props.initialData as never}
        viewModeEnabled={false}
        zenModeEnabled={!props.expanded}
        UIOptions={UI_OPTIONS as never}
        onChange={onChange as never}
        excalidrawAPI={bindApi as never}
      />
    </div>
  )
}

function DrawSideBar(props: { expanded: boolean; onToggle: () => void }) {
  return (
    <div
      className="page-slide-bar"
      data-testid="excalidraw-side-bar"
      data-biu-ignore
      style={props.expanded ? { position: 'fixed', top: 12, right: 4, zIndex: 9993, opacity: 1 } : undefined}
    >
      <button
        type="button"
        className="page-slide-icon"
        tabIndex={-1}
        data-page-block-expand=""
        data-testid="excalidraw-expand"
        title={props.expanded ? '缩小' : '放大'}
        aria-label={props.expanded ? '缩小' : '放大'}
        onMouseDown={(event) => event.preventDefault()}
        onClick={props.onToggle}
      >
        {props.expanded ? (
          <ArrowsPointingInIcon aria-hidden className="page-slide-ico" />
        ) : (
          <ArrowsPointingOutIcon aria-hidden className="page-slide-ico" />
        )}
      </button>
    </div>
  )
}

function Board(props: { data: Record<string, unknown>; update: (p: Record<string, unknown>) => void; writable: boolean }) {
  const file = String(props.data.file || '')
  const [expanded, setExpanded] = useState(false)
  const slotRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!file) {
      props.update({ file: `assets/画板-${crypto.randomUUID().slice(0, 8)}.json` })
    }
  }, [file])

  useLayoutEffect(() => {
    if (!file) return
    retainHost(file)
    return () => {
      const host = hosts.get(file)
      if (host) parkHost(host)
      releaseHost(file)
    }
  }, [file])

  useLayoutEffect(() => {
    if (!file) return
    const host = hosts.get(file)
    if (!host) return
    host.expanded = expanded
    host.onCollapse = () => setExpanded(false)
    host.sync = () => {
      host.expanded = expanded
      placeHost(host, slotRef.current)
    }
    void host.ready.then(() => {
      if (hosts.get(file) !== host) return
      paintHost(host)
      host.sync?.()
    })
    host.sync()
    return () => {
      if (host.onCollapse) host.onCollapse = undefined
      if (host.sync) host.sync = undefined
    }
  }, [file, expanded])

  if (!file) return <div className="text-sm text-[var(--muted-foreground)]">正在创建画板文件…</div>

  const bar = (
    <DrawSideBar expanded={expanded} onToggle={() => setExpanded((v) => !v)} />
  )

  return (
    <div
      data-testid="page-excalidraw"
      style={{ position: 'relative', overflow: 'visible', background: 'var(--biu-color-bg)', borderRadius: 8 }}
    >
      {expanded ? createPortal(bar, document.body) : bar}
      <div ref={slotRef} style={{ position: 'relative', height: 280, overflow: 'hidden', borderRadius: 8 }} />
    </div>
  )
}

export function apply(ctx: { pageEditor: PageEditor }) {
  ctx.pageEditor.registerBlock({
    kind: 'excalidraw',
    plugin: name,
    label: '画板',
    blockType: 'excalidraw',
    blockTypeLabel: '画板',
    hint: '手绘白板，放大后编辑',
    aliases: ['excalidraw', 'draw', '白板', '画板', 'board'],
    assets: ['file'],
    defaults: () => ({ file: `assets/画板-${crypto.randomUUID().slice(0, 8)}.json` }),
    View: Board,
  })
}
