import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Duplex } from 'node:stream'
import { Service, type Context } from 'cordis'
import { WebSocketServer, type WebSocket } from 'ws'
import { HUB_CHANGE } from '@biu/types/http'
import { hostPort, hostSharePort, hostShareProxyUi } from '@biu/host-plugin-loader/env'
import type { Method, RouteContext, RouteHandler, RouteOptions, RouteScope } from '@biu/types/http'
import {
  currentAccountId,
  currentPluginId,
  currentRequestWorkspaceId,
  profilePath,
  runWithAccount,
  runWithRequestWorkspace,
} from '@biu/host-plugin-loader/data-dir'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import { getAccountPort } from '@biu/host-plugin-loader/ports'
import { isShareApiPath, isSharePublicPath } from './share-gate.ts'
import { isAssetTicketEligiblePath, signAssetTicket, verifyAssetTicket } from './asset-ticket.ts'
import { consumeWsTicket, issueWsTicket, resolveCorsOrigin } from './ws-ticket.ts'

interface Route {
  method: Method
  pattern: string
  keys: string[]
  regexp: RegExp
  handler: RouteHandler
  pluginId?: string
  scope?: RouteScope
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.map': 'application/json',
}

function isHashedAssetPath(pathname: string) {
  return /^\/assets\/[^/]+$/.test(pathname) && Boolean(MIME[extname(pathname)])
}

/**
 * 默认所有 WS 事件在已绑定空间的连接上均按租户隔离（fail-closed）；
 * 仅明确声明为无敏感载荷的全局广播事件允许跨租户推送。
 */
const GLOBAL_BROADCAST_EVENTS = new Set(['plugins/changed', 'clock'])

/** 已绑定空间的连接只接收同一空间的租户事件。非 database 事件还要落到同一账号。数据变更要给同空间的其他成员，否则详情里的正文无法互相刷新。未绑定的本机连接仍接收全部。 */
export function deliverTenantEvent(
  socket: { workspaceId?: string; accountId?: string },
  type: string,
  event: { workspaceId?: string; accountId?: string } = {},
) {
  if (!socket.workspaceId || GLOBAL_BROADCAST_EVENTS.has(type)) return true
  if (!event.workspaceId || event.workspaceId !== socket.workspaceId) return false
  if (type !== 'database' && event.accountId && event.accountId !== socket.accountId) return false
  return true
}

function compile(pattern: string) {
  const keys: string[] = []
  const regexp = new RegExp(
    '^' +
    pattern.replace(/:([A-Za-z0-9_]+)/g, (_, key) => {
      keys.push(key)
      return '([^/]+)'
    }) +
    '$',
  )
  return { keys, regexp }
}

const DEFAULT_MAX_BODY_BYTES = 10 * 1024 * 1024
const UPLOAD_MAX_BODY_BYTES = 50 * 1024 * 1024
const WS_HEARTBEAT_INTERVAL_MS = 30_000
const DEFAULT_MAX_WS_PER_ACCOUNT = 20

export class PayloadTooLargeError extends Error {
  readonly status = 413
  constructor(public readonly maxBytes: number) {
    super(`payload exceeds limit of ${maxBytes} bytes`)
    this.name = 'PayloadTooLargeError'
  }
}

export function maxBodyBytesForPath(pathname: string): number {
  const configured = Number(process.env.BIU_HTTP_MAX_BODY_BYTES)
  if (Number.isInteger(configured) && configured > 0) return configured
  if (/\/(artifacts|assets|files|upload|import)(\/|$)/.test(pathname)) return UPLOAD_MAX_BODY_BYTES
  return DEFAULT_MAX_BODY_BYTES
}

function maxWsPerAccount(): number {
  const configured = Number(process.env.BIU_WS_MAX_PER_ACCOUNT)
  if (Number.isInteger(configured) && configured > 0) return configured
  return DEFAULT_MAX_WS_PER_ACCOUNT
}

export function readBody(req: IncomingMessage, maxBytes = DEFAULT_MAX_BODY_BYTES): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let exceeded = false
    req.on('data', (chunk) => {
      if (exceeded) return
      const buf = Buffer.from(chunk)
      total += buf.length
      if (maxBytes > 0 && total > maxBytes) {
        exceeded = true
        chunks.length = 0
        req.resume()
        reject(new PayloadTooLargeError(maxBytes))
        return
      }
      chunks.push(buf)
    })
    req.on('end', () => {
      if (!exceeded) resolve(Buffer.concat(chunks))
    })
    req.on('error', (err) => {
      if (!exceeded) reject(err)
    })
  })
}

