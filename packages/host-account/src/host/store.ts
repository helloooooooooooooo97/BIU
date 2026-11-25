import { createHash, randomBytes } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { currentAccountId, currentRequestWorkspaceId, superAdminEmail, superAdminPassword } from '@biu/host-plugin-loader/data-dir'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import { AuthorizationService, type ResourcePolicyInput, type ResourceRole, type WorkspaceRole } from './authorization.ts'
import {
  CollabError,
  DEFAULT_LOCK_MS,
  DEFAULT_MCP_CREDENTIAL_MS,
  DEFAULT_SESSION_MS,
  PRESENCE_STALE_MS,
  hashPassword,
  id,
  inviteToken,
  isRegisteredBuiltinPlugin,
  registerBuiltinPluginLookup,
  tokenHash,
  verifyPassword,
  type Account,
  type EditLock,
  type PluginAssignmentSubject,
  type PluginPackageInput,
  type PresenceRow,
  type RecordHead,
  type SyncOp,
  type Workspace,
} from './store-types.ts'

export {
  CollabError,
  DEFAULT_LOCK_MS,
  DEFAULT_MCP_CREDENTIAL_MS,
  DEFAULT_SESSION_MS,
  PRESENCE_STALE_MS,
  isRegisteredBuiltinPlugin,
  registerBuiltinPluginLookup,
  type Account,
  type EditLock,
  type PluginAssignmentSubject,
  type PluginPackageInput,
  type PresenceRow,
  type RecordHead,
  type SyncOp,
  type Workspace,
}

export class CollabStore {
  readonly authorization: AuthorizationService
  private lastActiveAccount: { accountId: string; at: number } | null = null
  private db: DatabaseSync

  constructor(rawDb: DatabaseSync) {
    // 复用高频 SQLite prepared statement，避免 200+ 处鉴权/成员查询每次重复编译 SQL。
    const stmtCache = new Map<string, ReturnType<DatabaseSync['prepare']>>()
    this.db = new Proxy(rawDb, {
      get(target, prop, receiver) {
        if (prop === 'prepare') {
          return (sql: string) => {
            let cached = stmtCache.get(sql)
            if (!cached) {
              cached = target.prepare(sql)
              if (stmtCache.size < 256) stmtCache.set(sql, cached)
            }
            return cached
          }
        }
        const value = Reflect.get(target, prop, receiver)
        return typeof value === 'function' ? value.bind(target) : value
      },
    })
    this.authorization = new AuthorizationService(this.db, (accountId) => {
      const requested = currentRequestWorkspaceId()
      if (requested && this.isMember(accountId, requested)) return requested
      return this.accountActiveWorkspace(accountId)
    })
    this.ensureBuiltInRoot()
    this.ensureActivityTable()
  }

  private ensureActivityTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_activity_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        via TEXT NOT NULL DEFAULT 'user',
        category TEXT NOT NULL,
        action TEXT NOT NULL,
        collection TEXT NOT NULL DEFAULT '',
        record_id TEXT NOT NULL DEFAULT '',
        record_title TEXT NOT NULL DEFAULT '',
        detail TEXT NOT NULL DEFAULT '',
        count INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_activity_actor
        ON workspace_activity_log(workspace_id, actor_id, updated_at DESC);
    `)
  }

  isSuperAdmin(accountId?: string | null) {
    const id = accountId || currentAccountId()
    if (!id) return false
    const row = this.db.prepare('SELECT email FROM accounts WHERE id = ?').get(id) as { email?: string } | undefined
    return String(row?.email ?? '').trim().toLowerCase() === superAdminEmail()
  }

  bootstrapLocal(input: { accountName?: string; workspaceName?: string; now?: number } = {}) {
    const now = input.now ?? Date.now()
    const done = this.db.prepare(`SELECT value FROM collab_state WHERE key = 'bootstrapped'`).get() as
      | { value: string }
      | undefined
    if (done) return { ...this.localSession(), imported: 0, bootstrapped: true }
    const existing = this.db.prepare('SELECT id FROM workspaces ORDER BY created_at LIMIT 1').get() as
      | { id: string }
      | undefined
    if (existing) {
      this.markBootstrapped()
      if (!this.homeWorkspaceId()) this.writeState('home', existing.id)
      if (!this.activeWorkspaceId()) this.writeState('active', existing.id)
      return { ...this.localSession(), imported: 0, bootstrapped: true }
    }
    const accountName = (input.accountName ?? '').trim() || '我'
    const workspaceName = (input.workspaceName ?? '').trim() || '本机'
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const account = this.register(accountName, now)
      const workspace = this.createWorkspace(account.id, workspaceName, now, false)
      const imported = this.importLiveRecords(workspace.id, account.id, now)
      this.markBootstrapped()
      this.writeState('home', workspace.id)
      this.writeState('active', workspace.id)
      this.db.exec('COMMIT')
      return {
        account: { id: account.id, name: account.name, createdAt: account.createdAt },
        token: account.token,
        workspace,
        imported,
        bootstrapped: false,
      }
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw error
    }
  }

  register(name: string, now = Date.now(), password = '', email = ''): Account & { token: string } {
    const secret = password.trim()
    const normalized = email.trim().toLowerCase()
    if (secret && secret.length < 6) throw new CollabError('密码至少 6 位', 400)
    if (secret && !normalized) throw new CollabError('邮箱不能为空', 400)
    if (normalized && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized)) throw new CollabError('邮箱格式不对', 400)
    if (normalized) {
      const taken = this.db.prepare('SELECT id FROM accounts WHERE email = ?').get(normalized) as { id: string } | undefined
      if (taken) throw new CollabError('这个邮箱已经注册过', 409)
    }
    const trimmed = name.trim() || normalized
    if (!trimmed) throw new CollabError('名字不能为空', 400)
    const account = {
      id: id('acc'),
      name: trimmed,
      email: normalized,
      avatar: '',
      token: randomBytes(24).toString('hex'),
      createdAt: now,
    }
    this.db
      .prepare('INSERT INTO accounts (id, name, token, password_hash, created_at, email, password_recall, avatar) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(account.id, account.name, account.token, secret ? hashPassword(secret) : '', account.createdAt, normalized || null, secret, '')
    return account
  }

  login(email: string, password: string, deviceName = '浏览器'): Account & { token: string } {
    const normalized = email.trim().toLowerCase()
    const row = this.db
      .prepare('SELECT id, name, email, avatar, token, password_hash, created_at, must_change_password FROM accounts WHERE email = ?')
      .get(normalized) as
      | {
          id: string
          name: string
          email: string
          avatar: string | null
          token: string
          password_hash: string
          created_at: number
          must_change_password: number
        }
      | undefined
    if (!row) throw new CollabError('账号不存在', 401)
    if (!row.password_hash || !verifyPassword(password, row.password_hash)) {
      throw new CollabError('密码不正确', 401)
    }
    const session = this.openSession(row.id, deviceName.slice(0, 120))
    this.noteActiveAccount(row.id)
    this.rememberPassword(row.id, password)
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      avatar: row.avatar ?? '',
      token: session.token,
      createdAt: row.created_at,
      mustChangePassword: Boolean(row.must_change_password),
    }
  }

  saveAccountProfile(accountId: string, patch: { name?: string; avatar?: string }): Account {
    const row = this.db
      .prepare('SELECT id, name, email, avatar, created_at, must_change_password FROM accounts WHERE id = ?')
      .get(accountId) as
      | {
          id: string
          name: string
          email: string | null
          avatar: string | null
          created_at: number
          must_change_password: number
        }
      | undefined
    if (!row) throw new CollabError('账号不存在', 404)
    let nextName = row.name
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim().slice(0, 40)
      if (!trimmed) throw new CollabError('账号名不能为空', 400)
      nextName = trimmed
    }
    let nextAvatar = row.avatar ?? ''
    if (patch.avatar !== undefined) {
      nextAvatar = patch.avatar.trim()
      if (nextAvatar && !nextAvatar.startsWith('data:image/')) {
        throw new CollabError('头像格式不对', 400)
      }
      if (nextAvatar.length > 240_000) throw new CollabError('头像太大', 400)
    }
    this.db.prepare('UPDATE accounts SET name = ?, avatar = ? WHERE id = ?').run(nextName, nextAvatar, accountId)
    return {
      id: row.id,
      name: nextName,
      email: row.email ?? '',
      avatar: nextAvatar,
      createdAt: row.created_at,
      mustChangePassword: Boolean(row.must_change_password),
    }
  }

  rememberPassword(accountId: string, password: string) {
    this.db.prepare('UPDATE accounts SET password_recall = ? WHERE id = ?').run(password, accountId)
  }

  recalledPassword(accountId: string) {
    const row = this.db.prepare('SELECT password_recall FROM accounts WHERE id = ?').get(accountId) as { password_recall?: string } | undefined
    return row?.password_recall || ''
  }

  assertPassword(accountId: string, password: string) {
    const row = this.db.prepare('SELECT password_hash FROM accounts WHERE id = ?').get(accountId) as { password_hash: string } | undefined
    if (!row?.password_hash || !verifyPassword(password, row.password_hash)) {
      throw new CollabError('当前密码不对', 401)
    }
  }

  changePassword(accountId: string, currentPassword: string, nextPassword: string, keepToken = '', now = Date.now()) {
    const next = nextPassword.trim()
    if (next.length < 6) throw new CollabError('密码至少 6 位', 400)
    this.assertPassword(accountId, currentPassword)
    this.db
      .prepare('UPDATE accounts SET password_hash = ?, must_change_password = 0, password_recall = ? WHERE id = ?')
      .run(hashPassword(next), next, accountId)
    const keepHash = keepToken ? this.digestToken(keepToken) : ''
    this.db
      .prepare('UPDATE auth_sessions SET revoked_at = ? WHERE account_id = ? AND revoked_at IS NULL AND token_hash != ?')
      .run(now, accountId, keepHash)
    return { ok: true }
  }

  /** 登录后停在自己的工作区。还没有的话建一个空的。 */
  enter(accountId: string) {
    const rows = this.listWorkspaces(accountId)
    const current = this.accountActiveWorkspace(accountId)
    const next = current && rows.some((row) => row.id === current) ? current : (rows[0]?.id ?? this.createWorkspace(accountId, '我的工作区').id)
    this.rememberActive(accountId, next)
    return next
  }

  activeWorkspaceId() {
    const requested = currentRequestWorkspaceId()
    const caller = currentAccountId()
    if (requested) {
      if (caller && !this.isMember(caller, requested)) return null
      return requested
    }
    if (!getRuntimePolicy().allowImplicitActiveWorkspace) return caller ? this.accountActiveWorkspace(caller) : null
    if (caller) return this.accountActiveWorkspace(caller)
    return this.stateValue('active')
  }

  isMember(accountId: string, workspaceId: string) {
    const row = this.db
      .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { role?: string } | undefined
    return Boolean(row)
  }

  private digestToken(token: string) {
    return createHash('sha256').update(token).digest('hex')
  }

  openSession(accountId: string, deviceName = '', expiresAt: number | null = null, now = Date.now()) {
    const token = randomBytes(24).toString('hex')
    const sessionId = id('ses')
    const expiration = expiresAt ?? now + DEFAULT_SESSION_MS
    this.db
      .prepare(
        `INSERT INTO auth_sessions (id, account_id, token_hash, device_name, expires_at, revoked_at, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(sessionId, accountId, this.digestToken(token), deviceName, expiration, now, now)
    return { id: sessionId, token, expiresAt: expiration }
  }

  /** 本机登录集中部署后，用对方发的令牌在本地也能认出这个账号。 */
  bindKnownSession(accountId: string, token: string, deviceName = '本机', now = Date.now()) {
    const hash = this.digestToken(token)
    const existing = this.db.prepare('SELECT id FROM auth_sessions WHERE token_hash = ?').get(hash) as { id: string } | undefined
    if (existing) return
    this.db
      .prepare(
        `INSERT INTO auth_sessions (id, account_id, token_hash, device_name, expires_at, revoked_at, created_at, last_seen_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?)`,
      )
      .run(id('ses'), accountId, hash, deviceName, now + DEFAULT_SESSION_MS, now, now)
  }

  ensureRemoteAccount(input: { id: string; name: string; email: string; token: string; workspaceId: string; workspaceName?: string }) {
    const email = input.email.trim().toLowerCase()
    const byId = this.db.prepare('SELECT id FROM accounts WHERE id = ?').get(input.id) as { id: string } | undefined
    const byEmail = email
      ? (this.db.prepare('SELECT id FROM accounts WHERE email = ?').get(email) as { id: string } | undefined)
      : undefined
    const accountId = byId?.id ?? byEmail?.id ?? input.id
    if (!byId && !byEmail) {
      this.db
        .prepare('INSERT INTO accounts (id, name, token, password_hash, created_at, email) VALUES (?, ?, ?, ?, ?, ?)')
        .run(accountId, input.name || email || '我', input.token, '', Date.now(), email || null)
    }
    this.bindKnownSession(accountId, input.token)
    if (input.workspaceId) {
      const workspace = this.db.prepare('SELECT id FROM workspaces WHERE id = ?').get(input.workspaceId) as { id: string } | undefined
      if (!workspace) {
        this.db
          .prepare('INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)')
          .run(input.workspaceId, input.workspaceName || '在线', accountId, Date.now())
      }
      const member = this.db
        .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
        .get(input.workspaceId, accountId)
      if (!member) {
        this.db
          .prepare('INSERT INTO workspace_members (workspace_id, account_id, role, created_at) VALUES (?, ?, ?, ?)')
          .run(input.workspaceId, accountId, 'owner', Date.now())
      }
      this.rememberActive(accountId, input.workspaceId)
    }
    return { id: accountId, token: input.token, workspaceId: input.workspaceId }
  }

  revokeSession(token: string, now = Date.now()) {
    if (!token) return
    const hash = this.digestToken(token)
    const owner = this.db
      .prepare('SELECT account_id FROM auth_sessions WHERE token_hash = ? AND revoked_at IS NULL')
      .get(hash) as { account_id?: string } | undefined
    this.db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').run(now, hash)
    if (owner?.account_id && this.lastActiveAccount?.accountId === owner.account_id) {
      this.lastActiveAccount = null
    }
  }

  listSessions(accountId: string) {
    return this.db
      .prepare(
        `SELECT id, device_name, expires_at, revoked_at, created_at, last_seen_at
         FROM auth_sessions WHERE account_id = ? ORDER BY created_at DESC`,
      )
      .all(accountId) as Array<{
      id: string
      device_name: string
      expires_at: number | null
      revoked_at: number | null
      created_at: number
      last_seen_at: number
    }>
  }

  revokeSessionById(actorId: string, sessionId: string, now = Date.now()) {
    const row = this.db.prepare('SELECT account_id FROM auth_sessions WHERE id = ?').get(sessionId) as { account_id: string } | undefined
    if (!row || row.account_id !== actorId) throw new CollabError('代理不存在', 404)
    this.db.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL').run(now, sessionId)
    return { id: sessionId }
  }

