import { existsSync } from 'node:fs'
import { Service, type Context } from 'cordis'
import { hostRemoteOrigin } from '@biu/host-plugin-loader/env'
import { biuSqlitePath, currentAccountId, eventsSqlitePath, openAndMigrateBiu, openAndMigrateEvents } from '@biu/host-plugin-loader/data-dir'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import { emitTenantRevoked, emitWorkspaceDeleted } from '@biu/host-plugin-loader/tenant-state'
import { resolveScopedWorkspaceId } from '@biu/host-plugin-loader/runtime'
import type { RouteContext } from '@biu/types/http'
import { CollabError, CollabStore } from './store.ts'
import { authRateLimitMax, clientIp, SlidingWindowLimiter } from './rate-limit.ts'
import type { AuthorizationService, ResourceRole } from './authorization.ts'
import { workspaceMembersCollection } from './workspace-members-collection.ts'

export type { Actor, Action, ResourceRef, ResourceRole, WorkspaceRole, Decision } from './authorization.ts'

declare module 'cordis' {
  interface Events {
    'account/request'(payload: { accountId?: string; token?: string }): void
    dispose(): void
  }
}

export const name = 'account'
export const inject = ['http']

type AccountConfig = { sqlitePath?: string }
type CloudConnection = {
  localAccountId: string
  origin: string
  remoteAccountId: string
  remoteName: string
  remoteEmail: string
  token: string
  connectedAt: number
}

export class AccountService extends Service {
  store: CollabStore
  authorization: AuthorizationService
  private cloudAvatars = new Map<string, string>()
  private db: {
    close(): void
    exec(sql: string): void
    prepare(sql: string): { get(...args: unknown[]): unknown; all(...args: unknown[]): unknown[]; run(...args: unknown[]): unknown }
  }

  constructor(ctx: Context, config: AccountConfig = {}) {
    super(ctx, 'account')
    const db = openAndMigrateBiu(config.sqlitePath ?? biuSqlitePath())
    this.db = db
    this.store = new CollabStore(db)
    this.authorization = this.store.authorization
    db.exec(`CREATE TABLE IF NOT EXISTS record_place (
      collection TEXT NOT NULL,
      record_id TEXT NOT NULL,
      place TEXT NOT NULL,
      PRIMARY KEY (collection, record_id)
    )`)
    ctx.on('account/request', (event) => {
      const localAccountId = String((event as { accountId?: string }).accountId ?? '')
      if (!localAccountId) return
      this.store.noteActiveAccount(localAccountId)
    })
    ctx.inject(['database'], (inner) =>
      inner.database.register(
        workspaceMembersCollection(
          this.store,
          (workspaceId) => this.workspaceLocation(workspaceId) === 'cloud',
          true,
        ),
      ),
    )
    ctx.on('dispose', () => db.close())
  }

  configuredCloudOrigin(): string {
    if (!getRuntimePolicy().allowCloudLinking) return ''
    const row = this.db
      .prepare(`SELECT value FROM collab_state WHERE key = 'cloud_remote_origin'`)
      .get() as { value?: string } | undefined
    const saved = String(row?.value ?? '').trim().replace(/\/+$/, '')
    return saved || hostRemoteOrigin()
  }

  setConfiguredCloudOrigin(raw: string): string {
    if (!getRuntimePolicy().allowCloudLinking) throw new CollabError('服务端不能配置远程云端地址', 400)
    const normalized = normalizeCloudOrigin(raw)
    if (normalized) {
      this.db
        .prepare(
          `INSERT INTO collab_state (key, value) VALUES ('cloud_remote_origin', ?)
           ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        )
        .run(normalized)
    } else {
      this.db.prepare(`DELETE FROM collab_state WHERE key = 'cloud_remote_origin'`).run()
    }
    return this.configuredCloudOrigin()
  }
  isLocal(collection: string, id: string) {
    const row = this.db.prepare('SELECT place FROM record_place WHERE collection = ? AND record_id = ?').get(collection, id) as
      | { place?: string }
      | undefined
    return row?.place === 'local'
  }

  markLocal(collection: string, id: string) {
    this.db
      .prepare(
        `INSERT INTO record_place (collection, record_id, place) VALUES (?, ?, 'local')
         ON CONFLICT(collection, record_id) DO UPDATE SET place = 'local'`,
      )
      .run(collection, id)
  } cloudConnection(localAccountId: string): CloudConnection | null {
    const row = this.db
      .prepare(
        `SELECT local_account_id, origin, remote_account_id, remote_name, remote_email, token, connected_at
         FROM cloud_connections WHERE local_account_id = ? AND active = 1
         ORDER BY connected_at DESC LIMIT 1`,
      )
      .get(localAccountId) as
      | {
          local_account_id: string
          origin: string
          remote_account_id: string
          remote_name: string
          remote_email: string
          token: string
          connected_at: number
        }
      | undefined
    return row ? this.cloudRow(row) : null
  }

  listCloudConnections(localAccountId: string): Array<CloudConnection & { active: boolean }> {
    const rows = this.db
      .prepare(
        `SELECT local_account_id, origin, remote_account_id, remote_name, remote_email, token, connected_at, active
         FROM cloud_connections WHERE local_account_id = ?
         ORDER BY active DESC, connected_at DESC`,
      )
      .all(localAccountId) as Array<{
        local_account_id: string
        origin: string
        remote_account_id: string
        remote_name: string
        remote_email: string
        token: string
        connected_at: number
        active: number
      }>
    return rows.map((row) => ({ ...this.cloudRow(row), active: row.active === 1 }))
  }

  private cloudRow(row: {
    local_account_id: string
    origin: string
    remote_account_id: string
    remote_name: string
    remote_email: string
    token: string
    connected_at: number
  }): CloudConnection {
    return {
      localAccountId: row.local_account_id,
      origin: row.origin,
      remoteAccountId: row.remote_account_id,
      remoteName: row.remote_name,
      remoteEmail: row.remote_email,
      token: row.token,
      connectedAt: row.connected_at,
    }
  }

  private cloudAvatarKey(origin: string, remoteAccountId: string) {
    return `${origin}\t${remoteAccountId}`
  }

  cloudAvatar(origin: string, remoteAccountId: string) {
    return this.cloudAvatars.get(this.cloudAvatarKey(origin, remoteAccountId)) ?? ''
  }

  setCloudAvatar(origin: string, remoteAccountId: string, avatar: string) {
    const key = this.cloudAvatarKey(origin, remoteAccountId)
    const trimmed = avatar.trim()
    if (trimmed) this.cloudAvatars.set(key, trimmed)
    else this.cloudAvatars.delete(key)
  }

  updateCloudIdentity(
    localAccountId: string,
    origin: string,
    remoteAccountId: string,
    patch: { name?: string; email?: string; avatar?: string },
  ) {
    if (typeof patch.avatar === 'string') {
      this.setCloudAvatar(origin, remoteAccountId, patch.avatar)
    }
    const nextName = typeof patch.name === 'string' ? patch.name.trim() : ''
    const nextEmail = typeof patch.email === 'string' ? patch.email.trim().toLowerCase() : ''
    if (nextName && nextEmail) {
      this.db
        .prepare(
          `UPDATE cloud_connections SET remote_name = ?, remote_email = ?
           WHERE local_account_id = ? AND origin = ? AND remote_account_id = ?`,
        )
        .run(nextName, nextEmail, localAccountId, origin, remoteAccountId)
    } else if (nextName) {
      this.db
        .prepare(
          `UPDATE cloud_connections SET remote_name = ?
           WHERE local_account_id = ? AND origin = ? AND remote_account_id = ?`,
        )
        .run(nextName, localAccountId, origin, remoteAccountId)
    }
  }

  saveCloudConnection(input: Omit<CloudConnection, 'connectedAt'> & { connectedAt?: number }) {
    const connectedAt = input.connectedAt ?? Date.now()
    // 每个本地主机可配置多个远程连接，同一时间仅激活一个；同一个远程服务器地址只绑定一个云端账号。
    this.db.prepare('UPDATE cloud_connections SET active = 0 WHERE local_account_id = ?').run(input.localAccountId)
    this.db
      .prepare('DELETE FROM cloud_connections WHERE local_account_id = ? AND origin = ?')
      .run(input.localAccountId, input.origin)
    this.db
      .prepare(
        `INSERT INTO cloud_connections
          (local_account_id, origin, remote_account_id, remote_name, remote_email, token, connected_at, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        input.localAccountId,
        input.origin,
        input.remoteAccountId,
        input.remoteName,
        input.remoteEmail,
        input.token,
        connectedAt,
      )
    return this.cloudConnection(input.localAccountId)!
  }

  /** 已关联的云端身份。当前请求没有账号时，一台设备只有一条关联也可以取到。 */
  linkedCloud(localAccountId = currentAccountId()) {
    if (localAccountId) return this.cloudConnection(localAccountId)
    const rows = this.db
      .prepare('SELECT local_account_id FROM cloud_connections WHERE active = 1')
      .all() as Array<{ local_account_id: string }>
    if (rows.length !== 1) return null
    return this.cloudConnection(rows[0]?.local_account_id ?? '')
  }

  /** 统一的桌面端云端空间目标解析，收敛各模块重复判断。 */
  resolveCloudTarget(
    workspaceId = '',
    localAccountId = currentAccountId(),
  ): { origin: string; token: string; workspaceId: string } | null {
    if (!getRuntimePolicy().allowCloudLinking) return null
    const targetWorkspace = workspaceId || this.store.activeWorkspaceId() || ''
    if (!targetWorkspace || this.workspaceLocation(targetWorkspace) !== 'cloud') return null
    const connection = (localAccountId ? this.cloudConnection(localAccountId) : null) ?? this.linkedCloud(localAccountId)
    if (!connection?.origin || !connection.token) return null
    return { origin: connection.origin.replace(/\/+$/, ''), token: connection.token, workspaceId: targetWorkspace }
  }

  /** 当断开或切换云端账号时，若当前仍停留在云端空间，自动回落到本机空间，避免持续 401 或跨服务器串空间。 */
  fallbackToDeviceWorkspace(localAccountId: string): string {
    if (!getRuntimePolicy().allowCloudLinking) return ''
    const active = this.store.activeWorkspaceId()
    if (!active || this.workspaceLocation(active) !== 'cloud') return active ?? ''
    const device = this.store.listWorkspaces(localAccountId).find((ws) => this.workspaceLocation(ws.id) === 'device')
    if (device) {
      this.store.setActive(localAccountId, device.id)
      return device.id
    }
    return ''
  }

  /** 远端已删除空间但本地名称不匹配时，兜底清理本地缓存记录与 workspace_place，避免留下僵尸空间。 */
  purgeWorkspaceCache(workspaceId: string) {
    this.db.prepare('DELETE FROM workspace_place WHERE workspace_id = ?').run(workspaceId)
    this.db.prepare('DELETE FROM memberships WHERE workspace_id = ?').run(workspaceId)
    this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId)
  }

  /** 断开当前连接，保留已配置的远程连接记录。 */
  disconnectCloud(localAccountId: string) {
    this.db.prepare('UPDATE cloud_connections SET active = 0 WHERE local_account_id = ?').run(localAccountId)
    this.fallbackToDeviceWorkspace(localAccountId)
  }

  activateCloud(localAccountId: string, origin: string, remoteAccountId: string) {
    const row = this.db
      .prepare(
        `SELECT token FROM cloud_connections
         WHERE local_account_id = ? AND origin = ? AND remote_account_id = ?`,
      )
      .get(localAccountId, origin, remoteAccountId) as { token?: string } | undefined
    if (!row?.token) throw new CollabError('还没有关联这个云端账号', 404)
    const previous = this.cloudConnection(localAccountId)
    this.db.prepare('UPDATE cloud_connections SET active = 0 WHERE local_account_id = ?').run(localAccountId)
    this.db
      .prepare(
        `UPDATE cloud_connections SET active = 1, connected_at = ?
         WHERE local_account_id = ? AND origin = ? AND remote_account_id = ?`,
      )
      .run(Date.now(), localAccountId, origin, remoteAccountId)
    if (previous && (previous.origin !== origin || previous.remoteAccountId !== remoteAccountId)) {
      this.fallbackToDeviceWorkspace(localAccountId)
    }
    return this.cloudConnection(localAccountId)!
  }

  removeCloudConnection(localAccountId: string, origin?: string) {
    const normalized = origin ? normalizeCloudOrigin(origin) : ''
    if (!normalized) {
      this.disconnectCloud(localAccountId)
      return
    }
    const active = this.cloudConnection(localAccountId)
    this.db
      .prepare('DELETE FROM cloud_connections WHERE local_account_id = ? AND origin = ?')
      .run(localAccountId, normalized)
    if (active && active.origin === normalized) {
      this.fallbackToDeviceWorkspace(localAccountId)
    }
  }

  workspaceLocation(workspaceId: string): 'device' | 'cloud' {
    if (getRuntimePolicy().hostMode === 'cloud') return 'cloud'
    const row = this.db.prepare('SELECT place FROM workspace_place WHERE workspace_id = ?').get(workspaceId) as
      | { place?: string }
      | undefined
    return row?.place === 'cloud' ? 'cloud' : 'device'
  }

  markCloudWorkspace(workspaceId: string) {
    this.db
      .prepare(
        `INSERT INTO workspace_place (workspace_id, place) VALUES (?, 'cloud')
         ON CONFLICT(workspace_id) DO UPDATE SET place = 'cloud'`,
      )
      .run(workspaceId)
  }
}

function bearer(route: RouteContext) {
  const header = String(route.req.headers.authorization ?? '')
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  if (match?.[1]) return match[1]
  const cookie = String(route.req.headers.cookie ?? '')
  const encoded = cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith('biu_account='))
  return encoded ? decodeURIComponent(encoded.slice('biu_account='.length)) : ''
}

