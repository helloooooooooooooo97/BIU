import { abortApiScope } from './api-client.ts'

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

export function isSignedAssetPath(pathname: string): boolean {
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
  const changed =
    normalized.mode !== activeEndpoint.mode ||
    normalized.origin !== activeEndpoint.origin ||
    normalized.workspaceId !== activeEndpoint.workspaceId ||
    normalized.token !== activeEndpoint.token
  activeEndpoint = normalized
  if (changed) {
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

function mergeHeaders(base: HeadersInit | undefined, extra: Record<string, string>): Headers {
  const headers = new Headers(base)
  for (const [k, v] of Object.entries(extra)) {
    if (!headers.has(k)) headers.set(k, v)
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
  const headers = mergeHeaders(init.headers, extra)
  return {
    url: `${ep.origin}${path}`,
    init: { ...init, headers },
  }
}

/**
 * Resolve a WebSocket path (`/ws` or any custom `ctx.http.ws(path)`) to the active endpoint.
 * In cloud mode, connects directly to `ws(s)://<cloud-origin><path>?workspaceId=...&token=...`.
 */
export function resolveWsUrl(path = '/ws'): string {
  const ep = activeEndpoint
  if (ep.mode === 'cloud' && ep.origin) {
    const wsOrigin = ep.origin.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://')
    const url = new URL(path.startsWith('/') ? path : `/${path}`, wsOrigin)
    if (ep.workspaceId && !url.searchParams.has('workspaceId')) {
      url.searchParams.set('workspaceId', ep.workspaceId)
    }
    if (ep.token && !url.searchParams.has('token')) {
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

  return () => {
    globalThis.fetch = origFetch
    if (OrigWebSocket) globalThis.WebSocket = OrigWebSocket
    globalTransportInstalled = false
  }
}

let ticketRefreshTimer: ReturnType<typeof setInterval> | null = null

/**
 * Fetch active workspace endpoint from local desktop host (`/api/account/cloud/endpoint`).
 * If active workspace is cloud, immediately mints a short-lived asset ticket from the cloud origin
 * and schedules automatic renewal every 10 minutes.
 */
export async function syncWorkspaceEndpoint(workspaceId = ''): Promise<WorkspaceEndpoint> {
  if (ticketRefreshTimer) {
    clearInterval(ticketRefreshTimer)
    ticketRefreshTimer = null
  }
  const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : ''
  try {
    const res = await globalThis.fetch(`/api/account/cloud/endpoint${qs}`)
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
      await refreshTicket()
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
    resetWorkspaceEndpoint()
    return getWorkspaceEndpoint()
  }
}