  acquireExecutionLease(
    accountId: string,
    sessionId: string,
    executorId: string,
    ttlMs = 90_000,
    now = Date.now(),
  ) {
    this.db.prepare('DELETE FROM session_execution_leases WHERE expires_at <= ?').run(now)
    const existing = this.db
      .prepare('SELECT account_id, executor_id, expires_at FROM session_execution_leases WHERE session_id = ?')
      .get(sessionId) as { account_id: string; executor_id: string; expires_at: number } | undefined
    if (existing) {
      throw new CollabError(`这个代理正在由 ${existing.executor_id || '另一台设备'} 运行`, 409)
    }
    const leaseId = id('lease')
    const expiresAt = now + Math.max(30_000, Math.min(5 * 60_000, ttlMs))
    this.db
      .prepare(
        `INSERT INTO session_execution_leases
          (session_id, account_id, lease_id, executor_id, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(sessionId, accountId, leaseId, executorId.trim().slice(0, 120) || 'device', expiresAt, now)
    return { leaseId, sessionId, expiresAt }
  }

  renewExecutionLease(accountId: string, sessionId: string, leaseId: string, ttlMs = 90_000, now = Date.now()) {
    const expiresAt = now + Math.max(30_000, Math.min(5 * 60_000, ttlMs))
    const result = this.db
      .prepare(
        `UPDATE session_execution_leases SET expires_at = ?
         WHERE session_id = ? AND account_id = ? AND lease_id = ? AND expires_at > ?`,
      )
      .run(expiresAt, sessionId, accountId, leaseId, now)
    if (!result.changes) throw new CollabError('执行租约已失效', 409)
    return { leaseId, sessionId, expiresAt }
  }

  requireExecutionLease(accountId: string, sessionId: string, leaseId: string, now = Date.now()) {
    const row = this.db
      .prepare(
        `SELECT lease_id FROM session_execution_leases
         WHERE session_id = ? AND account_id = ? AND lease_id = ? AND expires_at > ?`,
      )
      .get(sessionId, accountId, leaseId, now) as { lease_id?: string } | undefined
    if (!row) throw new CollabError('执行租约不存在或已失效', 409)
  }

  releaseExecutionLease(accountId: string, sessionId: string, leaseId: string) {
    this.db
      .prepare('DELETE FROM session_execution_leases WHERE session_id = ? AND account_id = ? AND lease_id = ?')
      .run(sessionId, accountId, leaseId)
    return { ok: true }
  }

  hasExecutionLease(sessionId: string, now = Date.now()) {
    const row = this.db
      .prepare('SELECT 1 AS ok FROM session_execution_leases WHERE session_id = ? AND expires_at > ?')
      .get(sessionId, now) as { ok?: number } | undefined
    return Boolean(row)
  }

  issueMcpCredential(
    accountId: string,
    workspaceId: string,
    options: { allowedTools?: string[]; expiresAt?: number } = {},
    now = Date.now(),
  ) {
    if (!this.isMember(accountId, workspaceId)) throw new CollabError('不在这个空间', 403)
    const token = randomBytes(24).toString('hex')
    const credentialId = id('mcp')
    const allowedTools = [...new Set(options.allowedTools?.map(String).filter(Boolean) ?? [])]
    const expiresAt = options.expiresAt ?? now + DEFAULT_MCP_CREDENTIAL_MS
    if (expiresAt <= now) throw new CollabError('凭证有效期必须晚于当前时间', 400)
    this.db
      .prepare(
        `INSERT INTO mcp_credentials (id, token_hash, account_id, workspace_id, allowed_tools, expires_at, revoked_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      )
      .run(credentialId, this.digestToken(token), accountId, workspaceId, JSON.stringify(allowedTools), expiresAt, now)
    return { id: credentialId, token, workspaceId, allowedTools, expiresAt }
  }

  listMcpCredentials(accountId: string, workspaceId: string) {
    if (!this.isMember(accountId, workspaceId)) throw new CollabError('不在这个空间', 403)
    return this.db
      .prepare(
        `SELECT id, workspace_id, allowed_tools, expires_at, revoked_at, created_at
         FROM mcp_credentials WHERE account_id = ? AND workspace_id = ? ORDER BY created_at DESC`,
      )
      .all(accountId, workspaceId)
      .map((row) => {
        const value = row as Record<string, unknown>
        return { ...value, allowed_tools: JSON.parse(String(value.allowed_tools || '[]')) }
      })
  }

  revokeMcpCredential(accountId: string, credentialId: string, now = Date.now()) {
    const result = this.db
      .prepare('UPDATE mcp_credentials SET revoked_at = ? WHERE id = ? AND account_id = ? AND revoked_at IS NULL')
      .run(now, credentialId, accountId)
    if (!result.changes) throw new CollabError('MCP 凭证不存在', 404)
    return { id: credentialId }
  }

  resolveMcpCredential(token: string, now = Date.now()) {
    if (!token) return null
    const row = this.db
      .prepare(
        `SELECT c.id, c.account_id, c.workspace_id, c.allowed_tools, c.expires_at, c.revoked_at, m.role
         FROM mcp_credentials c
         LEFT JOIN workspace_members m ON m.workspace_id = c.workspace_id AND m.account_id = c.account_id
         WHERE c.token_hash = ?`,
      )
      .get(this.digestToken(token)) as
      | { id: string; account_id: string; workspace_id: string; allowed_tools: string; expires_at: number | null; revoked_at: number | null; role: string | null }
      | undefined
    if (!row || row.revoked_at || (row.expires_at && row.expires_at <= now) || !row.role) return null
    return {
      credentialId: row.id,
      accountId: row.account_id,
      workspaceId: row.workspace_id,
      role: row.role,
      allowedTools: JSON.parse(row.allowed_tools || '[]') as string[],
    }
  }

  auditMcp(tenant: { credentialId: string; accountId: string; workspaceId: string }, toolName: string, success: boolean, now = Date.now()) {
    this.db
      .prepare(
        `INSERT INTO mcp_audit_log
         (credential_id, account_id, workspace_id, tool_name, success, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(tenant.credentialId, tenant.accountId, tenant.workspaceId, toolName, success ? 1 : 0, now)
    this.recordActivity({
      workspaceId: tenant.workspaceId,
      actorId: tenant.accountId,
      via: 'mcp',
      category: 'automation',
      action: 'mcp.call',
      detail: `调用 MCP 工具 ${toolName}${success ? '' : '（失败）'}`,
      now,
    })
  }

  recordActivity(input: {
    workspaceId?: string
    actorId?: string
    via?: 'user' | 'agent' | 'mcp'
    category: 'data' | 'access' | 'member' | 'session' | 'automation'
    action: string
    collection?: string
    recordId?: string
    recordTitle?: string
    detail?: string
    now?: number
  }) {
    const workspaceId = input.workspaceId || this.activeWorkspaceId() || ''
    const actorId = input.actorId || currentAccountId() || ''
    if (!workspaceId || !actorId) return
    const now = input.now ?? Date.now()
    const via = input.via ?? 'user'
    const collection = input.collection ?? ''
    const recordId = input.recordId ?? ''
    const recordTitle = (input.recordTitle ?? '').slice(0, 120)
    const detail = (input.detail ?? '').slice(0, 240)
    // 同一成员 5 分钟内连续编辑同一条记录，自动合并计数防止刷屏
    if (input.action === 'record.update' && collection && recordId) {
      const recent = this.db
        .prepare(
          `SELECT id, updated_at FROM workspace_activity_log
           WHERE workspace_id = ? AND actor_id = ? AND via = ? AND action = 'record.update'
             AND collection = ? AND record_id = ?
           ORDER BY updated_at DESC LIMIT 1`,
        )
        .get(workspaceId, actorId, via, collection, recordId) as { id: number; updated_at: number } | undefined
      if (recent && now - recent.updated_at <= 5 * 60 * 1000) {
        this.db
          .prepare(
            `UPDATE workspace_activity_log
             SET count = count + 1, updated_at = ?,
                 record_title = CASE WHEN ? != '' THEN ? ELSE record_title END,
                 detail = CASE WHEN ? != '' THEN ? ELSE detail END
             WHERE id = ?`,
          )
          .run(now, recordTitle, recordTitle, detail, detail, recent.id)
        return
      }
    }
    this.db
      .prepare(
        `INSERT INTO workspace_activity_log
         (workspace_id, actor_id, via, category, action, collection, record_id, record_title, detail, count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(workspaceId, actorId, via, input.category, input.action, collection, recordId, recordTitle, detail, now, now)
  }

  memberActivity(actorId: string, memberId: string, options: { days?: number; limit?: number; now?: number } = {}) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const actorRole = this.requireInternalMember(actorId, workspaceId)
    const now = options.now ?? Date.now()
    const days = Math.max(7, Math.min(365, Math.floor(options.days ?? 182)))
    const limit = Math.max(10, Math.min(200, Math.floor(options.limit ?? 80)))
    const members = this.members(actorId, workspaceId, now)
    const target = members.find((item) => item.id === memberId)
    if (!target) throw new CollabError('成员不存在', 404)

    const dayMs = 24 * 60 * 60 * 1000
    const startDate = new Date(now - (days - 1) * dayMs)
    startDate.setHours(0, 0, 0, 0)
    const since = startDate.getTime()

    const rawRows = this.db
      .prepare(
        `SELECT id, via, category, action, collection, record_id, record_title, detail, count, created_at, updated_at
         FROM workspace_activity_log
         WHERE workspace_id = ? AND actor_id = ? AND updated_at >= ?
         ORDER BY updated_at DESC`,
      )
      .all(workspaceId, memberId, since) as Array<{
        id: number
        via: 'user' | 'agent' | 'mcp'
        category: 'data' | 'access' | 'member' | 'session' | 'automation'
        action: string
        collection: string
        record_id: string
        record_title: string
        detail: string
        count: number
        created_at: number
        updated_at: number
      }>
    const isAdminOrSelf = actorId === memberId || actorRole === 'owner' || actorRole === 'admin'
    const rows = rawRows.filter((row) => {
      if (row.collection && row.record_id) {
        return this.authorization.authorize(
          { type: 'account', accountId: actorId, workspaceId },
          'resource:read',
          { type: 'record', workspaceId, collection: row.collection, recordId: row.record_id },
        ).allowed
      }
      if (row.category === 'access' && !isAdminOrSelf) return false
      return true
    })

    const formatDay = (ts: number) => {
      const d = new Date(ts)
      const y = d.getFullYear()
      const m = String(d.getMonth() + 1).padStart(2, '0')
      const day = String(d.getDate()).padStart(2, '0')
      return `${y}-${m}-${day}`
    }

    const dailyCounts = new Map<string, number>()
    const byCategory = { data: 0, access: 0, member: 0, session: 0, automation: 0 }
    const byVia = { user: 0, agent: 0, mcp: 0 }
    let totalEvents = 0
    let last30Days = 0
    const since30 = now - 30 * dayMs

    for (const row of rows) {
      const weight = Math.max(1, Number(row.count) || 1)
      totalEvents += weight
      if (row.updated_at >= since30) last30Days += weight
      if (row.category in byCategory) byCategory[row.category] += weight
      if (row.via in byVia) byVia[row.via] += weight
      const key = formatDay(row.updated_at)
      dailyCounts.set(key, (dailyCounts.get(key) ?? 0) + weight)
    }

    const levelOf = (count: number): 0 | 1 | 2 | 3 | 4 => {
      if (count <= 0) return 0
      if (count <= 2) return 1
      if (count <= 5) return 2
      if (count <= 10) return 3
      return 4
    }

    const heatmap: Array<{ date: string; count: number; level: 0 | 1 | 2 | 3 | 4 }> = []
    for (let i = 0; i < days; i += 1) {
      const key = formatDay(since + i * dayMs)
      const count = dailyCounts.get(key) ?? 0
      heatmap.push({ date: key, count, level: levelOf(count) })
    }

    const activeDays = heatmap.filter((cell) => cell.count > 0).length
    let currentStreak = 0
    for (let i = heatmap.length - 1; i >= 0; i -= 1) {
      const cell = heatmap[i]!
      if (cell.count > 0) {
        currentStreak += 1
      } else if (i === heatmap.length - 1) {
        // 今天还没操作不算断签，允许从昨天起算连续天数
        continue
      } else {
        break
      }
    }

    const recordGrants = isAdminOrSelf
      ? (this.db
          .prepare(
            `SELECT collection, record_id, role
             FROM record_grants
             WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?
             ORDER BY created_at DESC LIMIT 50`,
          )
          .all(workspaceId, memberId) as Array<{ collection: string; record_id: string; role: string }>)
      : []

    const viewGrants = isAdminOrSelf
      ? (this.db
          .prepare(
            `SELECT collection, view_id, role
             FROM view_grants
             WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?
             ORDER BY created_at DESC LIMIT 50`,
          )
          .all(workspaceId, memberId) as Array<{ collection: string; view_id: string; role: string }>)
      : []

    return {
      member: {
        id: target.id,
        name: target.name,
        displayName: target.display_name,
        email: target.email,
        role: target.role,
        memberKind: target.member_kind,
        status: target.status,
        joinedAt: target.created_at,
        lastActiveAt: target.last_active_at,
      },
      stats: {
        totalEvents,
        activeDays,
        currentStreak,
        last30Days,
        byCategory,
        byVia,
      },
      heatmap,
      recent: rows.slice(0, limit).map((row) => ({
        id: row.id,
        via: row.via,
        category: row.category,
        action: row.action,
        collection: row.collection,
        recordId: row.record_id,
        recordTitle: row.record_title,
        detail: row.detail,
        count: row.count,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      grants: {
        records: recordGrants.map((row) => ({
          collection: row.collection,
          recordId: row.record_id,
          role: row.role,
        })),
        views: viewGrants.map((row) => ({
          collection: row.collection,
          viewId: row.view_id,
          role: row.role,
        })),
      },
    }
  }

  listMcpAudit(accountId: string, workspaceId: string, limit = 100) {
    this.requireManager(accountId, workspaceId)
    return this.db
      .prepare(
        `SELECT id, credential_id, account_id, workspace_id, tool_name, success, created_at
         FROM mcp_audit_log WHERE workspace_id = ? ORDER BY id DESC LIMIT ?`,
      )
      .all(workspaceId, Math.max(1, Math.min(500, limit)))
  }

  tenantForRecord(collection: string, recordId: string) {
    const row = this.db
      .prepare(
        `SELECT workspace_id, owner_id FROM record_owners
         WHERE collection = ? AND record_id = ? LIMIT 1`,
      )
      .get(collection, recordId) as { workspace_id: string; owner_id: string } | undefined
    return row ? { workspaceId: row.workspace_id, accountId: row.owner_id } : null
  }

  revokeMcpForMember(accountId: string, workspaceId: string, now = Date.now()) {
    this.db
      .prepare('UPDATE mcp_credentials SET revoked_at = ? WHERE account_id = ? AND workspace_id = ? AND revoked_at IS NULL')
      .run(now, accountId, workspaceId)
  }

  accountByToken(token: string, now = Date.now()): Account | null {
    const session = this.db
      .prepare(
        `SELECT a.id, a.name, a.email, a.avatar, a.created_at, a.must_change_password,
                s.id AS session_id, s.expires_at, s.revoked_at
         FROM auth_sessions s
         JOIN accounts a ON a.id = s.account_id
         WHERE s.token_hash = ?`,
      )
      .get(this.digestToken(token)) as
      | {
          id: string
          name: string
          email: string | null
          avatar: string | null
          created_at: number
          must_change_password: number
          session_id: string
          expires_at: number | null
          revoked_at: number | null
        }
      | undefined
    if (session) {
      if (session.revoked_at || (session.expires_at && session.expires_at <= now)) return null
      this.db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?').run(now, session.session_id)
      return {
        id: session.id,
        name: session.name,
        email: session.email ?? '',
        avatar: session.avatar ?? '',
        createdAt: session.created_at,
        mustChangePassword: Boolean(session.must_change_password),
      }
    }
    const row = this.db
      .prepare(
        `SELECT a.id, a.name, a.email, a.avatar, a.created_at,
                gs.id AS guest_session_id, gs.expires_at, gs.revoked_at
         FROM accounts a
         LEFT JOIN guest_sessions gs ON gs.account_id = a.id
         WHERE a.token = ?`,
      )
      .get(token) as
      | {
          id: string
          name: string
          email: string | null
          avatar: string | null
          created_at: number
          guest_session_id?: string
          expires_at?: number
          revoked_at?: number | null
        }
      | undefined
    if (!row) return null
    if (getRuntimePolicy().authzMode === 'rbac' && !row.guest_session_id) return null
    if (row.guest_session_id) {
      if (row.revoked_at || Number(row.expires_at) <= now) return null
      this.db.prepare('UPDATE guest_sessions SET last_seen_at = ? WHERE id = ?').run(now, row.guest_session_id)
    }
    return { id: row.id, name: row.name, email: row.email ?? '', avatar: row.avatar ?? '', createdAt: row.created_at }
  }

  requiresPasswordChange(accountId: string) {
    const row = this.db
      .prepare('SELECT must_change_password FROM accounts WHERE id = ?')
      .get(accountId) as { must_change_password?: number } | undefined
    return Boolean(row?.must_change_password)
  }

  createWorkspace(ownerId: string, name: string, now = Date.now(), ownTransaction = true): Workspace {
    this.requireAccount(ownerId)
    const trimmed = name.trim()
    if (!trimmed) throw new CollabError('工作区名字不能为空', 400)
    const workspace = { id: id('ws'), name: trimmed, ownerId, createdAt: now }
    const write = () => {
      this.db
        .prepare('INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)')
        .run(workspace.id, workspace.name, ownerId, now)
      this.db
        .prepare(
          'INSERT INTO workspace_members (workspace_id, account_id, role, created_at) VALUES (?, ?, ?, ?)',
        )
        .run(workspace.id, ownerId, 'owner', now)
    }
    if (!ownTransaction) {
      write()
      return { ...workspace, role: 'owner' }
    }
    this.db.exec('BEGIN IMMEDIATE')
    try {
      write()
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return { ...workspace, role: 'owner' }
  }

  renameWorkspace(actorId: string, workspaceId: string, name: string): Workspace {
    this.requireManager(actorId, workspaceId)
    const trimmed = name.trim()
    if (!trimmed) throw new CollabError('空间名称不能为空', 400)
    if (trimmed.length > 40) throw new CollabError('空间名称不能超过 40 个字符', 400)
    this.db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(trimmed, workspaceId)
    const workspace = this.listWorkspaces(actorId).find((row) => row.id === workspaceId)
    if (!workspace) throw new CollabError('空间不存在', 404)
    return workspace
  }

  /** 所有者输入完整空间名称后，硬删除空间及其记录、成员和授权。 */
  deleteWorkspace(actorId: string, workspaceId: string, confirmName: string) {
    this.requireRole(actorId, workspaceId, 'owner')
    const row = this.db.prepare('SELECT name FROM workspaces WHERE id = ?').get(workspaceId) as { name?: string } | undefined
    if (!row) throw new CollabError('空间不存在', 404)
    if (confirmName !== row.name) throw new CollabError('请输入完整的空间名称以确认删除', 400)
    const records = this.db
      .prepare('SELECT collection, record_id FROM record_owners WHERE workspace_id = ?')
      .all(workspaceId) as Array<{ collection: string; record_id: string }>
    const tables = this.db
      .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`)
      .all() as Array<{ name: string }>
    const columnsOf = (table: string) =>
      (this.db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((column) => column.name)
    const sessionIds = records.filter((record) => record.collection === '/agents').map((record) => record.record_id)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const table of tables) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.name)) continue
        const columns = columnsOf(table.name)
        if (table.name === 'auth_sessions' && columns.includes('workspace_id')) {
          this.db.prepare('UPDATE auth_sessions SET workspace_id = ? WHERE workspace_id = ?').run('', workspaceId)
          continue
        }
        if (!columns.includes('workspace_id')) continue
        this.db.prepare(`DELETE FROM ${table.name} WHERE workspace_id = ?`).run(workspaceId)
      }
      const direct: Record<string, string> = {
        '/pages': 'pages',
        '/tasks': 'tasks',
        '/agents': 'agents',
        '/tags': 'tags',
      }
      for (const [collection, table] of Object.entries(direct)) {
        if (!tables.some((item) => item.name === table)) continue
        const stmt = this.db.prepare(`DELETE FROM ${table} WHERE id = ?`)
        for (const record of records) {
          if (record.collection === collection) stmt.run(record.record_id)
        }
      }
      if (tables.some((item) => item.name === 'saved_views')) {
        const stmt = this.db.prepare('DELETE FROM saved_views WHERE view_id = ?')
        for (const record of records) stmt.run(record.record_id)
      }
      for (const table of tables) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.name)) continue
        const columns = columnsOf(table.name)
        if (!columns.includes('record_id')) continue
        const hasCollection = columns.includes('collection')
        const stmt = this.db.prepare(
          hasCollection
            ? `DELETE FROM ${table.name} WHERE collection = ? AND record_id = ?`
            : `DELETE FROM ${table.name} WHERE record_id = ?`,
        )
        for (const record of records) {
          if (hasCollection) stmt.run(record.collection, record.record_id)
          else stmt.run(record.record_id)
        }
      }
      for (const table of tables) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table.name)) continue
        if (!columnsOf(table.name).includes('page_id')) continue
        const stmt = this.db.prepare(`DELETE FROM ${table.name} WHERE page_id = ?`)
        for (const record of records) {
          if (record.collection === '/pages') stmt.run(record.record_id)
        }
      }
      if (tables.some((item) => item.name === 'tag_stamps')) {
        const stmt = this.db.prepare('DELETE FROM tag_stamps WHERE tag_id = ?')
        for (const record of records) {
          if (record.collection === '/tags') stmt.run(record.record_id)
        }
      }
      if (tables.some((item) => item.name === 'shares')) {
        const stmt = this.db.prepare('DELETE FROM shares WHERE record_id = ? OR view_id = ?')
        for (const record of records) stmt.run(record.record_id, record.record_id)
      }
      this.db.prepare('DELETE FROM workspaces WHERE id = ?').run(workspaceId)
      this.db.prepare('UPDATE accounts SET active_workspace_id = ? WHERE active_workspace_id = ?').run('', workspaceId)
      if (this.stateValue('active') === workspaceId) this.writeState('active', '')
      if (this.stateValue('home') === workspaceId) this.writeState('home', '')
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    const next = this.listWorkspaces(actorId)[0]
    if (next) this.setActive(actorId, next.id)
    return { id: workspaceId, deleted: true as const, sessionIds, activeWorkspaceId: next?.id ?? '' }
  }

  addMember(actorId: string, workspaceId: string, accountId: string, now = Date.now()) {
    this.requireManager(actorId, workspaceId)
    this.requireAccount(accountId)
    this.db
      .prepare(
        `INSERT INTO workspace_members (workspace_id, account_id, role, created_at)
         VALUES (?, ?, 'member', ?)
         ON CONFLICT(workspace_id, account_id) DO UPDATE SET
           role = CASE WHEN workspace_members.member_kind = 'external' THEN 'member' ELSE workspace_members.role END,
           member_kind = CASE WHEN workspace_members.member_kind = 'external' THEN 'member' ELSE workspace_members.member_kind END`,
      )
      .run(workspaceId, accountId, now)
    this.reconcileAccountGrantScopes(workspaceId, accountId)
    return this.members(actorId, workspaceId)
  }

  addMemberByEmail(actorId: string, workspaceId: string, email: string, now = Date.now()) {
    const normalized = email.trim().toLowerCase()
    if (!normalized) throw new CollabError('邮箱不能为空', 400)
    const row = this.db.prepare('SELECT id FROM accounts WHERE email = ?').get(normalized) as { id: string } | undefined
    if (!row) throw new CollabError('没有这个邮箱，对方需要先注册', 404)
    return this.addMember(actorId, workspaceId, row.id, now)
  }

  createWorkspaceInvite(
    actorId: string,
    workspaceId: string,
    role: 'member' | 'viewer' = 'viewer',
    expiresInHours = 168,
    now = Date.now(),
  ) {
    this.requireManager(actorId, workspaceId)
    if (role !== 'member' && role !== 'viewer') throw new CollabError('邀请角色只能是编辑者或查看者', 400)
    const raw = inviteToken()
    const invite = {
      id: id('inv'),
      token: raw,
      workspaceId,
      kind: 'workspace' as const,
      role,
      expiresAt: now + Math.max(1, Math.min(24 * 30, expiresInHours)) * 60 * 60 * 1000,
    }
    this.db
      .prepare(
        `INSERT INTO workspace_invites
          (id, token_hash, workspace_id, kind, role, collection, record_id, resource_role,
           expires_at, max_uses, use_count, created_by, created_at)
         VALUES (?, ?, ?, 'workspace', ?, '', '', 'viewer', ?, 1, 0, ?, ?)`,
      )
      .run(invite.id, tokenHash(raw), workspaceId, role, invite.expiresAt, actorId, now)
    return invite
  }

  acceptWorkspaceInvite(actorId: string, token: string, now = Date.now()) {
    this.requireAccount(actorId)
    const guest = this.db.prepare('SELECT 1 AS ok FROM guest_sessions WHERE account_id = ?').get(actorId)
    if (guest) throw new CollabError('临时访客不能加入其他空间', 403)
    const invite = this.validInvite(token, 'workspace', now)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db
        .prepare(
          `INSERT INTO workspace_members (workspace_id, account_id, role, member_kind, created_at)
           VALUES (?, ?, ?, 'member', ?)
           ON CONFLICT(workspace_id, account_id) DO UPDATE SET
             role = CASE WHEN workspace_members.member_kind = 'external' THEN excluded.role ELSE workspace_members.role END,
             member_kind = CASE WHEN workspace_members.member_kind = 'external' THEN 'member' ELSE workspace_members.member_kind END`,
        )
        .run(invite.workspace_id, actorId, invite.role, now)
      this.reconcileAccountGrantScopes(invite.workspace_id, actorId)
      this.useInvite(invite.id)
      this.rememberActive(actorId, invite.workspace_id)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return { workspaceId: invite.workspace_id, role: invite.role }
  }

  createGuestInvite(
    actorId: string,
    collection: string,
    recordId: string,
    resourceRole: 'viewer' | 'editor' = 'viewer',
    expiresInHours = 24,
    now = Date.now(),
    viewId = '',
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const normalizedView = viewId.trim()
    if (normalizedView) {
      this.requireViewSharer(actorId, workspaceId, collection)
    } else {
      const resource = { type: 'record' as const, workspaceId, ...this.recordKey(collection, recordId) }
      const decision = this.authorization.authorize(
        { type: 'account', accountId: actorId, workspaceId },
        'resource:manage-permissions',
        resource,
      )
      if (!decision.allowed) throw new CollabError('没有权限', 403)
    }
    const raw = inviteToken()
    const invite = {
      id: id('inv'),
      token: raw,
      workspaceId,
      kind: 'guest' as const,
      collection,
      recordId: normalizedView ? '' : recordId,
      viewId: normalizedView,
      role: resourceRole,
      expiresAt: now + Math.max(1, Math.min(24 * 30, expiresInHours)) * 60 * 60 * 1000,
    }
    this.db
      .prepare(
        `INSERT INTO workspace_invites
          (id, token_hash, workspace_id, kind, role, collection, record_id, view_id, resource_role,
           expires_at, max_uses, use_count, created_by, created_at)
         VALUES (?, ?, ?, 'guest', 'viewer', ?, ?, ?, ?, ?, 1, 0, ?, ?)`,
      )
      .run(
        invite.id,
        tokenHash(raw),
        workspaceId,
        collection,
        normalizedView ? '' : recordId,
        normalizedView,
        resourceRole,
        invite.expiresAt,
        actorId,
        now,
      )
    return invite
  }

  acceptGuestInvite(token: string, displayName = '', now = Date.now()) {
    const invite = this.validInvite(token, 'guest', now)
    const accountId = id('guest')
    const sessionId = id('gss')
    const accountToken = randomBytes(24).toString('hex')
    const name = displayName.trim().slice(0, 40) || `临时访客-${accountId.slice(-4)}`
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db
        .prepare(
          `INSERT INTO accounts (id, name, token, password_hash, created_at, email, active_workspace_id)
           VALUES (?, ?, ?, '', ?, NULL, ?)`,
        )
        .run(accountId, name, accountToken, now, invite.workspace_id)
      this.db
        .prepare(
          `INSERT INTO workspace_members
            (workspace_id, account_id, role, member_kind, created_at, display_name)
           VALUES (?, ?, 'viewer', 'guest', ?, ?)`,
        )
        .run(invite.workspace_id, accountId, now, name)
      this.db
        .prepare(
          `INSERT INTO guest_sessions
            (id, account_id, workspace_id, expires_at, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?)`,
        )
        .run(sessionId, accountId, invite.workspace_id, invite.expires_at, now, now)
      if (invite.view_id) {
        this.writeViewGrant(
          invite.workspace_id,
          invite.collection,
          invite.view_id,
          'account',
          accountId,
          invite.resource_role,
          invite.created_by,
          now,
        )
      } else {
        this.db
          .prepare(
            `INSERT INTO record_grants
              (workspace_id, collection, record_id, subject_type, subject_id, role, granted_by, created_at)
             VALUES (?, ?, ?, 'account', ?, ?, ?, ?)`,
          )
          .run(
            invite.workspace_id,
            invite.collection,
            invite.record_id,
            accountId,
            invite.resource_role,
            invite.created_by,
            now,
          )
        this.reconcileRecordScope(invite.workspace_id, invite.collection, invite.record_id)
      }
      this.useInvite(invite.id)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return {
      id: accountId,
      name,
      email: '',
      token: accountToken,
      workspaceId: invite.workspace_id,
      expiresAt: invite.expires_at,
      collection: invite.collection,
      recordId: invite.record_id,
      viewId: invite.view_id,
    }
  }

  members(actorId: string, workspaceId: string, now = Date.now()) {
    this.requireMember(actorId, workspaceId)
    const rows = this.db
      .prepare(
        `SELECT a.id,
                COALESCE(NULLIF(a.name, ''), NULLIF(a.email, ''), '未设置') AS name,
                COALESCE(m.display_name, '') AS display_name,
                COALESCE(NULLIF(m.avatar, ''), NULLIF(a.avatar, ''), '') AS avatar,
                COALESCE(a.email, '') AS email, m.role, m.member_kind, m.created_at,
                COALESCE((
                  SELECT MAX(COALESCE(s.last_seen_at, s.created_at, 0))
                  FROM auth_sessions s
                  WHERE s.account_id = a.id AND s.revoked_at IS NULL
                ), 0) AS auth_seen_at,
                COALESCE((
                  SELECT MAX(COALESCE(g.last_seen_at, g.created_at, 0))
                  FROM guest_sessions g
                  WHERE g.account_id = a.id AND g.workspace_id = m.workspace_id
                ), 0) AS guest_seen_at,
                COALESCE((
                  SELECT MAX(g.expires_at)
                  FROM guest_sessions g
                  WHERE g.account_id = a.id AND g.workspace_id = m.workspace_id AND g.revoked_at IS NULL
                ), 0) AS guest_expires_at,
                COALESCE((
                  SELECT MAX(l.updated_at)
                  FROM workspace_activity_log l
                  WHERE l.workspace_id = m.workspace_id AND l.actor_id = a.id
                ), 0) AS activity_at
         FROM workspace_members m
         JOIN accounts a ON a.id = m.account_id
         WHERE m.workspace_id = ?
         ORDER BY m.created_at`,
      )
      .all(workspaceId) as Array<{
        id: string
        name: string
        display_name: string
        avatar: string
        email: string
        role: string
        member_kind: 'member' | 'external' | 'guest'
        created_at: number
        auth_seen_at: number
        guest_seen_at: number
        guest_expires_at: number
        activity_at: number
      }>
    const ONLINE_WINDOW_MS = 5 * 60 * 1000
    return rows.map(({ auth_seen_at, guest_seen_at, guest_expires_at, activity_at, ...row }) => {
      const last_active_at = Math.max(auth_seen_at, guest_seen_at, activity_at, row.created_at)
      const status: 'online' | 'active' | 'expired' =
        row.member_kind === 'guest' && guest_expires_at > 0 && guest_expires_at < now
          ? 'expired'
          : last_active_at > row.created_at && now - last_active_at <= ONLINE_WINDOW_MS
            ? 'online'
            : 'active'
      return { ...row, last_active_at, status }
    })
  }

  currentMembers() {
    const actorId = currentAccountId()
    const workspaceId = this.activeWorkspaceId()
    if (!actorId || !workspaceId) return []
    return this.members(actorId, workspaceId)
  }

  /** 局域网分享访客：浏览器 localStorage 随机码稳定对应一名访客。 */
  rememberLanMember(workspaceId: string, deviceCode: string, now = Date.now()) {
    const raw = deviceCode.trim().slice(0, 80)
    if (!workspaceId || raw.length < 8 || !/^[0-9a-zA-Z._-]+$/.test(raw)) return null
    const accountId = `lan_${createHash('sha256').update(`lan-member:${raw}`).digest('hex').slice(0, 22)}`
    const name = `局域网 ${accountId.slice(4, 12)}`
    const token = `lan.${createHash('sha256').update(`lan-token:${raw}`).digest('hex').slice(0, 40)}`
    const sessionId = `gss_${accountId.slice(4)}`
    const expiresAt = now + 400 * 24 * 60 * 60 * 1000
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db
        .prepare(
          `INSERT INTO accounts (id, name, token, password_hash, created_at, email, active_workspace_id)
           VALUES (?, ?, ?, '', ?, NULL, ?)
           ON CONFLICT(id) DO UPDATE SET name = excluded.name`,
        )
        .run(accountId, name, token, now, workspaceId)
      this.db
        .prepare(
          `INSERT INTO workspace_members (workspace_id, account_id, role, member_kind, created_at, display_name)
           VALUES (?, ?, 'viewer', 'guest', ?, ?)
           ON CONFLICT(workspace_id, account_id) DO UPDATE SET display_name = excluded.display_name`,
        )
        .run(workspaceId, accountId, now, name)
      this.db
        .prepare(
          `INSERT INTO guest_sessions (id, account_id, workspace_id, expires_at, created_at, last_seen_at)
           VALUES (?, ?, ?, ?, ?, ?)
           ON CONFLICT(account_id) DO UPDATE SET last_seen_at = excluded.last_seen_at, workspace_id = excluded.workspace_id, expires_at = excluded.expires_at, revoked_at = NULL`,
        )
        .run(sessionId, accountId, workspaceId, expiresAt, now, now)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return { id: accountId, name }
  }

  removeMember(
    actorId: string,
    workspaceId: string,
    accountId: string,
    options: { transferToAccountId?: string } = {},
  ) {
    const actorRole = this.requireManager(actorId, workspaceId)
    const target = this.db
      .prepare('SELECT role, member_kind FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { role: string; member_kind: string } | undefined
    if (!target) throw new CollabError('成员不存在', 404)
    if (target.role === 'owner') throw new CollabError('不能移除工作区所有者', 400)
    if (actorRole === 'admin' && target.role === 'admin') throw new CollabError('管理员不能移除其他管理员', 403)

    // 确定离职资产归属接收人：显式指定（须为本空间有效成员）或默认转交给空间所有者，杜绝孤儿私密数据
    const wsOwner = this.db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').get(workspaceId) as { owner_id?: string } | undefined
    let transferTo = options.transferToAccountId?.trim() || wsOwner?.owner_id || actorId
    if (transferTo === accountId || !this.isMember(transferTo, workspaceId)) {
      transferTo = wsOwner?.owner_id && wsOwner.owner_id !== accountId ? wsOwner.owner_id : actorId
    }

    const affectedRecords = this.recordGrantKeysForAccount(workspaceId, accountId)
    const ownedPolicies = this.db
      .prepare(
        `SELECT collection, record_id FROM resource_policies
         WHERE workspace_id = ? AND owner_account_id = ?`,
      )
      .all(workspaceId, accountId) as Array<{ collection: string; record_id: string }>
    const now = Date.now()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      // 1. 批量转交离职成员名下记录的所有权给接收人
      if (transferTo && transferTo !== accountId) {
        this.db
          .prepare(
            `UPDATE resource_policies SET owner_account_id = ?
             WHERE workspace_id = ? AND owner_account_id = ?`,
          )
          .run(transferTo, workspaceId, accountId)
        this.db
          .prepare(
            `UPDATE record_owners SET owner_id = ?
             WHERE workspace_id = ? AND owner_id = ?`,
          )
          .run(transferTo, workspaceId, accountId)
        for (const rec of ownedPolicies) {
          this.db
            .prepare(
              `INSERT INTO record_grants
                (workspace_id, collection, record_id, subject_type, subject_id, role, effect, granted_by, created_at)
               VALUES (?, ?, ?, 'account', ?, 'owner', 'allow', ?, ?)
               ON CONFLICT(workspace_id, collection, record_id, subject_type, subject_id)
               DO UPDATE SET role = 'owner', effect = 'allow', granted_by = excluded.granted_by, created_at = excluded.created_at`,
            )
            .run(workspaceId, rec.collection, rec.record_id, transferTo, actorId, now)
        }
      }
      // 2. 清理成员组、个人授权、作为 granted_by 颁发的内置全量视图授权及插件分发
      this.db.prepare(
        `DELETE FROM workspace_group_members
         WHERE account_id = ? AND group_id IN (SELECT id FROM workspace_groups WHERE workspace_id = ?)`,
      ).run(accountId, workspaceId)
      this.db.prepare(
        `DELETE FROM record_grants
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?`,
      ).run(workspaceId, accountId)
      this.db.prepare(
        `DELETE FROM view_grants
         WHERE workspace_id = ? AND (
           (subject_type = 'account' AND subject_id = ?)
           OR (granted_by = ? AND view_id LIKE 'builtin-all:%')
         )`,
      ).run(workspaceId, accountId, accountId)
      this.db.prepare(
        `DELETE FROM plugin_assignments
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?`,
      ).run(workspaceId, accountId)
      // 3. 清理实时编辑锁、Agent 执行租约、以及该成员签发的 Agent/MCP/外链 Scope
      this.db
        .prepare('DELETE FROM edit_locks WHERE workspace_id = ? AND account_id = ?')
        .run(workspaceId, accountId)
      this.db
        .prepare('DELETE FROM session_execution_leases WHERE account_id = ?')
        .run(accountId)
      this.authorization.revokeActorScopesByIssuer(workspaceId, accountId, now)
      this.db
        .prepare('DELETE FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
        .run(workspaceId, accountId)
      for (const record of affectedRecords) {
        this.reconcileRecordScope(workspaceId, record.collection, record.record_id)
      }
      this.revokeMcpForMember(accountId, workspaceId)
      if (target.member_kind === 'guest') {
        this.db.prepare('DELETE FROM guest_sessions WHERE account_id = ?').run(accountId)
        this.db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    this.authorization.invalidateAll()
    return { id: accountId, transferredTo: transferTo, transferredRecords: ownedPolicies.length }
  }

  updateMemberRole(actorId: string, workspaceId: string, accountId: string, role: WorkspaceRole) {
    this.requireRole(actorId, workspaceId, 'owner')
    const target = this.db
      .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { role: string } | undefined
    if (!target) throw new CollabError('成员不存在', 404)
    if (target.role === 'owner' && role !== 'owner') throw new CollabError('请先把所有者角色转交给其他成员', 400)
    if (role === 'owner' && accountId !== actorId) {
      this.db.exec('BEGIN IMMEDIATE')
      try {
        this.db
          .prepare(`UPDATE workspace_members SET role = 'admin' WHERE workspace_id = ? AND account_id = ?`)
          .run(workspaceId, actorId)
        this.db
          .prepare(`UPDATE workspace_members SET role = 'owner' WHERE workspace_id = ? AND account_id = ?`)
          .run(workspaceId, accountId)
        this.db.prepare('UPDATE workspaces SET owner_id = ? WHERE id = ?').run(accountId, workspaceId)
        this.db.exec('COMMIT')
      } catch (error) {
        this.db.exec('ROLLBACK')
        throw error
      }
      this.authorization.invalidateAll()
      return this.members(accountId, workspaceId).find((row) => row.id === accountId)!
    }
    this.db
      .prepare('UPDATE workspace_members SET role = ? WHERE workspace_id = ? AND account_id = ?')
      .run(role, workspaceId, accountId)
    this.authorization.invalidateAll()
    return this.members(actorId, workspaceId).find((row) => row.id === accountId)!
  }

  createGroup(actorId: string, workspaceId: string, name: string, now = Date.now()) {
    this.requireManager(actorId, workspaceId)
    const trimmed = name.trim()
    if (!trimmed) throw new CollabError('组名不能为空', 400)
    const group = { id: id('grp'), workspaceId, name: trimmed, createdBy: actorId, createdAt: now }
    this.db
      .prepare('INSERT INTO workspace_groups (id, workspace_id, name, created_by, created_at) VALUES (?, ?, ?, ?, ?)')
      .run(group.id, workspaceId, group.name, actorId, now)
    return group
  }

  groups(actorId: string, workspaceId: string) {
    this.requireInternalMember(actorId, workspaceId)
    const rows = this.db
      .prepare(
        `SELECT g.id, g.name, g.created_by, g.created_at, COUNT(gm.account_id) AS member_count
         FROM workspace_groups g
         LEFT JOIN workspace_group_members gm ON gm.group_id = g.id
         WHERE g.workspace_id = ?
         GROUP BY g.id
         ORDER BY g.created_at`,
      )
      .all(workspaceId) as Array<{
        id: string
        name: string
        created_by: string
        created_at: number
        member_count: number
      }>
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      createdBy: row.created_by,
      createdAt: row.created_at,
      memberCount: Number(row.member_count),
    }))
  }

  addGroupMemberByEmail(actorId: string, workspaceId: string, groupId: string, email: string, now = Date.now()) {
    this.requireManager(actorId, workspaceId)
    const group = this.db
      .prepare('SELECT id FROM workspace_groups WHERE id = ? AND workspace_id = ?')
      .get(groupId, workspaceId) as { id: string } | undefined
    if (!group) throw new CollabError('成员组不存在', 404)
    const account = this.db
      .prepare('SELECT id FROM accounts WHERE email = ?')
      .get(email.trim().toLowerCase()) as { id: string } | undefined
    if (!account) throw new CollabError('没有这个邮箱，对方需要先注册', 404)
    this.requireMember(account.id, workspaceId)
    this.db
      .prepare(
        `INSERT INTO workspace_group_members (group_id, account_id, created_at)
         VALUES (?, ?, ?)
         ON CONFLICT(group_id, account_id) DO NOTHING`,
      )
      .run(groupId, account.id, now)
    this.authorization.invalidateAll()
    return this.groupMembers(actorId, workspaceId, groupId)
  }

  groupMembers(actorId: string, workspaceId: string, groupId: string) {
    this.requireInternalMember(actorId, workspaceId)
    return this.db
      .prepare(
        `SELECT a.id, COALESCE(NULLIF(m.display_name, ''), '未设置') AS name, COALESCE(a.email, '') AS email
         FROM workspace_group_members gm
         JOIN workspace_groups g ON g.id = gm.group_id AND g.workspace_id = ?
         JOIN accounts a ON a.id = gm.account_id
         LEFT JOIN workspace_members m ON m.workspace_id = g.workspace_id AND m.account_id = a.id
         WHERE gm.group_id = ?
         ORDER BY gm.created_at`,
      )
      .all(workspaceId, groupId)
  }

  grantGroup(
    actorId: string,
    collection: string,
    recordId: string,
    groupId: string,
    role: ResourceRole,
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const group = this.db
      .prepare('SELECT id FROM workspace_groups WHERE id = ? AND workspace_id = ?')
      .get(groupId, workspaceId) as { id: string } | undefined
    if (!group) throw new CollabError('成员组不存在', 404)
    this.authorization.grant(
      actorId,
      { type: 'record', workspaceId, collection, recordId },
      'group',
      groupId,
      role,
    )
    this.reconcileRecordScope(workspaceId, collection, recordId)
    return this.accessRows(workspaceId, collection, recordId)
  }

  grantMemberView(
    actorId: string,
    collection: string,
    recordId: string,
    viewId: string,
    role: ResourceRole,
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const normalized = viewId.trim()
    if (!normalized) throw new CollabError('成员视图不能为空', 400)
    this.authorization.grant(
      actorId,
      { type: 'record', workspaceId, collection, recordId },
      'member_view',
      normalized,
      role,
    )
    this.reconcileRecordScope(workspaceId, collection, recordId)
    return this.accessRows(workspaceId, collection, recordId)
  }

  workspaceProfile(actorId: string) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireMember(actorId, workspaceId)
    const row = this.db
      .prepare(
        `SELECT a.email AS login_email, m.display_name, m.avatar
         FROM workspace_members m
         JOIN accounts a ON a.id = m.account_id
         WHERE m.workspace_id = ? AND m.account_id = ?`,
      )
      .get(workspaceId, actorId) as { login_email: string | null; display_name: string; avatar: string } | undefined
    if (!row) throw new CollabError('不在这个工作区', 403)
    return { workspaceId, email: row.login_email ?? '', name: row.display_name.trim(), avatar: row.avatar }
  }

  noteActiveAccount(accountId: string, now = Date.now()) {
    const id = String(accountId ?? '').trim()
    if (!id) return
    this.lastActiveAccount = { accountId: id, at: now }
  }

  /** 本机模式下解析当前登录账号与空间（给本机 host MCP token 使用）。 */
  activeLocalActor(requestedWorkspaceId = '', now = Date.now()): { accountId: string; workspaceId: string } | null {
    const requested = String(requestedWorkspaceId ?? '').trim()
    const sessionRow = this.db
      .prepare(
        `SELECT s.account_id, COALESCE(s.last_seen_at, s.created_at, 0) AS seen_at
         FROM auth_sessions s
         JOIN accounts a ON a.id = s.account_id
         WHERE s.revoked_at IS NULL AND (s.expires_at IS NULL OR s.expires_at > ?)
         ORDER BY COALESCE(s.last_seen_at, s.created_at, 0) DESC, s.created_at DESC
         LIMIT 1`,
      )
      .get(now) as { account_id: string; seen_at: number } | undefined

    let accountId = ''
    if (this.lastActiveAccount) {
      const exists = this.db
        .prepare('SELECT id FROM accounts WHERE id = ?')
        .get(this.lastActiveAccount.accountId) as { id?: string } | undefined
      if (!exists?.id) {
        this.lastActiveAccount = null
      } else if (!sessionRow || this.lastActiveAccount.at >= sessionRow.seen_at) {
        accountId = exists.id
      }
    }
    if (!accountId && sessionRow?.account_id) accountId = sessionRow.account_id
    if (!accountId) {
      const preferredWs = this.activeWorkspaceId() || this.homeWorkspaceId()
      const ownerRow = (
        preferredWs
          ? this.db
              .prepare('SELECT owner_id FROM workspaces WHERE id = ? LIMIT 1')
              .get(preferredWs)
          : undefined
      ) as { owner_id?: string } | undefined
      const fallbackRow = (
        ownerRow?.owner_id
          ? ownerRow
          : this.db.prepare('SELECT owner_id FROM workspaces ORDER BY created_at LIMIT 1').get()
      ) as { owner_id?: string } | undefined
      accountId = String(fallbackRow?.owner_id ?? '').trim()
    }
    if (!accountId) return null
    const workspaceId =
      requested && this.isMember(accountId, requested)
        ? requested
        : this.accountActiveWorkspace(accountId) ?? ''
    return { accountId, workspaceId }
  }

  workspacePerson(actorId: string) {
    const requested = currentRequestWorkspaceId()
    const workspaceId =
      requested && this.isMember(actorId, requested)
        ? requested
        : this.accountActiveWorkspace(actorId)
    if (workspaceId) {
      const row = this.db
        .prepare(
          `SELECT COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), NULLIF(a.email, ''), '用户') AS name
           FROM workspace_members m
           JOIN accounts a ON a.id = m.account_id
           WHERE m.workspace_id = ? AND m.account_id = ?`,
        )
        .get(workspaceId, actorId) as { name: string } | undefined
      if (row) return { accountId: actorId, workspaceId, name: row.name }
    }
    const account = this.db
      .prepare(
        `SELECT COALESCE(NULLIF(name, ''), NULLIF(email, ''), '用户') AS name
         FROM accounts WHERE id = ?`,
      )
      .get(actorId) as { name: string } | undefined
    return account ? { accountId: actorId, workspaceId: workspaceId ?? '', name: account.name } : null
  }

  saveWorkspaceProfile(actorId: string, patch: { name?: string; avatar?: string }) {
    const current = this.workspaceProfile(actorId)
    const name = patch.name !== undefined ? patch.name.trim().slice(0, 40) : current.name
    let avatar = patch.avatar !== undefined ? patch.avatar.trim() : current.avatar
    if (avatar && !avatar.startsWith('data:image/')) avatar = ''
    if (avatar.length > 240_000) throw new CollabError('头像太大', 400)
    const display = name
    this.db
      .prepare(
        `UPDATE workspace_members SET display_name = ?, avatar = ? WHERE workspace_id = ? AND account_id = ?`,
      )
      .run(display, avatar, current.workspaceId, actorId)
    return { ...current, name: display, avatar }
  }

  private prefsKey(workspaceId: string, actorId: string) {
    return `prefs:${workspaceId}:${actorId}`
  }

  private sanitizeStarredViews(raw: unknown): Array<{ path: string; viewId: string; name?: string }> {
    if (!Array.isArray(raw)) return []
    const seen = new Set<string>()
    const out: Array<{ path: string; viewId: string; name?: string }> = []
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const path = String(rec.path ?? '').trim()
      const viewId = String(rec.viewId ?? '').trim()
      const name = String(rec.name ?? '').trim().slice(0, 80)
      if (!path || !viewId) continue
      const key = `${path}\0${viewId}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(name ? { path, viewId, name } : { path, viewId })
    }
    return out
  }

  private sanitizeStarredRecords(raw: unknown): Array<{ path: string; recordId: string; label?: string; emoji?: string }> {
    if (!Array.isArray(raw)) return []
    const seen = new Set<string>()
    const out: Array<{ path: string; recordId: string; label?: string; emoji?: string }> = []
    for (const item of raw) {
      if (!item || typeof item !== 'object') continue
      const rec = item as Record<string, unknown>
      const path = String(rec.path ?? '').trim()
      const recordId = String(rec.recordId ?? '').trim()
      const label = String(rec.label ?? '').trim().slice(0, 120)
      const emoji = String(rec.emoji ?? '').trim().slice(0, 16)
      if (!path || !recordId) continue
      const key = `${path}\0${recordId}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push({ path, recordId, ...(label ? { label } : {}), ...(emoji ? { emoji } : {}) })
    }
    return out
  }

  private sanitizePinnedAgents(raw: unknown): string[] {
    if (!Array.isArray(raw)) return []
    const seen = new Set<string>()
    const out: string[] = []
    for (const item of raw) {
      const id = String(item ?? '').trim()
      if (!id || seen.has(id)) continue
      seen.add(id)
      out.push(id)
    }
    return out
  }

  workspacePrefs(actorId: string, requestedWorkspaceId = '') {
    const workspaceId = requestedWorkspaceId.trim() || currentRequestWorkspaceId() || this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireMember(actorId, workspaceId)
    const row = this.db
      .prepare('SELECT value FROM collab_state WHERE key = ?')
      .get(this.prefsKey(workspaceId, actorId)) as { value?: string } | undefined
    const empty = {
      workspaceId,
      starredViews: [] as Array<{ path: string; viewId: string; name?: string }>,
      starredRecords: [] as Array<{ path: string; recordId: string; label?: string; emoji?: string }>,
      pinnedAgents: [] as string[],
      theme: undefined as 'light' | 'dark' | undefined,
      accent: undefined as 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'red' | undefined,
      pagePrefs: undefined as Record<string, unknown> | undefined,
    }
    if (!row?.value) return empty
    try {
      const parsed = JSON.parse(row.value) as Record<string, unknown>
      const theme = parsed.theme === 'dark' || parsed.theme === 'light' ? parsed.theme : undefined
      const accent =
        parsed.accent === 'blue' ||
        parsed.accent === 'purple' ||
        parsed.accent === 'green' ||
        parsed.accent === 'orange' ||
        parsed.accent === 'pink' ||
        parsed.accent === 'red'
          ? parsed.accent
          : undefined
      const pagePrefs =
        parsed.pagePrefs && typeof parsed.pagePrefs === 'object' && !Array.isArray(parsed.pagePrefs)
          ? (parsed.pagePrefs as Record<string, unknown>)
          : undefined
      return {
        workspaceId,
        starredViews: this.sanitizeStarredViews(parsed.starredViews),
        starredRecords: this.sanitizeStarredRecords(parsed.starredRecords),
        pinnedAgents: this.sanitizePinnedAgents(parsed.pinnedAgents),
        theme,
        accent,
        pagePrefs,
      }
    } catch {
      return empty
    }
  }

  saveWorkspacePrefs(
    actorId: string,
    patch: {
      starredViews?: unknown
      starredRecords?: unknown
      pinnedAgents?: unknown
      theme?: unknown
      accent?: unknown
      pagePrefs?: unknown
    },
    requestedWorkspaceId = '',
  ) {
    const current = this.workspacePrefs(actorId, requestedWorkspaceId)
    const theme =
      patch.theme === 'dark' || patch.theme === 'light'
        ? patch.theme
        : current.theme
    const accent =
      patch.accent === 'blue' ||
      patch.accent === 'purple' ||
      patch.accent === 'green' ||
      patch.accent === 'orange' ||
      patch.accent === 'pink' ||
      patch.accent === 'red'
        ? patch.accent
        : current.accent
    const pagePrefs =
      patch.pagePrefs && typeof patch.pagePrefs === 'object' && !Array.isArray(patch.pagePrefs)
        ? { ...(current.pagePrefs ?? {}), ...(patch.pagePrefs as Record<string, unknown>) }
        : current.pagePrefs
    const next = {
      starredViews: patch.starredViews !== undefined ? this.sanitizeStarredViews(patch.starredViews) : current.starredViews,
      starredRecords:
        patch.starredRecords !== undefined ? this.sanitizeStarredRecords(patch.starredRecords) : current.starredRecords,
      pinnedAgents: patch.pinnedAgents !== undefined ? this.sanitizePinnedAgents(patch.pinnedAgents) : current.pinnedAgents,
      ...(theme ? { theme } : {}),
      ...(accent ? { accent } : {}),
      ...(pagePrefs ? { pagePrefs } : {}),
    }
    this.db
      .prepare(
        `INSERT INTO collab_state (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(this.prefsKey(current.workspaceId, actorId), JSON.stringify(next))
    return { workspaceId: current.workspaceId, ...next }
  }

  setAgentPinned(actorId: string, agentId: string, pinned: boolean, requestedWorkspaceId = '') {
    const id = String(agentId ?? '').trim()
    if (!id) throw new CollabError('需要代理 ID', 400)
    const current = this.workspacePrefs(actorId, requestedWorkspaceId)
    const nextPinned = pinned
      ? [...current.pinnedAgents.filter((item) => item !== id), id]
      : current.pinnedAgents.filter((item) => item !== id)
    return this.saveWorkspacePrefs(actorId, { pinnedAgents: nextPinned }, current.workspaceId)
  }

  /** 远程工作区在本机留一份成员关系，方便文件权限查询。 */
  upsertPulledWorkspace(input: { accountId: string; id: string; name: string; ownerId?: string; role?: string; createdAt?: number }) {
    const id = input.id.trim()
    if (!id || id === this.homeWorkspaceId()) return
    const name = input.name.trim() || '在线'
    const now = input.createdAt || Date.now()
    const existing = this.db.prepare('SELECT id FROM workspaces WHERE id = ?').get(id) as { id: string } | undefined
    if (!existing) {
      this.db
        .prepare('INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)')
        .run(id, name, input.ownerId || input.accountId, now)
    } else {
      this.db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, id)
    }
    const role = input.role === 'owner' || input.role === 'admin' || input.role === 'viewer' ? input.role : 'member'
    this.db
      .prepare(
        `INSERT INTO workspace_members (workspace_id, account_id, role, created_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(workspace_id, account_id) DO UPDATE SET role = excluded.role`,
      )
      .run(id, input.accountId, role, now)
  }

  listWorkspaces(accountId: string): Workspace[] {
    const rows = this.db
      .prepare(
        `SELECT w.id, w.name, w.owner_id, w.created_at, m.role
         FROM workspace_members m
         JOIN workspaces w ON w.id = m.workspace_id
         WHERE m.account_id = ?
         ORDER BY w.created_at`,
      )
      .all(accountId) as Array<{ id: string; name: string; owner_id: string; created_at: number; role: WorkspaceRole }>
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      ownerId: row.owner_id,
      role: row.role,
      createdAt: row.created_at,
    }))
  }

  canAccessPlugin(accountId: string, workspaceId: string, pluginId: string) {
    if (!accountId || !workspaceId || !pluginId || !this.isMember(accountId, workspaceId)) return false
    return this.hasPluginLoad(accountId, workspaceId, pluginId)
  }

  hasPluginLoad(accountId: string, workspaceId: string, pluginId: string) {
    if (!accountId || !workspaceId || !pluginId) return false
    const row = this.db
      .prepare(
        `SELECT 1 AS ok FROM plugin_loads
         WHERE workspace_id = ? AND account_id = ? AND plugin_id = ?`,
      )
      .get(workspaceId, accountId, pluginId) as { ok?: number } | undefined
    return Boolean(row)
  }

  pluginLoadsFor(accountId: string, workspaceId: string) {
    if (!accountId || !workspaceId) return []
    const rows = this.db
      .prepare(
        `SELECT plugin_id FROM plugin_loads
         WHERE workspace_id = ? AND account_id = ?
         ORDER BY plugin_id`,
      )
      .all(workspaceId, accountId) as Array<{ plugin_id: string }>
    return rows.map((row) => row.plugin_id)
  }

  /** 安装包删掉之后，所有账号在这个插件上的运行记录一起清掉。 */
  forgetPluginLoads(pluginId: string) {
    const id = pluginId.trim()
    if (!id) return
    this.db.prepare('DELETE FROM plugin_loads WHERE plugin_id = ?').run(id)
  }

  loadedPluginIds() {
    const rows = this.db
      .prepare('SELECT DISTINCT plugin_id FROM plugin_loads ORDER BY plugin_id')
      .all() as Array<{ plugin_id: string }>
    return rows.map((row) => row.plugin_id)
  }

  setPluginLoad(accountId: string, workspaceId: string, pluginId: string, loaded: boolean, now = Date.now()) {
    this.requireMember(accountId, workspaceId)
    const id = pluginId.trim()
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(id)) throw new CollabError('插件 ID 不合法', 400)
    if (loaded) {
      this.db
        .prepare(
          `INSERT INTO plugin_loads (workspace_id, account_id, plugin_id, loaded_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT(workspace_id, account_id, plugin_id)
           DO UPDATE SET loaded_at = excluded.loaded_at`,
        )
        .run(workspaceId, accountId, id, now)
      return
    }
    this.db
      .prepare('DELETE FROM plugin_loads WHERE workspace_id = ? AND account_id = ? AND plugin_id = ?')
      .run(workspaceId, accountId, id)
  }

