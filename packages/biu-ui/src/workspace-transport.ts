import { abortApiScope, apiFetch } from './api-client.ts'
import { resetWorkspaceClientCaches } from './cache.ts'
import { readStorageString } from './client-storage.ts'

export type AssetTicket = {
  uid: string
  ws: string
  exp: number
  sig: string
}

export type WorkspaceEndpoint = {
  mode: 'local' | 'cloud'
  /** Empty string for same-origin local host; e.g. "https://cloud.biu.dev" for direct cloud transport. */
  origin: string
  workspaceId: string
  /** In-memory cloud Bearer token (never persisted to localStorage). */
  token?: string
  assetTicket?: AssetTicket | null
}

const DEFAULT_ENDPOINT: WorkspaceEndpoint = {
  mode: 'local',
  origin: '',
  workspaceId: '',
  assetTicket: null,
}

let activeEndpoint: WorkspaceEndpoint = { ...DEFAULT_ENDPOINT }
const endpointListeners = new Set<(endpoint: WorkspaceEndpoint) => void>()

/**
 * Host-shell control paths that always stay on the local desktop host (3151),
 * even when the active workspace is hosted on a remote cloud server.
 * Everything else under `/api/*` routes directly to the active workspace's cloud origin.
 */
const HOST_CONTROL_EXACT_PATHS = new Set([
  '/api/runtime',
  '/api/update',
  '/api/account/me',
  '/api/account/active',
  '/api/account/login',
  '/api/account/register',
  '/api/account/logout',
  '/api/account/password',
  '/api/account/profile',
  '/api/account/workspaces',
])

export function isHostControlPath(pathname: string): boolean {
  const clean = pathname.split('?')[0] || ''
  if (HOST_CONTROL_EXACT_PATHS.has(clean)) return true
  if (clean === '/api/account/cloud' || clean.startsWith('/api/account/cloud/')) return true
  if (clean.startsWith('/api/account/invites/')) return true
  return false
}

const AGENT_ARTIFACT_PATH_RE = /^\/api\/agents\/[^/]+\/artifacts\/[^/]+$/

function isSignedAssetPath(pathname: string): boolean {
  const clean = pathname.split('?')[0] || ''
  return (
    clean.startsWith('/api/db/file/') ||
    clean.startsWith('/api/page/file/') ||
    clean.startsWith('/api/doc/file/') ||
    AGENT_ARTIFACT_PATH_RE.test(clean)
  )
}

export function getWorkspaceEndpoint(): WorkspaceEndpoint {
  return activeEndpoint
}

export function subscribeWorkspaceEndpoint(listener: (endpoint: WorkspaceEndpoint) => void): () => void {
  endpointListeners.add(listener)
  return () => {
    endpointListeners.delete(listener)
  }
}

export function setWorkspaceEndpoint(next: WorkspaceEndpoint): void {
  const normalized: WorkspaceEndpoint = {
    mode: next.mode === 'cloud' && next.origin ? 'cloud' : 'local',
    origin: next.mode === 'cloud' ? next.origin.replace(/\/+$/, '') : '',
    workspaceId: next.workspaceId.trim(),
    ...(next.token ? { token: next.token } : {}),
    assetTicket: next.assetTicket ?? null,
  }
  const scopeChanged =
    normalized.mode !== activeEndpoint.mode ||
    normalized.origin !== activeEndpoint.origin ||
    normalized.workspaceId !== activeEndpoint.workspaceId
  const changed = scopeChanged || normalized.token !== activeEndpoint.token
  activeEndpoint = normalized
  if (scopeChanged) {
    resetWorkspaceClientCaches()
  } else if (changed) {
    abortApiScope('workspace-endpoint-changed')
  }
  for (const fn of endpointListeners) {
    try {
      fn(activeEndpoint)
    } catch {
      /* isolate subscriber errors */
    }
  }
}

