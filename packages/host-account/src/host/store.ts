import { createHash, randomBytes } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import { currentAccountId, currentRequestWorkspaceId, superAdminEmail, superAdminPassword, wrapPreparedStmtCache } from '@biu/host-plugin-loader/data-dir'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import { AuthorizationService, ROLE_RANK, type ResourcePolicyInput, type ResourceRole, type WorkspaceRole } from './authorization.ts'
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
  type BatchPermissionApplyInput,
  type BatchPermissionApplyResult,
  type BatchPermissionPreviewResult,
  type BatchPermissionSubject,
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
  type BatchPermissionApplyInput,
  type BatchPermissionApplyResult,
  type BatchPermissionPreviewResult,
  type BatchPermissionSubject,
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
    this.db = wrapPreparedStmtCache(rawDb, 256)
    this.authorization = new AuthorizationService(this.db, (accountId) => {
      const requested = currentRequestWorkspaceId()
      if (requested && this.isMember(accountId, requested)) return requested
      return this.accountActiveWorkspace(accountId)
    })
    this.ensureBuiltInRoot()
    this.ensureActivityTable()
    this.ensureWorkspaceAvatarColumn()
  }

  private ensureWorkspaceAvatarColumn() {
    const wsCols = (this.db.prepare('PRAGMA table_info(workspaces)').all() as Array<{ name: string }>).map((c) => c.name)
    if (wsCols.length > 0 && !wsCols.includes('avatar')) {
      this.db.exec(`ALTER TABLE workspaces ADD COLUMN avatar TEXT NOT NULL DEFAULT ''`)
    }
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

  memberRole(accountId: string, workspaceId: string): WorkspaceRole | null {
    const row = this.db
      .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { role?: string } | undefined
    return row?.role === 'owner' || row?.role === 'admin' || row?.role === 'member' || row?.role === 'viewer'
      ? row.role
      : null
  }

  /** 按主键单行查询成员资料（O(1)），用于锁定成员视图匹配，避免全员表扫描。 */
  memberById(workspaceId: string, accountId: string) {
    const row = this.db
      .prepare(
        `SELECT a.id, COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), NULLIF(a.email, ''), '未设置') AS name,
                COALESCE(m.display_name, '') AS display_name,
                COALESCE(m.avatar, '') AS avatar,
                COALESCE(a.email, '') AS email,
                m.role, m.member_kind, m.created_at
         FROM workspace_members m
         JOIN accounts a ON a.id = m.account_id
         WHERE m.workspace_id = ? AND m.account_id = ?`,
      )
      .get(workspaceId, accountId) as
      | {
          id: string
          name: string
          display_name: string
          avatar: string
          email: string
          role: WorkspaceRole
          member_kind: 'member' | 'external' | 'guest'
          created_at: number
        }
      | undefined
    return row ?? null
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

    const viewGrants = recordGrants
      .filter((row) => row.collection === '/views')
      .map((row) => {
        const sep = row.record_id.indexOf('::')
        return {
          collection: sep > 0 ? row.record_id.slice(0, sep) : '/views',
          view_id: sep > 0 ? row.record_id.slice(sep + 2) : row.record_id,
          role: row.role,
        }
      })

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
        `SELECT workspace_id, owner_account_id FROM resource_policies
         WHERE collection = ? AND record_id = ? LIMIT 1`,
      )
      .get(collection, recordId) as { workspace_id: string; owner_account_id: string } | undefined
    return row ? { workspaceId: row.workspace_id, accountId: row.owner_account_id } : null
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

  updateWorkspace(actorId: string, workspaceId: string, patch: { name?: string; avatar?: string }): Workspace {
    this.requireManager(actorId, workspaceId)
    if (patch.name !== undefined) {
      const trimmed = patch.name.trim()
      if (!trimmed) throw new CollabError('空间名称不能为空', 400)
      if (trimmed.length > 40) throw new CollabError('空间名称不能超过 40 个字符', 400)
      this.db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(trimmed, workspaceId)
    }
    if (patch.avatar !== undefined) {
      const avatar = String(patch.avatar ?? '').trim()
      if (avatar.length > 512_000) throw new CollabError('空间头像图片过大', 400)
      this.db.prepare('UPDATE workspaces SET avatar = ? WHERE id = ?').run(avatar, workspaceId)
    }
    const workspace = this.listWorkspaces(actorId).find((row) => row.id === workspaceId)
    if (!workspace) throw new CollabError('空间不存在', 404)
    return workspace
  }

  renameWorkspace(actorId: string, workspaceId: string, name: string): Workspace {
    return this.updateWorkspace(actorId, workspaceId, { name })
  }

  /** 所有者输入完整空间名称后，硬删除空间及其记录、成员和授权。 */
  deleteWorkspace(actorId: string, workspaceId: string, confirmName: string) {
    this.requireRole(actorId, workspaceId, 'owner')
    const row = this.db.prepare('SELECT name FROM workspaces WHERE id = ?').get(workspaceId) as { name?: string } | undefined
    if (!row) throw new CollabError('空间不存在', 404)
    if (confirmName !== row.name) throw new CollabError('请输入完整的空间名称以确认删除', 400)
    const records = this.db
      .prepare('SELECT collection, record_id FROM resource_policies WHERE workspace_id = ?')
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
    this.authorization.invalidateAll()
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
      this.authorization.invalidateAll()
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
    if (viewId.trim()) throw new CollabError('视图不支持独立访客邀请，请使用访问规则分享', 400)
    const targetResource = { type: 'record' as const, workspaceId, ...this.recordKey(collection, recordId) }
    if (targetResource.collection === '/notices') {
      throw new CollabError('该数据类型仅自己可见，不支持分享', 400)
    }
    if (targetResource.collection === '/comments' || targetResource.collection === '/editor-blocks') {
      throw new CollabError('该衍生数据类型权限跟随源记录，不支持独立分享', 400)
    }
    const effectiveResourceRole: 'viewer' | 'editor' =
      targetResource.collection === '/agents' ? 'viewer' : resourceRole
    const decision = this.authorization.authorize(
      { type: 'account', accountId: actorId, workspaceId },
      'resource:manage-permissions',
      targetResource,
    )
    if (!decision.allowed) throw new CollabError('没有权限', 403)
    const raw = inviteToken()
    const invite = {
      id: id('inv'),
      token: raw,
      workspaceId,
      kind: 'guest' as const,
      collection,
      recordId,
      viewId: '',
      role: effectiveResourceRole,
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
        recordId,
        '',
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
      const grantCollection = invite.collection
      const grantRecordId = invite.record_id
      this.db
        .prepare(
          `INSERT INTO record_grants
            (workspace_id, collection, record_id, subject_type, subject_id, role, granted_by, created_at)
           VALUES (?, ?, ?, 'account', ?, ?, ?, ?)
           ON CONFLICT(workspace_id, collection, record_id, subject_type, subject_id)
           DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by, created_at = excluded.created_at`,
        )
        .run(
          invite.workspace_id,
          grantCollection,
          grantRecordId,
          accountId,
          invite.resource_role,
          invite.created_by,
          now,
        )
      this.authorization.invalidate(invite.workspace_id, grantCollection)
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
                COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), NULLIF(a.email, ''), '未设置') AS name,
                COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), NULLIF(a.email, ''), '') AS display_name,
                COALESCE(m.avatar, '') AS avatar,
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
    options: { transferToAccountId?: string; transferAccessRules?: boolean } = {},
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

    const ownedPolicies = this.db
      .prepare(
        `SELECT collection, record_id, access_mode FROM resource_policies
         WHERE workspace_id = ? AND owner_account_id = ?`,
      )
      .all(workspaceId, accountId) as Array<{ collection: string; record_id: string; access_mode?: string }>
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
      // 2. 清理个人授权与插件分发
      this.db.prepare(
        `DELETE FROM record_grants
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?`,
      ).run(workspaceId, accountId)
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

  /** 将单条记录授权给 `/workspace-members` 管理员锁定视图（动态成员组）。 */
  grantMemberView(
    actorId: string,
    collection: string,
    recordId: string,
    viewId: string,
    role: ResourceRole,
    now = Date.now(),
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireMember(actorId, workspaceId)
    const normalizedViewId = viewId.trim()
    if (!normalizedViewId) throw new CollabError('成员视图不能为空', 400)
    const target = this.resolveRecordTarget(collection, recordId)
    if (target.collection === '/notices') {
      throw new CollabError('该数据类型仅自己可见，不支持分享', 400)
    }
    if (target.collection === '/comments' || target.collection === '/editor-blocks') {
      throw new CollabError('该衍生数据类型权限跟随源记录，不支持独立分享', 400)
    }
    const effectiveRole: ResourceRole = target.collection === '/agents' ? 'viewer' : role
    const owned = this.db
      .prepare('SELECT 1 AS ok FROM resource_policies WHERE workspace_id = ? AND collection = ? AND record_id = ?')
      .get(workspaceId, target.collection, target.recordId) as { ok: number } | undefined
    if (!owned) throw new CollabError('记录不在这个工作区', 404)
    try {
      this.authorization.grant(
        actorId,
        { type: 'record', workspaceId, collection: target.collection, recordId: target.recordId },
        'member_view',
        normalizedViewId,
        effectiveRole,
        now,
      )
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error)
      if (msg.includes('LOCKED_MEMBER_VIEW_REQUIRED')) {
        throw new CollabError('只有管理员锁定的成员视图可以作为动态组授权', 400)
      }
      if (msg.includes('permission denied')) throw new CollabError('没有权限', 403)
      throw new CollabError(msg, 400)
    }
    this.recordActivity({
      workspaceId,
      actorId,
      category: 'access',
      action: 'access.grant',
      collection: target.collection,
      recordId: target.recordId,
      detail: `授权给锁定成员视图 ${normalizedViewId}（${role}）`,
      now,
    })
    return this.accessRows(workspaceId, target.collection, target.recordId)
  }

  /** 统计指定 `/workspace-members` 锁定视图当前被多少条记录动态引用。 */
  memberViewGrantCount(workspaceId: string, viewId: string): number {
    if (!workspaceId || !viewId) return 0
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS cnt FROM record_grants
         WHERE workspace_id = ? AND subject_type = 'member_view' AND subject_id = ?`,
      )
      .get(workspaceId, viewId) as { cnt?: number } | undefined
    return Number(row?.cnt ?? 0)
  }

  /**
   * 解锁或删除已被引用的 `/workspace-members` 锁定视图前，将动态引用固化为此刻命中的成员个人授权快照。
   * 仅 space owner / admin 可执行。
   */
  freezeMemberViewGrants(
    actorId: string,
    workspaceId: string,
    viewId: string,
    memberIds: string[],
    now = Date.now(),
  ) {
    this.requireManager(actorId, workspaceId)
    const normalizedViewId = viewId.trim()
    if (!normalizedViewId) return { frozenRecords: 0, expandedGrants: 0 }
    const refs = this.db
      .prepare(
        `SELECT collection, record_id, role, granted_by
         FROM record_grants
         WHERE workspace_id = ? AND subject_type = 'member_view' AND subject_id = ?`,
      )
      .all(workspaceId, normalizedViewId) as Array<{
      collection: string
      record_id: string
      role: ResourceRole
      granted_by: string
    }>
    if (!refs.length) return { frozenRecords: 0, expandedGrants: 0 }
    const uniqueMembers = [...new Set(memberIds.map((m) => m.trim()).filter(Boolean))]
    let expandedGrants = 0
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const ref of refs) {
        const ownerRow = this.db
          .prepare(
            `SELECT owner_account_id FROM resource_policies
             WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
          )
          .get(workspaceId, ref.collection, ref.record_id) as { owner_account_id?: string } | undefined
        for (const memberId of uniqueMembers) {
          if (ownerRow?.owner_account_id && memberId === ownerRow.owner_account_id) continue
          const existing = this.db
            .prepare(
              `SELECT role FROM record_grants
               WHERE workspace_id = ? AND collection = ? AND record_id = ? AND subject_type = 'account' AND subject_id = ?`,
            )
            .get(workspaceId, ref.collection, ref.record_id, memberId) as { role: string } | undefined
          if (!existing) {
            this.db
              .prepare(
                `INSERT INTO record_grants
                  (workspace_id, collection, record_id, subject_type, subject_id, role, granted_by, created_at)
                 VALUES (?, ?, ?, 'account', ?, ?, ?, ?)`,
              )
              .run(workspaceId, ref.collection, ref.record_id, memberId, ref.role, actorId, now)
            expandedGrants += 1
          } else if ((ROLE_RANK[ref.role] ?? 0) > (ROLE_RANK[existing.role as ResourceRole] ?? 0)) {
            this.db
              .prepare(
                `UPDATE record_grants SET role = ?, granted_by = ?, created_at = ?
                 WHERE workspace_id = ? AND collection = ? AND record_id = ? AND subject_type = 'account' AND subject_id = ?`,
              )
              .run(ref.role, actorId, now, workspaceId, ref.collection, ref.record_id, memberId)
            expandedGrants += 1
          }
        }
      }
      this.db
        .prepare(
          `DELETE FROM record_grants
           WHERE workspace_id = ? AND subject_type = 'member_view' AND subject_id = ?`,
        )
        .run(workspaceId, normalizedViewId)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    this.authorization.invalidateAll()
    return { frozenRecords: refs.length, expandedGrants }
  }

  /** 解锁或删除已被引用的 `/workspace-members` 锁定视图时，直接撤销其全部动态授权引用。 */
  revokeAllMemberViewGrants(actorId: string, workspaceId: string, viewId: string) {
    this.requireManager(actorId, workspaceId)
    const normalizedViewId = viewId.trim()
    if (!normalizedViewId) return { revokedRecords: 0 }
    const res = this.db
      .prepare(
        `DELETE FROM record_grants
         WHERE workspace_id = ? AND subject_type = 'member_view' AND subject_id = ?`,
      )
      .run(workspaceId, normalizedViewId)
    this.authorization.invalidateAll()
    return { revokedRecords: Number(res.changes) }
  }

  workspaceOwnerId(workspaceId: string): string | null {
    if (!workspaceId) return null
    const row = this.db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').get(workspaceId) as
      | { owner_id?: string }
      | undefined
    return row?.owner_id?.trim() || null
  }

  workspaceProfile(actorId: string) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireMember(actorId, workspaceId)
    const row = this.db
      .prepare(
        `SELECT a.name AS account_name, a.email AS login_email, m.display_name, m.avatar
         FROM workspace_members m
         JOIN accounts a ON a.id = m.account_id
         WHERE m.workspace_id = ? AND m.account_id = ?`,
      )
      .get(workspaceId, actorId) as { account_name: string | null; login_email: string | null; display_name: string; avatar: string } | undefined
    if (!row) throw new CollabError('不在这个工作区', 403)
    const email = row.login_email ?? ''
    const fallbackName = String(row.account_name ?? '').trim() || email
    return {
      workspaceId,
      accountId: actorId,
      email,
      name: row.display_name.trim(),
      fallbackName,
      avatar: row.avatar ?? '',
    }
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

  /** 读取指定工作区成员用于公开分享页展示的昵称与头像（不暴露邮箱等私密信息）。 */
  publicMemberProfile(workspaceId: string, accountId: string): { accountId: string; name: string; avatar: string } | null {
    const id = String(accountId ?? '').trim()
    if (!id) return null
    const ws = String(workspaceId ?? '').trim()
    if (ws) {
      const row = this.db
        .prepare(
          `SELECT COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), NULLIF(a.email, ''), '') AS name,
                  COALESCE(NULLIF(m.avatar, ''), '') AS avatar
           FROM workspace_members m
           JOIN accounts a ON a.id = m.account_id
           WHERE m.workspace_id = ? AND m.account_id = ?`,
        )
        .get(ws, id) as { name: string; avatar: string } | undefined
      if (row) return { accountId: id, name: row.name.trim(), avatar: row.avatar.trim() }
    }
    const account = this.db
      .prepare(
        `SELECT COALESCE(NULLIF(name, ''), NULLIF(email, ''), '') AS name,
                COALESCE(NULLIF(avatar, ''), '') AS avatar
         FROM accounts WHERE id = ?`,
      )
      .get(id) as { name: string; avatar: string } | undefined
    return account ? { accountId: id, name: account.name.trim(), avatar: account.avatar.trim() } : null
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

  private sanitizeViewOrder(raw: unknown): Record<string, string[]> {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
    const out: Record<string, string[]> = {}
    let tableCount = 0
    for (const [rawPath, rawIds] of Object.entries(raw as Record<string, unknown>)) {
      if (tableCount >= 128) break
      const path = String(rawPath ?? '').trim()
      if (!path || !Array.isArray(rawIds)) continue
      const seen = new Set<string>()
      const ids: string[] = []
      for (const item of rawIds) {
        const id = String(item ?? '').trim()
        if (!id || seen.has(id)) continue
        seen.add(id)
        ids.push(id)
        if (ids.length >= 200) break
      }
      if (ids.length > 0) {
        out[path] = ids
        tableCount += 1
      }
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
      viewOrder: {} as Record<string, string[]>,
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
        viewOrder: this.sanitizeViewOrder(parsed.viewOrder),
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
      viewOrder?: unknown
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
    const viewOrder =
      patch.viewOrder !== undefined
        ? { ...current.viewOrder, ...this.sanitizeViewOrder(patch.viewOrder) }
        : current.viewOrder
    const next = {
      starredViews: patch.starredViews !== undefined ? this.sanitizeStarredViews(patch.starredViews) : current.starredViews,
      starredRecords:
        patch.starredRecords !== undefined ? this.sanitizeStarredRecords(patch.starredRecords) : current.starredRecords,
      pinnedAgents: patch.pinnedAgents !== undefined ? this.sanitizePinnedAgents(patch.pinnedAgents) : current.pinnedAgents,
      viewOrder,
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
  upsertPulledWorkspace(input: { accountId: string; id: string; name: string; avatar?: string; ownerId?: string; role?: string; createdAt?: number }) {
    const id = input.id.trim()
    if (!id || id === this.homeWorkspaceId()) return
    const name = input.name.trim() || '在线'
    const now = input.createdAt || Date.now()
    const existing = this.db.prepare('SELECT id FROM workspaces WHERE id = ?').get(id) as { id: string } | undefined
    if (!existing) {
      try {
        this.db
          .prepare('INSERT INTO workspaces (id, name, owner_id, created_at, avatar) VALUES (?, ?, ?, ?, ?)')
          .run(id, name, input.ownerId || input.accountId, now, input.avatar ?? '')
      } catch {
        this.db
          .prepare('INSERT INTO workspaces (id, name, owner_id, created_at) VALUES (?, ?, ?, ?)')
          .run(id, name, input.ownerId || input.accountId, now)
      }
    } else {
      if (input.avatar !== undefined) {
        try {
          this.db.prepare('UPDATE workspaces SET name = ?, avatar = ? WHERE id = ?').run(name, input.avatar, id)
        } catch {
          this.db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, id)
        }
      } else {
        this.db.prepare('UPDATE workspaces SET name = ? WHERE id = ?').run(name, id)
      }
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
    let rows: Array<{ id: string; name: string; avatar?: string; owner_id: string; created_at: number; role: WorkspaceRole }> = []
    try {
      rows = this.db
        .prepare(
          `SELECT w.id, w.name, COALESCE(w.avatar, '') AS avatar, w.owner_id, w.created_at, m.role
           FROM workspace_members m
           JOIN workspaces w ON w.id = m.workspace_id
           WHERE m.account_id = ?
           ORDER BY w.created_at`,
        )
        .all(accountId) as Array<{ id: string; name: string; avatar?: string; owner_id: string; created_at: number; role: WorkspaceRole }>
    } catch {
      rows = this.db
        .prepare(
          `SELECT w.id, w.name, w.owner_id, w.created_at, m.role
           FROM workspace_members m
           JOIN workspaces w ON w.id = m.workspace_id
           WHERE m.account_id = ?
           ORDER BY w.created_at`,
        )
        .all(accountId) as Array<{ id: string; name: string; owner_id: string; created_at: number; role: WorkspaceRole }>
    }
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      ...(row.avatar ? { avatar: row.avatar } : {}),
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

  /** 只返回这个账号有权阅读的变更。桌面端拉取用这个，避免把同空间其他人的私有记录带下去。 */

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
    const person = this.workspacePerson(actorId)
    return {
      workspaceId,
      accountId: actorId,
      name: person?.name || account.name,
      collection,
      recordId,
      seenAt: now,
    }
  }

  presence(actorId: string, workspaceId: string, now = Date.now()): PresenceRow[] {
    this.requireMember(actorId, workspaceId)
    const rows = this.db
      .prepare(
        `SELECT p.workspace_id, p.account_id, COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), NULLIF(a.email, ''), '未设置') AS name, p.collection, p.record_id, p.seen_at
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
      .prepare('SELECT workspace_id, collection, record_id FROM resource_policies')
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

  accountActiveWorkspace(accountId: string) {
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
      .prepare('SELECT record_id FROM resource_policies WHERE workspace_id = ? AND collection = ?')
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
        `SELECT workspace_id FROM resource_policies
         WHERE collection = ? AND record_id = ? AND workspace_id != ? LIMIT 1`,
      )
      .get(collection, recordId, workspaceId) as { workspace_id?: string } | undefined
    if (elsewhere) throw new CollabError('这条记录已经属于另一个空间', 409)
    this.authorization.attach(
      { type: 'account', accountId: recordOwner, workspaceId },
      { type: 'record', workspaceId, collection, recordId },
      policy,
      now,
    )
  }

  /** 以显式 owner 挂载记录归属与策略（用于 /views 视图创建与默认种子视图懒初始化）。 */
  attachAs(
    workspaceId: string,
    collection: string,
    recordId: string,
    ownerAccountId: string,
    policy: ResourcePolicyInput = {},
    now = Date.now(),
  ) {
    if (!workspaceId || !collection || !recordId) return
    const ownerRow = this.db.prepare('SELECT owner_id FROM workspaces WHERE id = ?').get(workspaceId) as
      | { owner_id: string }
      | undefined
    if (!ownerRow) return
    const recordOwner = ownerAccountId.trim() || ownerRow.owner_id
    if (!recordOwner) return
    this.authorization.attach(
      { type: 'account', accountId: recordOwner, workspaceId },
      { type: 'record', workspaceId, collection, recordId },
      policy,
      now,
    )
  }

  /** 移除记录在工作区内的归属、策略与定向授权（用于删除视图等硬删场景）。 */
  detachRecord(workspaceId: string, collection: string, recordId: string) {
    if (!workspaceId || !collection || !recordId) return
    this.db
      .prepare('DELETE FROM record_grants WHERE workspace_id = ? AND collection = ? AND record_id = ?')
      .run(workspaceId, collection, recordId)
    this.db
      .prepare('DELETE FROM resource_policies WHERE workspace_id = ? AND collection = ? AND record_id = ?')
      .run(workspaceId, collection, recordId)
    this.authorization.invalidate(workspaceId, collection)
  }

  private directExternalRecordIds(workspaceId: string, collection: string): Set<string> {
    if (!workspaceId || !collection) return new Set()
    const rows = this.db
      .prepare(
        `SELECT DISTINCT g.record_id
         FROM record_grants g
         JOIN workspace_members m
           ON m.workspace_id = g.workspace_id AND m.account_id = g.subject_id
         WHERE g.workspace_id = ? AND g.collection = ?
           AND g.subject_type = 'account'
           AND m.member_kind IN ('external', 'guest')`,
      )
      .all(workspaceId, collection) as Array<{ record_id: string }>
    return new Set(rows.map((r) => r.record_id))
  }

  /** 查询某集合内存在外部/访客协作者授权的 record_id 集合（正交外部标记）。 */
  collectionExternalSharedIds(workspaceId: string, collection: string): Set<string> {
    return this.directExternalRecordIds(workspaceId, collection)
  }

  canReadRecord(collection: string, recordId: string, record?: Record<string, unknown>, actorId?: string) {
    const caller = actorId || currentAccountId()
    const workspaceId = this.activeWorkspaceId()
    if (getRuntimePolicy().authzMode === 'rbac' && (!caller || !workspaceId)) return false
    if (!caller || !workspaceId) return true
    return this.authorization.authorize(
      { type: 'account', accountId: caller, workspaceId },
      'resource:read',
      { type: 'record', workspaceId, collection, recordId, ...(record ? { record } : {}) },
    ).allowed
  }

  private resolveRecordTarget(collection: string, recordId: string): { collection: string; recordId: string } {
    const col = collection.trim()
    const idPart = recordId.trim()
    if ((col === '/data' || col === '/trash') && idPart.includes('::')) {
      const sep = idPart.indexOf('::')
      const table = idPart.slice(0, sep).trim().replace(/^\/+/, '')
      const source = idPart.slice(sep + 2).trim()
      if (table && source) return { collection: `/${table}`, recordId: source }
    }
    return { collection: col, recordId: idPart }
  }

  recordAccess(actorId: string, collection: string, recordId: string, record?: Record<string, unknown>) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireMember(actorId, workspaceId)
    const target = this.resolveRecordTarget(collection, recordId)
    if (!this.canReadRecord(target.collection, target.recordId, record, actorId)) {
      throw new CollabError('没有权限', 403)
    }
    const resource = {
      type: 'record' as const,
      workspaceId,
      collection: target.collection,
      recordId: target.recordId,
      ...(record ? { record } : {}),
    }
    const actorObj = { type: 'account' as const, accountId: actorId, workspaceId }
    const canManage = this.authorization.authorize(actorObj, 'resource:manage-permissions', resource).allowed
    const readDecision = this.authorization.authorize(actorObj, 'resource:read', resource)
    const effectiveRole = readDecision.allowed ? readDecision.effectiveRole : undefined
    const inheritance = this.authorization.inheritanceInfo(resource)
    const base = this.accessRows(workspaceId, target.collection, target.recordId)
    const ancestors = inheritance.ancestors.map((ancestor) => ({
      ...ancestor,
      ...this.accessRows(workspaceId, ancestor.collection, ancestor.recordId),
    }))
    let effectiveScope = base.scope
    let effectiveHasExternalCollaborator = base.hasExternalCollaborator
    if (inheritance.mode === 'inherit' && ancestors.length > 0) {
      if (effectiveScope !== 'workspace' && ancestors.some((a) => a.scope === 'workspace')) {
        effectiveScope = 'workspace'
      } else if (
        effectiveScope === 'personal' &&
        ancestors.some(
          (a) =>
            a.scope === 'shared' ||
            a.people.some((p) => p.id !== a.ownerId) ||
            a.memberViews.length > 0,
        )
      ) {
        effectiveScope = 'shared'
      }
      if (!effectiveHasExternalCollaborator && ancestors.some((a) => a.hasExternalCollaborator)) {
        effectiveHasExternalCollaborator = true
      }
    }
    return {
      ...base,
      private: effectiveScope === 'personal',
      scope: effectiveScope,
      hasExternalCollaborator: effectiveHasExternalCollaborator,
      canManage,
      ...(effectiveRole ? { effectiveRole } : {}),
      people: base.people.map((row) => {
        const editable = Boolean(canManage && row.role !== 'owner' && row.id !== base.ownerId && row.id !== actorId)
        return { ...row, canEdit: editable, canRevoke: editable }
      }),
      memberViews: base.memberViews.map((row) => ({
        ...row,
        canEdit: canManage,
        canRevoke: canManage,
      })),
      currentAccountId: actorId,
      roleChain: this.authorization.roleChain(actorId, resource),
      inheritance: {
        mode: inheritance.mode,
        hasParent: inheritance.hasParent,
        parent: inheritance.parent,
        ancestors,
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
    const target = this.resolveRecordTarget(collection, recordId)
    const resource = { type: 'record' as const, workspaceId, collection: target.collection, recordId: target.recordId }
    try {
      this.authorization.setInheritanceMode({ type: 'account', accountId: actorId, workspaceId }, resource, mode)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('permission denied')) throw new CollabError('没有权限', 403)
      throw new CollabError(message, 400)
    }
    this.recordActivity({
      workspaceId,
      actorId,
      category: 'access',
      action: 'access.inherit',
      collection: target.collection,
      recordId: target.recordId,
      detail: mode === 'inherit' ? '开启继承上级权限' : '断开上级继承，改为独立权限',
    })
    return this.recordAccess(actorId, target.collection, target.recordId)
  }

  /**
   * 校验将某个 `/views` 视图从空间全员（members）切回仅受邀（private）时，
   * 该表在 `saved_views` 中仍至少保留 1 个有效的空间视图（忽略已删除旧视图残留的幽灵策略行）。
   */
  private assertWorkspaceViewRemainsForPrivatize(workspaceId: string, recordId: string) {
    const sep = recordId.indexOf('::')
    if (sep <= 0) return
    const tableName = recordId.slice(0, sep)
    const tablePrefix = `${tableName}::`
    const collectionPath = `/${tableName}`
    const current = this.db
      .prepare(
        `SELECT access_mode FROM resource_policies
         WHERE workspace_id = ? AND collection = '/views' AND record_id = ?`,
      )
      .get(workspaceId, recordId) as { access_mode?: string } | undefined
    if (current?.access_mode !== 'members') return

    let hasSavedViewsForTable = false
    try {
      hasSavedViewsForTable = Boolean(
        this.db
          .prepare(
            `SELECT 1 AS ok FROM saved_views
             WHERE (workspace_id = ? OR workspace_id = '') AND collection = ?
             LIMIT 1`,
          )
          .get(workspaceId, collectionPath),
      )
    } catch {
      hasSavedViewsForTable = false
    }

    const row = hasSavedViewsForTable
      ? (this.db
          .prepare(
            `SELECT COUNT(DISTINCT p.record_id) AS cnt
             FROM resource_policies p
             JOIN saved_views v
               ON (v.workspace_id = p.workspace_id OR v.workspace_id = '')
              AND v.collection = ?
              AND substr(p.record_id, ?) = v.view_id
             WHERE p.workspace_id = ?
               AND p.collection = '/views'
               AND substr(p.record_id, 1, ?) = ?
               AND p.access_mode = 'members'`,
          )
          .get(collectionPath, tablePrefix.length + 1, workspaceId, tablePrefix.length, tablePrefix) as
          | { cnt?: number }
          | undefined)
      : (this.db
          .prepare(
            `SELECT COUNT(*) AS cnt FROM resource_policies
             WHERE workspace_id = ? AND collection = '/views'
               AND substr(record_id, 1, ?) = ?
               AND access_mode = 'members'`,
          )
          .get(workspaceId, tablePrefix.length, tablePrefix) as { cnt?: number } | undefined)

    if (Number(row?.cnt ?? 0) <= 1) {
      throw new CollabError('至少保留一个空间视图', 400)
    }
  }

  setRecordAccessMode(
    actorId: string,
    collection: string,
    recordId: string,
    accessMode: 'private' | 'members',
    memberDefaultRole?: 'viewer' | 'editor',
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireMember(actorId, workspaceId)
    const target = this.resolveRecordTarget(collection, recordId)
    if (target.collection === '/notices') {
      throw new CollabError('该数据类型仅自己可见，不支持分享', 400)
    }
    if (target.collection === '/comments' || target.collection === '/editor-blocks') {
      throw new CollabError('该衍生数据类型权限跟随源记录，不支持独立分享', 400)
    }
    const effectiveDefaultRole: 'viewer' | 'editor' | undefined =
      target.collection === '/agents' && accessMode === 'members' ? 'viewer' : memberDefaultRole
    if (target.collection === '/views' && accessMode === 'private') {
      this.assertWorkspaceViewRemainsForPrivatize(workspaceId, target.recordId)
    }
    const resource = { type: 'record' as const, workspaceId, collection: target.collection, recordId: target.recordId }
    try {
      this.authorization.setAccessMode(
        { type: 'account', accountId: actorId, workspaceId },
        resource,
        accessMode,
        effectiveDefaultRole,
      )
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      if (message.includes('permission denied')) throw new CollabError('没有权限', 403)
      throw new CollabError(message, 400)
    }
    this.recordActivity({
      workspaceId,
      actorId,
      category: 'access',
      action: 'access.mode',
      collection: target.collection,
      recordId: target.recordId,
      detail: accessMode === 'private' ? '切换为仅受邀人员可见' : '切换为空间全员可见',
    })
    return this.recordAccess(actorId, collection, recordId)
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
    const target = this.resolveRecordTarget(collection, recordId)
    if (target.collection === '/notices') {
      throw new CollabError('该数据类型仅自己可见，不支持分享', 400)
    }
    if (target.collection === '/comments' || target.collection === '/editor-blocks') {
      throw new CollabError('该衍生数据类型权限跟随源记录，不支持独立分享', 400)
    }
    const effectiveRole: ResourceRole = target.collection === '/agents' ? 'viewer' : role
    const owned = this.db
      .prepare('SELECT 1 AS ok FROM resource_policies WHERE workspace_id = ? AND collection = ? AND record_id = ?')
      .get(workspaceId, target.collection, target.recordId) as { ok: number } | undefined
    if (!owned) throw new CollabError('记录不在这个工作区', 404)
    const normalized = email.trim().toLowerCase()
    if (!normalized) throw new CollabError('邮箱不能为空', 400)
    const account = this.db.prepare('SELECT id FROM accounts WHERE email = ?').get(normalized) as { id: string } | undefined
    if (!account) throw new CollabError('没有这个邮箱，对方需要先注册', 404)
    const resource = { type: 'record' as const, workspaceId, collection: target.collection, recordId: target.recordId }
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
    this.authorization.grant(actorId, resource, 'account', account.id, effectiveRole, now)
    this.recordActivity({
      workspaceId,
      actorId,
      category: 'access',
      action: 'access.grant',
      collection: target.collection,
      recordId: target.recordId,
      detail: `授权给 ${normalized}（${effectiveRole}）`,
      now,
    })
    return this.accessRows(workspaceId, target.collection, target.recordId)
  }

  revokeRecordGrant(
    actorId: string,
    collection: string,
    recordId: string,
    subjectType: 'account' | 'member_view',
    subjectId: string,
  ) {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    const target = this.resolveRecordTarget(collection, recordId)
    const resource = { type: 'record' as const, workspaceId, collection: target.collection, recordId: target.recordId }
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
      .get(workspaceId, target.collection, target.recordId) as { owner_account_id?: string } | undefined
    if (subjectType === 'account' && subjectId === policy?.owner_account_id) {
      throw new CollabError('不能移除数据创建者', 400)
    }
    if (subjectType === 'account' && subjectId === actorId) {
      throw new CollabError('不能移除自己的权限', 400)
    }
    const removed = this.db
      .prepare(
        `DELETE FROM record_grants
         WHERE workspace_id = ? AND collection = ? AND record_id = ?
           AND subject_type = ? AND subject_id = ?`,
      )
      .run(workspaceId, target.collection, target.recordId, subjectType, subjectId)
    if (!removed.changes) throw new CollabError('协作者不存在', 404)
    if (subjectType === 'account') this.cleanupExternalMembership(workspaceId, subjectId)
    this.authorization.invalidate(workspaceId, target.collection)
    this.recordActivity({
      workspaceId,
      actorId,
      category: 'access',
      action: 'access.revoke',
      collection: target.collection,
      recordId: target.recordId,
      detail: `移除了协作者权限（${subjectType}）`,
    })
    return this.accessRows(workspaceId, target.collection, target.recordId)
  }

  /**
   * 预加载主集合的 `resource_policies`，并为跨集合父子继承提供按需懒查与环路保护的记忆化 DFS 求解器。
   */
  private createCollectionPolicyGraph(workspaceId: string, collection: string) {
    type PolicySummary = {
      record_id: string
      access_mode: string
      owner_account_id: string
      parent_collection: string
      parent_record_id: string
    }
    const policies = this.db
      .prepare(
        `SELECT record_id, access_mode, owner_account_id, parent_collection, parent_record_id
         FROM resource_policies
         WHERE workspace_id = ? AND collection = ?`,
      )
      .all(workspaceId, collection) as PolicySummary[]
    const policyById = new Map(policies.map((row) => [row.record_id, row]))
    const crossPolicyCache = new Map<string, PolicySummary | null>()

    const getPolicy = (col: string, recId: string): PolicySummary | null => {
      if (col === collection) return policyById.get(recId) ?? null
      const key = `${col}\t${recId}`
      if (crossPolicyCache.has(key)) return crossPolicyCache.get(key) ?? null
      const row = this.db
        .prepare(
          `SELECT record_id, access_mode, owner_account_id, parent_collection, parent_record_id
           FROM resource_policies
           WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
        )
        .get(workspaceId, col, recId) as PolicySummary | undefined
      const found = row ?? null
      crossPolicyCache.set(key, found)
      return found
    }

    const createResolver = <T>(
      fallbackOnCycle: T,
      evaluate: (
        col: string,
        recId: string,
        policy: PolicySummary | null,
        resolveParent: (parentCol: string, parentId: string) => T,
      ) => T,
    ) => {
      const memo = new Map<string, T>()
      const walk = (col: string, recId: string, visiting = new Set<string>(), depth = 0): T => {
        const key = `${col}\t${recId}`
        if (memo.has(key)) return memo.get(key)!
        if (visiting.has(key) || depth > 64) return fallbackOnCycle
        visiting.add(key)
        const value = evaluate(col, recId, getPolicy(col, recId), (parentCol, parentId) =>
          walk(parentCol, parentId, visiting, depth + 1),
        )
        visiting.delete(key)
        memo.set(key, value)
        return value
      }
      return walk
    }

    return { policies, policyById, getPolicy, createResolver }
  }

  /** Notion 对齐三态内部域：'workspace'（空间全员） / 'shared'（仅受邀协作者，不论内外，含继承链） / 'personal'（仅创建者）。 */
  collectionOwnership(workspaceId: string, collection: string) {
    const { policies, policyById, createResolver } = this.createCollectionPolicyGraph(workspaceId, collection)

    const grants = this.db
      .prepare(
        `SELECT record_id, subject_type, subject_id
         FROM record_grants
         WHERE workspace_id = ? AND collection = ?`,
      )
      .all(workspaceId, collection) as Array<{ record_id: string; subject_type: string; subject_id: string }>
    const directSharedIds = new Set<string>()
    for (const grant of grants) {
      const ownerId = policyById.get(grant.record_id)?.owner_account_id ?? ''
      if (grant.subject_type === 'account' && ownerId && grant.subject_id === ownerId) continue
      directSharedIds.add(grant.record_id)
    }

    const crossSharedCache = new Map<string, boolean>()
    const hasDirectGrant = (col: string, recId: string, ownerId: string): boolean => {
      if (col === collection) return directSharedIds.has(recId)
      const key = `${col}\t${recId}`
      if (crossSharedCache.has(key)) return crossSharedCache.get(key)!
      const rows = this.db
        .prepare(
          `SELECT subject_type, subject_id FROM record_grants
           WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
        )
        .all(workspaceId, col, recId) as Array<{ subject_type: string; subject_id: string }>
      const shared = rows.some((g) => !(g.subject_type === 'account' && ownerId && g.subject_id === ownerId))
      crossSharedCache.set(key, shared)
      return shared
    }

    const resolveScope = createResolver<'personal' | 'workspace' | 'shared'>(
      'personal',
      (col, recId, policy, resolveParent) => {
        if (!policy) {
          return hasDirectGrant(col, recId, '') ? 'shared' : 'personal'
        }
        if (policy.access_mode === 'members') return 'workspace'
        if (policy.access_mode === 'inherit' && policy.parent_record_id) {
          const parentScope = resolveParent(policy.parent_collection || col, policy.parent_record_id)
          if (parentScope === 'workspace') return 'workspace'
          if (parentScope === 'shared' || hasDirectGrant(col, recId, policy.owner_account_id)) return 'shared'
          return 'personal'
        }
        return hasDirectGrant(col, recId, policy.owner_account_id) ? 'shared' : 'personal'
      },
    )

    const map = new Map<string, 'personal' | 'workspace' | 'shared'>()
    for (const row of policies) {
      map.set(row.record_id, resolveScope(collection, row.record_id))
    }
    return map
  }

  /** 返回该集合下存在外部协作者/访客授权的记录 ID 集合（含继承链，正交外部标记，不覆盖内部三态）。 */
  collectionExternalCollaborators(workspaceId: string, collection: string): Set<string> {
    const directSet = this.directExternalRecordIds(workspaceId, collection)
    const { policies, createResolver } = this.createCollectionPolicyGraph(workspaceId, collection)
    const crossExtCache = new Map<string, boolean>()

    const hasDirectExternal = (col: string, recId: string): boolean => {
      if (col === collection) return directSet.has(recId)
      const key = `${col}\t${recId}`
      if (crossExtCache.has(key)) return crossExtCache.get(key)!
      const hit = Boolean(
        this.db
          .prepare(
            `SELECT 1 FROM record_grants g
             JOIN workspace_members m
               ON g.subject_type = 'account'
              AND m.workspace_id = g.workspace_id
              AND m.account_id = g.subject_id
              AND m.member_kind IN ('external', 'guest')
             WHERE g.workspace_id = ? AND g.collection = ? AND g.record_id = ?
             LIMIT 1`,
          )
          .get(workspaceId, col, recId),
      )
      crossExtCache.set(key, hit)
      return hit
    }

    const hasExternalOn = createResolver<boolean>(false, (col, recId, policy, resolveParent) => {
      if (hasDirectExternal(col, recId)) return true
      if (policy?.access_mode === 'inherit' && policy.parent_record_id) {
        return resolveParent(policy.parent_collection || col, policy.parent_record_id)
      }
      return false
    })

    const out = new Set<string>(directSet)
    for (const p of policies) {
      if (p.access_mode === 'inherit' && p.parent_record_id && hasExternalOn(collection, p.record_id)) {
        out.add(p.record_id)
      }
    }
    return out
  }

  /** 查询单条记录的继承配置与祖先链（从顶层祖先到直接父级），不要求当前账号必须先调用 recordAccess。 */
  recordInheritance(workspaceId: string, collection: string, recordId: string) {
    const target = this.resolveRecordTarget(collection, recordId)
    return this.authorization.inheritanceInfo({
      type: 'record',
      workspaceId,
      collection: target.collection,
      recordId: target.recordId,
    })
  }

  /**
   * 批量解析集合内所有处于 `access_mode = 'inherit'` 的记录，沿继承链向上找到最近的命中 `directKeys` 的祖先。
   * 用于公开链接等随统一继承开关向下传递的能力（不计入本条自身，仅返回继承来源）。
   * `directKeys` 的元素格式为 `${collection}\t${recordId}`。
   */
  collectionInheritedSources(
    workspaceId: string,
    collection: string,
    directKeys: ReadonlySet<string>,
  ): Map<string, { collection: string; recordId: string }> {
    const out = new Map<string, { collection: string; recordId: string }>()
    if (!directKeys.size) return out
    const { policies, createResolver } = this.createCollectionPolicyGraph(workspaceId, collection)

    const findHitOrAncestor = createResolver<{ collection: string; recordId: string } | null>(
      null,
      (col, recId, policy, resolveParent) => {
        if (directKeys.has(`${col}\t${recId}`)) return { collection: col, recordId: recId }
        if (policy?.access_mode === 'inherit' && policy.parent_record_id) {
          return resolveParent(policy.parent_collection || col, policy.parent_record_id)
        }
        return null
      },
    )

    for (const p of policies) {
      if (p.access_mode !== 'inherit' || !p.parent_record_id) continue
      const source = findHitOrAncestor(
        p.parent_collection || collection,
        p.parent_record_id,
        new Set([`${collection}\t${p.record_id}`]),
        1,
      )
      if (source) out.set(p.record_id, source)
    }
    return out
  }

  /**
   * 从指定根记录出发，按 BFS 枚举所有处于有效 `access_mode = 'inherit'` 链上的后代记录。
   * 任意节点关闭继承（private / members）即截断该分支，绝不返回其本身及其后代。
   */
  collectInheritingDescendants(
    workspaceId: string,
    collection: string,
    rootRecordId: string,
    maxCount = 2000,
  ): Array<{ collection: string; recordId: string; parentCollection: string; parentRecordId: string }> {
    const out: Array<{ collection: string; recordId: string; parentCollection: string; parentRecordId: string }> = []
    const visited = new Set<string>([`${collection}\t${rootRecordId}`])
    const queue: Array<{ collection: string; recordId: string }> = [{ collection, recordId: rootRecordId }]
    const stmt = this.db.prepare(
      `SELECT collection, record_id, parent_collection, parent_record_id
       FROM resource_policies
       WHERE workspace_id = ?
         AND access_mode = 'inherit'
         AND parent_record_id = ?
         AND (parent_collection = ? OR (parent_collection = '' AND collection = ?))`,
    )
    while (queue.length > 0 && out.length < maxCount) {
      const current = queue.shift()!
      const children = stmt.all(
        workspaceId,
        current.recordId,
        current.collection,
        current.collection,
      ) as Array<{ collection: string; record_id: string; parent_collection: string; parent_record_id: string }>
      for (const child of children) {
        const key = `${child.collection}\t${child.record_id}`
        if (visited.has(key)) continue
        visited.add(key)
        out.push({
          collection: child.collection,
          recordId: child.record_id,
          parentCollection: child.parent_collection || current.collection,
          parentRecordId: child.parent_record_id,
        })
        if (out.length >= maxCount) break
        queue.push({ collection: child.collection, recordId: child.record_id })
      }
    }
    return out
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

  /** 预览批量静态授权：统计总目标数、当前用户可管理记录数与将跳过的无权记录数。 */
  previewBatchRecordPermissions(
    actorId: string,
    collection: string,
    recordIds: string[],
  ): BatchPermissionPreviewResult {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireMember(actorId, workspaceId)
    const normalizedCol = collection.trim()
    if (!normalizedCol.startsWith('/')) throw new CollabError('集合路径不合法', 400)
    const uniqueIds = [...new Set(recordIds.map((item) => String(item ?? '').trim()).filter(Boolean))]
    if (!uniqueIds.length) {
      return { collection: normalizedCol, totalCount: 0, manageableCount: 0, skippedCount: 0, manageableIds: [] }
    }
    const actor = { type: 'account' as const, accountId: actorId, workspaceId }
    this.authorization.preloadCollection(workspaceId, normalizedCol, actorId)
    try {
      const manageableIds: string[] = []
      for (const rawId of uniqueIds) {
        const target = this.resolveRecordTarget(normalizedCol, rawId)
        const allowed = this.authorization.authorize(actor, 'resource:manage-permissions', {
          type: 'record',
          workspaceId,
          collection: target.collection,
          recordId: target.recordId,
        }).allowed
        if (allowed) manageableIds.push(rawId)
      }
      return {
        collection: normalizedCol,
        totalCount: uniqueIds.length,
        manageableCount: manageableIds.length,
        skippedCount: uniqueIds.length - manageableIds.length,
        manageableIds,
      }
    } finally {
      this.authorization.releaseCollection(workspaceId, normalizedCol, actorId)
    }
  }

  /**
   * 单事务批量静态授权：仅对当前操作者具备 resource:manage-permissions 的记录生效，其余自动跳过。
   * 支持增量叠加协作者（不覆写原协作者）、批量移除协作者、批量切换通用访问（private / members）。
   */
  batchUpdateRecordPermissions(
    actorId: string,
    input: BatchPermissionApplyInput,
    now = Date.now(),
  ): BatchPermissionApplyResult {
    const workspaceId = this.activeWorkspaceId()
    if (!workspaceId) throw new CollabError('没有工作区', 400)
    this.requireMember(actorId, workspaceId)
    const normalizedCol = input.collection.trim()
    if (!normalizedCol.startsWith('/')) throw new CollabError('集合路径不合法', 400)
    if (normalizedCol === '/notices') {
      throw new CollabError('该数据类型仅自己可见，不支持分享', 400)
    }
    if (normalizedCol === '/comments' || normalizedCol === '/editor-blocks') {
      throw new CollabError('该衍生数据类型权限跟随源记录，不支持独立分享', 400)
    }
    if (normalizedCol === '/agents') {
      if (input.mode === 'grant') input = { ...input, role: 'viewer' }
      if (input.mode === 'access_mode' && input.accessMode === 'members') {
        input = { ...input, memberDefaultRole: 'viewer' }
      }
    }
    const uniqueIds = [...new Set((input.recordIds ?? []).map((item) => String(item ?? '').trim()).filter(Boolean))]
    if (!uniqueIds.length) {
      return { collection: normalizedCol, totalCount: 0, updatedCount: 0, skippedCount: 0, updatedIds: [] }
    }
    const actor = { type: 'account' as const, accountId: actorId, workspaceId }
    const subjects: BatchPermissionSubject[] = (input.subjects ?? [])
      .map((s) => ({ subjectType: s.subjectType, subjectId: String(s.subjectId ?? '').trim() }))
      .filter(
        (s): s is BatchPermissionSubject =>
          (s.subjectType === 'account' || s.subjectType === 'member_view') && Boolean(s.subjectId),
      )

    if (input.mode === 'grant') {
      if (!subjects.length) throw new CollabError('请至少选择一个协作者或成员视图', 400)
      if (!input.role || !['viewer', 'commenter', 'editor', 'manager'].includes(input.role)) {
        throw new CollabError('不支持的权限角色', 400)
      }
      for (const s of subjects) {
        if (s.subjectType === 'member_view' && !this.authorization.isLockedMemberView(workspaceId, s.subjectId)) {
          throw new CollabError('只有管理员锁定的成员视图可以作为动态组授权', 400)
        }
      }
    } else if (input.mode === 'revoke') {
      if (!subjects.length) throw new CollabError('请至少选择一个要移除的协作者或成员视图', 400)
    } else if (input.mode === 'access_mode') {
      if (input.accessMode !== 'private' && input.accessMode !== 'members') {
        throw new CollabError('不支持的访问模式', 400)
      }
    } else {
      throw new CollabError('不支持的批量授权动作', 400)
    }

    const touchedCollections = new Set<string>([normalizedCol])
    const updatedIds: string[] = []
    const revokedAccountIds = new Set<string>()
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const rawId of uniqueIds) {
        const target = this.resolveRecordTarget(normalizedCol, rawId)
        const resource = {
          type: 'record' as const,
          workspaceId,
          collection: target.collection,
          recordId: target.recordId,
        }
        const decision = this.authorization.authorize(actor, 'resource:manage-permissions', resource)
        if (!decision.allowed) continue

        if (input.mode === 'access_mode') {
          try {
            if (target.collection === '/views' && input.accessMode === 'private') {
              this.assertWorkspaceViewRemainsForPrivatize(workspaceId, target.recordId)
            }
            this.authorization.setAccessMode(
              actor,
              resource,
              input.accessMode!,
              input.memberDefaultRole,
              { skipInvalidate: true },
            )
            touchedCollections.add(target.collection)
            updatedIds.push(rawId)
          } catch {
            continue
          }
          continue
        }

        const policyRow = this.db
          .prepare(
            `SELECT owner_account_id FROM resource_policies
             WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
          )
          .get(workspaceId, target.collection, target.recordId) as { owner_account_id?: string } | undefined
        const ownerId = policyRow?.owner_account_id ?? ''
        let recordChanged = false

        for (const subject of subjects) {
          if (subject.subjectType === 'account' && (subject.subjectId === ownerId || subject.subjectId === actorId)) {
            continue
          }
          if (input.mode === 'grant') {
            try {
              this.authorization.grant(
                actorId,
                resource,
                subject.subjectType,
                subject.subjectId,
                input.role!,
                now,
                { skipInvalidate: true },
              )
              recordChanged = true
            } catch {
              /* 跳过违反防自锁或防角色放大的单项 */
            }
          } else {
            const removed = this.db
              .prepare(
                `DELETE FROM record_grants
                 WHERE workspace_id = ? AND collection = ? AND record_id = ?
                   AND subject_type = ? AND subject_id = ?`,
              )
              .run(workspaceId, target.collection, target.recordId, subject.subjectType, subject.subjectId)
            if (Number(removed.changes) > 0) {
              recordChanged = true
              if (subject.subjectType === 'account') revokedAccountIds.add(subject.subjectId)
            }
          }
        }
        if (recordChanged) {
          touchedCollections.add(target.collection)
          updatedIds.push(rawId)
        }
      }
      for (const accountId of revokedAccountIds) {
        this.cleanupExternalMembership(workspaceId, accountId)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }

    for (const col of touchedCollections) {
      this.authorization.invalidate(workspaceId, col)
    }
    if (updatedIds.length > 0) {
      const detail =
        input.mode === 'access_mode'
          ? `批量修改 ${updatedIds.length} 条记录为${input.accessMode === 'members' ? '空间全员可见' : '仅受邀人员可见'}`
          : input.mode === 'grant'
            ? `批量授权 ${updatedIds.length} 条记录（${input.role}）`
            : `批量移除 ${updatedIds.length} 条记录的协作者`
      this.recordActivity({
        workspaceId,
        actorId,
        category: 'access',
        action: 'access.batch',
        collection: normalizedCol,
        detail,
        now,
      })
    }
    return {
      collection: normalizedCol,
      totalCount: uniqueIds.length,
      updatedCount: updatedIds.length,
      skippedCount: uniqueIds.length - updatedIds.length,
      updatedIds,
    }
  }

  private memberViewName(workspaceId: string, viewId: string): string {
    try {
      const row = this.db
        .prepare(
          `SELECT payload_json FROM saved_views
           WHERE (workspace_id = ? OR workspace_id = '') AND collection = '/workspace-members' AND view_id = ?
           ORDER BY CASE WHEN workspace_id = ? THEN 0 ELSE 1 END
           LIMIT 1`,
        )
        .get(workspaceId, viewId, workspaceId) as { payload_json?: string } | undefined
      if (row?.payload_json) {
        const parsed = JSON.parse(row.payload_json) as { name?: unknown }
        if (typeof parsed.name === 'string' && parsed.name.trim()) return parsed.name.trim()
      }
    } catch {
      /* ignore */
    }
    return viewId
  }

  private accessRows(workspaceId: string, collection: string, recordId: string) {
    const rows = this.db
      .prepare(
        `SELECT a.id, COALESCE(NULLIF(m.display_name, ''), NULLIF(a.name, ''), NULLIF(a.email, ''), '未设置') AS name,
                COALESCE(m.avatar, '') AS avatar,
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
    const memberViewRows = this.db
      .prepare(
        `SELECT subject_id AS id, role
         FROM record_grants
         WHERE workspace_id = ? AND collection = ? AND record_id = ? AND subject_type = 'member_view'
         ORDER BY created_at`,
      )
      .all(workspaceId, collection, recordId) as Array<{ id: string; role: string }>
    const memberViews = memberViewRows.map((row) => ({
      id: row.id,
      name: this.memberViewName(workspaceId, row.id),
      role: row.role,
    }))
    const policy = this.db
      .prepare(
        `SELECT access_mode, member_default_role, owner_account_id FROM resource_policies
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(workspaceId, collection, recordId) as
      | { access_mode: string; member_default_role: 'viewer' | 'editor'; owner_account_id: string }
      | undefined
    const ownerId = policy?.owner_account_id || ''
    const collaboratorCount = rows.filter((row) => row.id !== ownerId).length + memberViews.length
    const hasExternalCollaborator = rows.some(
      (row) => row.id !== ownerId && (row.member_kind === 'external' || row.member_kind === 'guest'),
    )
    const effectiveMode = this.authorization.effectiveAccessMode({
      type: 'record',
      workspaceId,
      collection,
      recordId,
    })
    // Notion 对齐三态内部域（外部协作者/外链改为正交标记，不覆盖内部状态）
    const scope = effectiveMode === 'members'
      ? ('workspace' as const)
      : collaboratorCount > 0
        ? ('shared' as const)
        : ('personal' as const)
    const rawMode = policy?.access_mode
    const accessMode = (rawMode === 'members' || rawMode === 'inherit' ? rawMode : 'private') as 'inherit' | 'private' | 'members'
    const memberDefaultRole: 'viewer' | 'editor' = policy?.member_default_role === 'editor' ? 'editor' : 'viewer'
    return {
      private: effectiveMode === 'private' && collaboratorCount === 0,
      scope,
      hasExternalCollaborator,
      accessMode,
      memberDefaultRole,
      ownerId,
      people: rows.map(({ member_kind, ...row }) => ({ ...row, memberKind: member_kind })),
      memberViews,
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
    const pluginGrant = this.db
      .prepare(
        `SELECT 1 AS ok FROM plugin_assignments
         WHERE workspace_id = ? AND subject_type = 'account' AND subject_id = ?
         LIMIT 1`,
      )
      .get(workspaceId, accountId)
    if (recordGrant || pluginGrant) return
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

}