  availablePluginIds(accountId: string, workspaceId: string) {
    if (!this.isMember(accountId, workspaceId)) return []
    const rows = this.db
      .prepare('SELECT DISTINCT plugin_id FROM plugin_assignments WHERE workspace_id = ? ORDER BY plugin_id')
      .all(workspaceId) as Array<{ plugin_id: string }>
    return rows
      .map((row) => row.plugin_id)
      .filter((pluginId) => this.canAccessPlugin(accountId, workspaceId, pluginId))
  }

  ensurePluginOwnerAssignments(pluginId: string, now = Date.now()) {
    const existing = this.db
      .prepare('SELECT 1 AS ok FROM plugin_assignments WHERE plugin_id = ? LIMIT 1')
      .get(pluginId)
    if (existing) return 0
    const inserted = this.db
      .prepare(
        `INSERT OR IGNORE INTO plugin_assignments
          (workspace_id, plugin_id, plugin_version, subject_type, subject_id, created_by, created_at)
         SELECT w.id, ?, '', 'account', w.owner_id, w.owner_id, ?
         FROM workspaces w`,
      )
      .run(pluginId, now)
    return Number(inserted.changes)
  }

  listPluginAssignments(actorId: string, workspaceId: string, pluginId = '') {
    this.requireMember(actorId, workspaceId)
    const role = this.workspaceRole(actorId, workspaceId)
    if (role !== 'owner' && role !== 'admin') {
      return this.db
        .prepare(
          `SELECT workspace_id, plugin_id, plugin_version, subject_type, subject_id, created_by, created_at
           FROM plugin_assignments
           WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?
             AND (? = '' OR plugin_id = ?)
           ORDER BY plugin_id`,
        )
        .all(workspaceId, actorId, pluginId, pluginId)
    }
    return this.db
      .prepare(
        `SELECT workspace_id, plugin_id, plugin_version, subject_type, subject_id, created_by, created_at
         FROM plugin_assignments
         WHERE workspace_id = ? AND (? = '' OR plugin_id = ?)
         ORDER BY plugin_id, subject_type, subject_id`,
      )
      .all(workspaceId, pluginId, pluginId)
  }