export function updateWorkspaceAssetTicket(ticket: AssetTicket | null): void {
  activeEndpoint = { ...activeEndpoint, assetTicket: ticket }
  for (const fn of endpointListeners) {
    try {
      fn(activeEndpoint)
    } catch {
      /* ignore */
    }
  }
}

export function resetWorkspaceEndpoint(): void {
  setWorkspaceEndpoint(DEFAULT_ENDPOINT)
}

function applyCloudHeaders(base: HeadersInit | undefined, extra: Record<string, string>): Headers {
  const headers = new Headers(base)
  // Always override local host credentials (e.g. local 3151 Bearer token injected by
  // registerApiRequestInterceptor) with the cloud workspace's credentials.
  for (const [k, v] of Object.entries(extra)) {
    headers.set(k, v)
  }
  return headers
}

/**
 * Resolve an `/api/*` request against the active WorkspaceEndpoint.
 * In cloud mode, all non-host-shell workspace APIs go directly to the cloud origin
 * with Bearer token and `X-Biu-Workspace-Id` headers attached.
 */
export function resolveApiRequest(
  path: string,
  init: RequestInit = {},
): { url: string; init: RequestInit } {
  if (!path.startsWith('/api/')) return { url: path, init }
  const ep = activeEndpoint
  if (ep.mode !== 'cloud' || !ep.origin) return { url: path, init }
  if (isHostControlPath(path)) return { url: path, init }

  const extra: Record<string, string> = {}
  if (ep.token) extra.Authorization = `Bearer ${ep.token}`
  if (ep.workspaceId) extra['X-Biu-Workspace-Id'] = ep.workspaceId
  const headers = applyCloudHeaders(init.headers, extra)
  return {
    url: `${ep.origin}${path}`,
    // Direct cross-origin cloud calls authenticate via Bearer token, never cookies.
    // Using 'omit' guarantees compatibility with `Access-Control-Allow-Origin: *`.
    init: { ...init, credentials: 'omit', headers },
  }
}

/**
 * Mint a short-lived, single-use WebSocket handshake ticket from the active cloud origin
 * (`POST /api/ws-ticket`) so long-lived Bearer session tokens never appear in WS URLs.
 */
export async function mintWsTicket(ep: WorkspaceEndpoint = activeEndpoint): Promise<string | null> {
  if (ep.mode !== 'cloud' || !ep.origin || !ep.token || !ep.workspaceId) return null
  try {
    const res = await globalThis.fetch(`${ep.origin}/api/ws-ticket`, {
      method: 'POST',
      credentials: 'omit',
      headers: {
        Authorization: `Bearer ${ep.token}`,
        'X-Biu-Workspace-Id': ep.workspaceId,
      },
    })
    if (!res.ok) return null
    const body = (await res.json().catch(() => ({}))) as { ticket?: unknown }
    return typeof body.ticket === 'string' && body.ticket.trim() ? body.ticket.trim() : null
  } catch {
    return null
  }
}

/**
 * Resolve a WebSocket path (`/ws` or any custom `ctx.http.ws(path)`) to the active endpoint.
 * In cloud mode, prefers a single-use `wsTicket` when provided (keeping long-lived Bearer
 * tokens out of URL query strings); falls back to `token` only when no ticket is supplied.
 */
export function resolveWsUrl(path = '/ws', opts?: { wsTicket?: string | null }): string {
  const ep = activeEndpoint
  if (ep.mode === 'cloud' && ep.origin) {
    const wsOrigin = ep.origin.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://')
    const url = new URL(path.startsWith('/') ? path : `/${path}`, wsOrigin)
    if (ep.workspaceId && !url.searchParams.has('workspaceId')) {
      url.searchParams.set('workspaceId', ep.workspaceId)
    }
    const ticket = opts?.wsTicket?.trim()
    if (ticket) {
      url.searchParams.delete('token')
      url.searchParams.set('wsTicket', ticket)
    } else if (ep.token && !url.searchParams.has('token') && !url.searchParams.has('wsTicket')) {
      url.searchParams.set('token', ep.token)
    }
    return url.toString()
  }
  if (typeof window !== 'undefined' && window.location) {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    const url = new URL(path.startsWith('/') ? path : `/${path}`, `${proto}//${window.location.host}`)
    if (ep.workspaceId && !url.searchParams.has('workspaceId')) {
      url.searchParams.set('workspaceId', ep.workspaceId)
    }
    return url.toString()
  }
  return path
}