function rememberLogin(route: RouteContext, token: string) {
  route.res.setHeader('set-cookie', `biu_account=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict`)
}

function requestPublicOrigin(route: RouteContext): string {
  const origin = String(route.req.headers.origin ?? '').trim()
  if (/^https?:\/\//i.test(origin)) {
    try {
      return new URL(origin).origin
    } catch {
      /* ignore malformed Origin */
    }
  }
  const host = String(route.req.headers['x-forwarded-host'] ?? route.req.headers.host ?? '').split(',')[0]?.trim() ?? ''
  if (!host) return ''
  const proto = String(route.req.headers['x-forwarded-proto'] ?? 'http').split(',')[0]?.trim() || 'http'
  return `${proto}://${host}`
}

function normalizeCloudOrigin(raw: string) {
  const trimmed = raw.trim().replace(/\/+$/, '')
  if (!trimmed) return ''
  let parsed: URL
  try {
    parsed = new URL(trimmed)
  } catch {
    throw new CollabError('远程服务地址格式不对，请输入 http:// 或 https:// 开头的地址', 400)
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new CollabError('远程服务地址只支持 http:// 或 https://', 400)
  }
  return parsed.origin
}

async function relayAccount(
  route: RouteContext,
  account: AccountService,
  localAccountId: string,
  path: string,
  opts?: { body?: unknown; workspaceId?: string },
) {
  const connection = account.linkedCloud(localAccountId)
  if (!connection) return null
  const activeWorkspaceId = opts?.workspaceId ?? account.store.activeWorkspaceId()
  const cloudWorkspaceId =
    activeWorkspaceId && account.workspaceLocation(activeWorkspaceId) === 'cloud' ? activeWorkspaceId : ''
  const method = route.req.method ?? 'GET'
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const raw = hasBody ? (opts && 'body' in opts ? opts.body : await route.json().catch(() => ({}))) : undefined
  let res: Response
  try {
    res = await fetch(`${connection.origin}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${connection.token}`,
        ...(cloudWorkspaceId ? { 'x-biu-workspace-id': cloudWorkspaceId } : {}),
        ...(hasBody ? { 'content-type': 'application/json' } : {}),
      },
      body: hasBody ? JSON.stringify(raw ?? {}) : undefined,
    })
  } catch {
    throw new CollabError('云端暂时连不上', 503)
  }
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, payload }
}

function cacheWorkspaceList(account: AccountService, accountId: string, payload: Record<string, unknown>) {
  const workspaces = Array.isArray(payload.workspaces) ? payload.workspaces : []
  for (const item of workspaces) {
    if (!item || typeof item !== 'object') continue
    const row = item as { id?: string; name?: string; ownerId?: string; role?: string; createdAt?: number }
    if (!row.id) continue
    account.store.upsertPulledWorkspace({
      accountId,
      id: String(row.id),
      name: String(row.name ?? ''),
      ownerId: row.ownerId,
      role: row.role,
      createdAt: row.createdAt,
    })
    account.markCloudWorkspace(String(row.id))
  }
}

function purgeSessionEvents(sessionIds: string[]) {
  if (!sessionIds.length) return
  const path = eventsSqlitePath()
  if (!existsSync(path)) return
  const db = openAndMigrateEvents(path)
  try {
    const stmt = db.prepare('DELETE FROM events WHERE session_id = ?')
    for (const id of sessionIds) stmt.run(id)
  } catch {
    /* 事件库还没有这张表时，空间记录本身已经删除。 */
  } finally {
    db.close()
  }
}