  grantPluginAssignment(
    actorId: string,
    workspaceId: string,
    pluginId: string,
    subject: PluginAssignmentSubject,
    pluginVersion = '',
    now = Date.now(),
  ) {
    this.requireMember(actorId, workspaceId)
    const normalizedPlugin = pluginId.trim()
    const subjectId = subject.id.trim()
    if (!/^[a-z][a-z0-9-]{1,40}$/.test(normalizedPlugin)) throw new CollabError('插件 ID 不合法', 400)
    if (!subjectId) throw new CollabError('授权对象不能为空', 400)
    const role = this.workspaceRole(actorId, workspaceId)
    const manager = role === 'owner' || role === 'admin'
    if (!manager && (subject.type !== 'account' || subjectId !== actorId)) {
      throw new CollabError('普通成员只能为自己启用插件', 403)
    }
    if (subject.type === 'account') this.requireMember(subjectId, workspaceId)
    if (subject.type !== 'account' && subject.type !== 'member_view') {
      throw new CollabError('插件授权对象不合法', 400)
    }
    const approved = this.db
      .prepare(
        `SELECT 1 AS ok FROM plugin_packages
         WHERE id = ? AND trust_state = 'approved'
         LIMIT 1`,
      )
      .get(normalizedPlugin)
    if (!approved) throw new CollabError('插件未安装或尚未批准', 409)
    this.db
      .prepare(
        `INSERT INTO plugin_assignments
          (workspace_id, plugin_id, plugin_version, subject_type, subject_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, plugin_id, subject_type, subject_id)
         DO UPDATE SET plugin_version = excluded.plugin_version,
                       created_by = excluded.created_by,
                       created_at = excluded.created_at`,
      )
      .run(workspaceId, normalizedPlugin, pluginVersion.trim(), subject.type, subjectId, actorId, now)
    this.auditPlugin(actorId, workspaceId, normalizedPlugin, 'assignment.grant', { subject }, now)
    return { workspaceId, pluginId: normalizedPlugin, subjectType: subject.type, subjectId }
  }