/**
 * Rewrite relative binary/media URLs (`/api/db/file/*`, `/api/page/file/*`, `/api/doc/file/*`,
 * `/api/agents/:id/artifacts/:name`) to direct cloud origin URLs signed with the short-lived
 * HMAC asset ticket so `<img>`, `<video>`, and downloads work cross-origin without cookies or proxy.
 */
export function resolveAssetUrl(rawUrl: string): string {
  if (!rawUrl) return rawUrl
  if (/^(?:https?:|data:|blob:)/i.test(rawUrl)) return rawUrl
  if (!isSignedAssetPath(rawUrl)) return rawUrl
  const ep = activeEndpoint
  if (ep.mode !== 'cloud' || !ep.origin) return rawUrl
  const url = new URL(rawUrl, ep.origin)
  const ticket = ep.assetTicket
  if (ticket && ticket.exp > Date.now()) {
    url.searchParams.set('uid', ticket.uid)
    url.searchParams.set('ws', ticket.ws)
    url.searchParams.set('exp', String(ticket.exp))
    url.searchParams.set('sig', ticket.sig)
  }
  return url.toString()
}

const ASSET_SRC_ATTR = 'data-biu-asset-src'
const ASSET_HREF_ATTR = 'data-biu-asset-href'

/**
 * Rewrite relative asset `src` / `href` attributes on DOM elements (`<img>`, `<video>`, `<audio>`,
 * `<source>`, `<a>`) to direct signed cloud URLs, tracking the original logical path so ticket
 * rotations can re-sign live elements transparently.
 */
export function rewriteElementAssetUrls(root: { querySelectorAll?: (selector: string) => Iterable<Element> } | Element): void {
  const apply = (el: Element) => {
    const tag = el.tagName?.toUpperCase()
    if (tag === 'IMG' || tag === 'VIDEO' || tag === 'AUDIO' || tag === 'SOURCE') {
      const logical = el.getAttribute(ASSET_SRC_ATTR) || el.getAttribute('src') || ''
      if (isSignedAssetPath(logical)) {
        if (!el.hasAttribute(ASSET_SRC_ATTR)) el.setAttribute(ASSET_SRC_ATTR, logical)
        const next = resolveAssetUrl(logical)
        if (el.getAttribute('src') !== next) el.setAttribute('src', next)
      }
    } else if (tag === 'A') {
      const logical = el.getAttribute(ASSET_HREF_ATTR) || el.getAttribute('href') || ''
      if (isSignedAssetPath(logical)) {
        if (!el.hasAttribute(ASSET_HREF_ATTR)) el.setAttribute(ASSET_HREF_ATTR, logical)
        const next = resolveAssetUrl(logical)
        if (el.getAttribute('href') !== next) el.setAttribute('href', next)
      }
    }
  }
  if ('tagName' in root && typeof root.tagName === 'string') {
    apply(root as Element)
  }
  if (typeof root.querySelectorAll === 'function') {
    for (const el of root.querySelectorAll('img,video,audio,source,a')) {
      apply(el)
    }
  }
}

let assetObserverCleanup: (() => void) | null = null