function parseJson(raw: Buffer): unknown {
  if (!raw.length) return null
  try {
    return JSON.parse(raw.toString('utf8'))
  } catch {
    throw new Error('invalid json')
  }
}

export type HttpListenConfig = {
  port?: number
  host?: string
  publicDir?: string
  /** 请求端口被占用时回退到系统分配端口。 */
  fallbackPort?: boolean
  /** LAN listener that only serves share pages. 0 = off. */
  sharePort?: number
  shareHost?: string
}

function defaultSharePort(port: number) {
  const raw = hostSharePort()
  if (raw !== undefined && raw !== '') return Number(raw)
  if (process.env.VITEST) return 0
  return port
}

function defaultPublicDir() {
  const env = String(process.env.BIU_PUBLIC_DIR ?? '').trim()
  if (env) return env
  const dist = join(process.cwd(), 'dist')
  if (existsSync(join(dist, 'index.html'))) return dist
  return join(process.cwd(), 'public')
}

function documentTheme(): 'light' | 'dark' {
  try {
    const file = profilePath()
    const raw = JSON.parse(readFileSync(file, 'utf8')) as { theme?: unknown }
    if (raw.theme === 'dark' || raw.theme === 'light') return raw.theme
  } catch {
    /* default light */
  }
  return 'light'
}

export function paintDocumentTheme(html: string, theme = documentTheme()) {
  return html
    .replace(/\bclass="(?:light|dark)"/, `class="${theme}"`)
    .replace('data-theme-source="static"', 'data-theme-source="server"')
    .replace(/content="(?:light|dark)"/, `content="${theme}"`)
}

function asHtml(data: Buffer) {
  return Buffer.from(paintDocumentTheme(data.toString('utf8')))
}

function resolveListenConfig(config?: HttpListenConfig) {
  const port = hostPort(config?.port)
  const sharePortRaw = config?.sharePort ?? defaultSharePort(port)
  return {
    port,
    host: config?.host ?? process.env.HTTP_HOST ?? '0.0.0.0',
    publicDir: config?.publicDir ?? defaultPublicDir(),
    fallbackPort: config?.fallbackPort ?? process.env.BIU_PORT_FALLBACK === '1',
    sharePort: Number.isFinite(sharePortRaw) ? sharePortRaw : 0,
    shareHost: config?.shareHost ?? process.env.SHARE_HOST ?? '0.0.0.0',
  }
}

/** 旧路径：/api/sessions 与 /api/account/sessions → /agents。 */
export function rewriteLegacyAgentApi(pathname: string) {
  const accountLegacy = '/api/account/' + 'sessions'
  if (pathname === accountLegacy || pathname.startsWith(accountLegacy + '/')) {
    return '/api/account/agents' + pathname.slice(accountLegacy.length)
  }
  const legacy = '/api/' + 'sessions'
  if (pathname === legacy || pathname.startsWith(legacy + '/')) {
    return '/api/agents' + pathname.slice(legacy.length)
  }
  return pathname
}

function upgradePath(req: IncomingMessage) {
  try {
    return new URL(req.url ?? '/', 'http://localhost').pathname
  } catch {
    return '/'
  }
}

export class HttpService extends Service {
  private routes: Route[] = []
  private sockets = new Set<WebSocket>()
  private socketsByWorkspace = new Map<string, Set<WebSocket>>()
  private socketsByAccount = new Map<string, Set<WebSocket>>()
  private unboundSockets = new Set<WebSocket>()
  private socketMeta = new WeakMap<WebSocket, { accountId: string; workspaceId: string; token: string }>()
  private socketAlive = new WeakMap<WebSocket, boolean>()
  private sessionReadCache = new Map<string, { allowed: boolean; expiresAt: number }>()
  private server: Server | null = null
  /** 同一 HTTP server 上只能有一条 upgrade 路由；多挂几个 `ws.Server({ server })` 会互相 abort 握手。 */
  private wsServers = new Map<string, WebSocketServer>()