  revokePluginAssignment(
    actorId: string,
    workspaceId: string,
    pluginId: string,
    subject: PluginAssignmentSubject,
    now = Date.now(),
  ) {
    this.requireMember(actorId, workspaceId)
    const role = this.workspaceRole(actorId, workspaceId)
    const manager = role === 'owner' || role === 'admin'
    if (!manager && (subject.type !== 'account' || subject.id !== actorId)) {
      throw new CollabError('普通成员只能为自己停用插件', 403)
    }
    const removed = this.db
      .prepare(
        `DELETE FROM plugin_assignments
         WHERE workspace_id = ? AND plugin_id = ? AND subject_type = ? AND subject_id = ?`,
      )
      .run(workspaceId, pluginId, subject.type, subject.id)
    if (!removed.changes) throw new CollabError('插件授权不存在', 404)
    this.auditPlugin(actorId, workspaceId, pluginId, 'assignment.revoke', { subject }, now)
    return { workspaceId, pluginId, subjectType: subject.type, subjectId: subject.id }
  }

  listPluginAudit(actorId: string, workspaceId = '', limit = 100) {
    if (!workspaceId) throw new CollabError('需要空间', 400)
    const role = this.workspaceRole(actorId, workspaceId)
    if (role !== 'owner' && role !== 'admin') throw new CollabError('没有插件审计权限', 403)
    return this.db
      .prepare(
        `SELECT id, account_id, workspace_id, plugin_id, action, detail_json, created_at
         FROM plugin_audit_log
         WHERE (? = '' OR workspace_id = ?)
         ORDER BY id DESC LIMIT ?`,
      )
      .all(workspaceId, workspaceId, Math.max(1, Math.min(500, limit)))
      .map((row) => {
        const value = row as Record<string, unknown>
        return { ...value, detail: JSON.parse(String(value.detail_json || '{}')) }
      })
  }

  recordPluginPackage(
    actorId: string,
    input: PluginPackageInput,
    now = Date.now(),
  ) {
    this.db
      .prepare(
        `INSERT INTO plugin_packages
          (id, version, package_hash, package_path, source_kind, trust_state, tenant_mode,
           has_web, has_host, manifest_json, installed_by, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id, version) DO UPDATE SET
           package_hash = excluded.package_hash,
           package_path = excluded.package_path,
           trust_state = excluded.trust_state,
           tenant_mode = excluded.tenant_mode,
           has_web = excluded.has_web,
           has_host = excluded.has_host,
           manifest_json = excluded.manifest_json,
           installed_by = excluded.installed_by,
           updated_at = excluded.updated_at`,
      )
      .run(
        input.id,
        input.version,
        input.packageHash,
        input.packagePath,
        input.sourceKind,
        input.trustState,
        input.tenantMode,
        input.hasWeb ? 1 : 0,
        input.hasHost ? 1 : 0,
        JSON.stringify(input.manifest ?? {}),
        actorId,
        now,
        now,
      )
    this.auditPlugin(actorId, '', input.id, 'package.install', { version: input.version }, now)
  }

  syncInstalledPluginPackage(
    input: PluginPackageInput,
    now = Date.now(),
  ) {
    const actorId =
      currentAccountId() ||
      (
        this.db.prepare('SELECT id FROM accounts ORDER BY created_at, id LIMIT 1').get() as { id?: string } | undefined
      )?.id ||
      ''
    if (!actorId) return false
    this.recordPluginPackage(actorId, input, now)
    return true
  }

  removePluginPackage(actorId: string, pluginId: string, now = Date.now()) {
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.db.prepare('DELETE FROM plugin_assignments WHERE plugin_id = ?').run(pluginId)
      this.db.prepare('DELETE FROM plugin_workspace_config WHERE plugin_id = ?').run(pluginId)
      this.db.prepare('DELETE FROM plugin_account_config WHERE plugin_id = ?').run(pluginId)
      this.db.prepare('DELETE FROM plugin_packages WHERE id = ?').run(pluginId)
      this.auditPlugin(actorId, '', pluginId, 'package.uninstall', {}, now)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  claim(actorId: string, workspaceId: string, collection: string, recordId: string, now = Date.now()): RecordHead {
    this.requireMember(actorId, workspaceId)
    const key = this.recordKey(collection, recordId)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const current = this.head(workspaceId, key.collection, key.recordId)
      const elsewhere = this.db
        .prepare(
          `SELECT workspace_id FROM record_owners
           WHERE collection = ? AND record_id = ? AND workspace_id != ? LIMIT 1`,
        )
        .get(key.collection, key.recordId, workspaceId) as { workspace_id?: string } | undefined
      if (elsewhere) throw new CollabError('这条记录已经属于另一个空间', 409)
      if (!current) {
        this.db
          .prepare(
            `INSERT INTO record_owners
             (workspace_id, collection, record_id, owner_id, version, updated_at)
             VALUES (?, ?, ?, ?, 0, ?)`,
          )
          .run(workspaceId, key.collection, key.recordId, actorId, now)
      } else if (current.ownerId !== actorId) {
        throw new CollabError('这条记录已经有归属', 409)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        /* already rolled back by sqlite on throw inside */
      }
      throw error
    }
    return this.head(workspaceId, key.collection, key.recordId)!
  }