function installAssetUrlObserver(): () => void {
  if (assetObserverCleanup || typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => {}
  }
  rewriteElementAssetUrls(document)
  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      if (m.type === 'attributes' && m.target instanceof Element) {
        rewriteElementAssetUrls(m.target)
      } else if (m.type === 'childList') {
        for (const node of m.addedNodes) {
          if (node instanceof Element) rewriteElementAssetUrls(node)
        }
      }
    }
  })
  observer.observe(document.documentElement, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['src', 'href'],
  })
  const unsub = subscribeWorkspaceEndpoint(() => {
    rewriteElementAssetUrls(document)
  })
  assetObserverCleanup = () => {
    observer.disconnect()
    unsub()
    assetObserverCleanup = null
  }
  return assetObserverCleanup
}

let globalTransportInstalled = false

/**
 * Install an idempotent global `fetch` & `WebSocket` router on `globalThis` so
 * all plugins (including third-party plugins using bare `fetch('/api/...')` or `new WebSocket('/ws')`)
 * transparently route directly to the active cloud workspace origin without a local proxy hop.
 */
export function installGlobalWorkspaceTransport(): () => void {
  if (globalTransportInstalled || typeof globalThis === 'undefined') return () => {}
  const origFetch = globalThis.fetch?.bind(globalThis)
  const OrigWebSocket = globalThis.WebSocket
  if (!origFetch) return () => {}
  globalTransportInstalled = true

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      if (!isHostControlPath(input) && endpointSyncPromise) {
        return waitForWorkspaceEndpointReady().then(() => {
          const resolved = resolveApiRequest(input, init)
          return origFetch(resolved.url, resolved.init)
        })
      }
      const resolved = resolveApiRequest(input, init)
      return origFetch(resolved.url, resolved.init)
    }
    return origFetch(input, init)
  }) as typeof globalThis.fetch

  if (OrigWebSocket) {
    const WrappedWebSocket = function (this: unknown, url: string | URL, protocols?: string | string[]) {
      const raw = typeof url === 'string' ? url : url.toString()
      let target = raw
      if (typeof window !== 'undefined' && window.location) {
        const localWsPrefix = `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.host}`
        if (raw.startsWith('/ws')) {
          target = resolveWsUrl(raw)
        } else if (raw.startsWith(`${localWsPrefix}/ws`)) {
          target = resolveWsUrl(raw.slice(localWsPrefix.length))
        }
      } else if (raw.startsWith('/ws')) {
        target = resolveWsUrl(raw)
      }
      return protocols !== undefined ? new OrigWebSocket(target, protocols) : new OrigWebSocket(target)
    } as unknown as typeof WebSocket
    WrappedWebSocket.prototype = OrigWebSocket.prototype
    Object.assign(WrappedWebSocket, {
      CONNECTING: OrigWebSocket.CONNECTING,
      OPEN: OrigWebSocket.OPEN,
      CLOSING: OrigWebSocket.CLOSING,
      CLOSED: OrigWebSocket.CLOSED,
    })
    globalThis.WebSocket = WrappedWebSocket
  }

  const stopObserver = installAssetUrlObserver()

  return () => {
    stopObserver()
    globalThis.fetch = origFetch
    if (OrigWebSocket) globalThis.WebSocket = OrigWebSocket
    globalTransportInstalled = false
  }
}

let ticketRefreshTimer: ReturnType<typeof setInterval> | null = null
let endpointSyncPromise: Promise<WorkspaceEndpoint> | null = null
let endpointSyncSeq = 0

/**
 * Returns the currently in-flight `syncWorkspaceEndpoint()` promise if one is pending,
 * or `null` when the endpoint is already settled (allowing callers to stay synchronous).
 */
export function getPendingWorkspaceEndpointSync(): Promise<WorkspaceEndpoint> | null {
  return endpointSyncPromise
}

/**
 * Wait for any in-flight `syncWorkspaceEndpoint()` call to finish before dispatching
 * workspace-scoped `/api/*` requests, preventing boot-time and workspace-switch races.
 */
