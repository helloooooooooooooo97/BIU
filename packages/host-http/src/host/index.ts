import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { existsSync, readFileSync } from 'node:fs'
import { extname, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import type { Duplex } from 'node:stream'
import { Service, type Context } from 'cordis'
import { WebSocket as WsClient, WebSocketServer, type WebSocket } from 'ws'
import { HUB_CHANGE } from '@biu/type-http'
import { hostPort, hostSharePort, hostShareProxyUi } from '@biu/host-plugin-loader/env'
import type { Method, RouteContext, RouteHandler, RouteOptions, RouteScope } from '@biu/type-http'
import {
  currentAccountId,
  currentPluginId,
  currentRequestWorkspaceId,
  profilePath,
  runWithAccount,
  runWithRequestWorkspace,
  isOnlineRuntime,
} from '@biu/host-plugin-loader/data-dir'
import { getRuntimePolicy, resolveRemoteCloudTarget } from '@biu/host-plugin-loader/runtime'
import { isShareApiPath, isSharePublicPath } from './share-gate.ts'

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

const TENANT_EVENTS = new Set(['database', 'session', 'agent', 'inbox', 'approval', 'event', 'snapshot'])

/** 已绑定空间的连接只接收同一空间的租户事件。会话类事件还要落到同一账号。数据变更要给同空间的其他成员，否则详情里的正文无法互相刷新。未绑定的本机连接仍接收全部。 */
export function deliverTenantEvent(
  socket: { workspaceId?: string; accountId?: string },
  type: string,
  event: { workspaceId?: string; accountId?: string } = {},
) {
  if (!socket.workspaceId || !TENANT_EVENTS.has(type)) return true
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

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
    req.on('end', () => resolve(Buffer.concat(chunks)))
    req.on('error', reject)
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

const CLOUD_PROXY_WORKSPACE_RE = /^\/api\/account\/workspaces\/([^/]+)\/(?:members|groups|invites)(?:\/|$)/
const CLOUD_PROXY_BODY_WORKSPACE_PATHS = new Set([
  '/api/account/mcp/credentials',
  '/api/account/locks',
  '/api/account/presence',
])
const CLOUD_PROXY_READONLY_DB_TOOLS = new Set(['db_list', 'db_read', 'db_stat'])
const CLOUD_PROXY_TIMEOUT_MS = 60_000

/**
 * 桌面端处于云端空间时（方案 A：云端算力 + 云端数据 + 云端沙盒），
 * 所有 workspace 作用域的接口（数据、协作、Agent 执行与配置、审批、技能、MCP）统一透传到远端云主机。
 * 优先遵循路由注册时声明的 RouteOptions.scope，未声明时回落到路径规则。
 */
export function shouldProxyCloudApi(pathname: string, _method = 'GET', routeScope?: RouteScope): boolean {
  if (routeScope === 'host' || routeScope === 'public') return false
  if (routeScope === 'workspace') return true
  if (
    pathname === '/api/db' ||
    pathname.startsWith('/api/db/') ||
    pathname.startsWith('/api/page/') ||
    pathname.startsWith('/api/doc/') ||
    pathname.startsWith('/api/tag/') ||
    pathname.startsWith('/api/content-turns/') ||
    pathname === '/api/profile'
  ) {
    return true
  }
  if (
    pathname === '/api/agents' ||
    pathname.startsWith('/api/agents/') ||
    pathname === '/api/chat' ||
    pathname.startsWith('/api/chat/') ||
    pathname === '/api/approvals' ||
    pathname.startsWith('/api/approvals/') ||
    pathname.startsWith('/api/skills/') ||
    pathname.startsWith('/api/editor/') ||
    pathname.startsWith('/api/page-sandbox/') ||
    pathname === '/api/mcp/info' ||
    pathname === '/api/mcp/rotate'
  ) {
    return true
  }
  if (
    pathname === '/api/account/workspace-profile' ||
    pathname === '/api/account/starred' ||
    pathname === '/api/account/presence' ||
    pathname === '/api/account/locks' ||
    pathname === '/api/account/access' ||
    pathname.startsWith('/api/account/access/') ||
    pathname === '/api/account/member-activity' ||
    pathname === '/api/account/plugins/audit' ||
    pathname.startsWith('/api/account/mcp/')
  ) {
    return true
  }
  if (CLOUD_PROXY_WORKSPACE_RE.test(pathname)) return true
  return false
}

export function cloudProxyTargetWorkspace(
  pathname: string,
  requestedWorkspace: string,
  query?: URLSearchParams,
  rawBody?: Buffer,
): string {
  const matched = CLOUD_PROXY_WORKSPACE_RE.exec(pathname)
  if (matched?.[1]) {
    try {
      return decodeURIComponent(matched[1])
    } catch {
      return matched[1]
    }
  }
  const fromQuery = String(query?.get('workspaceId') ?? '').trim()
  if (fromQuery) return fromQuery
  if (CLOUD_PROXY_BODY_WORKSPACE_PATHS.has(pathname) && rawBody && rawBody.length > 0) {
    try {
      const parsed = JSON.parse(rawBody.toString('utf8')) as { workspaceId?: unknown }
      const fromBody = typeof parsed?.workspaceId === 'string' ? parsed.workspaceId.trim() : ''
      if (fromBody) return fromBody
    } catch {
      /* 非 JSON 或无 workspaceId 时回退 requestedWorkspace */
    }
  }
  return requestedWorkspace
}

/** 仅对真正会变更空间数据的写操作广播 database 事件，避免 presence 心跳、锁续期或只读 db_tool 触发前端刷新风暴。 */
export function shouldBroadcastCloudMutation(pathname: string, method: string, rawBody?: Buffer): boolean {
  const upper = method.toUpperCase()
  if (upper === 'GET' || upper === 'HEAD') return false
  if (pathname === '/api/account/presence' || pathname === '/api/account/locks') return false
  if (pathname === '/api/db/tool' && rawBody && rawBody.length > 0) {
    try {
      const parsed = JSON.parse(rawBody.toString('utf8')) as { name?: unknown }
      if (typeof parsed?.name === 'string' && CLOUD_PROXY_READONLY_DB_TOOLS.has(parsed.name.trim())) {
        return false
      }
    } catch {
      /* ignore */
    }
  }
  return true
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
  private socketMeta = new WeakMap<WebSocket, { accountId: string; workspaceId: string; token: string }>()
  private cloudBridges = new Map<WebSocket, WsClient>()
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
        try {
          const account = this.ctx.get('account') as
            | {
                store?: { activeWorkspaceId(): string | null }
                workspaceLocation?: (id: string) => 'device' | 'cloud'
              }
            | undefined
          if (!wsId && policy.allowImplicitActiveWorkspace) {
            wsId = String(account?.store?.activeWorkspaceId?.() ?? '').trim()
          }
          if (wsId) {
            location = policy.hostMode === 'cloud' ? 'cloud' : (account?.workspaceLocation?.(wsId) ?? 'device')
          }
        } catch {
          if (wsId) location = policy.hostMode === 'cloud' ? 'cloud' : 'device'
        }
        route.send(200, {
          ...policy,
          workspace: wsId ? { id: wsId, location: location ?? (policy.hostMode === 'cloud' ? 'cloud' : 'device') } : null,
        })
      },
      { scope: 'host' },
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
        this.socketMeta.set(socket, auth)
        this.sockets.add(socket)
        socket.send(JSON.stringify({ type: 'hello', payload: { ok: true, workspaceId: auth.workspaceId } }))
        if (getRuntimePolicy().hostMode === 'desktop' && auth.accountId && auth.workspaceId) {
          this.attachCloudWsBridge(socket, auth.accountId, auth.workspaceId)
        }
        socket.on('close', () => {
          this.sockets.delete(socket)
          this.socketMeta.delete(socket)
          const upstream = this.cloudBridges.get(socket)
          if (upstream) {
            this.cloudBridges.delete(socket)
            try {
              upstream.close()
            } catch {
              /* ignore */
            }
          }
        })
      })
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
          for (const upstream of this.cloudBridges.values()) {
            try {
              upstream.terminate()
            } catch {
              /* ignore */
            }
          }
          this.cloudBridges.clear()
          for (const socket of this.sockets) socket.terminate()
          server.off('upgrade', onUpgrade)
          hub.close()
          this.wsServers.delete('/ws')
          this.server = null
          server.closeAllConnections?.()
          server.close(() => resolve())
        })
    }, 'http.listen')
  }

  /**
   * 桌面端处于云端空间时，把本地前端的 /ws 连接桥接到远端云主机 /ws，
   * 让云端 Agent 流式 chunk、审批、状态、协作数据库变更直接实时推送到桌面端，无需轮询。
   */
  private attachCloudWsBridge(localSocket: WebSocket, accountId: string, workspaceId: string) {
    const remote = resolveRemoteCloudTarget(this.ctx, workspaceId, accountId)
    if (!remote) return
    const wsOrigin = remote.origin.replace(/^http:\/\//i, 'ws://').replace(/^https:\/\//i, 'wss://')
    const wsUrl = `${wsOrigin}/ws?workspaceId=${encodeURIComponent(remote.workspaceId)}`
    let upstream: WsClient
    try {
      upstream = new WsClient(wsUrl, {
        headers: {
          authorization: `Bearer ${remote.token}`,
        },
      })
    } catch {
      return
    }
    this.cloudBridges.set(localSocket, upstream)
    upstream.on('message', (data, isBinary) => {
      if (localSocket.readyState !== 1) return
      if (!isBinary) {
        const text = typeof data === 'string' ? data : data.toString('utf8')
        try {
          const parsed = JSON.parse(text) as { type?: unknown }
          if (parsed?.type === 'hello') return
        } catch {
          /* forward non-JSON frames as-is */
        }
        localSocket.send(text)
        return
      }
      localSocket.send(data)
    })
    localSocket.on('message', (data, isBinary) => {
      if (upstream.readyState !== 1) return
      upstream.send(data, { binary: isBinary })
    })
    upstream.on('close', (code, reason) => {
      if (this.cloudBridges.get(localSocket) === upstream) {
        this.cloudBridges.delete(localSocket)
      }
      if ((code === 4401 || code === 4403) && localSocket.readyState === 1) {
        localSocket.close(code, reason.toString('utf8') || (code === 4403 ? 'workspace' : 'tenant'))
      }
    })
    upstream.on('error', () => {
      /* close event handles cleanup */
    })
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
        if (isOnlineRuntime()) {
          const auth = this.authenticateSocket(request)
          if (auth.error) {
            socket.close(auth.error, auth.error === 4403 ? 'workspace' : 'tenant')
            return
          }
          const store = (
            this.ctx.get('account') as {
              store?: { canAccessPlugin?(accountId: string, workspaceId: string, pluginId: string): boolean }
            } | undefined
          )?.store
          if (pluginId && !store?.canAccessPlugin?.(auth.accountId, auth.workspaceId, pluginId)) {
            socket.close(4403, 'plugin access')
            return
          }
        }
        handler(socket, request)
      })
      this.wsServers.set(path, wss)
      return () => {
        if (this.wsServers.get(path) === wss) this.wsServers.delete(path)
        wss.close()
      }
    }, `http.ws ${path}`)
  }

  broadcast(type: string, payload: unknown, workspaceId?: string, accountId?: string) {
    if (payload && typeof payload === 'object') {
      const scoped = payload as { workspaceId?: unknown; accountId?: unknown; sessionId?: unknown }
      workspaceId ||= typeof scoped.workspaceId === 'string' ? scoped.workspaceId : ''
      accountId ||= typeof scoped.accountId === 'string' ? scoped.accountId : ''
      if ((!workspaceId || !accountId) && typeof scoped.sessionId === 'string') {
        const tenant = (
          this.ctx.get('account') as {
            store?: {
              tenantForRecord?(collection: string, recordId: string): {
                workspaceId: string
                accountId: string
              } | null
            }
          } | undefined
        )?.store?.tenantForRecord?.('/agents', scoped.sessionId)
        workspaceId ||= tenant?.workspaceId ?? ''
        accountId ||= tenant?.accountId ?? ''
      }
    }
    workspaceId ||= currentRequestWorkspaceId()
    accountId ||= currentAccountId()
    const data = JSON.stringify({ type, payload, ts: Date.now() })
    for (const socket of this.sockets) {
      const meta = this.socketMeta.get(socket)
      if (meta?.accountId && meta.workspaceId) {
        const store = (
          this.ctx.get('account') as {
            store?: {
              accountByToken?(token: string): { id: string } | null
              isMember?(accountId: string, workspaceId: string): boolean
            }
          } | undefined
        )?.store
        if (
          (store?.accountByToken && store.accountByToken(meta.token)?.id !== meta.accountId) ||
          (store?.isMember && !store.isMember(meta.accountId, meta.workspaceId))
        ) {
          socket.close(4403, 'membership revoked')
          continue
        }
      }
      if (!deliverTenantEvent(meta ?? {}, type, { workspaceId, accountId })) continue
      if (socket.readyState === socket.OPEN) socket.send(data)
    }
  }

  broadcastWorkspace(workspaceId: string, type: string, payload: unknown) {
    this.broadcast(type, payload, workspaceId)
  }

  broadcastAccount(accountId: string, type: string, payload: unknown) {
    const data = JSON.stringify({ type, payload, ts: Date.now() })
    for (const socket of this.sockets) {
      const meta = this.socketMeta.get(socket)
      if (meta?.accountId !== accountId || socket.readyState !== socket.OPEN) continue
      socket.send(data)
    }
  }

  disconnectTenant(accountId: string, workspaceId: string) {
    for (const socket of this.sockets) {
      const meta = this.socketMeta.get(socket)
      if (meta?.accountId === accountId && meta.workspaceId === workspaceId) {
        socket.close(4403, 'membership revoked')
      }
    }
  }

  disconnectRevokedSessions(accountId: string) {
    const store = (
      this.ctx.get('account') as { store?: { accountByToken?(token: string): { id: string } | null } } | undefined
    )?.store
    for (const socket of this.sockets) {
      const meta = this.socketMeta.get(socket)
      if (meta?.accountId === accountId && store?.accountByToken?.(meta.token)?.id !== accountId) {
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
    const token = preview ? '' : (url.searchParams.get('token') ?? (bearerToken || cookieToken))
    let workspaceId = preview ? '' : (url.searchParams.get('workspaceId') ?? '')
    let accountId = ''
    const store = (
      this.ctx.get('account') as {
        store?: {
          accountByToken?(token: string): { id: string } | null
          isMember?(accountId: string, workspaceId: string): boolean
          activeWorkspaceId?(): string | null
        }
      } | undefined
    )?.store
    try {
      accountId = token ? store?.accountByToken?.(token)?.id ?? '' : ''
    } catch {
      accountId = ''
    }
    if (!workspaceId && accountId) {
      workspaceId = runWithAccount(accountId, () => String(store?.activeWorkspaceId?.() ?? '').trim())
    }
    if (accountId && workspaceId && store?.isMember && !store.isMember(accountId, workspaceId)) {
      return { accountId, workspaceId, token, error: 4403 as const }
    }
    if (isOnlineRuntime() && (!accountId || !workspaceId)) {
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
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, X-Biu-Workspace-Id, X-Share-Password, mcp-session-id, mcp-protocol-version, Last-Event-ID',
      'Access-Control-Expose-Headers': 'mcp-session-id, mcp-protocol-version',
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
      const body = () => {
        if (!rawBody) rawBody = readBody(req)
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
        if (token) {
          try {
            const store = (this.ctx.get('account') as { store?: { accountByToken(token: string): { id: string } | null } } | undefined)?.store
            accountId = store?.accountByToken(token)?.id ?? ''
          } catch {
            accountId = ''
          }
        }
        if (accountId && legacyToken && !accountToken) {
          res.setHeader('set-cookie', [
            `biu_account=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`,
            'biu_legacy_account=; Path=/; SameSite=Strict; Max-Age=0',
          ])
        }
        const hasAccountSystem = Boolean(
          (this.ctx.get('account') as { store?: { accountByToken?: unknown } } | undefined)?.store?.accountByToken,
        )
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
        const headerWorkspace = String(req.headers['x-biu-workspace-id'] ?? '').trim()
        const accountStore = (
          this.ctx.get('account') as {
            store?: {
              isMember?(accountId: string, workspaceId: string): boolean
              activeWorkspaceId?(): string | null
              canAccessPlugin?(accountId: string, workspaceId: string, pluginId: string): boolean
            }
          } | undefined
        )?.store
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
        if (isOnlineRuntime() && match.pluginId) {
          const allowed = accountStore?.canAccessPlugin?.(accountId, requestedWorkspace, match.pluginId)
          if (!allowed) {
            context.send(404, { error: 'not found' })
            return
          }
        }
        if (!isOnlineRuntime() && !shareOnly && accountId && shouldProxyCloudApi(url.pathname, method, match.scope)) {
          const accountSvc = this.ctx.get('account') as
            | {
                workspaceLocation?: (workspaceId: string) => 'device' | 'cloud'
                cloudConnection?: (localAccountId: string) => { origin: string; token: string } | null
              }
            | undefined
          const hasBody = method !== 'GET'
          const rawReqBody =
            hasBody && CLOUD_PROXY_BODY_WORKSPACE_PATHS.has(url.pathname) ? await body() : undefined
          const targetWorkspace = cloudProxyTargetWorkspace(url.pathname, requestedWorkspace, url.searchParams, rawReqBody)
          if (targetWorkspace && accountSvc?.workspaceLocation?.(targetWorkspace) === 'cloud') {
            const remote = resolveRemoteCloudTarget(this.ctx, targetWorkspace, accountId)
            if (!remote) {
              context.send(401, { error: '请先登录云端账号' })
              return
            }
            const forwardHeaders: Record<string, string> = {
              authorization: `Bearer ${remote.token}`,
              'x-biu-workspace-id': remote.workspaceId,
            }
            for (const key of ['content-type', 'accept', 'if-match', 'if-none-match', 'x-share-password']) {
              const value = req.headers[key]
              if (typeof value === 'string' && value) forwardHeaders[key] = value
            }
            const reqBody = hasBody ? (rawReqBody ?? (await body())) : undefined
            let upstream: Response
            try {
              upstream = await fetch(`${remote.origin}${url.pathname}${url.search}`, {
                method,
                headers: forwardHeaders,
                body: hasBody && reqBody && reqBody.length > 0 ? new Uint8Array(reqBody) : undefined,
                signal: AbortSignal.timeout(CLOUD_PROXY_TIMEOUT_MS),
              })
            } catch {
              context.send(503, { error: '云端服务暂时连不上' })
              return
            }
            const outHeaders: Record<string, string> = { ...corsHeaders }
            for (const key of ['content-type', 'etag', 'content-disposition', 'cache-control', 'last-modified']) {
              const value = upstream.headers.get(key)
              if (value) outHeaders[key] = value
            }
            const payload = Buffer.from(await upstream.arrayBuffer())
            res.writeHead(upstream.status, outHeaders)
            res.end(payload)
            if (upstream.ok && shouldBroadcastCloudMutation(url.pathname, method, reqBody)) {
              this.broadcast('database', { workspaceId: targetWorkspace, ts: Date.now() })
            }
            return
          }
        }
        await runWithAccount(accountId, () => runWithRequestWorkspace(requestedWorkspace, () => match.handler(context)))
      } catch (error) {
        this.ctx.logger('http').error(error)
        if (!res.headersSent) context.send(500, { error: String(error) })
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