function fail(route: RouteContext, error: unknown) {
  if (error instanceof CollabError) {
    route.send(error.status, { error: error.message })
    return
  }
  route.send(500, { error: String(error instanceof Error ? error.message : error) })
}

export function apply(ctx: Context, config: AccountConfig = {}) {
  const account = new AccountService(ctx, config)

  function actor(route: RouteContext) {
    const token = bearer(route)
    const found = token ? account.store.accountByToken(token) : null
    if (!found) throw new CollabError('需要登录', 401)
    rememberLogin(route, token)
    return found
  }

  function requireCollaborativeWorkspace(workspaceId: string) {
    if (!workspaceId || account.workspaceLocation(workspaceId) !== 'cloud') {
      throw new CollabError('本机空间仅供当前本地账号使用，不提供成员、分享或权限功能', 404)
    }
  }

  async function connectCloudIdentity(
    local: { id: string },
    action: 'login' | 'register',
    email: string,
    password: string,
    requestedOrigin = '',
    remoteName = '',
  ) {
    if (!getRuntimePolicy().allowCloudLinking) throw new CollabError('服务端不能连接另一个云端账号', 400)
    const origin = requestedOrigin.trim()
      ? account.setConfiguredCloudOrigin(requestedOrigin)
      : account.configuredCloudOrigin()
    if (!origin) throw new CollabError('请先配置远程主机服务地址', 400)
    let remote: Response
    try {
      remote = await fetch(`${origin}/api/account/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          password,
          ...(remoteName.trim() ? { name: remoteName.trim() } : {}),
        }),
      })
    } catch {
      throw new CollabError('云端暂时连不上', 503)
    }
    const payload = (await remote.json().catch(() => ({}))) as {
      id?: string
      name?: string
      avatar?: string
      token?: string
      workspaceId?: string
      error?: string
    }
    if (!remote.ok || !payload.id || !payload.token) {
      throw new CollabError(payload.error || (action === 'login' ? '云端登录失败' : '云端注册失败'), remote.status || 400)
    }
    if (typeof payload.avatar === 'string') {
      account.setCloudAvatar(origin, payload.id, payload.avatar)
    }
    const connection = account.saveCloudConnection({
      localAccountId: local.id,
      origin,
      remoteAccountId: payload.id,
      remoteName: payload.name || remoteName.trim() || email,
      remoteEmail: email.trim().toLowerCase(),
      token: payload.token,
    })
    let workspaces: unknown[] = []
    try {
      const listed = await fetch(`${origin}/api/account/workspaces`, {
        headers: { authorization: `Bearer ${payload.token}` },
      })
      const listedBody = (await listed.json().catch(() => ({}))) as Record<string, unknown>
      if (listed.ok) {
        cacheWorkspaceList(account, local.id, listedBody)
        workspaces = Array.isArray(listedBody.workspaces) ? listedBody.workspaces : []
      }
    } catch {
      /* 登录已经成功，空间稍后重试加载 */
    }
    const workspaceId = String(payload.workspaceId ?? '')
    if (workspaceId) {
      account.markCloudWorkspace(workspaceId)
    }
    return {
      account: {
        id: connection.remoteAccountId,
        name: connection.remoteName,
        email: connection.remoteEmail,
        avatar: account.cloudAvatar(connection.origin, connection.remoteAccountId),
      },
      origin: connection.origin,
      workspaceId,
      workspaces,
    }
  }

  async function connectCloud(route: RouteContext, action: 'login' | 'register') {
    const local = actor(route)
    const body = (await route.json()) as { email?: string; password?: string; origin?: string; name?: string }
    return connectCloudIdentity(
      local,
      action,
      String(body.email ?? ''),
      String(body.password ?? ''),
      String(body.origin ?? ''),
      String(body.name ?? ''),
    )
  }

  ctx.http.route(
    'GET',
    '/api/account/cloud/endpoint',
    async (route) => {
      try {
        const requested = String(route.query.get('workspaceId') ?? '').trim()
        if (!getRuntimePolicy().allowCloudLinking) {
          route.send(200, { mode: 'local', workspaceId: requested || account.store.activeWorkspaceId() || '' })
          return
        }
        const me = actor(route)
        const targetWorkspace = requested || account.store.activeWorkspaceId() || ''
        if (!targetWorkspace || account.workspaceLocation(targetWorkspace) !== 'cloud') {
          route.send(200, { mode: 'local', workspaceId: targetWorkspace })
          return
        }
        const remote = account.resolveCloudTarget(targetWorkspace, me.id)
        if (!remote) {
          route.send(401, { error: '请先登录云端账号' })
          return
        }
        route.send(200, {
          mode: 'cloud',
          origin: remote.origin,
          workspaceId: remote.workspaceId,
          token: remote.token,
        })
      } catch (error) {
        fail(route, error)
      }
    },
    { scope: 'host' },
  )

  type RouteArg = Parameters<Parameters<typeof ctx.http.route>[2]>[0]
  const handledRoute = (method: Parameters<typeof ctx.http.route>[0], path: string, fn: (route: RouteArg) => Promise<void> | void) =>
    ctx.http.route(method, path, async (route) => {
      try {
        await fn(route)
      } catch (error) {
        fail(route, error)
      }
    })
  const authedRoute = (method: Parameters<typeof ctx.http.route>[0], path: string, fn: (route: RouteArg, me: ReturnType<typeof actor>) => Promise<void> | void) =>
    handledRoute(method, path, (route) => fn(route, actor(route)))

  handledRoute('GET', '/api/account/cloud', async (route) => {
    if (!getRuntimePolicy().allowCloudLinking) return route.send(200, { available: false, connected: false, configuredOrigin: '' })
    const me = actor(route)
    const initial = account.cloudConnection(me.id)
    if (initial?.origin && initial.token) {
      try {
        const res = await fetch(`${initial.origin}/api/account/me`, {
          headers: { authorization: `Bearer ${initial.token}` },
          signal: AbortSignal.timeout(2000),
        })
        if (res.ok) {
          const remoteMe = (await res.json().catch(() => ({}))) as {
            name?: unknown
            email?: unknown
            avatar?: unknown
          }
          account.updateCloudIdentity(me.id, initial.origin, initial.remoteAccountId, {
            ...(typeof remoteMe.name === 'string' && remoteMe.name.trim() ? { name: remoteMe.name } : {}),
            ...(typeof remoteMe.email === 'string' && remoteMe.email.trim() ? { email: remoteMe.email } : {}),
            ...(typeof remoteMe.avatar === 'string' ? { avatar: remoteMe.avatar } : {}),
          })
        }
      } catch {
        /* 远端不可达时沿用本地缓存的名称与默认头像 */
      }
    }
    const connection = account.cloudConnection(me.id)
    const configuredOrigin = account.configuredCloudOrigin()
    const accounts = account.listCloudConnections(me.id).map((item) => ({
      id: item.remoteAccountId,
      name: item.remoteName,
      email: item.remoteEmail,
      avatar: account.cloudAvatar(item.origin, item.remoteAccountId),
      origin: item.origin,
      active: item.active,
    }))
    route.send(200, {
      available: true,
      configuredOrigin,
      connected: Boolean(connection),
      accounts,
      ...(connection
        ? {
            account: {
              id: connection.remoteAccountId,
              name: connection.remoteName,
              email: connection.remoteEmail,
              avatar: account.cloudAvatar(connection.origin, connection.remoteAccountId),
            },
            origin: connection.origin,
          }
        : {}),
    })
  })

  handledRoute('POST', '/api/account/cloud/config', async (route) => {
    actor(route)
    const body = (await route.json()) as { origin?: string }
    const origin = account.setConfiguredCloudOrigin(String(body.origin ?? ''))
    route.send(200, { origin, available: true })
  })

  handledRoute('POST', '/api/account/cloud/login', async (route) => {
    route.send(200, await connectCloud(route, 'login'))
  })

  handledRoute('POST', '/api/account/cloud/register', async (route) => {
    route.send(201, await connectCloud(route, 'register'))
  })

  handledRoute('POST', '/api/account/cloud/sync-create', async (route) => {
    if (!getRuntimePolicy().allowCloudLinking) throw new CollabError('服务端不能连接另一个云端账号', 400)
    const local = actor(route)
    const body = (await route.json().catch(() => ({}))) as { origin?: string }
    const requestedOrigin = String(body.origin ?? '')
    if (!local.email) throw new CollabError('本地账号没有可同步的邮箱', 400)
    const password = account.store.recalledPassword(local.id)
    if (!password) throw new CollabError('请退出后重新登录一次，就能用本地密码创建云端账号', 400)
    try {
      route.send(201, {
        ...(await connectCloudIdentity(local, 'register', local.email, password, requestedOrigin, local.name)),
        created: true,
      })
    } catch (error) {
      if (!(error instanceof CollabError) || error.status !== 409) throw error
      route.send(200, {
        ...(await connectCloudIdentity(local, 'login', local.email, password, requestedOrigin)),
        created: false,
      })
    }
  })

  authedRoute('POST', '/api/account/cloud/active', async (route, me) => {
    const body = (await route.json()) as { remoteAccountId?: string; origin?: string }
    const connection = account.activateCloud(me.id, String(body.origin ?? ''), String(body.remoteAccountId ?? ''))
    ctx.http.broadcast('database', { ts: Date.now() })
    route.send(200, {
      account: {
        id: connection.remoteAccountId,
        name: connection.remoteName,
        email: connection.remoteEmail,
        avatar: account.cloudAvatar(connection.origin, connection.remoteAccountId),
      },
      origin: connection.origin,
    })
  })

  authedRoute('DELETE', '/api/account/cloud', async (route, me) => {
    const queryOrigin = String(route.query.get('origin') ?? '').trim()
    let bodyOrigin = ''
    if (!queryOrigin) {
      const body = (await route.json().catch(() => ({}))) as { origin?: string }
      bodyOrigin = String(body?.origin ?? '').trim()
    }
    account.removeCloudConnection(me.id, queryOrigin || bodyOrigin || undefined)
    ctx.http.broadcast('database', { ts: Date.now() })
    route.send(200, { ok: true, workspaceId: account.store.activeWorkspaceId() })
  })

  handledRoute('GET', '/api/account/active', async (route) => {
    actor(route)
    const workspaceId = account.store.activeWorkspaceId()
    route.send(200, {
      workspaceId,
      ...(workspaceId ? { location: account.workspaceLocation(workspaceId) } : {}),
    })
  })

  authedRoute('POST', '/api/account/active', async (route, me) => {
    const body = (await route.json()) as { workspaceId?: string }
    const workspaceId = account.store.setActive(me.id, String(body.workspaceId ?? ''))
    ctx.http.broadcast('database', { ts: Date.now() })
    route.send(200, { workspaceId, location: account.workspaceLocation(workspaceId) })
  })

  const authLimiter = new SlidingWindowLimiter()
  const enforceAuthRateLimit = (route: RouteContext, action: 'login' | 'register') => {
    const limit = authRateLimitMax()
    if (limit <= 0) return true
    const result = authLimiter.check(`${action}:${clientIp(route.req)}`, Date.now(), limit)
    if (result.allowed) return true
    route.res.setHeader('retry-after', String(result.retryAfterSec))
    route.send(429, { error: '操作过于频繁，请稍后再试', retryAfterSec: result.retryAfterSec })
    return false
  }

  ctx.http.route('POST', '/api/account/register', async (route) => {
    if (!enforceAuthRateLimit(route, 'register')) return
    try {
      const body = (await route.json()) as { email?: string; password?: string; name?: string }
      const password = String(body.password ?? '')
      const email = String(body.email ?? '')
      const name = String(body.name ?? '')
      if (!password.trim()) throw new CollabError('密码不能为空', 400)
      if (!email.trim()) throw new CollabError('邮箱不能为空', 400)
      const created = account.store.register(name, Date.now(), password, email)
      const workspaceId = account.store.enter(created.id)
      const session = account.store.openSession(created.id, String(route.req.headers['user-agent'] ?? '浏览器').slice(0, 120))
      rememberLogin(route, session.token)
      ctx.http.broadcast('database', { ts: Date.now() })
      route.send(201, { id: created.id, name: created.name, avatar: created.avatar ?? '', createdAt: created.createdAt, token: session.token, workspaceId })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/login', async (route) => {
    if (!enforceAuthRateLimit(route, 'login')) return
    try {
      const body = (await route.json()) as { email?: string; password?: string }
      const found = account.store.login(
        String(body.email ?? ''),
        String(body.password ?? ''),
        String(route.req.headers['user-agent'] ?? '浏览器'),
      )
      const workspaceId = account.store.enter(found.id)
      rememberLogin(route, found.token)
      ctx.http.broadcast('database', { ts: Date.now() })
      route.send(200, {
        id: found.id,
        name: found.name,
        avatar: found.avatar ?? '',
        createdAt: found.createdAt,
        token: found.token,
        workspaceId,
        mustChangePassword: found.mustChangePassword === true,
      })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/logout', async (route) => {
    const token = bearer(route)
    const found = token ? account.store.accountByToken(token) : null
    account.store.revokeSession(token)
    if (found) {
      ctx.http.disconnectRevokedSessions(found.id)
      emitTenantRevoked(ctx, { accountId: found.id })
    }
    route.res.setHeader('set-cookie', [
      'biu_account=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
      'biu_legacy_account=; Path=/; SameSite=Strict; Max-Age=0',
    ])
    route.send(200, { ok: true })
  })

  authedRoute('POST', '/api/account/password', async (route, me) => {
    const body = (await route.json()) as { currentPassword?: string; nextPassword?: string }
    const changed = account.store.changePassword(me.id, String(body.currentPassword ?? ''), String(body.nextPassword ?? ''), bearer(route))
    ctx.http.disconnectRevokedSessions(me.id)
    emitTenantRevoked(ctx, { accountId: me.id })
    route.send(200, changed)
  })

  authedRoute('GET', '/api/account/agents', async (route, me) => {
    const agents = account.store.listSessions(me.id)
    route.send(200, { agents, sessions: agents })
  })

  authedRoute('DELETE', '/api/account/agents/:id', async (route, me) => {
    const revoked = account.store.revokeSessionById(me.id, String(route.params.id ?? ''))
    ctx.http.disconnectRevokedSessions(me.id)
    emitTenantRevoked(ctx, { accountId: me.id })
    route.send(200, revoked)
  })

  authedRoute('POST', '/api/account/mcp/credentials', async (route, me) => {
    const body = (await route.json()) as { workspaceId?: string; allowedTools?: unknown; expiresInHours?: unknown }
    const workspaceId = String(body.workspaceId ?? '').trim()
    if (!workspaceId) throw new CollabError('需要空间', 400)
    const hours = Math.min(24 * 365, Math.max(1, Number(body.expiresInHours ?? 24 * 90)))
    const allowedTools = Array.isArray(body.allowedTools) ? body.allowedTools.map(String) : []
    route.send(
      201,
      account.store.issueMcpCredential(me.id, workspaceId, {
        allowedTools,
        expiresAt: Date.now() + hours * 60 * 60 * 1000,
      }),
    )
  })

  authedRoute('GET', '/api/account/mcp/credentials', async (route, me) => {
    const workspaceId = String(route.query.get('workspaceId') ?? '').trim()
    if (!workspaceId) throw new CollabError('需要空间', 400)
    route.send(200, { credentials: account.store.listMcpCredentials(me.id, workspaceId) })
  })

  authedRoute('DELETE', '/api/account/mcp/credentials/:id', async (route, me) => {
    const credentialId = String(route.params.id ?? '')
    route.send(200, account.store.revokeMcpCredential(me.id, credentialId))
  })

  authedRoute('GET', '/api/account/mcp/audit', async (route, me) => {
    const workspaceId = String(route.query.get('workspaceId') ?? '').trim()
    if (!workspaceId) throw new CollabError('需要空间', 400)
    const limit = Number(route.query.get('limit') ?? 100)
    route.send(200, {
      events: account.store.listMcpAudit(me.id, workspaceId, limit),
    })
  })

  authedRoute('GET', '/api/account/me', async (route, me) => {
    route.send(200, { ...me, online: getRuntimePolicy().hostMode === 'cloud', isSuperAdmin: account.store.isSuperAdmin(me.id) })
  })

  authedRoute('POST', '/api/account/profile', async (route, me) => {
    const body = (await route.json()) as { name?: unknown; avatar?: unknown }
    const updated = account.store.saveAccountProfile(me.id, {
      ...(typeof body.name === 'string' ? { name: body.name } : {}),
      ...(typeof body.avatar === 'string' ? { avatar: body.avatar } : {}),
    })
    route.send(200, { ...updated, online: getRuntimePolicy().hostMode === 'cloud', isSuperAdmin: account.store.isSuperAdmin(me.id) })
  })
  authedRoute('GET', '/api/account/workspace-profile', async (route, me) => {
    route.send(200, account.store.workspaceProfile(me.id))
  })

  authedRoute('POST', '/api/account/workspace-profile', async (route, me) => {
    const body = (await route.json()) as { name?: unknown; avatar?: unknown }
    route.send(
      200,
      account.store.saveWorkspaceProfile(me.id, {
        ...(typeof body.name === 'string' ? { name: body.name } : {}),
        ...(typeof body.avatar === 'string' ? { avatar: body.avatar } : {}),
      }),
    )
  })

  authedRoute('GET', '/api/account/starred', async (route, me) => {
    const prefs = account.store.workspacePrefs(me.id)
    route.send(200, {
      workspaceId: prefs.workspaceId,
      starredViews: prefs.starredViews,
      starredRecords: prefs.starredRecords,
      pinnedAgents: prefs.pinnedAgents,
    })
  })

  authedRoute('POST', '/api/account/starred', async (route, me) => {
    const body = (await route.json()) as {
      starredViews?: unknown
      starredRecords?: unknown
      pinnedAgents?: unknown
    }
    const saved = account.store.saveWorkspacePrefs(me.id, body)
    route.send(200, {
      workspaceId: saved.workspaceId,
      starredViews: saved.starredViews,
      starredRecords: saved.starredRecords,
      pinnedAgents: saved.pinnedAgents,
    })
  })

  authedRoute('POST', '/api/agents/:id/pin', async (route, me) => {
    const body = (await route.json()) as { pinned?: unknown }
    const saved = account.store.setAgentPinned(me.id, String(route.params.id ?? ''), Boolean(body.pinned))
    route.send(200, {
      id: String(route.params.id ?? ''),
      pinned: saved.pinnedAgents.includes(String(route.params.id ?? '')),
      pinnedAgents: saved.pinnedAgents,
    })
  })

  authedRoute('GET', '/api/account/workspaces', async (route, me) => {
    const local = account.store
      .listWorkspaces(me.id)
      .filter((workspace) => account.workspaceLocation(workspace.id) === 'device')
      .map((workspace) => ({ ...workspace, location: 'device' as const }))
    const cachedCloud = () =>
      account.store
        .listWorkspaces(me.id)
        .filter((workspace) => account.workspaceLocation(workspace.id) === 'cloud')
        .map((workspace) => ({ ...workspace, location: 'cloud' as const }))
    const allowCloudLinking = getRuntimePolicy().allowCloudLinking
    let cloud: Array<Record<string, unknown>> = !allowCloudLinking ? cachedCloud() : []
    let cloudUnavailable = false
    if (allowCloudLinking && account.cloudConnection(me.id)) {
      cloud = cachedCloud()
      try {
        const relayed = await relayAccount(route, account, me.id, '/api/account/workspaces')
        if (relayed?.status && relayed.status < 300) {
          cacheWorkspaceList(account, me.id, relayed.payload)
          cloud = (Array.isArray(relayed.payload.workspaces) ? relayed.payload.workspaces : []).map((workspace) => ({
            ...(workspace as Record<string, unknown>),
            location: 'cloud',
          }))
        } else if (relayed) {
          cloudUnavailable = true
        }
      } catch {
        cloudUnavailable = true
      }
    }
    if (allowCloudLinking && !account.cloudConnection(me.id)) {
      const active = account.store.activeWorkspaceId()
      const device = local[0]
      if (active && account.workspaceLocation(active) === 'cloud' && device) account.store.setActive(me.id, device.id)
    }
    route.send(200, {
      workspaces: [...local, ...cloud],
      cloudConnected: Boolean(account.cloudConnection(me.id)),
      cloudUnavailable,
    })
  })

  authedRoute('POST', '/api/account/workspaces', async (route, me) => {
    const body = (await route.json()) as { name?: string; location?: string }
    const name = String(body.name ?? '').trim() || (body.location === 'device' ? '本机空间' : '云端空间')
    if (!getRuntimePolicy().allowCloudLinking) {
      const workspace = account.store.createWorkspace(me.id, name)
      route.send(201, { ...workspace, location: 'cloud' })
      return
    }
    if (body.location === 'cloud') {
      const connection = account.cloudConnection(me.id)
      if (!connection) throw new CollabError('请先登录云端账号', 401)
      let response: Response
      try {
        response = await fetch(`${connection.origin}/api/account/workspaces`, {
          method: 'POST',
          headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ name, location: 'cloud' }),
        })
      } catch {
        throw new CollabError('云端暂时连不上', 503)
      }
      const payload = (await response.json().catch(() => ({}))) as {
        id?: string
        name?: string
        ownerId?: string
        role?: string
        createdAt?: number
        error?: string
      }
      if (!response.ok || !payload.id) throw new CollabError(payload.error || '创建云端空间失败', response.status)
      account.store.upsertPulledWorkspace({
        accountId: me.id,
        id: payload.id,
        name: String(payload.name ?? name),
        ownerId: payload.ownerId,
        role: payload.role || 'owner',
        createdAt: payload.createdAt,
      })
      account.markCloudWorkspace(payload.id)
      account.store.setActive(me.id, payload.id)
      route.send(201, { ...payload, location: 'cloud' })
      return
    }
    const workspace = account.store.createWorkspace(me.id, name)
    route.send(201, { ...workspace, location: 'device' })
  })

  authedRoute('PATCH', '/api/account/workspaces/:id', async (route, me) => {
    const body = (await route.json()) as { name?: string }
    if (getRuntimePolicy().allowCloudLinking && account.workspaceLocation(route.params.id!) === 'cloud') {
      const connection = account.cloudConnection(me.id)
      if (!connection) throw new CollabError('请先登录云端账号', 401)
      let response: Response
      try {
        response = await fetch(`${connection.origin}/api/account/workspaces/${encodeURIComponent(route.params.id!)}`, {
          method: 'PATCH',
          headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
          body: JSON.stringify(body),
        })
      } catch {
        throw new CollabError('云端暂时连不上', 503)
      }
      const payload = (await response.json().catch(() => ({}))) as {
        id?: string
        name?: string
        ownerId?: string
        role?: string
        createdAt?: number
        error?: string
      }
      if (!response.ok || !payload.id) throw new CollabError(payload.error || '重命名云端空间失败', response.status)
      account.store.upsertPulledWorkspace({
        accountId: me.id,
        id: payload.id,
        name: String(payload.name ?? ''),
        ownerId: payload.ownerId,
        role: payload.role,
        createdAt: payload.createdAt,
      })
      route.send(200, { ...payload, location: 'cloud' })
      return
    }
    route.send(200, account.store.renameWorkspace(me.id, route.params.id!, String(body.name ?? '')))
  })

  authedRoute('DELETE', '/api/account/workspaces/:id', async (route, me) => {
    const body = (await route.json().catch(() => ({}))) as { name?: string }
    const confirmName = String(body.name ?? '')
    const workspaceId = route.params.id!
    if (getRuntimePolicy().allowCloudLinking && account.workspaceLocation(workspaceId) === 'cloud') {
      const connection = account.cloudConnection(me.id)
      if (!connection) throw new CollabError('请先登录云端账号', 401)
      let response: Response
      try {
        response = await fetch(`${connection.origin}/api/account/workspaces/${encodeURIComponent(workspaceId)}`, {
          method: 'DELETE',
          headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
          body: JSON.stringify({ name: confirmName }),
        })
      } catch {
        throw new CollabError('云端暂时连不上', 503)
      }
      const payload = (await response.json().catch(() => ({}))) as { error?: string; activeWorkspaceId?: string }
      if (!response.ok) throw new CollabError(payload.error || '删除云端空间失败', response.status)
      try {
        const deleted = account.store.deleteWorkspace(me.id, workspaceId, confirmName)
    emitWorkspaceDeleted(ctx, workspaceId)
        purgeSessionEvents(deleted.sessionIds)
        account.purgeWorkspaceCache(workspaceId)
        route.send(200, { id: workspaceId, deleted: true, activeWorkspaceId: deleted.activeWorkspaceId })
      } catch {
        account.purgeWorkspaceCache(workspaceId)
        const fallback = account.store.listWorkspaces(me.id).find((ws) => ws.id !== workspaceId)?.id ?? ''
        if (fallback) account.store.setActive(me.id, fallback)
        route.send(200, { id: workspaceId, deleted: true, activeWorkspaceId: fallback })
      }
      return
    }
    const deleted = account.store.deleteWorkspace(me.id, workspaceId, confirmName)
    emitWorkspaceDeleted(ctx, workspaceId)
    purgeSessionEvents(deleted.sessionIds)
    route.send(200, { id: deleted.id, deleted: true, activeWorkspaceId: deleted.activeWorkspaceId })
  })

  authedRoute('GET', '/api/account/workspaces/:id/members', async (route, me) => {
    requireCollaborativeWorkspace(route.params.id!)
    route.send(200, { members: account.store.members(me.id, route.params.id!) })
  })

  authedRoute('POST', '/api/account/workspaces/:id/members', async (route, me) => {
    requireCollaborativeWorkspace(route.params.id!)
    const body = (await route.json()) as { accountId?: string; email?: string }
    const email = String(body.email ?? '').trim()
    const members = email
      ? account.store.addMemberByEmail(me.id, route.params.id!, email)
      : account.store.addMember(me.id, route.params.id!, String(body.accountId ?? ''))
    route.send(200, { members })
  })

  authedRoute('POST', '/api/account/workspaces/:id/invites', async (route, me) => {
    requireCollaborativeWorkspace(route.params.id!)
    const body = (await route.json()) as { role?: string; expiresInHours?: number }
    const role = body.role === 'member' ? 'member' : 'viewer'
    const invite = account.store.createWorkspaceInvite(
      me.id,
      route.params.id!,
      role,
      Number(body.expiresInHours ?? 168),
    )
    const invitePath = `/?workspaceInvite=${encodeURIComponent(invite.token)}`
    const origin = requestPublicOrigin(route)
    route.send(201, {
      ...invite,
      path: invitePath,
      ...(origin ? { url: `${origin}${invitePath}` } : {}),
    })
  })

  authedRoute('POST', '/api/account/invites/:token/accept', async (route, me) => {
    const connection = getRuntimePolicy().allowCloudLinking ? account.cloudConnection(me.id) : null
    if (connection) {
      const relayed = await relayAccount(
        route,
        account,
        me.id,
        `/api/account/invites/${encodeURIComponent(route.params.token!)}/accept`,
      )
      if (!relayed) throw new CollabError('请先登录云端账号', 401)
      if (relayed.status < 300) {
        try {
          const listed = await fetch(`${connection.origin}/api/account/workspaces`, {
            headers: { authorization: `Bearer ${connection.token}` },
          })
          const payload = (await listed.json().catch(() => ({}))) as Record<string, unknown>
          if (listed.ok) cacheWorkspaceList(account, me.id, payload)
        } catch {
          /* 接受已经成功，空间列表稍后刷新 */
        }
      }
      route.send(relayed.status, relayed.payload)
      return
    }
    if (!getRuntimePolicy().allowWorkspaceInvites) throw new CollabError('本机空间不提供成员邀请', 403)
    const result = account.store.acceptWorkspaceInvite(me.id, route.params.token!)
    ctx.http.broadcast('database', { ts: Date.now() })
    route.send(200, result)
  })

  handledRoute('POST', '/api/account/guest-invites/:token/accept', async (route) => {
    if (!getRuntimePolicy().allowWorkspaceInvites) throw new CollabError('本机空间不提供访客邀请', 403)
    const body = (await route.json()) as { name?: string }
    const result = account.store.acceptGuestInvite(route.params.token!, String(body.name ?? ''))
    rememberLogin(route, result.token)
    ctx.http.broadcast('database', { ts: Date.now() })
    route.send(200, result)
  })

  authedRoute('DELETE', '/api/account/workspaces/:id/members/:accountId', async (route, me) => {
    requireCollaborativeWorkspace(route.params.id!)
    const queryTransfer = String(route.query.get('transferToAccountId') ?? '').trim()
    const body = (await route.json().catch(() => ({}))) as { transferToAccountId?: string }
    const transferToAccountId = queryTransfer || String(body?.transferToAccountId ?? '').trim() || undefined
    const removed = account.store.removeMember(me.id, route.params.id!, route.params.accountId!, {
      ...(transferToAccountId ? { transferToAccountId } : {}),
    })
    ctx.http.disconnectTenant(route.params.accountId!, route.params.id!)
    emitTenantRevoked(ctx, { accountId: route.params.accountId!, workspaceId: route.params.id! })
    route.send(200, {
      members: account.store.members(me.id, route.params.id!),
      transfer: removed,
    })
  })

  authedRoute('GET', '/api/account/workspaces/:id/actor-scopes', async (route, me) => {
    const workspaceId = route.params.id!
    requireCollaborativeWorkspace(workspaceId)
    const role = account.store.memberRole(me.id, workspaceId)
    if (role !== 'owner' && role !== 'admin') throw new CollabError('仅管理员可查看代理作用域', 403)
    const actorType = String(route.query.get('actorType') ?? '')
    const actorId = String(route.query.get('actorId') ?? '').trim()
    if ((actorType !== 'agent' && actorType !== 'mcp' && actorType !== 'public-link') || !actorId) {
      throw new CollabError('参数 actorType / actorId 无效', 400)
    }
    const scope = account.authorization.getActorScope(workspaceId, actorType, actorId)
    route.send(200, { scope })
  })

  authedRoute('POST', '/api/account/workspaces/:id/actor-scopes', async (route, me) => {
    const workspaceId = route.params.id!
    requireCollaborativeWorkspace(workspaceId)
    const role = account.store.memberRole(me.id, workspaceId)
    if (role !== 'owner' && role !== 'admin') throw new CollabError('仅管理员可配置代理作用域', 403)
    const body = (await route.json()) as {
      actorType?: string
      actorId?: string
      allowedCollections?: string[] | null
      allowedViews?: string[] | null
      maxRole?: ResourceRole
      expiresAt?: number | null
    }
    const actorType = body.actorType
    const actorId = String(body.actorId ?? '').trim()
    if ((actorType !== 'agent' && actorType !== 'mcp' && actorType !== 'public-link') || !actorId) {
      throw new CollabError('参数 actorType / actorId 无效', 400)
    }
    account.authorization.setActorScope(workspaceId, actorType, actorId, me.id, {
      allowedCollections: Array.isArray(body.allowedCollections) ? body.allowedCollections : null,
      allowedViews: Array.isArray(body.allowedViews) ? body.allowedViews : null,
      maxRole: body.maxRole,
      expiresAt: typeof body.expiresAt === 'number' ? body.expiresAt : null,
    })
    route.send(200, { scope: account.authorization.getActorScope(workspaceId, actorType, actorId) })
  })

  authedRoute('DELETE', '/api/account/workspaces/:id/actor-scopes', async (route, me) => {
    const workspaceId = route.params.id!
    requireCollaborativeWorkspace(workspaceId)
    const role = account.store.memberRole(me.id, workspaceId)
    if (role !== 'owner' && role !== 'admin') throw new CollabError('仅管理员可吊销代理作用域', 403)
    const body = (await route.json()) as { actorType?: string; actorId?: string }
    const actorType = body.actorType
    const actorId = String(body.actorId ?? '').trim()
    if ((actorType !== 'agent' && actorType !== 'mcp' && actorType !== 'public-link') || !actorId) {
      throw new CollabError('参数 actorType / actorId 无效', 400)
    }
    account.authorization.revokeActorScope(workspaceId, actorType, actorId)
    route.send(200, { ok: true })
  })

  authedRoute('PATCH', '/api/account/workspaces/:id/members/:accountId', async (route, me) => {
    requireCollaborativeWorkspace(route.params.id!)
    const body = (await route.json()) as { role?: string }
    const role = String(body.role ?? '')
    if (role !== 'owner' && role !== 'admin' && role !== 'member' && role !== 'viewer') {
      throw new CollabError('角色只能是 owner、admin、member 或 viewer', 400)
    }
    account.store.updateMemberRole(me.id, route.params.id!, route.params.accountId!, role)
    route.send(200, { members: account.store.members(me.id, route.params.id!) })
  })

  authedRoute('GET', '/api/account/groups', async (route, me) => {
    const workspaceId = resolveScopedWorkspaceId(ctx) || account.store.activeWorkspaceId() || ''
    if (!workspaceId) {
      route.send(200, { groups: [] })
      return
    }
    requireCollaborativeWorkspace(workspaceId)
    route.send(200, { groups: account.store.groups(me.id, workspaceId) })
  })

  authedRoute('POST', '/api/account/groups', async (route, me) => {
    const workspaceId = resolveScopedWorkspaceId(ctx) || account.store.activeWorkspaceId() || ''
    if (!workspaceId) throw new CollabError('未找到活跃工作区', 400)
    requireCollaborativeWorkspace(workspaceId)
    const body = (await route.json()) as {
      name?: string
      kind?: 'static' | 'dynamic'
      filterTree?: Record<string, unknown> | null
    }
    const group = account.store.createGroup(me.id, workspaceId, String(body.name ?? ''), {
      kind: body.kind === 'dynamic' ? 'dynamic' : 'static',
      filterTree: body.filterTree ?? null,
    })
    broadcastAccessChange(workspaceId, 'records')
    route.send(201, group)
  })

  authedRoute('GET', '/api/account/workspaces/:id/groups', async (route, me) => {
    requireCollaborativeWorkspace(route.params.id!)
    route.send(200, { groups: account.store.groups(me.id, route.params.id!) })
  })

  authedRoute('POST', '/api/account/workspaces/:id/groups', async (route, me) => {
    requireCollaborativeWorkspace(route.params.id!)
    const body = (await route.json()) as {
      name?: string
      kind?: 'static' | 'dynamic'
      filterTree?: Record<string, unknown> | null
    }
    const group = account.store.createGroup(me.id, route.params.id!, String(body.name ?? ''), {
      kind: body.kind === 'dynamic' ? 'dynamic' : 'static',
      filterTree: body.filterTree ?? null,
    })
    broadcastAccessChange(route.params.id!, 'records')
    route.send(201, group)
  })

  authedRoute('PATCH', '/api/account/workspaces/:id/groups/:groupId', async (route, me) => {
    requireCollaborativeWorkspace(route.params.id!)
    const body = (await route.json()) as {
      name?: string
      filterTree?: Record<string, unknown> | null
    }
    const group = account.store.updateGroup(me.id, route.params.id!, route.params.groupId!, {
      ...(body.name !== undefined ? { name: String(body.name) } : {}),
      ...(body.filterTree !== undefined ? { filterTree: body.filterTree } : {}),
    })
    broadcastAccessChange(route.params.id!, 'records')
    route.send(200, group)
  })

  authedRoute('DELETE', '/api/account/workspaces/:id/groups/:groupId', async (route, me) => {
    requireCollaborativeWorkspace(route.params.id!)
    const result = account.store.deleteGroup(me.id, route.params.id!, route.params.groupId!)
    broadcastAccessChange(route.params.id!, 'records')
    route.send(200, result)
  })

  authedRoute('POST', '/api/account/workspaces/:id/groups/:groupId/members', async (route, me) => {
    requireCollaborativeWorkspace(route.params.id!)
    const body = (await route.json()) as { email?: string }
    route.send(
      200,
      {
        members: account.store.addGroupMemberByEmail(
          me.id,
          route.params.id!,
          route.params.groupId!,
          String(body.email ?? ''),
        ),
      },
    )
  })

  authedRoute('GET', '/api/account/member-activity', async (route, me) => {
    const memberId = String(route.query.get('memberId') ?? '').trim() || me.id
    const days = Number(route.query.get('days') ?? 182)
    const limit = Number(route.query.get('limit') ?? 80)
    const data = account.store.memberActivity(me.id, memberId, {
      days: Number.isFinite(days) ? days : 182,
      limit: Number.isFinite(limit) ? limit : 80,
    })
    type DatabaseLookup = {
      collection?: (path: string) => { label?: string; schema?: { labelField?: string } } | undefined
      list?: (
        path: string,
        filter?: Record<string, unknown>,
        page?: { columns?: string[]; limit?: number; offset?: number },
      ) => Promise<{ items?: Array<Record<string, unknown>> }>
      viewCatalog?: { viewsFor(path: string): Array<{ id?: unknown; name?: unknown }> }
    }
    let db: DatabaseLookup | undefined
    try {
      db = ctx.get('database') as DatabaseLookup | undefined
    } catch {
      db = undefined
    }
    const titleMap = new Map<string, string>()
    for (const item of data.recent) {
      const key = `${item.collection}\t${item.recordId}`
      const title = item.recordTitle?.trim()
      if (item.collection && item.recordId && title && !titleMap.has(key)) {
        titleMap.set(key, title)
      }
    }
    const collectionLabels = new Map<string, string>()
    if (db?.list && data.grants.records.length) {
      const byCollection = new Map<string, string[]>()
      for (const grant of data.grants.records) {
        const list = byCollection.get(grant.collection) ?? []
        list.push(grant.recordId)
        byCollection.set(grant.collection, list)
      }
      for (const [collection, ids] of byCollection) {
        const spec = db.collection?.(collection)
        const label = spec?.label?.trim() ?? ''
        if (label) collectionLabels.set(collection, label)
        const labelField = spec?.schema?.labelField?.trim()
        const columns = [...new Set(['title', 'name', 'label', ...(labelField ? [labelField] : [])])]
        const resolvedIds = new Set<string>()
        const collectRows = (items: Array<Record<string, unknown>> | undefined) => {
          for (const row of items ?? []) {
            const id = String(row.id ?? '')
            if (!id) continue
            resolvedIds.add(id)
            const rawTitle = String(
              (labelField ? row[labelField] : undefined) ?? row.title ?? row.name ?? row.label ?? '',
            ).trim()
            titleMap.set(`${collection}\t${id}`, rawTitle || (label ? `未命名${label}` : '未命名'))
          }
        }
        try {
          const listed = await db.list(collection, { $ids: ids }, { columns, limit: Math.max(ids.length, 100) })
          collectRows(listed?.items)
          const missingIds = ids.filter((id) => !resolvedIds.has(id))
          if (missingIds.length) {
            const trashed = await db.list(
              collection,
              { $ids: missingIds, deleted: true },
              { columns, limit: Math.max(missingIds.length, 100) },
            )
            collectRows(trashed?.items)
          }
        } catch {
          /* 无法读取该集合时回退为已有标题或 recordId */
        }
      }
    }
    const viewNameMap = new Map<string, string>()
    if (db?.viewCatalog && data.grants.views.length) {
      const collections = new Set(data.grants.views.map((item) => item.collection))
      for (const collection of collections) {
        const label = db.collection?.(collection)?.label?.trim()
        if (label) collectionLabels.set(collection, label)
        try {
          for (const view of db.viewCatalog.viewsFor(collection)) {
            const id = String(view.id ?? '')
            const name = String(view.name ?? '').trim()
            if (id && name) viewNameMap.set(`${collection}\t${id}`, name)
          }
        } catch {
          /* 视图目录不可用时回退为 viewId */
        }
      }
    }
    route.send(200, {
      ...data,
      grants: {
        records: data.grants.records.map((grant) => ({
          ...grant,
          title: titleMap.get(`${grant.collection}\t${grant.recordId}`) ?? '',
          collectionLabel: collectionLabels.get(grant.collection) ?? '',
        })),
        views: data.grants.views.map((grant) => ({
          ...grant,
          viewName: viewNameMap.get(`${grant.collection}\t${grant.viewId}`) ?? '',
          collectionLabel: collectionLabels.get(grant.collection) ?? '',
        })),
      },
    })
  })

  authedRoute('GET', '/api/account/access', async (route, me) => {
    const activeWorkspace = resolveScopedWorkspaceId(ctx)
    if (!activeWorkspace || account.workspaceLocation(activeWorkspace) !== 'cloud') {
      route.send(200, {
        scope: 'personal',
        ownerId: me.id,
        people: [],
        groups: [],
        memberViews: [],
        viewGrants: [],
        roleChain: [],
        local: true,
      })
      return
    }
    const collection = String(route.query.get('collection') ?? '')
    route.send(
      200,
      account.store.recordAccess(me.id, collection, String(route.query.get('recordId') ?? '')),
    )
  })

  const broadcastAccessChange = (workspaceId: string, scope: 'views' | 'records', path?: string) => {
    const cleanPath = String(path ?? '').trim()
    const payload =
      scope === 'views'
        ? { ts: Date.now(), scope: 'views' as const, views: true, ...(cleanPath ? { path: cleanPath } : {}) }
        : { ts: Date.now(), scope: 'records' as const, ...(cleanPath ? { path: cleanPath } : {}) }
    ctx.http.broadcast('database', payload, workspaceId)
  }

  authedRoute('POST', '/api/account/access', async (route, me) => {
    const activeWorkspace = resolveScopedWorkspaceId(ctx)
    requireCollaborativeWorkspace(activeWorkspace ?? '')
    const body = (await route.json()) as {
      collection?: string
      recordId?: string
      viewId?: string
      email?: string
      groupId?: string
      role?: ResourceRole
      collaboratorKind?: 'internal' | 'external'
    }
    const collection = String(body.collection ?? '')
    const recordId = String(body.recordId ?? '')
    const role: ResourceRole =
      body.role === 'viewer' || body.role === 'commenter' || body.role === 'manager' || body.role === 'owner'
        ? body.role
        : 'editor'
    const kind = body.collaboratorKind === 'internal' ? 'internal' : 'external'
    const result = body.groupId
      ? account.store.grantGroup(me.id, collection, recordId, String(body.groupId), role)
      : account.store.shareWithEmail(me.id, collection, recordId, String(body.email ?? ''), role, kind)
    broadcastAccessChange(activeWorkspace, 'records', collection)
    route.send(200, result)
  })

  authedRoute('PATCH', '/api/account/access', async (route, me) => {
    const activeWorkspace = resolveScopedWorkspaceId(ctx)
    requireCollaborativeWorkspace(activeWorkspace ?? '')
    const body = (await route.json()) as {
      collection?: string
      recordId?: string
      inheritanceMode?: 'inherit' | 'custom'
    }
    const collection = String(body.collection ?? '').trim()
    const recordId = String(body.recordId ?? '').trim()
    const mode = body.inheritanceMode === 'inherit' ? 'inherit' : body.inheritanceMode === 'custom' ? 'custom' : null
    if (!collection || !recordId || !mode) {
      route.send(400, { error: '参数不完整' })
      return
    }
    const result = account.store.setRecordInheritance(me.id, collection, recordId, mode)
    broadcastAccessChange(activeWorkspace, 'records', collection)
    route.send(200, result)
  })

  authedRoute('DELETE', '/api/account/access', async (route, me) => {
    const activeWorkspace = resolveScopedWorkspaceId(ctx)
    requireCollaborativeWorkspace(activeWorkspace ?? '')
    const body = (await route.json()) as {
      collection?: string
      recordId?: string
      viewId?: string
      subjectType?: 'account' | 'group'
      subjectId?: string
      grantedBy?: string
    }
    const collection = String(body.collection ?? '')
    const subjectType = body.subjectType === 'group' ? 'group' : 'account'
    const result = account.store.revokeRecordGrant(
      me.id,
      collection,
      String(body.recordId ?? ''),
      subjectType,
      String(body.subjectId ?? ''),
    )
    broadcastAccessChange(activeWorkspace, 'records', collection)
    route.send(200, result)
  })

  authedRoute('POST', '/api/account/access/guest-invite', async (route, me) => {
    const activeWorkspace = resolveScopedWorkspaceId(ctx)
    requireCollaborativeWorkspace(activeWorkspace ?? '')
    const body = (await route.json()) as {
      collection?: string
      recordId?: string
      viewId?: string
      role?: string
      expiresInHours?: number
    }
    const invite = account.store.createGuestInvite(
      me.id,
      String(body.collection ?? ''),
      String(body.recordId ?? ''),
      body.role === 'editor' ? 'editor' : 'viewer',
      Number(body.expiresInHours ?? 24),
      Date.now(),
      String(body.viewId ?? ''),
    )
    const guestPath = `/?guestInvite=${encodeURIComponent(invite.token)}`
    const origin = requestPublicOrigin(route)
    route.send(201, {
      ...invite,
      path: guestPath,
      ...(origin ? { url: `${origin}${guestPath}` } : {}),
    })
  })
  // 独立分享规则（access_rules）CRUD：按 K+1 逻辑表分区（workspace 规则由管理员共管，personal 规则个人持有）
  authedRoute('GET', '/api/account/access-rules', async (route, me) => {
    const workspaceId = resolveScopedWorkspaceId(ctx) || account.store.activeWorkspaceId() || ''
    if (!workspaceId) throw new CollabError('未找到活跃工作区', 400)
    const collection = route.query.get('collection')?.trim() || undefined
    const rawScope = route.query.get('scope')?.trim()
    const scopeFilter = rawScope === 'workspace' || rawScope === 'personal' ? rawScope : 'all'
    const rules = account.store.listVisibleAccessRules(me.id, workspaceId, collection, scopeFilter)
    route.send(200, { rules })
  })

  authedRoute('POST', '/api/account/access-rules', async (route, me) => {
    const workspaceId = resolveScopedWorkspaceId(ctx) || account.store.activeWorkspaceId() || ''
    if (!workspaceId) throw new CollabError('未找到活跃工作区', 400)
    const body = (await route.json()) as {
      collection?: string
      name?: string
      scope?: 'workspace' | 'personal'
      ownerTable?: string
      filterTree?: Record<string, unknown>
      columns?: string[] | null
      visibleViews?: string[] | null
      displaySnapshot?: { mode?: string; sorts?: unknown[]; groupBy?: string; groupConfig?: Record<string, unknown> } | null
      enabled?: boolean
      grants?: Array<{ subjectType: 'account' | 'workspace' | 'group'; subjectId: string; role: 'viewer' | 'editor' | 'manager' }>
    }
    const rule = account.store.createAccessRule(me.id, workspaceId, {
      collection: String(body.collection ?? ''),
      name: String(body.name ?? ''),
      scope: body.scope,
      ownerTable: body.ownerTable,
      filterTree: body.filterTree,
      columns: body.columns,
      visibleViews: body.visibleViews,
      displaySnapshot: body.displaySnapshot,
      enabled: body.enabled,
      grants: body.grants,
    })
    broadcastAccessChange(workspaceId, 'records', rule.collection)
    route.send(201, { rule })
  })

  authedRoute('POST', '/api/account/records/owner-table', async (route, me) => {
    const workspaceId = resolveScopedWorkspaceId(ctx) || account.store.activeWorkspaceId() || ''
    if (!workspaceId) throw new CollabError('未找到活跃工作区', 400)
    const body = (await route.json()) as {
      collection?: string
      recordId?: string
      ownerTable?: string
    }
    const collection = String(body.collection ?? '').trim()
    const recordId = String(body.recordId ?? '').trim()
    const ownerTable = String(body.ownerTable ?? '').trim()
    const result = account.store.transferRecordOwnerTable(me.id, workspaceId, collection, recordId, ownerTable)
    broadcastAccessChange(workspaceId, 'records', collection)
    route.send(200, result)
  })

  authedRoute('PATCH', '/api/account/access-rules/:id', async (route, me) => {
    const workspaceId = resolveScopedWorkspaceId(ctx) || account.store.activeWorkspaceId() || ''
    if (!workspaceId) throw new CollabError('未找到活跃工作区', 400)
    const ruleId = String(route.params.id ?? '').trim()
    const body = (await route.json()) as {
      name?: string
      filterTree?: Record<string, unknown>
      columns?: string[] | null
      displaySnapshot?: { mode?: string; sorts?: unknown[]; groupBy?: string; groupConfig?: Record<string, unknown> } | null
      enabled?: boolean
      grants?: Array<{ subjectType: 'account' | 'workspace' | 'group'; subjectId: string; role: 'viewer' | 'editor' | 'manager' }>
    }
    const rule = account.store.updateAccessRule(me.id, workspaceId, ruleId, body)
    broadcastAccessChange(workspaceId, 'records', rule.collection)
    route.send(200, { rule })
  })

  authedRoute('DELETE', '/api/account/access-rules/:id', async (route, me) => {
    const workspaceId = resolveScopedWorkspaceId(ctx) || account.store.activeWorkspaceId() || ''
    if (!workspaceId) throw new CollabError('未找到活跃工作区', 400)
    const ruleId = String(route.params.id ?? '').trim()
    const result = account.store.deleteAccessRule(me.id, workspaceId, ruleId)
    broadcastAccessChange(workspaceId, 'records')
    route.send(200, result)
  })

  authedRoute('POST', '/api/account/access-rules/:id/grants', async (route, me) => {
    const workspaceId = resolveScopedWorkspaceId(ctx) || account.store.activeWorkspaceId() || ''
    if (!workspaceId) throw new CollabError('未找到活跃工作区', 400)
    const ruleId = String(route.params.id ?? '').trim()
    const body = (await route.json()) as {
      subjectType?: 'account' | 'workspace' | 'group'
      subjectId?: string
      role?: 'viewer' | 'editor' | 'manager'
    }
    const rule = account.store.grantAccessRuleSubject(me.id, workspaceId, ruleId, {
      subjectType: body.subjectType ?? 'account',
      subjectId: String(body.subjectId ?? ''),
      role: body.role ?? 'viewer',
    })
    broadcastAccessChange(workspaceId, 'records', rule.collection)
    route.send(200, { rule })
  })

  authedRoute('DELETE', '/api/account/access-rules/:id/grants', async (route, me) => {
    const workspaceId = resolveScopedWorkspaceId(ctx) || account.store.activeWorkspaceId() || ''
    if (!workspaceId) throw new CollabError('未找到活跃工作区', 400)
    const ruleId = String(route.params.id ?? '').trim()
    const body = (await route.json()) as {
      subjectType?: 'account' | 'workspace' | 'group'
      subjectId?: string
    }
    const rule = account.store.revokeAccessRuleSubject(
      me.id,
      workspaceId,
      ruleId,
      body.subjectType ?? 'account',
      String(body.subjectId ?? ''),
    )
    broadcastAccessChange(workspaceId, 'records', rule.collection)
    route.send(200, { rule })
  })

  authedRoute('POST', '/api/account/presence', async (route, me) => {
    const body = (await route.json()) as { workspaceId?: string; collection?: string; recordId?: string }
    requireCollaborativeWorkspace(String(body.workspaceId ?? ''))
    account.store.pulse(
      me.id,
      String(body.workspaceId ?? ''),
      String(body.collection ?? ''),
      String(body.recordId ?? ''),
    )
    route.send(200, { presence: account.store.presence(me.id, String(body.workspaceId ?? '')) })
  })
}