async function waitForWorkspaceEndpointReady(): Promise<WorkspaceEndpoint> {
  if (endpointSyncPromise) {
    try {
      await endpointSyncPromise
    } catch {
      /* ignore sync errors; fall back to current activeEndpoint */
    }
  }
  return activeEndpoint
}

function localControlHeaders(): Record<string, string> {
  const headers: Record<string, string> = {}
  const token = readStorageString('biu.account.token')
  if (token) headers.Authorization = `Bearer ${token}`
  const ws = readStorageString('biu.workspaceId', 'session') || readStorageString('biu.workspaceId')
  if (ws) headers['X-Biu-Workspace-Id'] = ws
  return headers
}

/**
 * Fetch active workspace endpoint from local desktop host (`/api/account/cloud/endpoint`).
 * If active workspace is cloud, immediately mints a short-lived asset ticket from the cloud origin
 * and schedules automatic renewal every 10 minutes.
 */
export async function syncWorkspaceEndpoint(workspaceId = ''): Promise<WorkspaceEndpoint> {
  const seq = ++endpointSyncSeq
  if (ticketRefreshTimer) {
    clearInterval(ticketRefreshTimer)
    ticketRefreshTimer = null
  }
  const effectiveWorkspaceId =
    workspaceId.trim() ||
    readStorageString('biu.workspaceId', 'session') ||
    readStorageString('biu.workspaceId') ||
    ''
  const qs = effectiveWorkspaceId ? `?workspaceId=${encodeURIComponent(effectiveWorkspaceId)}` : ''
  const run = (async (): Promise<WorkspaceEndpoint> => {
    try {
      const res = await apiFetch(`/api/account/cloud/endpoint${qs}`, {
        headers: localControlHeaders(),
      })
      if (seq !== endpointSyncSeq) return getWorkspaceEndpoint()
      if (!res.ok) {
        resetWorkspaceEndpoint()
        return getWorkspaceEndpoint()
      }
      const data = (await res.json()) as {
        mode?: 'local' | 'cloud'
        origin?: string
        workspaceId?: string
        token?: string
      }
      if (seq !== endpointSyncSeq) return getWorkspaceEndpoint()
      if (data.mode === 'cloud' && data.origin && data.workspaceId) {
        setWorkspaceEndpoint({
          mode: 'cloud',
          origin: data.origin,
          workspaceId: data.workspaceId,
          token: data.token,
          assetTicket: null,
        })
        const refreshTicket = async () => {
          const ep = getWorkspaceEndpoint()
          if (ep.mode !== 'cloud' || !ep.origin) return
          try {
            const tRes = await globalThis.fetch(`${ep.origin}/api/asset-ticket`, {
              credentials: 'omit',
              headers: {
                ...(ep.token ? { Authorization: `Bearer ${ep.token}` } : {}),
                ...(ep.workspaceId ? { 'X-Biu-Workspace-Id': ep.workspaceId } : {}),
              },
            })
            if (tRes.ok) {
              const ticket = (await tRes.json()) as AssetTicket
              if (ticket?.sig && ticket?.exp) updateWorkspaceAssetTicket(ticket)
            }
          } catch {
            /* retry on next tick */
          }
        }
        // Mint asset ticket in background so workspace API requests aren't delayed by a second round-trip.
        void refreshTicket()
        ticketRefreshTimer = setInterval(() => {
          void refreshTicket()
        }, 10 * 60 * 1000)
        return getWorkspaceEndpoint()
      }
      setWorkspaceEndpoint({
        mode: 'local',
        origin: '',
        workspaceId: data.workspaceId ?? '',
        assetTicket: null,
      })
      return getWorkspaceEndpoint()
    } catch {
      if (seq === endpointSyncSeq) resetWorkspaceEndpoint()
      return getWorkspaceEndpoint()
    }
  })()
  endpointSyncPromise = run
  try {
    return await run
  } finally {
    if (endpointSyncPromise === run) endpointSyncPromise = null
  }
}
