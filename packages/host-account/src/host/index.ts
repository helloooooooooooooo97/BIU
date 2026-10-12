import { existsSync } from 'node:fs'
import { Service, type Context } from 'cordis'
import { biuSqlitePath, currentAccountId, eventsSqlitePath, isOnlineRuntime, openAndMigrateBiu, openSqlite } from '@biu/host-plugin-loader/data-dir'
import type { RouteContext } from '@biu/type-http'
import { CollabError, CollabStore } from './store.ts'
import { httpRemote, RecordReplica } from './replica.ts'
import { applySnapshot, exchangeSnapshot, takeSnapshot, type MirrorSnapshot } from './mirror.ts'
import type { AuthorizationService, ResourceRole } from './authorization.ts'
import { workspaceMembersCollection } from './workspace-members-collection.ts'

export type { Actor, Action, ResourceRef, ResourceRole, WorkspaceRole, Decision } from './authorization.ts'

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
  replica: RecordReplica | null = null
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
    db.exec(`CREATE TABLE IF NOT EXISTS record_cloud_copy (
      collection TEXT NOT NULL,
      local_id TEXT NOT NULL,
      cloud_id TEXT NOT NULL,
      PRIMARY KEY (collection, local_id)
    )`)
    const origin = process.env.BIU_REMOTE_ORIGIN
    if (!isOnlineRuntime() && origin) {
      this.replica = new RecordReplica(db, httpRemote(origin))
      const timer = setInterval(() => {
        const device = this.replica?.active()
        if (!device?.token) return
        void exchangeSnapshot(ctx, origin, device.token, device.accountId, device.workspaceId).catch((error) => {
          console.warn('[replica] sync failed', error)
        })
      }, 3000)
      ctx.on('dispose', () => clearInterval(timer))
      ctx.on('account/request', (event) => {
        const localAccountId = String((event as { accountId?: string }).accountId ?? '')
        if (!localAccountId) return
        this.syncReplicaCredential(localAccountId)
      })
      const saved = this.db.prepare('SELECT local_account_id FROM cloud_connections WHERE active = 1').all() as Array<{ local_account_id: string }>
      for (const row of saved) this.syncReplicaCredential(row.local_account_id)
    }
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

  isRemote(collection: string, id: string) {
    const row = this.db.prepare('SELECT place FROM record_place WHERE collection = ? AND record_id = ?').get(collection, id) as
      | { place?: string }
      | undefined
    return row?.place === 'remote'
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
  }

  markRemote(collection: string, id: string) {
    this.db
      .prepare(
        `INSERT INTO record_place (collection, record_id, place) VALUES (?, ?, 'remote')
         ON CONFLICT(collection, record_id) DO UPDATE SET place = 'remote'`,
      )
      .run(collection, id)
  }

  clearPlace(collection: string, id: string) {
    this.db.prepare('DELETE FROM record_place WHERE collection = ? AND record_id = ?').run(collection, id)
  }

  remoteIds(collection: string) {
    const rows = this.db.prepare(`SELECT record_id FROM record_place WHERE collection = ? AND place = 'remote'`).all(collection) as Array<{
      record_id: string
    }>
    return rows.map((row) => row.record_id)
  }

  copiedCloud(collection: string, id: string) {
    const row = this.db.prepare('SELECT cloud_id FROM record_cloud_copy WHERE collection = ? AND local_id = ?').get(collection, id) as
      | { cloud_id?: string }
      | undefined
    return row?.cloud_id || ''
  }

  rememberCopy(collection: string, localId: string, cloudId: string) {
    this.db
      .prepare(
        `INSERT INTO record_cloud_copy (collection, local_id, cloud_id) VALUES (?, ?, ?)
         ON CONFLICT(collection, local_id) DO UPDATE SET cloud_id = excluded.cloud_id`,
      )
      .run(collection, localId, cloudId)
  }

  cloudConnection(localAccountId: string): CloudConnection | null {
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

  saveCloudConnection(input: Omit<CloudConnection, 'connectedAt'> & { connectedAt?: number }) {
    const connectedAt = input.connectedAt ?? Date.now()
    this.db.prepare('UPDATE cloud_connections SET active = 0 WHERE local_account_id = ?').run(input.localAccountId)
    this.db
      .prepare(
        `INSERT INTO cloud_connections
          (local_account_id, origin, remote_account_id, remote_name, remote_email, token, connected_at, active)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)
         ON CONFLICT(local_account_id, origin, remote_account_id) DO UPDATE SET
           remote_name = excluded.remote_name,
           remote_email = excluded.remote_email,
           token = excluded.token,
           connected_at = excluded.connected_at,
           active = 1`,
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
    const saved = this.cloudConnection(input.localAccountId)!
    this.syncReplicaCredential(input.localAccountId)
    return saved
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

  syncReplicaCredential(localAccountId: string) {
    if (!this.replica || !localAccountId) return
    const connection = this.cloudConnection(localAccountId)
    if (!connection) return
    const active = this.store.activeWorkspaceId()
    const currentCloud = active && this.workspaceLocation(active) === 'cloud' ? active : ''
    const previous = this.replica.devices().find((item) => item.accountId === localAccountId)
    this.replica.remember({
      accountId: localAccountId,
      workspaceId: currentCloud || previous?.workspaceId || '',
      token: connection.token,
    })
  }

  /** 断开当前连接，保留已关联的云端账号和令牌。 */
  disconnectCloud(localAccountId: string) {
    this.db.prepare('UPDATE cloud_connections SET active = 0 WHERE local_account_id = ?').run(localAccountId)
    this.replica?.forget(localAccountId)
  }

  activateCloud(localAccountId: string, origin: string, remoteAccountId: string) {
    const row = this.db
      .prepare(
        `SELECT token FROM cloud_connections
         WHERE local_account_id = ? AND origin = ? AND remote_account_id = ?`,
      )
      .get(localAccountId, origin, remoteAccountId) as { token?: string } | undefined
    if (!row?.token) throw new CollabError('还没有关联这个云端账号', 404)
    this.db.prepare('UPDATE cloud_connections SET active = 0 WHERE local_account_id = ?').run(localAccountId)
    this.db
      .prepare(
        `UPDATE cloud_connections SET active = 1, connected_at = ?
         WHERE local_account_id = ? AND origin = ? AND remote_account_id = ?`,
      )
      .run(Date.now(), localAccountId, origin, remoteAccountId)
    this.syncReplicaCredential(localAccountId)
    return this.cloudConnection(localAccountId)!
  }

  removeCloudConnection(localAccountId: string) {
    this.disconnectCloud(localAccountId)
  }

  workspaceLocation(workspaceId: string): 'device' | 'cloud' {
    if (isOnlineRuntime()) return 'cloud'
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

function configuredRemoteOrigin() {
  if (isOnlineRuntime()) return ''
  return process.env.BIU_REMOTE_ORIGIN?.replace(/\/$/, '') || ''
}

async function relayAccount(route: RouteContext, account: AccountService, localAccountId: string, path: string) {
  const connection = account.linkedCloud(localAccountId)
  if (!connection) return null
  const activeWorkspaceId = account.store.activeWorkspaceId()
  const cloudWorkspaceId =
    activeWorkspaceId && account.workspaceLocation(activeWorkspaceId) === 'cloud' ? activeWorkspaceId : ''
  const method = route.req.method ?? 'GET'
  const hasBody = method !== 'GET' && method !== 'HEAD'
  const raw = hasBody ? await route.json().catch(() => ({})) : undefined
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
  const db = openSqlite(path, { foreignKeys: false })
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

  async function relayCloudWorkspace(
    route: RouteContext,
    localAccountId: string,
    workspaceId: string,
    path: string,
  ) {
    if (isOnlineRuntime()) return false
    if (account.workspaceLocation(workspaceId) !== 'cloud') return false
    const relayed = await relayAccount(route, account, localAccountId, path)
    if (!relayed) throw new CollabError('请先登录云端账号', 401)
    route.send(relayed.status, relayed.payload)
    return true
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
  ) {
    if (isOnlineRuntime()) throw new CollabError('服务端不能连接另一个云端账号', 400)
    const origin = configuredRemoteOrigin()
    if (!origin) throw new CollabError('还没有配置云端服务地址', 400)
    let remote: Response
    try {
      remote = await fetch(`${origin}/api/account/${action}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
    } catch {
      throw new CollabError('云端暂时连不上', 503)
    }
    const payload = (await remote.json().catch(() => ({}))) as {
      id?: string
      name?: string
      token?: string
      workspaceId?: string
      error?: string
    }
    if (!remote.ok || !payload.id || !payload.token) {
      throw new CollabError(payload.error || (action === 'login' ? '云端登录失败' : '云端注册失败'), remote.status || 400)
    }
    const connection = account.saveCloudConnection({
      localAccountId: local.id,
      origin,
      remoteAccountId: payload.id,
      remoteName: payload.name || email,
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
      account.replica?.remember({ accountId: local.id, workspaceId, token: payload.token })
    }
    return {
      account: {
        id: connection.remoteAccountId,
        name: connection.remoteName,
        email: connection.remoteEmail,
      },
      workspaceId,
      workspaces,
    }
  }

  async function connectCloud(route: RouteContext, action: 'login' | 'register') {
    const local = actor(route)
    const body = (await route.json()) as { email?: string; password?: string }
    return connectCloudIdentity(local, action, String(body.email ?? ''), String(body.password ?? ''))
  }

  ctx.http.route('GET', '/api/account/cloud', async (route) => {
    try {
      if (isOnlineRuntime()) return route.send(200, { available: false, connected: false })
      const me = actor(route)
      const connection = account.cloudConnection(me.id)
      const accounts = account.listCloudConnections(me.id).map((item) => ({
        id: item.remoteAccountId,
        name: item.remoteName,
        email: item.remoteEmail,
        origin: item.origin,
        active: item.active,
      }))
      route.send(200, {
        available: Boolean(configuredRemoteOrigin()),
        connected: Boolean(connection),
        accounts,
        ...(connection
          ? {
              account: {
                id: connection.remoteAccountId,
                name: connection.remoteName,
                email: connection.remoteEmail,
              },
              origin: connection.origin,
            }
          : {}),
      })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/cloud/login', async (route) => {
    try {
      route.send(200, await connectCloud(route, 'login'))
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/cloud/register', async (route) => {
    try {
      route.send(201, await connectCloud(route, 'register'))
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/cloud/sync-create', async (route) => {
    try {
      if (isOnlineRuntime()) throw new CollabError('服务端不能连接另一个云端账号', 400)
      const local = actor(route)
      if (!local.email) throw new CollabError('本地账号没有可同步的邮箱', 400)
      const password = account.store.recalledPassword(local.id)
      if (!password) throw new CollabError('请退出后重新登录一次，就能用本地密码创建云端账号', 400)
      try {
        route.send(201, { ...(await connectCloudIdentity(local, 'register', local.email, password)), created: true })
      } catch (error) {
        if (!(error instanceof CollabError) || error.status !== 409) throw error
        route.send(200, { ...(await connectCloudIdentity(local, 'login', local.email, password)), created: false })
      }
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/cloud/active', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { remoteAccountId?: string; origin?: string }
      const connection = account.activateCloud(me.id, String(body.origin ?? ''), String(body.remoteAccountId ?? ''))
      ctx.http.broadcast('database', { ts: Date.now() })
      route.send(200, {
        account: { id: connection.remoteAccountId, name: connection.remoteName, email: connection.remoteEmail },
        origin: connection.origin,
      })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('DELETE', '/api/account/cloud', async (route) => {
    try {
      const me = actor(route)
      account.removeCloudConnection(me.id)
      route.send(200, { ok: true })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/active', async (route) => {
    try {
      actor(route)
      const workspaceId = account.store.activeWorkspaceId()
      route.send(200, {
        workspaceId,
        ...(workspaceId ? { location: account.workspaceLocation(workspaceId) } : {}),
      })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/active', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { workspaceId?: string }
      const workspaceId = account.store.setActive(me.id, String(body.workspaceId ?? ''))
      if (account.workspaceLocation(workspaceId) === 'cloud') {
        const connection = account.cloudConnection(me.id)
        if (connection) account.replica?.remember({ accountId: me.id, workspaceId, token: connection.token })
      }
      ctx.http.broadcast('database', { ts: Date.now() })
      route.send(200, { workspaceId, location: account.workspaceLocation(workspaceId) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/register', async (route) => {
    try {
      const body = (await route.json()) as { email?: string; password?: string }
      const password = String(body.password ?? '')
      const email = String(body.email ?? '')
      if (!password.trim()) throw new CollabError('密码不能为空', 400)
      if (!email.trim()) throw new CollabError('邮箱不能为空', 400)
      const created = account.store.register('', Date.now(), password, email)
      const workspaceId = account.store.enter(created.id)
      const session = account.store.openSession(created.id, String(route.req.headers['user-agent'] ?? '浏览器').slice(0, 120))
      rememberLogin(route, session.token)
      ctx.http.broadcast('database', { ts: Date.now() })
      route.send(201, { id: created.id, name: created.name, createdAt: created.createdAt, token: session.token, workspaceId })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/login', async (route) => {
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
    if (found) ctx.http.disconnectRevokedSessions(found.id)
    route.res.setHeader('set-cookie', [
      'biu_account=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0',
      'biu_legacy_account=; Path=/; SameSite=Strict; Max-Age=0',
    ])
    route.send(200, { ok: true })
  })

  ctx.http.route('POST', '/api/account/password', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { currentPassword?: string; nextPassword?: string }
      const changed = account.store.changePassword(me.id, String(body.currentPassword ?? ''), String(body.nextPassword ?? ''), bearer(route))
      ctx.http.disconnectRevokedSessions(me.id)
      route.send(200, changed)
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/sessions', async (route) => {
    try {
      const me = actor(route)
      route.send(200, { sessions: account.store.listSessions(me.id) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('DELETE', '/api/account/sessions/:id', async (route) => {
    try {
      const me = actor(route)
      const revoked = account.store.revokeSessionById(me.id, String(route.params.id ?? ''))
      ctx.http.disconnectRevokedSessions(me.id)
      route.send(200, revoked)
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/mcp/credentials', async (route) => {
    try {
      const me = actor(route)
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
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/mcp/credentials', async (route) => {
    try {
      const me = actor(route)
      const workspaceId = String(route.query.get('workspaceId') ?? '').trim()
      if (!workspaceId) throw new CollabError('需要空间', 400)
      route.send(200, { credentials: account.store.listMcpCredentials(me.id, workspaceId) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('DELETE', '/api/account/mcp/credentials/:id', async (route) => {
    try {
      route.send(200, account.store.revokeMcpCredential(actor(route).id, String(route.params.id ?? '')))
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/mcp/audit', async (route) => {
    try {
      const me = actor(route)
      const workspaceId = String(route.query.get('workspaceId') ?? '').trim()
      if (!workspaceId) throw new CollabError('需要空间', 400)
      route.send(200, {
        events: account.store.listMcpAudit(me.id, workspaceId, Number(route.query.get('limit') ?? 100)),
      })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/me', async (route) => {
    try {
      const me = actor(route)
      route.send(200, { ...me, online: isOnlineRuntime() })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/plugins/audit', async (route) => {
    try {
      const me = actor(route)
      route.send(200, {
        events: account.store.listPluginAudit(
          me.id,
          String(route.query.get('workspaceId') ?? ''),
          Number(route.query.get('limit') ?? 100),
        ),
      })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/workspace-profile', async (route) => {
    try {
      const me = actor(route)
      const workspaceId = account.store.activeWorkspaceId()
      if (workspaceId && (await relayCloudWorkspace(route, me.id, workspaceId, '/api/account/workspace-profile'))) return
      route.send(200, account.store.workspaceProfile(me.id))
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/workspace-profile', async (route) => {
    try {
      const me = actor(route)
      const workspaceId = account.store.activeWorkspaceId()
      if (workspaceId && (await relayCloudWorkspace(route, me.id, workspaceId, '/api/account/workspace-profile'))) return
      const body = (await route.json()) as { name?: unknown; avatar?: unknown }
      route.send(
        200,
        account.store.saveWorkspaceProfile(me.id, {
          ...(typeof body.name === 'string' ? { name: body.name } : {}),
          ...(typeof body.avatar === 'string' ? { avatar: body.avatar } : {}),
        }),
      )
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/workspaces', async (route) => {
    try {
      const me = actor(route)
      const local = account.store
        .listWorkspaces(me.id)
        .filter((workspace) => account.workspaceLocation(workspace.id) === 'device')
        .map((workspace) => ({ ...workspace, location: 'device' as const }))
      const cachedCloud = () =>
        account.store
          .listWorkspaces(me.id)
          .filter((workspace) => account.workspaceLocation(workspace.id) === 'cloud')
          .map((workspace) => ({ ...workspace, location: 'cloud' as const }))
      let cloud: Array<Record<string, unknown>> = isOnlineRuntime() ? cachedCloud() : []
      let cloudUnavailable = false
      if (!isOnlineRuntime() && account.cloudConnection(me.id)) {
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
      if (!isOnlineRuntime() && !account.cloudConnection(me.id)) {
        const active = account.store.activeWorkspaceId()
        const device = local[0]
        if (active && account.workspaceLocation(active) === 'cloud' && device) account.store.setActive(me.id, device.id)
      }
      route.send(200, {
        workspaces: [...local, ...cloud],
        cloudConnected: Boolean(account.cloudConnection(me.id)),
        cloudUnavailable,
      })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/workspaces', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { name?: string; location?: string }
      if (isOnlineRuntime() && body.location !== 'cloud') throw new CollabError('云端只能创建云端空间', 400)
      if (body.location === 'cloud') {
        if (isOnlineRuntime()) {
          const workspace = account.store.createWorkspace(me.id, String(body.name ?? ''))
          route.send(201, { ...workspace, location: 'cloud' })
          return
        }
        const connection = account.cloudConnection(me.id)
        if (!connection) throw new CollabError('请先登录云端账号', 401)
        let response: Response
        try {
          response = await fetch(`${connection.origin}/api/account/workspaces`, {
            method: 'POST',
            headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ name: body.name }),
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
          name: String(payload.name ?? body.name ?? ''),
          ownerId: payload.ownerId,
          role: payload.role || 'owner',
          createdAt: payload.createdAt,
        })
        account.markCloudWorkspace(payload.id)
        account.store.setActive(me.id, payload.id)
        account.replica?.remember({ accountId: me.id, workspaceId: payload.id, token: connection.token })
        route.send(201, { ...payload, location: 'cloud' })
        return
      }
      const workspace = account.store.createWorkspace(me.id, String(body.name ?? ''))
      route.send(201, { ...workspace, location: 'device' })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('PATCH', '/api/account/workspaces/:id', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { name?: string }
      if (account.workspaceLocation(route.params.id!) === 'cloud') {
        const connection = account.cloudConnection(me.id)
        if (!connection) throw new CollabError('请先登录云端账号', 401)
        let response: Response
        try {
          response = await fetch(`${connection.origin}/api/account/workspaces/${route.params.id}`, {
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
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('DELETE', '/api/account/workspaces/:id', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json().catch(() => ({}))) as { name?: string }
      const confirmName = String(body.name ?? '')
      const workspaceId = route.params.id!
      if (!isOnlineRuntime() && account.workspaceLocation(workspaceId) === 'cloud') {
        const connection = account.cloudConnection(me.id)
        if (!connection) throw new CollabError('请先登录云端账号', 401)
        let response: Response
        try {
          response = await fetch(`${connection.origin}/api/account/workspaces/${workspaceId}`, {
            method: 'DELETE',
            headers: { authorization: `Bearer ${connection.token}`, 'content-type': 'application/json' },
            body: JSON.stringify({ name: confirmName }),
          })
        } catch {
          throw new CollabError('云端暂时连不上', 503)
        }
        const payload = (await response.json().catch(() => ({}))) as { error?: string; activeWorkspaceId?: string }
        if (!response.ok) throw new CollabError(payload.error || '删除云端空间失败', response.status)
      }
      const deleted = account.store.deleteWorkspace(me.id, workspaceId, confirmName)
      purgeSessionEvents(deleted.sessionIds)
      route.send(200, { id: deleted.id, deleted: true, activeWorkspaceId: deleted.activeWorkspaceId })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/workspaces/:id/members', async (route) => {
    try {
      const me = actor(route)
      if (await relayCloudWorkspace(route, me.id, route.params.id!, `/api/account/workspaces/${route.params.id}/members`)) return
      requireCollaborativeWorkspace(route.params.id!)
      route.send(200, { members: account.store.members(me.id, route.params.id!) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/workspaces/:id/members', async (route) => {
    try {
      const me = actor(route)
      if (await relayCloudWorkspace(route, me.id, route.params.id!, `/api/account/workspaces/${route.params.id}/members`)) return
      requireCollaborativeWorkspace(route.params.id!)
      const body = (await route.json()) as { accountId?: string; email?: string }
      const email = String(body.email ?? '').trim()
      const members = email
        ? account.store.addMemberByEmail(me.id, route.params.id!, email)
        : account.store.addMember(me.id, route.params.id!, String(body.accountId ?? ''))
      route.send(200, { members })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/workspaces/:id/invites', async (route) => {
    try {
      const me = actor(route)
      if (await relayCloudWorkspace(route, me.id, route.params.id!, `/api/account/workspaces/${route.params.id}/invites`)) return
      requireCollaborativeWorkspace(route.params.id!)
      const body = (await route.json()) as { role?: string; expiresInHours?: number }
      const role = body.role === 'member' ? 'member' : 'viewer'
      const invite = account.store.createWorkspaceInvite(
        me.id,
        route.params.id!,
        role,
        Number(body.expiresInHours ?? 168),
      )
      route.send(201, {
        ...invite,
        path: `/?workspaceInvite=${encodeURIComponent(invite.token)}`,
      })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/invites/:token/accept', async (route) => {
    try {
      const me = actor(route)
      const connection = !isOnlineRuntime() ? account.cloudConnection(me.id) : null
      if (connection) {
        const relayed = await relayAccount(route, account, me.id, `/api/account/invites/${route.params.token}/accept`)
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
      if (!isOnlineRuntime()) throw new CollabError('本机空间不提供成员邀请', 403)
      const result = account.store.acceptWorkspaceInvite(me.id, route.params.token!)
      ctx.http.broadcast('database', { ts: Date.now() })
      route.send(200, result)
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/guest-invites/:token/accept', async (route) => {
    try {
      if (!isOnlineRuntime()) throw new CollabError('本机空间不提供访客邀请', 403)
      const body = (await route.json()) as { name?: string }
      const result = account.store.acceptGuestInvite(route.params.token!, String(body.name ?? ''))
      rememberLogin(route, result.token)
      ctx.http.broadcast('database', { ts: Date.now() })
      route.send(200, result)
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('DELETE', '/api/account/workspaces/:id/members/:accountId', async (route) => {
    try {
      const me = actor(route)
      if (
        await relayCloudWorkspace(
          route,
          me.id,
          route.params.id!,
          `/api/account/workspaces/${route.params.id}/members/${route.params.accountId}`,
        )
      ) return
      requireCollaborativeWorkspace(route.params.id!)
      account.store.removeMember(me.id, route.params.id!, route.params.accountId!)
      ctx.http.disconnectTenant(route.params.accountId!, route.params.id!)
      route.send(200, { members: account.store.members(me.id, route.params.id!) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('PATCH', '/api/account/workspaces/:id/members/:accountId', async (route) => {
    try {
      const me = actor(route)
      if (
        await relayCloudWorkspace(
          route,
          me.id,
          route.params.id!,
          `/api/account/workspaces/${route.params.id}/members/${route.params.accountId}`,
        )
      ) return
      requireCollaborativeWorkspace(route.params.id!)
      const body = (await route.json()) as { role?: string }
      const role = String(body.role ?? '')
      if (role !== 'owner' && role !== 'admin' && role !== 'member' && role !== 'viewer') {
        throw new CollabError('角色只能是 owner、admin、member 或 viewer', 400)
      }
      account.store.updateMemberRole(me.id, route.params.id!, route.params.accountId!, role)
      route.send(200, { members: account.store.members(me.id, route.params.id!) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/workspaces/:id/groups', async (route) => {
    try {
      const me = actor(route)
      if (await relayCloudWorkspace(route, me.id, route.params.id!, `/api/account/workspaces/${route.params.id}/groups`)) return
      requireCollaborativeWorkspace(route.params.id!)
      route.send(200, { groups: account.store.groups(me.id, route.params.id!) })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/workspaces/:id/groups', async (route) => {
    try {
      const me = actor(route)
      if (await relayCloudWorkspace(route, me.id, route.params.id!, `/api/account/workspaces/${route.params.id}/groups`)) return
      requireCollaborativeWorkspace(route.params.id!)
      const body = (await route.json()) as { name?: string }
      route.send(201, account.store.createGroup(me.id, route.params.id!, String(body.name ?? '')))
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/workspaces/:id/groups/:groupId/members', async (route) => {
    try {
      const me = actor(route)
      if (
        await relayCloudWorkspace(
          route,
          me.id,
          route.params.id!,
          `/api/account/workspaces/${route.params.id}/groups/${route.params.groupId}/members`,
        )
      ) return
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
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/access', async (route) => {
    try {
      const me = actor(route)
      const activeWorkspace = account.store.activeWorkspaceId()
      if (
        activeWorkspace &&
        (await relayCloudWorkspace(
          route,
          me.id,
          activeWorkspace,
          `/api/account/access${route.query.toString() ? `?${route.query.toString()}` : ''}`,
        ))
      ) return
      requireCollaborativeWorkspace(activeWorkspace ?? '')
      const collection = String(route.query.get('collection') ?? '')
      const viewId = String(route.query.get('viewId') ?? '')
      route.send(
        200,
        viewId
          ? account.store.viewAccess(me.id, collection, viewId)
          : account.store.recordAccess(me.id, collection, String(route.query.get('recordId') ?? '')),
      )
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/access', async (route) => {
    try {
      const me = actor(route)
      const activeWorkspace = account.store.activeWorkspaceId()
      if (activeWorkspace && (await relayCloudWorkspace(route, me.id, activeWorkspace, '/api/account/access'))) return
      requireCollaborativeWorkspace(activeWorkspace ?? '')
      const body = (await route.json()) as {
        collection?: string
        recordId?: string
        viewId?: string
        email?: string
        groupId?: string
        memberViewId?: string
        role?: ResourceRole
        collaboratorKind?: 'internal' | 'external'
      }
      const collection = String(body.collection ?? '')
      const recordId = String(body.recordId ?? '')
      const viewId = String(body.viewId ?? '')
      const role: ResourceRole =
        body.role === 'viewer' || body.role === 'manager' || body.role === 'owner' ? body.role : 'editor'
      const kind = body.collaboratorKind === 'internal' ? 'internal' : 'external'
      route.send(
        200,
        viewId
          ? body.memberViewId
            ? account.store.grantViewMemberView(me.id, collection, viewId, String(body.memberViewId), role)
            : account.store.shareViewWithEmail(me.id, collection, viewId, String(body.email ?? ''), role, kind)
          : body.memberViewId
          ? account.store.grantMemberView(me.id, collection, recordId, String(body.memberViewId), role)
          : body.groupId
          ? account.store.grantGroup(me.id, collection, recordId, String(body.groupId), role)
          : account.store.shareWithEmail(me.id, collection, recordId, String(body.email ?? ''), role, kind),
      )
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('DELETE', '/api/account/access', async (route) => {
    try {
      const me = actor(route)
      const activeWorkspace = account.store.activeWorkspaceId()
      if (activeWorkspace && (await relayCloudWorkspace(route, me.id, activeWorkspace, '/api/account/access'))) return
      requireCollaborativeWorkspace(activeWorkspace ?? '')
      const body = (await route.json()) as {
        collection?: string
        recordId?: string
        viewId?: string
        subjectType?: 'account' | 'group' | 'member_view'
        subjectId?: string
      }
      const viewId = String(body.viewId ?? '')
      const subjectType =
        body.subjectType === 'group' || body.subjectType === 'member_view' ? body.subjectType : 'account'
      route.send(
        200,
        viewId
          ? account.store.revokeViewGrant(
              me.id,
              String(body.collection ?? ''),
              viewId,
              subjectType === 'member_view' ? 'member_view' : 'account',
              String(body.subjectId ?? ''),
            )
          : account.store.revokeRecordGrant(
              me.id,
              String(body.collection ?? ''),
              String(body.recordId ?? ''),
              subjectType,
              String(body.subjectId ?? ''),
            ),
      )
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/access/guest-invite', async (route) => {
    try {
      const me = actor(route)
      const activeWorkspace = account.store.activeWorkspaceId()
      if (
        activeWorkspace &&
        (await relayCloudWorkspace(route, me.id, activeWorkspace, '/api/account/access/guest-invite'))
      ) return
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
      route.send(201, {
        ...invite,
        path: `/?guestInvite=${encodeURIComponent(invite.token)}`,
      })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/records/claim', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { workspaceId?: string; collection?: string; recordId?: string }
      route.send(
        200,
        account.store.claim(me.id, String(body.workspaceId ?? ''), String(body.collection ?? ''), String(body.recordId ?? '')),
      )
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/sync', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as {
        workspaceId?: string
        collection?: string
        recordId?: string
        field?: string
        value?: unknown
        expectedVersion?: number
      }
      const op = account.store.sync({
        actorId: me.id,
        workspaceId: String(body.workspaceId ?? ''),
        collection: String(body.collection ?? ''),
        recordId: String(body.recordId ?? ''),
        field: String(body.field ?? ''),
        value: body.value,
        expectedVersion: Number(body.expectedVersion ?? 0),
      })
      route.send(200, op)
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/replica/snapshot', async (route) => {
    try {
      actor(route)
      route.send(200, await takeSnapshot(ctx))
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/replica/snapshot', async (route) => {
    try {
      actor(route)
      const body = (await route.json()) as MirrorSnapshot
      await applySnapshot(ctx, body, 'adopt')
      route.send(200, { ok: true })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('GET', '/api/account/sync', async (route) => {
    try {
      const me = actor(route)
      const workspaceId = String(route.query.get('workspaceId') ?? '')
      const after = Number(route.query.get('after') ?? 0)
      const ops =
        route.query.get('visible') === '1'
          ? account.store.visibleOpsSince(me.id, workspaceId, after)
          : account.store.opsSince(me.id, workspaceId, after)
      route.send(200, { ops })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/locks', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as {
        workspaceId?: string
        collection?: string
        recordId?: string
        ttlMs?: number
      }
      route.send(
        200,
        account.store.acquireLock(
          me.id,
          String(body.workspaceId ?? ''),
          String(body.collection ?? ''),
          String(body.recordId ?? ''),
          body.ttlMs,
        ),
      )
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('DELETE', '/api/account/locks', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { workspaceId?: string; collection?: string; recordId?: string }
      account.store.releaseLock(
        me.id,
        String(body.workspaceId ?? ''),
        String(body.collection ?? ''),
        String(body.recordId ?? ''),
      )
      route.send(200, { ok: true })
    } catch (error) {
      fail(route, error)
    }
  })

  ctx.http.route('POST', '/api/account/presence', async (route) => {
    try {
      const me = actor(route)
      const body = (await route.json()) as { workspaceId?: string; collection?: string; recordId?: string }
      requireCollaborativeWorkspace(String(body.workspaceId ?? ''))
      account.store.pulse(
        me.id,
        String(body.workspaceId ?? ''),
        String(body.collection ?? ''),
        String(body.recordId ?? ''),
      )
      route.send(200, { presence: account.store.presence(me.id, String(body.workspaceId ?? '')) })
    } catch (error) {
      fail(route, error)
    }
  })
}