  sync(input: {
    actorId: string
    workspaceId: string
    collection: string
    recordId: string
    field: string
    value: unknown
    expectedVersion: number
    now?: number
  }): SyncOp {
    const now = input.now ?? Date.now()
    this.requireMember(input.actorId, input.workspaceId)
    const key = this.recordKey(input.collection, input.recordId)
    if (!this.head(input.workspaceId, key.collection, key.recordId)) {
      this.claim(input.actorId, input.workspaceId, key.collection, key.recordId, now)
    }
    const decision = this.authorization.authorize(
      { type: 'account', accountId: input.actorId, workspaceId: input.workspaceId },
      'resource:update',
      { type: 'record', workspaceId: input.workspaceId, collection: key.collection, recordId: key.recordId },
    )
    if (!decision.allowed) throw new CollabError('没有权限', 403)
    const field = input.field.trim()
    if (!field) throw new CollabError('字段不能为空', 400)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      this.assertLockFree(input.actorId, input.workspaceId, key.collection, key.recordId, now)
      const current = this.head(input.workspaceId, key.collection, key.recordId)
      const version = current?.version ?? 0
      if (input.expectedVersion !== version) {
        throw new CollabError(`版本冲突：期望 v${input.expectedVersion}，当前为 v${version}`, 409)
      }
      const next = version + 1
      if (!current) {
        this.db
          .prepare(
            `INSERT INTO record_owners
             (workspace_id, collection, record_id, owner_id, version, updated_at)
             VALUES (?, ?, ?, ?, ?, ?)`,
          )
          .run(input.workspaceId, key.collection, key.recordId, input.actorId, next, now)
      } else {
        this.db
          .prepare(
            `UPDATE record_owners SET version = ?, updated_at = ?
             WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
          )
          .run(next, now, input.workspaceId, key.collection, key.recordId)
      }
      const inserted = this.db
        .prepare(
          `INSERT INTO sync_ops
           (workspace_id, collection, record_id, field, value_json, version, author_id, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          input.workspaceId,
          key.collection,
          key.recordId,
          field,
          JSON.stringify(input.value ?? null),
          next,
          input.actorId,
          now,
        )
      this.db.exec('COMMIT')
      return {
        id: Number(inserted.lastInsertRowid),
        workspaceId: input.workspaceId,
        collection: key.collection,
        recordId: key.recordId,
        field,
        value: input.value ?? null,
        version: next,
        authorId: input.actorId,
        createdAt: now,
      }
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw error
    }
  }

  opsSince(actorId: string, workspaceId: string, after = 0): SyncOp[] {
    this.requireMember(actorId, workspaceId)
    const rows = this.db
      .prepare(
        `SELECT id, workspace_id, collection, record_id, field, value_json, version, author_id, created_at
         FROM sync_ops
         WHERE workspace_id = ? AND id > ?
         ORDER BY id
         LIMIT 200`,
      )
      .all(workspaceId, after) as Array<{
      id: number
      workspace_id: string
      collection: string
      record_id: string
      field: string
      value_json: string
      version: number
      author_id: string
      created_at: number
    }>
    return rows.map((row) => this.mapOp(row))
  }

  /** 只返回这个账号有权阅读的变更。桌面端拉取用这个，避免把同空间其他人的私有记录带下去。 */
  visibleOpsSince(actorId: string, workspaceId: string, after = 0): SyncOp[] {
    return this.opsSince(actorId, workspaceId, after).filter((op) =>
      this.authorization.authorize(
        { type: 'account', accountId: actorId, workspaceId },
        'resource:read',
        { type: 'record', workspaceId, collection: op.collection, recordId: op.recordId },
      ).allowed,
    )
  }

  fieldValue(
    actorId: string,
    workspaceId: string,
    collection: string,
    recordId: string,
    field: string,
  ): { version: number; value: unknown } | null {
    this.requireMember(actorId, workspaceId)
    const key = this.recordKey(collection, recordId)
    const allowed = this.authorization.authorize(
      { type: 'account', accountId: actorId, workspaceId },
      'resource:read',
      { type: 'record', workspaceId, collection: key.collection, recordId: key.recordId },
    ).allowed
    if (!allowed) return null
    const current = this.head(workspaceId, key.collection, key.recordId)
    if (!current) return null
    const row = this.db
      .prepare(
        `SELECT value_json FROM sync_ops
         WHERE workspace_id = ? AND collection = ? AND record_id = ? AND field = ?
         ORDER BY id DESC LIMIT 1`,
      )
      .get(workspaceId, key.collection, key.recordId, field) as { value_json: string } | undefined
    return { version: current.version, value: row ? (JSON.parse(row.value_json) as unknown) : null }
  }

  private mapOp(row: {
    id: number
    workspace_id: string
    collection: string
    record_id: string
    field: string
    value_json: string
    version: number
    author_id: string
    created_at: number
  }): SyncOp {
    return {
      id: row.id,
      workspaceId: row.workspace_id,
      collection: row.collection,
      recordId: row.record_id,
      field: row.field,
      value: JSON.parse(row.value_json) as unknown,
      version: row.version,
      authorId: row.author_id,
      createdAt: row.created_at,
    }
  }

  acquireLock(
    actorId: string,
    workspaceId: string,
    collection: string,
    recordId: string,
    ttlMs = DEFAULT_LOCK_MS,
    now = Date.now(),
  ): EditLock {
    this.requireMember(actorId, workspaceId)
    const key = this.recordKey(collection, recordId)
    const decision = this.authorization.authorize(
      { type: 'account', accountId: actorId, workspaceId },
      'resource:update',
      { type: 'record', workspaceId, collection: key.collection, recordId: key.recordId },
    )
    if (!decision.allowed) throw new CollabError('没有权限', 403)
    const expiresAt = now + Math.max(1000, ttlMs)
    this.db.exec('BEGIN IMMEDIATE')
    try {
      const held = this.lockRow(workspaceId, key.collection, key.recordId)
      if (held && held.expiresAt > now && held.accountId !== actorId) {
        throw new CollabError('这条记录正被别人编辑', 409)
      }
      this.db
        .prepare(
          `INSERT INTO edit_locks (workspace_id, collection, record_id, account_id, expires_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(workspace_id, collection, record_id)
           DO UPDATE SET account_id = excluded.account_id, expires_at = excluded.expires_at`,
        )
        .run(workspaceId, key.collection, key.recordId, actorId, expiresAt)
      this.db.exec('COMMIT')
    } catch (error) {
      try {
        this.db.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw error
    }
    return { workspaceId, collection: key.collection, recordId: key.recordId, accountId: actorId, expiresAt }
  }

  releaseLock(actorId: string, workspaceId: string, collection: string, recordId: string) {
    this.requireMember(actorId, workspaceId)
    const key = this.recordKey(collection, recordId)
    this.db
      .prepare(
        `DELETE FROM edit_locks
         WHERE workspace_id = ? AND collection = ? AND record_id = ? AND account_id = ?`,
      )
      .run(workspaceId, key.collection, key.recordId, actorId)
  }

  pulse(
    actorId: string,
    workspaceId: string,
    collection = '',
    recordId = '',
    now = Date.now(),
  ): PresenceRow {
    this.requireMember(actorId, workspaceId)
    const account = this.requireAccount(actorId)
    this.db
      .prepare(
        `INSERT INTO presence (workspace_id, account_id, collection, record_id, seen_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, account_id)
         DO UPDATE SET collection = excluded.collection, record_id = excluded.record_id, seen_at = excluded.seen_at`,
      )
      .run(workspaceId, actorId, collection, recordId, now)
    return {
      workspaceId,
      accountId: actorId,
      name: account.name,
      collection,
      recordId,
      seenAt: now,
    }
  }

  presence(actorId: string, workspaceId: string, now = Date.now()): PresenceRow[] {
    this.requireMember(actorId, workspaceId)
    const rows = this.db
      .prepare(
        `SELECT p.workspace_id, p.account_id, COALESCE(NULLIF(m.display_name, ''), '未设置') AS name, p.collection, p.record_id, p.seen_at
         FROM presence p
         JOIN accounts a ON a.id = p.account_id
         LEFT JOIN workspace_members m ON m.workspace_id = p.workspace_id AND m.account_id = p.account_id
         WHERE p.workspace_id = ? AND p.seen_at >= ?
         ORDER BY p.seen_at DESC`,
      )
      .all(workspaceId, now - PRESENCE_STALE_MS) as Array<{
      workspace_id: string
      account_id: string
      name: string
      collection: string
      record_id: string
      seen_at: number
    }>
    return rows.map((row) => ({
      workspaceId: row.workspace_id,
      accountId: row.account_id,
      name: row.name,
      collection: row.collection,
      recordId: row.record_id,
      seenAt: row.seen_at,
    }))
  }

  homeWorkspaceId() {
    return this.stateValue('home')
  }

  membership() {
    const active = this.activeWorkspaceId()
    const home = this.homeWorkspaceId()
    const rows = this.db
      .prepare('SELECT workspace_id, collection, record_id FROM record_owners')
      .all() as Array<{ workspace_id: string; collection: string; record_id: string }>
    const mine = new Set<string>()
    const any = new Set<string>()
    for (const row of rows) {
      const key = `${row.collection}\t${row.record_id}`
      any.add(key)
      if (row.workspace_id === active) mine.add(key)
    }
    return { active, home, mine, any, strict: Boolean(currentAccountId()) }
  }

  private stateValue(key: string) {
    const row = this.db.prepare('SELECT value FROM collab_state WHERE key = ?').get(key) as { value?: string } | undefined
    return row?.value || null
  }

  setActive(actorId: string, workspaceId: string) {
    this.requireMember(actorId, workspaceId)
    this.rememberActive(actorId, workspaceId)
    return workspaceId
  }

  private accountActiveWorkspace(accountId: string) {
    const row = this.db.prepare('SELECT active_workspace_id FROM accounts WHERE id = ?').get(accountId) as
      | { active_workspace_id?: string }
      | undefined
    return row?.active_workspace_id || null
  }

  private rememberActive(accountId: string, workspaceId: string) {
    this.db.prepare('UPDATE accounts SET active_workspace_id = ? WHERE id = ?').run(workspaceId, accountId)
    const caller = currentAccountId()
    if (!caller || caller === accountId) this.writeState('active', workspaceId)
  }

  recordIds(workspaceId: string, collection: string) {
    const rows = this.db
      .prepare('SELECT record_id FROM record_owners WHERE workspace_id = ? AND collection = ?')
      .all(workspaceId, collection) as Array<{ record_id: string }>
    return new Set(rows.map((row) => row.record_id))
  }

  attach(
    workspaceId: string,
    collection: string,
    recordId: string,
    now = Date.now(),
    policy: ResourcePolicyInput = {},
  ) {
    const owner = this.db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').get(workspaceId) as
      | { owner_id: string }
      | undefined
    if (!owner) throw new CollabError('工作区不存在', 404)
    if (collection === '/plugins' && isRegisteredBuiltinPlugin(recordId)) return
    const caller = currentAccountId()
    const recordOwner = caller || owner.owner_id
    const elsewhere = this.db
      .prepare(
        `SELECT workspace_id FROM record_owners
         WHERE collection = ? AND record_id = ? AND workspace_id != ? LIMIT 1`,
      )
      .get(collection, recordId, workspaceId) as { workspace_id?: string } | undefined
    if (elsewhere) throw new CollabError('这条记录已经属于另一个空间', 409)
    this.db
      .prepare(
        `INSERT INTO record_owners (workspace_id, collection, record_id, owner_id, version, updated_at)
         VALUES (?, ?, ?, ?, 0, ?)
         ON CONFLICT(workspace_id, collection, record_id) DO NOTHING`,
      )
      .run(workspaceId, collection, recordId, recordOwner, now)
    if (caller) {
      this.authorization.attach(
        { type: 'account', accountId: caller, workspaceId },
        { type: 'record', workspaceId, collection, recordId },
        policy,
        now,
      )
    }
  }

  grantMap(workspaceId: string, collection: string) {
    const rows = this.db
      .prepare(
        `SELECT record_id, subject_id
         FROM record_grants
         WHERE workspace_id = ? AND collection = ? AND subject_type = 'account'`,
      )
      .all(workspaceId, collection) as Array<{ record_id: string; subject_id: string }>
    const map = new Map<string, Set<string>>()
    for (const row of rows) {
      const set = map.get(row.record_id) ?? new Set<string>()
      set.add(row.subject_id)
      map.set(row.record_id, set)
    }
    return map
  }

  canReadRecord(collection: string, recordId: string) {
    const caller = currentAccountId()
    const workspaceId = this.activeWorkspaceId()
    if (getRuntimePolicy().authzMode === 'rbac' && (!caller || !workspaceId)) return false
    if (!caller || !workspaceId) return true
    return this.authorization.authorize(
      { type: 'account', accountId: caller, workspaceId },
      'resource:read',
      { type: 'record', workspaceId, collection, recordId },
    ).allowed
  }

  recordAccess(actorId: string, collection: string, recordId: string) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireMember(actorId, workspaceId)
    if (!this.canReadRecord(collection, recordId)) throw new CollabError('没有权限', 403)
    const resource = { type: 'record' as const, workspaceId, collection, recordId }
    const inheritance = this.authorization.inheritanceInfo(resource)
    const viewGrants = this.viewGrantShares(workspaceId, collection).map((grant) => ({
      ...grant,
      matchesActor: grant.subjectType === 'account'
        ? grant.subjectId === actorId
        : this.authorization.matchesMemberView(workspaceId, grant.subjectId, actorId),
    }))
    return {
      ...this.accessRows(workspaceId, collection, recordId),
      currentAccountId: actorId,
      viewGrants,
      roleChain: this.authorization.roleChain(actorId, resource),
      inheritance: {
        mode: inheritance.mode,
        hasParent: inheritance.hasParent,
        parent: inheritance.parent,
        ancestors: inheritance.ancestors.map((ancestor) => ({
          ...ancestor,
          ...this.accessRows(workspaceId, ancestor.collection, ancestor.recordId),
        })),
      },
    }
  }

  setRecordInheritance(
    actorId: string,
    collection: string,
    recordId: string,
    mode: 'inherit' | 'custom',
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireMember(actorId, workspaceId)
    const resource = { type: 'record' as const, workspaceId, collection, recordId }
    try {
      this.authorization.setInheritanceMode({ type: 'account', accountId: actorId, workspaceId }, resource, mode)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('permission denied')) throw new CollabError('没有权限', 403)
      throw new CollabError(message, 400)
    }
    if (mode === 'custom') this.reconcileRecordScope(workspaceId, collection, recordId)
    this.recordActivity({
      workspaceId,
      actorId,
      category: 'access',
      action: 'access.inherit',
      collection,
      recordId,
      detail: mode === 'inherit' ? '开启继承上级权限' : '断开上级继承，改为独立权限',
    })
    return this.recordAccess(actorId, collection, recordId)
  }

  viewGrantAudiences(workspaceId: string, collection: string) {
    return this.db
      .prepare(
        `SELECT g.view_id, g.subject_type, g.subject_id, g.granted_by, COALESCE(m.member_kind, '') AS member_kind
         FROM view_grants g
         LEFT JOIN workspace_members m
           ON g.subject_type = 'account'
          AND m.workspace_id = g.workspace_id
          AND m.account_id = g.subject_id
         WHERE g.workspace_id = ? AND g.collection = ?
         ORDER BY g.created_at`,
      )
      .all(workspaceId, collection) as Array<{
        view_id: string
        subject_type: 'account' | 'member_view'
        subject_id: string
        granted_by: string
        member_kind: string
      }>
  }

  private viewGrantShares(workspaceId: string, collection: string) {
    const people = this.db
      .prepare(
        `SELECT g.view_id, g.granted_by, a.id, COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), '未设置') AS name,
                COALESCE(NULLIF(m.avatar, ''), NULLIF(a.avatar, ''), '') AS avatar,
                COALESCE(a.email, '') AS email, g.role, COALESCE(m.member_kind, '') AS member_kind
         FROM view_grants g
         JOIN accounts a ON g.subject_type = 'account' AND a.id = g.subject_id
         LEFT JOIN workspace_members m ON m.workspace_id = g.workspace_id AND m.account_id = g.subject_id
         WHERE g.workspace_id = ? AND g.collection = ? AND g.subject_type = 'account'
         ORDER BY g.created_at`,
      )
      .all(workspaceId, collection) as Array<{
        view_id: string
        granted_by: string
        id: string
        name: string
        avatar: string
        email: string
        role: string
        member_kind: string
      }>
    const memberViews = this.db
      .prepare(
        `SELECT view_id, granted_by, subject_id AS id, role
         FROM view_grants
         WHERE workspace_id = ? AND collection = ? AND subject_type = 'member_view'
         ORDER BY created_at`,
      )
      .all(workspaceId, collection) as Array<{ view_id: string; granted_by: string; id: string; role: string }>
    return [
      ...people.map((row) => ({
        viewId: row.view_id,
        subjectType: 'account' as const,
        subjectId: row.id,
        role: row.role,
        name: row.name,
        avatar: row.avatar,
        email: row.email,
        grantedBy: row.granted_by,
        memberKind: row.member_kind === 'external' || row.member_kind === 'guest' ? row.member_kind : 'member' as const,
      })),
      ...memberViews.map((row) => ({
        viewId: row.view_id,
        subjectType: 'member_view' as const,
        subjectId: row.id,
        role: row.role,
        name: row.id,
        email: '',
        grantedBy: row.granted_by,
        memberKind: 'member' as const,
      })),
    ]
  }