  constructor(ctx: Context, public config: { port: number; host: string; publicDir: string; fallbackPort: boolean; sharePort: number; shareHost: string }) {
    super(ctx, 'http')
    this.route(
      'GET',
      '/api/runtime',
      (route) => {
        const policy = getRuntimePolicy()
        let wsId = currentRequestWorkspaceId()
        let location: 'device' | 'cloud' | null = null
        const account = getAccountPort(this.ctx)
        if (!wsId && policy.allowImplicitActiveWorkspace) {
          wsId = String(account?.store?.activeWorkspaceId?.() ?? '').trim()
        }
        if (wsId) {
          location = policy.hostMode === 'cloud' ? 'cloud' : (account?.workspaceLocation?.(wsId) ?? 'device')
        }
        route.send(200, {
          ...policy,
          workspace: wsId ? { id: wsId, location: location ?? (policy.hostMode === 'cloud' ? 'cloud' : 'device') } : null,
        })
      },
      { scope: 'host' },
    )
    this.route(
      'GET',
      '/api/asset-ticket',
      (route) => {
        const accountId = currentAccountId()
        const workspaceId = currentRequestWorkspaceId()
        if (!accountId || !workspaceId) {
          route.send(401, { error: '需要登录并指定空间' })
          return
        }
        route.send(200, signAssetTicket({ accountId, workspaceId }))
      },
      { scope: 'workspace' },
    )
    this.route(
      'POST',
      '/api/ws-ticket',
      (route) => {
        const accountId = currentAccountId()
        const workspaceId = currentRequestWorkspaceId()
        if (!accountId || !workspaceId) {
          route.send(401, { error: '需要登录并指定空间' })
          return
        }
        const authHeader = String(route.req.headers.authorization ?? '')
        const bearerMatch = /^Bearer\s+(\S+)$/i.exec(authHeader)
        const cookie = String(route.req.headers.cookie ?? '')
        const encoded = cookie
          .split(';')
          .map((part) => part.trim())
          .find((part) => part.startsWith('biu_account=') || part.startsWith('biu_legacy_account='))
        const cookieToken = encoded ? decodeURIComponent(encoded.slice(encoded.indexOf('=') + 1)) : ''
        const sessionToken = bearerMatch?.[1] ?? cookieToken
        route.send(200, issueWsTicket({ accountId, workspaceId, sessionToken }))
      },
      { scope: 'workspace' },
    )
    ctx.effect(() => {
      const server = createServer((req, res) => {
        void this.dispatch(req, res, false)
      })
      this.server = server
      const hub = new WebSocketServer({ noServer: true })
      this.wsServers.set('/ws', hub)
      hub.on('connection', (socket, request: IncomingMessage) => {
        const auth = this.authenticateSocket(request)
        if (auth.error) {
          socket.close(auth.error, auth.error === 4403 ? 'workspace' : 'tenant')
          return
        }
        this.registerSocket(socket, auth)
        socket.send(JSON.stringify({ type: 'hello', payload: { ok: true, workspaceId: auth.workspaceId } }))
        socket.on('pong', () => {
          this.socketAlive.set(socket, true)
        })
        socket.on('close', () => {
          this.unregisterSocket(socket)
        })
      })
      const heartbeatTimer = setInterval(() => {
        this.sweepSockets()
      }, WS_HEARTBEAT_INTERVAL_MS)
      heartbeatTimer.unref()
      const onUpgrade = (req: IncomingMessage, socket: Duplex, head: Buffer) => {
        const wss = this.wsServers.get(upgradePath(req))
        if (!wss) {
          socket.destroy()
          return
        }
        wss.handleUpgrade(req, socket, head, (ws) => {
          wss.emit('connection', ws, req)
        })
      }
      server.on('upgrade', onUpgrade)
      ctx.on('session/event', (payload) => this.broadcast('session', payload))
      ctx.on('agent/status', (payload) => this.broadcast('agent', payload))
      ctx.on('agent/inbox', (payload) => this.broadcast('inbox', payload))
      ctx.on('tenant/revoked', (payload) => {
        this.disconnectTenantSockets(
          (meta) =>
            meta.accountId === payload.accountId && (!payload.workspaceId || meta.workspaceId === payload.workspaceId),
          'tenant revoked',
        )
      })
      ctx.on('workspace/deleted', (payload) => {
        this.disconnectTenantSockets((meta) => meta.workspaceId === payload.workspaceId, 'workspace deleted')
      })
      let portFallbackUsed = false
      server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.code === 'EADDRINUSE' && config.fallbackPort && config.port > 0 && !portFallbackUsed) {
          portFallbackUsed = true
          server.listen(0, config.host ?? '127.0.0.1')
          return
        }
        if (error.code === 'EADDRINUSE') {
          ctx.logger('http').error(
            `端口 ${config.port} 已被占用。请先结束旧进程：make stop  或  lsof -ti:${config.port} | xargs kill`,
          )
        } else {
          ctx.logger('http').error(error)
        }
        process.exit(1)
      })
      const host = config.host ?? '127.0.0.1'
      server.listen(config.port, host, () => {
        const address = server.address()
        const port = address && typeof address !== 'string' ? address.port : config.port
        if (config.sharePort > 0 && config.sharePort === config.port) {
          process.env.SHARE_PORT = String(port)
          ctx.emit('http/share-ready', { port })
        }
        ctx.emit('http/ready', { port })
        ctx.logger('http').info(`listening on http://${host}:${port}${host === '0.0.0.0' ? ' (内网可达，工作台 API 需要鉴权)' : ''}`)
      })
      return () =>
        new Promise<void>((resolve) => {
          clearInterval(heartbeatTimer)
          for (const socket of [...this.sockets]) {
            this.unregisterSocket(socket)
            socket.terminate()
          }
          server.off('upgrade', onUpgrade)
          hub.close()
          this.wsServers.delete('/ws')
          this.server = null
          server.closeAllConnections?.()
          server.close(() => resolve())
        })
    }, 'http.listen')
  }

  route(method: Method, pattern: string, handler: RouteHandler, options?: RouteOptions) {
    const pluginId = currentPluginId()
    const scope = options?.scope
    return this.ctx.effect(() => {
      const { keys, regexp } = compile(pattern)
      const item: Route = {
        method,
        pattern,
        keys,
        regexp,
        handler,
        ...(pluginId ? { pluginId } : {}),
        ...(scope ? { scope } : {}),
      }
      this.routes.push(item)
      this.ctx.emit(HUB_CHANGE)
      return () => {
        const i = this.routes.indexOf(item)
        if (i >= 0) this.routes.splice(i, 1)
        this.ctx.emit(HUB_CHANGE)
      }
    }, `http.route ${method} ${pattern}`)
  }

  /** 在已有 HTTP 服务上再挂一条 WebSocket 路径（和 /ws 共用一条 upgrade 分发，互不 abort）。 */
  ws(path: string, handler: (socket: WebSocket, request: IncomingMessage) => void) {
    const pluginId = currentPluginId()
    return this.ctx.effect(() => {
      const wss = new WebSocketServer({ noServer: true })
      wss.on('connection', (socket, request) => {
        const auth = this.authenticateSocket(request)
        if (getRuntimePolicy().authzMode === 'rbac') {
          if (auth.error) {
            socket.close(auth.error, auth.error === 4403 ? 'workspace' : 'tenant')
            return
          }
          const store = getAccountPort(this.ctx)?.store
          if (pluginId && !store?.canAccessPlugin?.(auth.accountId, auth.workspaceId, pluginId)) {
            socket.close(4403, 'plugin access')
            return
          }
        }
        runWithAccount(auth.accountId, () => runWithRequestWorkspace(auth.workspaceId, () => handler(socket, request)))
      })
      this.wsServers.set(path, wss)
      return () => {
        if (this.wsServers.get(path) === wss) this.wsServers.delete(path)
        wss.close()
      }
    }, `http.ws ${path}`)
  }

  private registerSocket(socket: WebSocket, meta: { accountId: string; workspaceId: string; token: string }) {
    if (getRuntimePolicy().enforceTenantQuotas && meta.accountId) {
      const existing = this.socketsByAccount.get(meta.accountId)
      const cap = maxWsPerAccount()
      if (existing && existing.size >= cap) {
        const oldest = existing.values().next().value as WebSocket | undefined
        if (oldest) {
          this.unregisterSocket(oldest)
          oldest.close(4429, 'too many connections')
        }
      }
    }
    this.socketMeta.set(socket, meta)
    this.socketAlive.set(socket, true)
    this.sockets.add(socket)
    if (meta.workspaceId) {
      let bucket = this.socketsByWorkspace.get(meta.workspaceId)
      if (!bucket) {
        bucket = new Set()
        this.socketsByWorkspace.set(meta.workspaceId, bucket)
      }
      bucket.add(socket)
    } else {
      this.unboundSockets.add(socket)
    }
    if (meta.accountId) {
      let bucket = this.socketsByAccount.get(meta.accountId)
      if (!bucket) {
        bucket = new Set()
        this.socketsByAccount.set(meta.accountId, bucket)
      }
      bucket.add(socket)
    }
  }

  private unregisterSocket(socket: WebSocket) {
    const meta = this.socketMeta.get(socket)
    this.sockets.delete(socket)
    this.unboundSockets.delete(socket)
    this.socketAlive.delete(socket)
    if (meta?.workspaceId) {
      const bucket = this.socketsByWorkspace.get(meta.workspaceId)
      bucket?.delete(socket)
      if (bucket && bucket.size === 0) this.socketsByWorkspace.delete(meta.workspaceId)
    }
    if (meta?.accountId) {
      const bucket = this.socketsByAccount.get(meta.accountId)
      bucket?.delete(socket)
      if (bucket && bucket.size === 0) this.socketsByAccount.delete(meta.accountId)
    }
    this.socketMeta.delete(socket)
  }

  /** 定期清理僵死连接，并兜底复核云端 token/成员资格（不在每次广播热路径查 SQLite）。 */
  private sweepSockets() {
    const store = getAccountPort(this.ctx)?.store
    for (const socket of [...this.sockets]) {
      if (socket.readyState !== socket.OPEN) {
        this.unregisterSocket(socket)
        continue
      }
      if (this.socketAlive.get(socket) === false) {
        this.unregisterSocket(socket)
        socket.terminate()
        continue
      }
      const meta = this.socketMeta.get(socket)
      if (meta?.accountId && meta.workspaceId && store) {
        if (
          (store.accountByToken && store.accountByToken(meta.token)?.id !== meta.accountId) ||
          (store.isMember && !store.isMember(meta.accountId, meta.workspaceId))
        ) {
          this.unregisterSocket(socket)
          socket.close(4403, 'membership revoked')
          continue
        }
      }
      this.socketAlive.set(socket, false)
      try {
        socket.ping()
      } catch {
        this.unregisterSocket(socket)
        socket.terminate()
      }
    }
  }

  /** 租户吊销或工作区删除时立即踢出匹配的 WebSocket 长连接并失效权限缓存。 */
  disconnectTenantSockets(
    predicate: (meta: { accountId?: string; workspaceId?: string }) => boolean,
    reason = 'tenant revoked',
  ): number {
    this.sessionReadCache.clear()
    let closed = 0
    for (const socket of [...this.sockets]) {
      const meta = this.socketMeta.get(socket)
      if (!meta || !predicate(meta)) continue
      this.unregisterSocket(socket)
      try {
        socket.close(4403, reason)
      } catch {
        try {
          socket.terminate()
        } catch {
          /* ignore */
        }
      }
      closed += 1
    }
    return closed
  }

  private canAccountReadSession(workspaceId: string, sessionId: string, targetAccountId: string): boolean {
    if (!targetAccountId || !workspaceId || !sessionId) return false
    const store = getAccountPort(this.ctx)?.store
    if (!store?.canReadRecord) return false
    const key = `${workspaceId}:${sessionId}:${targetAccountId}`
    const now = Date.now()
    const cached = this.sessionReadCache.get(key)
    if (cached && cached.expiresAt > now) return cached.allowed
    let allowed = false
    try {
      allowed = runWithAccount(targetAccountId, () =>
        runWithRequestWorkspace(workspaceId, () => Boolean(store.canReadRecord?.('/agents', sessionId))),
      )
    } catch {
      allowed = false
    }
    if (this.sessionReadCache.size >= 500) this.sessionReadCache.clear()
    this.sessionReadCache.set(key, { allowed, expiresAt: now + 2000 })
    return allowed
  }

  broadcast(type: string, payload: unknown, workspaceId?: string, accountId?: string) {
    let sessionId = ''
    if (payload && typeof payload === 'object') {
      const scoped = payload as { workspaceId?: unknown; accountId?: unknown; sessionId?: unknown }
      workspaceId ||= typeof scoped.workspaceId === 'string' ? scoped.workspaceId : ''
      accountId ||= typeof scoped.accountId === 'string' ? scoped.accountId : ''
      sessionId = typeof scoped.sessionId === 'string' ? scoped.sessionId : ''
      if ((!workspaceId || !accountId) && sessionId) {
        const tenant = getAccountPort(this.ctx)?.store?.tenantForRecord?.('/agents', sessionId)
        workspaceId ||= tenant?.workspaceId ?? ''
        accountId ||= tenant?.accountId ?? ''
      }
    }
    workspaceId ||= currentRequestWorkspaceId()
    accountId ||= currentAccountId()
    const data = JSON.stringify({ type, payload, ts: Date.now() })
    const sendIfEligible = (socket: WebSocket) => {
      if (socket.readyState !== socket.OPEN) return
      const meta = this.socketMeta.get(socket)
      if (!deliverTenantEvent(meta ?? {}, type, { workspaceId, accountId })) return
      socket.send(data)
    }
    if (!GLOBAL_BROADCAST_EVENTS.has(type)) {
      if (workspaceId) {
        if (type !== 'database' && sessionId && getAccountPort(this.ctx)?.store?.canReadRecord) {
          const wsSockets = this.socketsByWorkspace.get(workspaceId)
          if (wsSockets) {
            for (const socket of wsSockets) {
              if (socket.readyState !== socket.OPEN) continue
              const meta = this.socketMeta.get(socket)
              if (!meta) continue
              if (
                (accountId && meta.accountId === accountId) ||
                (!accountId && !meta.accountId) ||
                (meta.accountId && this.canAccountReadSession(workspaceId, sessionId, meta.accountId))
              ) {
                socket.send(data)
              }
            }
          }
        } else if (type !== 'database' && accountId) {
          const acctSockets = this.socketsByAccount.get(accountId)
          if (acctSockets) for (const socket of acctSockets) sendIfEligible(socket)
        } else {
          const wsSockets = this.socketsByWorkspace.get(workspaceId)
          if (wsSockets) for (const socket of wsSockets) sendIfEligible(socket)
        }
      }
      for (const socket of this.unboundSockets) sendIfEligible(socket)
      return
    }
    for (const socket of this.sockets) sendIfEligible(socket)
  }

  broadcastAccount(accountId: string, type: string, payload: unknown) {
    const bucket = this.socketsByAccount.get(accountId)
    if (!bucket || bucket.size === 0) return
    const data = JSON.stringify({ type, payload, ts: Date.now() })
    for (const socket of bucket) {
      if (socket.readyState === socket.OPEN) socket.send(data)
    }
  }

  disconnectTenant(accountId: string, workspaceId: string) {
    const bucket = this.socketsByAccount.get(accountId)
    if (!bucket) return
    for (const socket of [...bucket]) {
      const meta = this.socketMeta.get(socket)
      if (meta?.workspaceId === workspaceId) {
        this.unregisterSocket(socket)
        socket.close(4403, 'membership revoked')
      }
    }
  }

  disconnectRevokedSessions(accountId: string) {
    const bucket = this.socketsByAccount.get(accountId)
    if (!bucket) return
    const store = getAccountPort(this.ctx)?.store
    for (const socket of [...bucket]) {
      const meta = this.socketMeta.get(socket)
      if (meta && store?.accountByToken?.(meta.token)?.id !== accountId) {
        this.unregisterSocket(socket)
        socket.close(4401, 'session revoked')
      }
    }
  }

  private authenticateSocket(request: IncomingMessage) {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const cookie = String(request.headers.cookie ?? '')
    const encoded = cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('biu_account=') || part.startsWith('biu_legacy_account='))
    const cookieToken = encoded ? decodeURIComponent(encoded.slice(encoded.indexOf('=') + 1)) : ''
    const authHeader = String(request.headers.authorization ?? '')
    const bearerMatch = /^Bearer\s+(\S+)$/i.exec(authHeader)
    const bearerToken = bearerMatch?.[1] ?? ''
    const preview = url.searchParams.get('landingPreview') === '1'
    const wsTicketRaw = preview ? '' : String(url.searchParams.get('wsTicket') ?? '').trim()
    let token = preview ? '' : (url.searchParams.get('token') ?? (bearerToken || cookieToken))
    let workspaceId = preview ? '' : (url.searchParams.get('workspaceId') ?? '')
    let accountId = ''
    const store = getAccountPort(this.ctx)?.store
    if (wsTicketRaw) {
      const consumed = consumeWsTicket(wsTicketRaw)
      if (!consumed) {
        return { accountId: '', workspaceId: '', token: '', error: 4401 as const }
      }
      if (workspaceId && workspaceId !== consumed.workspaceId) {
        return { accountId: consumed.accountId, workspaceId, token: consumed.sessionToken, error: 4403 as const }
      }
      accountId = consumed.accountId
      workspaceId = consumed.workspaceId
      token = consumed.sessionToken
      // Verify underlying session is still active when sessionToken is present
      if (token && store?.accountByToken && store.accountByToken(token)?.id !== accountId) {
        return { accountId: '', workspaceId, token: '', error: 4401 as const }
      }
    } else {
      try {
        accountId = token ? store?.accountByToken?.(token)?.id ?? '' : ''
      } catch {
        accountId = ''
      }
    }
    if (!workspaceId && accountId) {
      workspaceId = runWithAccount(accountId, () => String(store?.activeWorkspaceId?.() ?? '').trim())
    }
    if (accountId && workspaceId && store?.isMember && !store.isMember(accountId, workspaceId)) {
      return { accountId, workspaceId, token, error: 4403 as const }
    }
    if (getRuntimePolicy().authzMode === 'rbac' && (!accountId || !workspaceId)) {
      return { accountId, workspaceId, token, error: 4401 as const }
    }
    return { accountId, workspaceId, token, error: 0 as const }
  }

  listRoutes() {
    return this.routes.map(({ method, pattern }) => ({ method, pattern }))
  }

  private async dispatch(req: IncomingMessage, res: ServerResponse, shareOnly: boolean) {
    const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    url.pathname = rewriteLegacyAgentApi(url.pathname)
    const method = (req.method ?? 'GET').toUpperCase() as Method
    const cors = resolveCorsOrigin(req.headers.origin)
    const corsHeaders: Record<string, string> = {
      ...(cors.allowOrigin ? { 'Access-Control-Allow-Origin': cors.allowOrigin } : {}),
      ...(cors.varyOrigin ? { Vary: 'Origin' } : {}),
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, X-Biu-Workspace-Id, X-Biu-Resource-Path, X-Share-Password, If-Match, If-None-Match, mcp-session-id, mcp-protocol-version, Last-Event-ID',
      'Access-Control-Expose-Headers': 'ETag, Content-Disposition, Last-Modified, mcp-session-id, mcp-protocol-version',
      'Access-Control-Max-Age': '86400',
    }
    // CORS 预检：跨内网机器的浏览器请求，先给 OPTIONS 放行
    if ((req.method ?? '').toUpperCase() === 'OPTIONS') {
      if (shareOnly && !isSharePublicPath(url.pathname)) {
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders })
        res.end(JSON.stringify({ error: 'share-only listener' }))
        return
      }
      res.writeHead(204, corsHeaders)
      res.end()
      return
    }
    if (shareOnly && !isSharePublicPath(url.pathname)) {
      res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders })
      res.end(JSON.stringify({ error: 'share-only listener — workstation stays on localhost' }))
      return
    }
    // 静态段优先于 :param，避免 `/api/approvals/mode` 被 `/api/approvals/:id` 吃掉
    const match = this.routes
      .filter((route) => route.method === method && route.regexp.test(url.pathname))
      .filter((route) => !shareOnly || isShareApiPath(url.pathname))
      .sort((a, b) => a.keys.length - b.keys.length || b.pattern.length - a.pattern.length)[0]
    if (match) {
      const result = url.pathname.match(match.regexp)
      const params: Record<string, string> = {}
      match.keys.forEach((key, i) => {
        params[key] = decodeURIComponent(result?.[i + 1] ?? '')
      })
      let rawBody: Promise<Buffer> | null = null
      const maxBytes = maxBodyBytesForPath(url.pathname)
      const body = () => {
        if (!rawBody) rawBody = readBody(req, maxBytes)
        return rawBody
      }
      const context: RouteContext = {
        req,
        res,
        params,
        query: url.searchParams,
        json: async <T = unknown>() => parseJson(await body()) as T,
        bytes: () => body(),
        send: (status, body) => {
          res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders })
          try {
            res.end(JSON.stringify(body))
          } catch (error) {
            res.end(JSON.stringify({ error: String(error) }))
          }
        },
      }
      const started = Date.now()
      try {
        const header = String(req.headers.authorization ?? '')
        const bearerToken = /^Bearer\s+(\S+)$/i.exec(header)?.[1] ?? ''
        const cookie = String(req.headers.cookie ?? '')
        const encoded = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('biu_account='))
        const legacyEncoded = cookie
          .split(';')
          .map((part) => part.trim())
          .find((part) => part.startsWith('biu_legacy_account='))
        const accountToken = encoded ? decodeURIComponent(encoded.slice('biu_account='.length)) : ''
        const legacyToken = legacyEncoded ? decodeURIComponent(legacyEncoded.slice('biu_legacy_account='.length)) : ''
        const token = bearerToken || accountToken || legacyToken
        let accountId = ''
        let ticketWorkspace = ''
        const accountStore = getAccountPort(this.ctx)?.store
        if (token) {
          try {
            accountId = accountStore?.accountByToken?.(token)?.id ?? ''
          } catch {
            accountId = ''
          }
        }
        if (!accountId && isAssetTicketEligiblePath(method, url.pathname)) {
          const verified = verifyAssetTicket(url.searchParams)
          if (verified) {
            accountId = verified.accountId
            ticketWorkspace = verified.workspaceId
          }
        }
        if (accountId && legacyToken && !accountToken) {
          res.setHeader('set-cookie', [
            `biu_account=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`,
            'biu_legacy_account=; Path=/; SameSite=Strict; Max-Age=0',
          ])
        }
        const hasAccountSystem = Boolean(accountStore?.accountByToken)
        const publicApi =
          url.pathname === '/api/runtime' ||
          url.pathname.startsWith('/api/account/') ||
          url.pathname.startsWith('/api/share/') ||
          url.pathname === '/api/mcp' ||
          url.pathname.startsWith('/api/mcp/') ||
          (method === 'GET' && url.pathname.startsWith('/api/plugin-store/files/'))
        if (hasAccountSystem && url.pathname.startsWith('/api/') && !publicApi && !accountId) {
          context.send(401, { error: '需要登录' })
          return
        }
        const headerWorkspace = ticketWorkspace || String(req.headers['x-biu-workspace-id'] ?? '').trim()
        const requestedWorkspace = await runWithAccount(accountId, async () => {
          if (headerWorkspace) return headerWorkspace
          if (!accountId) return ''
          return String(accountStore?.activeWorkspaceId?.() ?? '').trim()
        })
        if (
          hasAccountSystem &&
          accountId &&
          url.pathname.startsWith('/api/') &&
          !publicApi &&
          !requestedWorkspace
        ) {
          context.send(400, { error: '需要空间' })
          return
        }
        if (accountId && token) this.ctx.emit('account/request', { accountId, token })
        const identityRoute = url.pathname === '/api/account/me' || url.pathname === '/api/runtime'
        if (
          !identityRoute &&
          accountId &&
          requestedWorkspace &&
          accountStore?.isMember &&
          !accountStore.isMember(accountId, requestedWorkspace)
        ) {
          context.send(403, { error: '不在这个空间' })
          return
        }
        if (getRuntimePolicy().authzMode === 'rbac' && match.pluginId) {
          const allowed = accountStore?.canAccessPlugin?.(accountId, requestedWorkspace, match.pluginId)
          if (!allowed) {
            context.send(404, { error: 'not found' })
            return
          }
        }
        await runWithAccount(accountId, () => runWithRequestWorkspace(requestedWorkspace, () => match.handler(context)))
      } catch (error) {
        if (error instanceof PayloadTooLargeError) {
          if (!res.headersSent) context.send(413, { error: error.message, maxBytes: error.maxBytes })
        } else {
          this.ctx.logger('http').error(error)
          if (!res.headersSent) context.send(500, { error: String(error) })
        }
      }
      const ms = Date.now() - started
      if (ms >= 8 || url.pathname.startsWith('/api/db')) {
        this.ctx.logger('http').info(`${method} ${url.pathname}${url.search} ${ms}ms`)
      }
      return
    }
    if (method === 'GET') {
      if (shareOnly && isShareApiPath(url.pathname)) {
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders })
        res.end(JSON.stringify({ error: 'not found' }))
        return
      }
      const proxied = await this.proxyShareUi(url.pathname, res)
      if (proxied) return
      await this.serveStatic(url.pathname, res, shareOnly)
      return
    }
    res.writeHead(404, { 'content-type': 'application/json; charset=utf-8', ...corsHeaders })
    res.end(JSON.stringify({ error: 'not found' }))
  }

  private async proxyShareUi(pathname: string, res: ServerResponse) {
    const base = hostShareProxyUi()
    if (!base) return false
    try {
      const upstream = await fetch(`${base}${pathname}`)
      const type = upstream.headers.get('content-type') ?? MIME[extname(pathname)] ?? 'application/octet-stream'
      if (isHashedAssetPath(pathname) && (upstream.status === 404 || type.includes('text/html'))) return false
      let buf = Buffer.from(await upstream.arrayBuffer())
      if (type.includes('text/html')) {
        const html = buf
          .toString('utf8')
          .replace(/<script\b[^>]*\bsrc=["']\/@vite\/client["'][^>]*><\/script>\s*/gi, '')
        buf = asHtml(Buffer.from(html))
      }
      res.writeHead(upstream.status, {
        'content-type': type,
        ...(type.includes('text/html') ? { 'cache-control': 'no-store' } : {}),
      })
      res.end(buf)
      return true
    } catch {
      return false
    }
  }

  private async serveStatic(pathname: string, res: ServerResponse, shareOnly = false) {
    const relative = (pathname === '/' ? '/index.html' : pathname).replace(/\.\./g, '')
    try {
      let data = await readFile(join(this.config.publicDir, relative))
      const type = MIME[extname(relative)] ?? 'application/octet-stream'
      if (type.includes('text/html')) data = asHtml(data)
      res.writeHead(200, {
        'content-type': type,
        ...(type.includes('text/html') ? { 'cache-control': 'no-store' } : {}),
      })
      res.end(data)
    } catch {
      if (pathname.startsWith('/api/')) {
        res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify({ error: 'not found — 对应插件可能已卸载' }))
        return
      }
      if (isHashedAssetPath(pathname)) {
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
        res.end('not found')
        return
      }
      if (shareOnly && !pathname.startsWith('/share')) {
        res.writeHead(404).end('not found')
        return
      }
      // SPA fallback：前端 History 路由（/login、/register、/agents/:id… 或 /share/:token）回落到 index.html
      try {
        const data = asHtml(await readFile(join(this.config.publicDir, 'index.html')))
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
        res.end(data)
      } catch {
        res.writeHead(404).end('not found')
      }
    }
  }
}

export const name = 'http'
export const inject = [] as const

export function apply(ctx: Context, config?: HttpListenConfig) {
  new HttpService(ctx, resolveListenConfig(config))
}