  shareWithEmail(
    actorId: string,
    collection: string,
    recordId: string,
    email: string,
    role: ResourceRole = 'editor',
    collaboratorKind: 'internal' | 'external' = 'external',
    now = Date.now(),
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireMember(actorId, workspaceId)
    const owned = this.db
      .prepare('SELECT 1 AS ok FROM record_owners WHERE workspace_id = ? AND collection = ? AND record_id = ?')
      .get(workspaceId, collection, recordId) as { ok: number } | undefined
    if (!owned) throw new CollabError('记录不在这个工作区', 404)
    const normalized = email.trim().toLowerCase()
    if (!normalized) throw new CollabError('邮箱不能为空', 400)
    const account = this.db.prepare('SELECT id FROM accounts WHERE email = ?').get(normalized) as { id: string } | undefined
    if (!account) throw new CollabError('没有这个邮箱，对方需要先注册', 404)
    const resource = { type: 'record' as const, workspaceId, collection, recordId }
    const decision = this.authorization.authorize(
      { type: 'account', accountId: actorId, workspaceId },
      'resource:share',
      resource,
    )
    if (!decision.allowed) throw new CollabError('没有权限', 403)
    const membership = this.db
      .prepare('SELECT member_kind FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, account.id) as { member_kind: string } | undefined
    if (collaboratorKind === 'internal') {
      if (membership?.member_kind !== 'member') {
        throw new CollabError('内部协作者必须先加入当前空间', 409)
      }
    } else {
      if (membership?.member_kind === 'member') {
        throw new CollabError('这个账号已经是内部空间成员', 409)
      }
      if (membership?.member_kind === 'guest') {
        throw new CollabError('临时访客不能转为外部协作者', 409)
      }
      this.db
        .prepare(
          `INSERT INTO workspace_members (workspace_id, account_id, role, member_kind, created_at)
           VALUES (?, ?, 'member', 'external', ?)
           ON CONFLICT(workspace_id, account_id) DO NOTHING`,
        )
        .run(workspaceId, account.id, now)
    }
    this.authorization.grant(actorId, resource, 'account', account.id, role, now)
    this.reconcileRecordScope(workspaceId, collection, recordId)
    this.recordActivity({
      workspaceId,
      actorId,
      category: 'access',
      action: 'access.grant',
      collection,
      recordId,
      detail: `授权给 ${normalized}（${role}）`,
      now,
    })
    return this.accessRows(workspaceId, collection, recordId)
  }

  revokeRecordGrant(
    actorId: string,
    collection: string,
    recordId: string,
    subjectType: 'account' | 'group' | 'member_view',
    subjectId: string,
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const resource = { type: 'record' as const, workspaceId, collection, recordId }
    const decision = this.authorization.authorize(
      { type: 'account', accountId: actorId, workspaceId },
      'resource:manage-permissions',
      resource,
    )
    if (!decision.allowed) throw new CollabError('没有权限', 403)
    const policy = this.db
      .prepare(
        `SELECT owner_account_id FROM resource_policies
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(workspaceId, collection, recordId) as { owner_account_id?: string } | undefined
    if (subjectType === 'account' && subjectId === policy?.owner_account_id) {
      throw new CollabError('不能移除数据创建者', 400)
    }
    const removed = this.db
      .prepare(
        `DELETE FROM record_grants
         WHERE workspace_id = ? AND collection = ? AND record_id = ?
           AND subject_type = ? AND subject_id = ?`,
      )
      .run(workspaceId, collection, recordId, subjectType, subjectId)
    if (!removed.changes) throw new CollabError('协作者不存在', 404)
    if (subjectType === 'account') this.cleanupExternalMembership(workspaceId, subjectId)
    this.authorization.invalidate(workspaceId, collection)
    this.reconcileRecordScope(workspaceId, collection, recordId)
    this.recordActivity({
      workspaceId,
      actorId,
      category: 'access',
      action: 'access.revoke',
      collection,
      recordId,
      detail: `移除了协作者权限（${subjectType}）`,
    })
    return this.accessRows(workspaceId, collection, recordId)
  }

  viewAccess(actorId: string, collection: string, viewId: string) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const actorRole = this.requireViewSharer(actorId, workspaceId, collection, viewId)
    return this.viewAccessRows(workspaceId, collection, viewId, actorId, actorRole === 'owner')
  }

  shareViewWithEmail(
    actorId: string,
    collection: string,
    viewId: string,
    email: string,
    role: ResourceRole = 'editor',
    collaboratorKind: 'internal' | 'external' = 'external',
    now = Date.now(),
    columns?: { readableColumns?: string[] | null; writableColumns?: string[] | null; deniedColumns?: string[] | null },
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const normalizedView = viewId.trim()
    if (!normalizedView) throw new CollabError('视图不能为空', 400)
    const actorRole = this.requireViewSharer(actorId, workspaceId, collection, normalizedView)
    if (role === 'owner') throw new CollabError('视图授权不能授予所有者角色', 403)
    const normalized = email.trim().toLowerCase()
    if (!normalized) throw new CollabError('邮箱不能为空', 400)
    const account = this.db.prepare('SELECT id FROM accounts WHERE email = ?').get(normalized) as { id: string } | undefined
    if (!account) throw new CollabError('没有这个邮箱，对方需要先注册', 404)
    this.ensureCollaboratorMembership(workspaceId, account.id, collaboratorKind, now)
    this.writeViewGrant(workspaceId, collection, normalizedView, 'account', account.id, role, actorId, now, columns)
    this.recordActivity({
      workspaceId,
      actorId,
      category: 'access',
      action: 'access.view_grant',
      collection,
      detail: `将视图授权给 ${normalized}（${role}）`,
      now,
    })
    return this.viewAccessRows(workspaceId, collection, normalizedView, actorId, actorRole === 'owner')
  }

  grantViewMemberView(
    actorId: string,
    collection: string,
    viewId: string,
    memberViewId: string,
    role: ResourceRole,
    now = Date.now(),
    columns?: { readableColumns?: string[] | null; writableColumns?: string[] | null; deniedColumns?: string[] | null },
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const normalizedView = viewId.trim()
    const normalizedMemberView = memberViewId.trim()
    if (!normalizedView || !normalizedMemberView) throw new CollabError('成员视图不能为空', 400)
    const actorRole = this.requireViewSharer(actorId, workspaceId, collection, normalizedView)
    if (role === 'owner') throw new CollabError('视图授权不能授予所有者角色', 403)
    this.writeViewGrant(workspaceId, collection, normalizedView, 'member_view', normalizedMemberView, role, actorId, now, columns)
    this.recordActivity({
      workspaceId,
      actorId,
      category: 'access',
      action: 'access.view_grant',
      collection,
      detail: `按成员视图授权视图（${role}）`,
      now,
    })
    return this.viewAccessRows(workspaceId, collection, normalizedView, actorId, actorRole === 'owner')
  }

  revokeViewGrant(
    actorId: string,
    collection: string,
    viewId: string,
    subjectType: 'account' | 'member_view',
    subjectId: string,
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const actorRole = this.requireViewSharer(actorId, workspaceId, collection, viewId)
    // 谁签发的视图授权只能由谁移除（空间所有者可强制审计移除），防止成员 B 篡改成员 A 的分享规则
    const removed = actorRole === 'owner'
      ? this.db
          .prepare(
            `DELETE FROM view_grants
             WHERE workspace_id = ? AND collection = ? AND view_id = ?
               AND subject_type = ? AND subject_id = ?`,
          )
          .run(workspaceId, collection, viewId, subjectType, subjectId)
      : this.db
          .prepare(
            `DELETE FROM view_grants
             WHERE workspace_id = ? AND collection = ? AND view_id = ?
               AND subject_type = ? AND subject_id = ? AND granted_by = ?`,
          )
          .run(workspaceId, collection, viewId, subjectType, subjectId, actorId)
    if (!removed.changes) throw new CollabError('协作者不存在或无权移除他人的分享规则', 404)
    if (subjectType === 'account') this.cleanupExternalMembership(workspaceId, subjectId)
    this.authorization.invalidate(workspaceId, collection)
    this.recordActivity({
      workspaceId,
      actorId,
      category: 'access',
      action: 'access.view_revoke',
      collection,
      detail: `移除了视图授权（${subjectType}）`,
    })
    return this.viewAccessRows(workspaceId, collection, viewId, actorId, actorRole === 'owner')
  }

  /** 删除视图时级联清理引用该视图的 view_grants 以及 member_view 授权。 */
  cleanupViewReferences(workspaceId: string, collection: string, viewId: string) {
    if (!workspaceId || !collection || !viewId) return
    let changed = false
    try {
      const deletedViewGrants = this.db
        .prepare('DELETE FROM view_grants WHERE workspace_id = ? AND collection = ? AND view_id = ?')
        .run(workspaceId, collection, viewId)
      if (Number(deletedViewGrants.changes) > 0) changed = true
      if (collection === '/workspace-members') {
        const deletedMemberViewGrants = this.db
          .prepare(`DELETE FROM view_grants WHERE workspace_id = ? AND subject_type = 'member_view' AND subject_id = ?`)
          .run(workspaceId, viewId)
        const deletedRecordGrants = this.db
          .prepare(`DELETE FROM record_grants WHERE workspace_id = ? AND subject_type = 'member_view' AND subject_id = ?`)
          .run(workspaceId, viewId)
        if (Number(deletedMemberViewGrants.changes) > 0 || Number(deletedRecordGrants.changes) > 0) changed = true
      }
    } catch {
      /* 兼容老库无相关表 */
    }
    if (changed) this.authorization.invalidateAll()
  }

  collectionOwnership(workspaceId: string, collection: string) {
    const policies = this.db
      .prepare(
        `SELECT record_id, access_mode, owner_account_id FROM resource_policies
         WHERE workspace_id = ? AND collection = ?`,
      )
      .all(workspaceId, collection) as Array<{ record_id: string; access_mode: string; owner_account_id: string }>
    const map = new Map<string, 'personal' | 'workspace' | 'shared'>()
    for (const row of policies) {
      map.set(row.record_id, row.access_mode === 'members' ? 'workspace' : 'personal')
    }
    const grants = this.db
      .prepare(
        `SELECT g.record_id, g.subject_id, COALESCE(m.member_kind, '') AS member_kind
         FROM record_grants g
         LEFT JOIN workspace_members m
           ON g.subject_type = 'account'
          AND m.workspace_id = g.workspace_id
          AND m.account_id = g.subject_id
         WHERE g.workspace_id = ? AND g.collection = ?`,
      )
      .all(workspaceId, collection) as Array<{ record_id: string; subject_id: string; member_kind: string }>
    const owners = new Map(policies.map((row) => [row.record_id, row.owner_account_id]))
    for (const grant of grants) {
      if (grant.subject_id === owners.get(grant.record_id)) continue
      const current = map.get(grant.record_id) ?? 'personal'
      if (grant.member_kind === 'external' || grant.member_kind === 'guest') map.set(grant.record_id, 'shared')
      else if (current !== 'shared') map.set(grant.record_id, 'workspace')
    }
    const owned = this.db
      .prepare(
        `SELECT record_id FROM record_owners WHERE workspace_id = ? AND collection = ?`,
      )
      .all(workspaceId, collection) as Array<{ record_id: string }>
    for (const row of owned) {
      if (!map.has(row.record_id)) map.set(row.record_id, 'workspace')
    }
    return map
  }

  viewGrantsFor(workspaceId: string, collection: string) {
    return this.db
      .prepare(
        `SELECT view_id, subject_type, subject_id, role, COALESCE(effect, 'allow') AS effect,
                readable_columns, writable_columns, denied_columns, granted_by
         FROM view_grants
         WHERE workspace_id = ? AND collection = ?
         ORDER BY created_at`,
      )
      .all(workspaceId, collection) as Array<{
        view_id: string
        subject_type: 'account' | 'member_view'
        subject_id: string
        role: ResourceRole
        effect?: 'allow' | 'deny'
        readable_columns?: string | null
        writable_columns?: string | null
        denied_columns?: string | null
        granted_by: string
      }>
  }

  collectionRecordOwners(workspaceId: string, collection: string) {
    const map = new Map<string, string>()
    const policies = this.db
      .prepare(
        `SELECT record_id, owner_account_id FROM resource_policies
         WHERE workspace_id = ? AND collection = ?`,
      )
      .all(workspaceId, collection) as Array<{ record_id: string; owner_account_id: string }>
    for (const row of policies) {
      if (row.owner_account_id) map.set(row.record_id, row.owner_account_id)
    }
    const owners = this.db
      .prepare(
        `SELECT record_id, owner_id FROM record_owners WHERE workspace_id = ? AND collection = ?`,
      )
      .all(workspaceId, collection) as Array<{ record_id: string; owner_id: string }>
    for (const row of owners) {
      if (!map.has(row.record_id) && row.owner_id) map.set(row.record_id, row.owner_id)
    }
    return map
  }

  externallySharedRecords(actorId: string, workspaceId: string) {
    this.requireInternalMember(actorId, workspaceId)
    const rows = this.db
      .prepare(
        `SELECT DISTINCT g.collection, g.record_id
         FROM record_grants g
         JOIN workspace_members m
           ON m.workspace_id = g.workspace_id
          AND m.account_id = g.subject_id
          AND m.member_kind IN ('external', 'guest')
         WHERE g.workspace_id = ? AND g.subject_type = 'account'
         ORDER BY g.created_at DESC`,
      )
      .all(workspaceId) as Array<{ collection: string; record_id: string }>
    return rows
      .filter((row) =>
        this.authorization.authorize(
          { type: 'account', accountId: actorId, workspaceId },
          'resource:read',
          { type: 'record', workspaceId, collection: row.collection, recordId: row.record_id },
        ).allowed,
      )
      .map((row) => ({ collection: row.collection, record_id: row.record_id }))
  }

  private requireViewSharer(actorId: string, workspaceId: string, collection: string, viewId = '') {
    const row = this.db
      .prepare('SELECT role, member_kind FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, actorId) as { role: string; member_kind: string } | undefined
    if (!row) throw new CollabError('不是这个工作区的成员', 403)
    if (row.member_kind === 'external' || row.member_kind === 'guest') {
      throw new CollabError('外部协作者无权管理视图分享', 403)
    }
    const decision = this.authorization.authorize(
      { type: 'account', accountId: actorId, workspaceId },
      'resource:share',
      { type: 'collection', workspaceId, collection },
    )
    if (decision.allowed) return row.role
    // 内部正式成员可按视图分享自己名下的记录（受非提权公理约束，永远只覆盖自己有权分享的记录）
    if (row.role === 'member' && row.member_kind === 'member' && viewId) return row.role
    throw new CollabError('没有权限', 403)
  }

  private ensureCollaboratorMembership(
    workspaceId: string,
    accountId: string,
    collaboratorKind: 'internal' | 'external',
    now: number,
  ) {
    const membership = this.db
      .prepare('SELECT member_kind FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { member_kind: string } | undefined
    if (collaboratorKind === 'internal') {
      if (membership?.member_kind !== 'member') {
        throw new CollabError('内部协作者必须先加入当前空间', 409)
      }
      return
    }
    if (membership?.member_kind === 'member') {
      throw new CollabError('这个账号已经是内部空间成员', 409)
    }
    if (membership?.member_kind === 'guest') {
      throw new CollabError('临时访客不能转为外部协作者', 409)
    }
    this.db
      .prepare(
        `INSERT INTO workspace_members (workspace_id, account_id, role, member_kind, created_at)
         VALUES (?, ?, 'member', 'external', ?)
         ON CONFLICT(workspace_id, account_id) DO NOTHING`,
      )
      .run(workspaceId, accountId, now)
  }

  private writeViewGrant(
    workspaceId: string,
    collection: string,
    viewId: string,
    subjectType: 'account' | 'member_view',
    subjectId: string,
    role: ResourceRole,
    grantedBy: string,
    now: number,
    columns?: { readableColumns?: string[] | null; writableColumns?: string[] | null; deniedColumns?: string[] | null },
  ) {
    const readable = columns?.readableColumns ? JSON.stringify(columns.readableColumns) : null
    const writable = columns?.writableColumns ? JSON.stringify(columns.writableColumns) : null
    const denied = columns?.deniedColumns ? JSON.stringify(columns.deniedColumns) : null
    this.db
      .prepare(
        `INSERT INTO view_grants
          (workspace_id, collection, view_id, subject_type, subject_id, role, readable_columns, writable_columns, denied_columns, granted_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, collection, view_id, subject_type, subject_id, granted_by)
         DO UPDATE SET role = excluded.role,
                       readable_columns = COALESCE(excluded.readable_columns, view_grants.readable_columns),
                       writable_columns = COALESCE(excluded.writable_columns, view_grants.writable_columns),
                       denied_columns = COALESCE(excluded.denied_columns, view_grants.denied_columns),
                       created_at = excluded.created_at`,
      )
      .run(workspaceId, collection, viewId, subjectType, subjectId, role, readable, writable, denied, grantedBy, now)
    this.authorization.invalidate(workspaceId, collection)
  }

  private viewAccessRows(
    workspaceId: string,
    collection: string,
    viewId: string,
    viewerId = '',
    includeAllGrantors = true,
  ) {
    const filterByGrantor = Boolean(viewerId && !includeAllGrantors)
    const people = (filterByGrantor
      ? this.db
          .prepare(
            `SELECT a.id, COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), '未设置') AS name,
                    COALESCE(NULLIF(m.avatar, ''), NULLIF(a.avatar, ''), '') AS avatar,
                    COALESCE(a.email, '') AS email, g.role, m.member_kind
             FROM view_grants g
             JOIN accounts a ON g.subject_type = 'account' AND a.id = g.subject_id
             LEFT JOIN workspace_members m ON m.workspace_id = g.workspace_id AND m.account_id = g.subject_id
             WHERE g.workspace_id = ? AND g.collection = ? AND g.view_id = ? AND g.subject_type = 'account' AND g.granted_by = ?
             ORDER BY g.created_at`,
          )
          .all(workspaceId, collection, viewId, viewerId)
      : this.db
          .prepare(
            `SELECT a.id, COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), '未设置') AS name,
                    COALESCE(NULLIF(m.avatar, ''), NULLIF(a.avatar, ''), '') AS avatar,
                    COALESCE(a.email, '') AS email, g.role, m.member_kind
             FROM view_grants g
             JOIN accounts a ON g.subject_type = 'account' AND a.id = g.subject_id
             LEFT JOIN workspace_members m ON m.workspace_id = g.workspace_id AND m.account_id = g.subject_id
             WHERE g.workspace_id = ? AND g.collection = ? AND g.view_id = ? AND g.subject_type = 'account'
             ORDER BY g.created_at`,
          )
          .all(workspaceId, collection, viewId)) as Array<{
        id: string
        name: string
        avatar: string
        email: string
        role: string
        member_kind: 'member' | 'external' | 'guest'
      }>
    const memberViews = (filterByGrantor
      ? this.db
          .prepare(
            `SELECT subject_id AS id, role
             FROM view_grants
             WHERE workspace_id = ? AND collection = ? AND view_id = ? AND subject_type = 'member_view' AND granted_by = ?
             ORDER BY created_at`,
          )
          .all(workspaceId, collection, viewId, viewerId)
      : this.db
          .prepare(
            `SELECT subject_id AS id, role
             FROM view_grants
             WHERE workspace_id = ? AND collection = ? AND view_id = ? AND subject_type = 'member_view'
             ORDER BY created_at`,
          )
          .all(workspaceId, collection, viewId)) as Array<{ id: string; role: string }>
    return {
      private: people.length + memberViews.length === 0,
      scope: 'personal' as const,
      ownerId: '',
      people: people.map(({ member_kind, ...row }) => ({ ...row, memberKind: member_kind })),
      groups: [] as Array<{ id: string; name: string; role: string }>,
      memberViews,
    }
  }

  private accessRows(workspaceId: string, collection: string, recordId: string) {
    const rows = this.db
      .prepare(
        `SELECT a.id, COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), '未设置') AS name,
                COALESCE(NULLIF(m.avatar, ''), NULLIF(a.avatar, ''), '') AS avatar,
                COALESCE(a.email, '') AS email, g.role, m.member_kind
         FROM record_grants g
         JOIN accounts a ON g.subject_type = 'account' AND a.id = g.subject_id
         LEFT JOIN workspace_members m ON m.workspace_id = g.workspace_id AND m.account_id = g.subject_id
         WHERE g.workspace_id = ? AND g.collection = ? AND g.record_id = ? AND g.subject_type = 'account'
         ORDER BY g.created_at`,
      )
      .all(workspaceId, collection, recordId) as Array<{
        id: string
        name: string
        avatar: string
        email: string
        role: string
        member_kind: 'member' | 'external' | 'guest'
      }>
    const groups = this.db
      .prepare(
        `SELECT g.id, g.name, rg.role
         FROM record_grants rg
         JOIN workspace_groups g ON rg.subject_type = 'group' AND g.id = rg.subject_id
         WHERE rg.workspace_id = ? AND rg.collection = ? AND rg.record_id = ?
         ORDER BY rg.created_at`,
      )
      .all(workspaceId, collection, recordId) as Array<{ id: string; name: string; role: string }>
    const memberViews = this.db
      .prepare(
        `SELECT subject_id AS id, role
         FROM record_grants
         WHERE workspace_id = ? AND collection = ? AND record_id = ? AND subject_type = 'member_view'
         ORDER BY created_at`,
      )
      .all(workspaceId, collection, recordId) as Array<{ id: string; role: string }>
    const policy = this.db
      .prepare(
        `SELECT access_mode, owner_account_id FROM resource_policies
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(workspaceId, collection, recordId) as
      | { access_mode: string; owner_account_id: string }
      | undefined
    const ownerRow = policy?.owner_account_id
      ? { owner_id: policy.owner_account_id }
      : this.db
          .prepare(
            `SELECT owner_id FROM record_owners WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
          )
          .get(workspaceId, collection, recordId) as { owner_id?: string } | undefined
    const ownerId = policy?.owner_account_id || ownerRow?.owner_id || ''
    const collaboratorCount =
      rows.filter((row) => row.id !== ownerId).length + groups.length + memberViews.length
    const hasExternal = rows.some(
      (row) => row.id !== ownerId && (row.member_kind === 'external' || row.member_kind === 'guest'),
    )
    const scope = hasExternal
      ? 'shared' as const
      : collaboratorCount || policy?.access_mode === 'members'
        ? 'workspace' as const
        : 'personal' as const
    return {
      private: collaboratorCount === 0,
      scope,
      ownerId,
      people: rows.map(({ member_kind, ...row }) => ({ ...row, memberKind: member_kind })),
      groups,
      memberViews,
    }
  }

  private reconcileRecordScope(workspaceId: string, collection: string, recordId: string) {
    let policy = this.db
      .prepare(
        `SELECT owner_account_id FROM resource_policies
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(workspaceId, collection, recordId) as { owner_account_id: string } | undefined
    if (!policy) {
      const owner = this.db
        .prepare(
          `SELECT owner_id FROM record_owners
           WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
        )
        .get(workspaceId, collection, recordId) as { owner_id?: string } | undefined
      if (!owner?.owner_id) throw new CollabError('记录不在这个工作区', 404)
      this.db
        .prepare(
          `INSERT INTO resource_policies
            (workspace_id, collection, record_id, owner_account_id, access_mode,
             member_default_role, parent_collection, parent_record_id, created_by, created_at)
           VALUES (?, ?, ?, ?, 'private', 'viewer', '', '', ?, ?)`,
        )
        .run(workspaceId, collection, recordId, owner.owner_id, owner.owner_id, Date.now())
      policy = { owner_account_id: owner.owner_id }
    }
    const rows = this.db
      .prepare(
        `SELECT g.subject_type, g.subject_id, COALESCE(m.member_kind, '') AS member_kind
         FROM record_grants g
         LEFT JOIN workspace_members m
           ON g.subject_type = 'account'
          AND m.workspace_id = g.workspace_id
          AND m.account_id = g.subject_id
         WHERE g.workspace_id = ? AND g.collection = ? AND g.record_id = ?`,
      )
      .all(workspaceId, collection, recordId) as Array<{
        subject_type: string
        subject_id: string
        member_kind: string
      }>
    const collaborators = rows.filter(
      (row) => row.subject_type !== 'account' || row.subject_id !== policy!.owner_account_id,
    )
    const hasExternal = collaborators.some(
      (row) => row.subject_type === 'account' && (row.member_kind === 'external' || row.member_kind === 'guest'),
    )
    const currentPolicy = this.db
      .prepare(
        `SELECT access_mode FROM resource_policies
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(workspaceId, collection, recordId) as { access_mode?: string } | undefined
    // 保持 access_mode（members / inherit）与 record_grants 正交，绝不因增删单个协作者而破坏全员可见或父子继承链。
    if (!currentPolicy?.access_mode || currentPolicy.access_mode === 'private' || currentPolicy.access_mode === 'restricted') {
      this.db
        .prepare(
          `UPDATE resource_policies
           SET access_mode = ?
           WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
        )
        .run(collaborators.length ? 'restricted' : 'private', workspaceId, collection, recordId)
    }
    return hasExternal
      ? 'shared'
      : currentPolicy?.access_mode === 'members' || collaborators.length
        ? 'workspace'
        : 'personal'
  }

  private recordGrantKeysForAccount(workspaceId: string, accountId: string) {
    return this.db
      .prepare(
        `SELECT DISTINCT collection, record_id
         FROM record_grants
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?`,
      )
      .all(workspaceId, accountId) as Array<{ collection: string; record_id: string }>
  }

  private reconcileAccountGrantScopes(workspaceId: string, accountId: string) {
    for (const record of this.recordGrantKeysForAccount(workspaceId, accountId)) {
      this.reconcileRecordScope(workspaceId, record.collection, record.record_id)
    }
  }

  private cleanupExternalMembership(workspaceId: string, accountId: string) {
    const membership = this.db
      .prepare(
        `SELECT member_kind FROM workspace_members
         WHERE workspace_id = ? AND account_id = ?`,
      )
      .get(workspaceId, accountId) as { member_kind?: string } | undefined
    if (membership?.member_kind !== 'external') return
    const recordGrant = this.db
      .prepare(
        `SELECT 1 AS ok FROM record_grants
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?
         LIMIT 1`,
      )
      .get(workspaceId, accountId)
    const viewGrant = this.db
      .prepare(
        `SELECT 1 AS ok FROM view_grants
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?
         LIMIT 1`,
      )
      .get(workspaceId, accountId)
    const pluginGrant = this.db
      .prepare(
        `SELECT 1 AS ok FROM plugin_assignments
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?
         LIMIT 1`,
      )
      .get(workspaceId, accountId)
    if (recordGrant || viewGrant || pluginGrant) return
    this.db
      .prepare(`DELETE FROM workspace_members WHERE workspace_id = ? AND account_id = ? AND member_kind = 'external'`)
      .run(workspaceId, accountId)
    this.revokeMcpForMember(accountId, workspaceId)
  }

  private writeState(key: string, value: string) {
    this.db
      .prepare(`INSERT INTO collab_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`)
      .run(key, value)
  }

  private validInvite(token: string, kind: 'workspace' | 'guest', now: number) {
    const normalized = token.trim()
    if (!normalized) throw new CollabError('邀请链接无效', 400)
    const row = this.db
      .prepare(
        `SELECT id, workspace_id, kind, role, collection, record_id, view_id, resource_role,
                expires_at, max_uses, use_count, created_by, revoked_at
         FROM workspace_invites
         WHERE token_hash = ? AND kind = ?`,
      )
      .get(tokenHash(normalized), kind) as
      | {
          id: string
          workspace_id: string
          kind: string
          role: WorkspaceRole
          collection: string
          record_id: string
          view_id: string
          resource_role: ResourceRole
          expires_at: number
          max_uses: number
          use_count: number
          created_by: string
          revoked_at: number | null
        }
      | undefined
    if (!row) throw new CollabError('邀请链接无效', 404)
    if (row.revoked_at || row.expires_at <= now || row.use_count >= row.max_uses) {
      throw new CollabError('邀请链接已过期或已使用', 410)
    }
    return row
  }

  private useInvite(inviteId: string) {
    const result = this.db
      .prepare('UPDATE workspace_invites SET use_count = use_count + 1 WHERE id = ? AND use_count < max_uses')
      .run(inviteId)
    if (!result.changes) throw new CollabError('邀请链接已使用', 410)
  }

  private markBootstrapped() {
    this.writeState('bootstrapped', '1')
  }

  private localSession() {
    const row = this.db
      .prepare(
        `SELECT a.id, a.name, a.token, a.created_at, w.id AS workspace_id, w.name AS workspace_name, w.owner_id, w.created_at AS workspace_created
         FROM workspaces w
         JOIN accounts a ON a.id = w.owner_id
         ORDER BY w.created_at
         LIMIT 1`,
      )
      .get() as
      | {
          id: string
          name: string
          token: string
          created_at: number
          workspace_id: string
          workspace_name: string
          owner_id: string
          workspace_created: number
        }
      | undefined
    if (!row) throw new CollabError('还没有本地工作区', 404)
    return {
      account: { id: row.id, name: row.name, email: '', createdAt: row.created_at },
      token: row.token,
      workspace: {
        id: row.workspace_id,
        name: row.workspace_name,
        ownerId: row.owner_id,
        role: 'owner',
        createdAt: row.workspace_created,
      },
    }
  }

  private importLiveRecords(workspaceId: string, ownerId: string, now: number) {
    const inserted = this.db
      .prepare(
        `INSERT INTO record_owners (workspace_id, collection, record_id, owner_id, version, updated_at)
         SELECT ?, live.collection, live.record_id, ?, 0, ?
         FROM (
           SELECT '/pages' AS collection, id AS record_id FROM pages
           UNION
           SELECT '/tasks', id FROM tasks
           UNION
           SELECT '/agents', id FROM agents
           UNION
           SELECT collection, record_id FROM editor_content
           WHERE collection IN ('/skills', '/plugins')
           UNION
           SELECT collection, record_id FROM record_meta
           WHERE collection IN ('/pages', '/tasks', '/agents', '/skills', '/plugins')
         ) AS live
         WHERE NOT EXISTS (
           SELECT 1 FROM record_meta AS meta
           WHERE meta.collection = live.collection
             AND meta.record_id = live.record_id
             AND meta.deleted_at IS NOT NULL
             AND meta.deleted_at > 0
         )`,
      )
      .run(workspaceId, ownerId, now)
    return Number(inserted.changes)
  }

  private ensureBuiltInRoot(now = Date.now()) {
    if (getRuntimePolicy().hostMode !== 'cloud') return false
    const email = superAdminEmail()
    const existing = this.db
      .prepare(`SELECT id FROM accounts WHERE lower(email) = ? LIMIT 1`)
      .get(email) as { id?: string } | undefined
    const reserved = 'acc_super'
    const accountId = existing?.id ?? (
      this.db.prepare(`SELECT 1 AS ok FROM accounts WHERE id = ?`).get(reserved) ? id('acc') : reserved
    )
    const name = email.split('@')[0] || 'BIU'
    this.db.exec('BEGIN IMMEDIATE')
    try {
      if (!existing) {
        this.db
          .prepare(
            `INSERT INTO accounts
              (id, name, token, password_hash, created_at, email, active_workspace_id, must_change_password)
             VALUES (?, ?, ?, ?, ?, ?, '', 0)`,
          )
          .run(accountId, name, randomBytes(24).toString('hex'), hashPassword(superAdminPassword()), now, email)
      } else {
        this.db.prepare('UPDATE accounts SET must_change_password = 0 WHERE id = ?').run(accountId)
      }
      this.db.exec('COMMIT')
      return !existing
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private workspaceRole(accountId: string, workspaceId: string): WorkspaceRole {
    const role = this.requireMember(accountId, workspaceId)
    if (role === 'owner' || role === 'admin' || role === 'member' || role === 'viewer') return role
    throw new CollabError('空间角色不合法', 403)
  }

  private auditPlugin(
    accountId: string,
    workspaceId: string,
    pluginId: string,
    action: string,
    detail: unknown,
    now = Date.now(),
  ) {
    this.db
      .prepare(
        `INSERT INTO plugin_audit_log
          (account_id, workspace_id, plugin_id, action, detail_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(accountId, workspaceId, pluginId, action, JSON.stringify(detail ?? {}), now)
  }

  private requireAccount(accountId: string) {
    const row = this.db.prepare('SELECT id, name, created_at FROM accounts WHERE id = ?').get(accountId) as
      | { id: string; name: string; created_at: number }
      | undefined
    if (!row) throw new CollabError('账号不存在', 404)
    return { id: row.id, name: row.name, createdAt: row.created_at }
  }

  private requireMember(accountId: string, workspaceId: string) {
    const row = this.db
      .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { role: string } | undefined
    if (!row) throw new CollabError('不是这个工作区的成员', 403)
    return row.role
  }

  private requireInternalMember(accountId: string, workspaceId: string) {
    const row = this.db
      .prepare('SELECT role, member_kind FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { role: string; member_kind?: string } | undefined
    if (!row) throw new CollabError('不是这个工作区的成员', 403)
    if (row.member_kind === 'external' || row.member_kind === 'guest') {
      throw new CollabError('外部协作者无权访问此空间级接口', 403)
    }
    return row.role
  }

  private requireRole(accountId: string, workspaceId: string, role: string) {
    const actual = this.requireMember(accountId, workspaceId)
    if (actual !== role) throw new CollabError('只有所有者可以这样做', 403)
  }

  private requireManager(accountId: string, workspaceId: string) {
    const actual = this.requireMember(accountId, workspaceId)
    if (actual !== 'owner' && actual !== 'admin') throw new CollabError('只有所有者或管理员可以这样做', 403)
    return actual
  }

  private recordKey(collection: string, recordId: string) {
    const normalized = collection.trim()
    const idPart = recordId.trim()
    if (!normalized.startsWith('/') || normalized.includes('..') || !idPart || idPart.includes('/')) {
      throw new CollabError('记录路径不合法', 400)
    }
    return { collection: normalized, recordId: idPart }
  }

  private head(workspaceId: string, collection: string, recordId: string): RecordHead | null {
    const row = this.db
      .prepare(
        `SELECT workspace_id, collection, record_id, owner_id, version, updated_at
         FROM record_owners
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(workspaceId, collection, recordId) as
      | {
          workspace_id: string
          collection: string
          record_id: string
          owner_id: string
          version: number
          updated_at: number
        }
      | undefined
    if (!row) return null
    return {
      workspaceId: row.workspace_id,
      collection: row.collection,
      recordId: row.record_id,
      ownerId: row.owner_id,
      version: row.version,
      updatedAt: row.updated_at,
    }
  }

  private lockRow(workspaceId: string, collection: string, recordId: string): EditLock | null {
    const row = this.db
      .prepare(
        `SELECT workspace_id, collection, record_id, account_id, expires_at
         FROM edit_locks
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(workspaceId, collection, recordId) as
      | {
          workspace_id: string
          collection: string
          record_id: string
          account_id: string
          expires_at: number
        }
      | undefined
    if (!row) return null
    return {
      workspaceId: row.workspace_id,
      collection: row.collection,
      recordId: row.record_id,
      accountId: row.account_id,
      expiresAt: row.expires_at,
    }
  }

  private assertLockFree(actorId: string, workspaceId: string, collection: string, recordId: string, now: number) {
    const held = this.lockRow(workspaceId, collection, recordId)
    if (held && held.expiresAt > now && held.accountId !== actorId) {
      throw new CollabError('这条记录正被别人编辑', 409)
    }
  }
}
