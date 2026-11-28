import type { DatabaseSync } from 'node:sqlite'
import { currentAccountId, currentActorContext, type ActorRoomContext } from '@biu/host-plugin-loader/data-dir'

export type { ActorRoomContext }

export type ActorScopeRule = {
  allowedCollections?: string[] | null
  allowedViews?: string[] | null
  maxRole?: ResourceRole
  expiresAt?: number | null
  revokedAt?: number | null
}

export type Actor =
  | { type: 'account'; accountId: string; workspaceId: string }
  | {
      type: 'agent'
      accountId: string
      delegatedBy: string
      workspaceId: string
      sessionId?: string
      invokerId?: string
      scope?: ActorScopeRule
      roomContext?: ActorRoomContext
    }
  | {
      type: 'mcp'
      accountId: string
      delegatedBy: string
      workspaceId: string
      credentialId?: string
      invokerId?: string
      scope?: ActorScopeRule
    }
  | { type: 'public-link'; shareTokenId: string; accountId?: string; workspaceId?: string }

export type AuthenticatedActor = Exclude<Actor, { type: 'public-link' }>

export type Action =
  | 'resource:list'
  | 'resource:read'
  | 'resource:comment'
  | 'resource:create'
  | 'resource:create-child'
  | 'resource:update'
  | 'resource:move'
  | 'resource:delete'
  | 'resource:restore'
  | 'resource:share'
  | 'resource:manage-permissions'
  | 'workspace:invite'
  | 'workspace:remove-member'
  | 'workspace:update'
  | 'workspace:delete'

export type ResourceRef =
  | { type: 'workspace'; workspaceId: string }
  | { type: 'collection'; workspaceId: string; collection: string }
  | { type: 'record'; workspaceId: string; collection: string; recordId: string; record?: Record<string, unknown> }

export type ResourceRole = 'viewer' | 'commenter' | 'editor' | 'manager' | 'owner'
export type Capability = 'read' | 'comment' | 'write' | 'delete' | 'move' | 'grant' | 'owner'
export type AccessMode = 'inherit' | 'private' | 'members'
export type WorkspaceRole = 'viewer' | 'member' | 'admin' | 'owner'
export type GrantSubjectType = 'account' | 'member_view'

export type MemberViewMatcher = (
  workspaceId: string,
  viewId: string,
  accountId: string,
) => boolean

export type MemberViewLockChecker = (
  workspaceId: string,
  viewId: string,
) => boolean

export type Decision =
  | {
      allowed: true
      effectiveRole: ResourceRole
      source: 'ownership' | 'direct-grant' | 'member-view-grant' | 'workspace-default' | 'inherited'
    }
  | {
      allowed: false
      reason:
        | 'UNAUTHENTICATED'
        | 'NOT_A_MEMBER'
        | 'WRONG_WORKSPACE'
        | 'UNKNOWN_RESOURCE'
        | 'PRIVATE_RESOURCE'
        | 'INSUFFICIENT_PERMISSION'
        | 'RELATION_CYCLE'
    }

export type ResourcePolicyInput = {
  accessMode?: AccessMode
  memberDefaultRole?: 'viewer' | 'editor'
  parentCollection?: string
  parentRecordId?: string
}

type PolicyRow = {
  workspace_id: string
  collection: string
  record_id: string
  owner_account_id: string
  access_mode: string
  member_default_role: 'viewer' | 'editor'
  parent_collection: string
  parent_record_id: string
}

type ScanGrant = {
  subject_type: GrantSubjectType
  subject_id: string
  role: ResourceRole
}

type CollectionScan = {
  refs: number
  workspaceId: string
  collection: string
  accountId: string
  policies: Map<string, PolicyRow>
  grants: Map<string, ScanGrant[]>
  matchedMemberViews: Set<string>
  membership: WorkspaceRole | null
  membershipKind: 'member' | 'external' | 'guest'
}

const POLICY_SELECT = `workspace_id, collection, record_id, owner_account_id, access_mode,
                member_default_role, parent_collection, parent_record_id`

export const ROLE_RANK: Record<ResourceRole, number> = { viewer: 1, commenter: 2, editor: 3, manager: 4, owner: 5 }

const PERSONAL_ONLY_COLLECTIONS = new Set(['/notices'])

export const ROLE_CAPABILITIES: Record<ResourceRole, ReadonlySet<Capability>> = {
  viewer: new Set<Capability>(['read']),
  commenter: new Set<Capability>(['read', 'comment']),
  editor: new Set<Capability>(['read', 'comment', 'write']),
  manager: new Set<Capability>(['read', 'comment', 'write', 'delete', 'move', 'grant']),
  owner: new Set<Capability>(['read', 'comment', 'write', 'delete', 'move', 'grant', 'owner']),
}

export function requiredCapability(action: Action): Capability {
  switch (action) {
    case 'resource:list':
    case 'resource:read':
      return 'read'
    case 'resource:comment':
      return 'comment'
    case 'resource:create':
    case 'resource:create-child':
    case 'resource:update':
      return 'write'
    case 'resource:move':
      return 'move'
    case 'resource:delete':
    case 'resource:restore':
      return 'delete'
    case 'resource:share':
    case 'resource:manage-permissions':
      return 'grant'
    default:
      return 'owner'
  }
}

function collectionScanKey(workspaceId: string, collection: string, accountId: string) {
  return `${workspaceId}\t${collection}\t${accountId}`
}

function maxRole(roles: ResourceRole[]) {
  return roles.sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])[0] ?? null
}

function minRole(roles: ResourceRole[]): ResourceRole | null {
  if (!roles.length) return null
  return roles.sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b])[0] ?? null
}

export function roleCoversAction(role: ResourceRole, action: Action) {
  return ROLE_CAPABILITIES[role].has(requiredCapability(action))
}

function memberAccessRole(policy: PolicyRow, membership: string | null): ResourceRole {
  if (membership === 'viewer') return 'viewer'
  return policy.member_default_role === 'editor' ? 'editor' : 'viewer'
}

function normalizeStoredAccessMode(raw: string | null | undefined): AccessMode {
  if (raw === 'members' || raw === 'inherit') return raw
  return 'private'
}

export class AuthorizationService {
  private memberViewMatcher?: MemberViewMatcher
  private memberViewLockChecker?: MemberViewLockChecker
  private agentShareCap?: (workspaceId: string) => 'viewer' | 'editor'
  private memberViewMatchCache = new Map<string, boolean>()
  private scans = new Map<string, CollectionScan>()
  private invalidators = new Set<() => void>()

  constructor(
    private db: DatabaseSync,
    private activeWorkspaceFor: (accountId: string) => string | null,
  ) {}

  /** 绑定工作区级代理最高分享角色上限（最高 editor；关闭可编辑时为 viewer；非创建者绝不允许 manager）。 */
  setWorkspaceAgentShareCap(fn: (workspaceId: string) => 'viewer' | 'editor') {
    this.agentShareCap = fn
    this.scans.clear()
    this.notifyInvalidators()
  }

  /** 授权表变了之后通知列表清掉可见行缓存。grant / revoke 都走这里。 */
  onInvalidate(fn: () => void) {
    this.invalidators.add(fn)
    return () => {
      this.invalidators.delete(fn)
    }
  }

  invalidate(workspaceId: string, collection: string) {
    this.dropScans(workspaceId, collection)
  }

  invalidateAll() {
    this.scans.clear()
    this.memberViewMatchCache.clear()
    this.notifyInvalidators()
  }

  currentActor(): AuthenticatedActor | null {
    const accountId = currentAccountId()
    if (!accountId) return null
    const workspaceId = this.activeWorkspaceFor(accountId)
    if (!workspaceId) return null
    const delegated = currentActorContext()
    if (delegated?.type === 'agent') {
      return {
        type: 'agent',
        accountId,
        delegatedBy: delegated.delegatedBy || accountId,
        workspaceId,
        sessionId: delegated.actorId,
        invokerId: delegated.invokerId,
        ...(delegated.roomContext ? { roomContext: delegated.roomContext } : {}),
        ...(delegated.maxRole || delegated.allowedCollections
          ? {
              scope: {
                ...(delegated.maxRole ? { maxRole: delegated.maxRole } : {}),
                ...(delegated.allowedCollections ? { allowedCollections: delegated.allowedCollections } : {}),
              },
            }
          : {}),
      }
    }
    if (delegated?.type === 'mcp') {
      return {
        type: 'mcp',
        accountId,
        delegatedBy: delegated.delegatedBy || accountId,
        workspaceId,
        credentialId: delegated.actorId,
        invokerId: delegated.invokerId,
        ...(delegated.maxRole || delegated.allowedCollections
          ? {
              scope: {
                ...(delegated.maxRole ? { maxRole: delegated.maxRole } : {}),
                ...(delegated.allowedCollections ? { allowedCollections: delegated.allowedCollections } : {}),
              },
            }
          : {}),
      }
    }
    return { type: 'account', accountId, workspaceId }
  }

  /** 注册 `/workspace-members` 管理员锁定视图匹配器（动态组），结果按 (ws, viewId, accountId) 缓存。 */
  setMemberViewMatcher(matcher: MemberViewMatcher) {
    this.memberViewMatcher = matcher
    this.memberViewMatchCache.clear()
  }

  /** 注册 `/workspace-members` 锁定视图校验器，防止对非锁定视图建立动态授权。 */
  setMemberViewLockChecker(checker: MemberViewLockChecker) {
    this.memberViewLockChecker = checker
  }

  isLockedMemberView(workspaceId: string, viewId: string): boolean {
    if (!this.memberViewLockChecker) return false
    return this.memberViewLockChecker(workspaceId, viewId)
  }

  matchesMemberView(workspaceId: string, viewId: string, accountId: string): boolean {
    if (!this.memberViewMatcher || !workspaceId || !viewId || !accountId) return false
    const key = `${workspaceId}\t${viewId}\t${accountId}`
    const cached = this.memberViewMatchCache.get(key)
    if (cached !== undefined) return cached
    const matched = Boolean(this.memberViewMatcher(workspaceId, viewId, accountId))
    if (this.memberViewMatchCache.size >= 4096) this.memberViewMatchCache.clear()
    this.memberViewMatchCache.set(key, matched)
    return matched
  }

  /** 为 Agent / MCP / 外链声明能力边界（Scope），运行时与触发者权限取交集。 */
  setActorScope(
    workspaceId: string,
    actorType: 'agent' | 'mcp' | 'public-link',
    actorId: string,
    issuerId: string,
    scope: ActorScopeRule,
    now = Date.now(),
  ) {
    const allowedCols = scope.allowedCollections?.length ? JSON.stringify([...new Set(scope.allowedCollections)]) : null
    const allowedViews = scope.allowedViews?.length ? JSON.stringify([...new Set(scope.allowedViews)]) : null
    const maxRole = scope.maxRole ?? 'editor'
    this.db
      .prepare(
        `INSERT INTO actor_scopes
          (workspace_id, actor_type, actor_id, issuer_id, allowed_collections, allowed_views, max_role, expires_at, revoked_at, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
         ON CONFLICT(workspace_id, actor_type, actor_id)
         DO UPDATE SET issuer_id = excluded.issuer_id,
                       allowed_collections = excluded.allowed_collections,
                       allowed_views = excluded.allowed_views,
                       max_role = excluded.max_role,
                       expires_at = excluded.expires_at,
                       revoked_at = NULL`,
      )
      .run(workspaceId, actorType, actorId, issuerId, allowedCols, allowedViews, maxRole, scope.expiresAt ?? null, now)
  }

  getActorScope(workspaceId: string, actorType: 'agent' | 'mcp' | 'public-link', actorId: string): (ActorScopeRule & { issuerId: string }) | null {
    if (!workspaceId || !actorId) return null
    try {
      const row = this.db
        .prepare(
          `SELECT issuer_id, allowed_collections, allowed_views, max_role, expires_at, revoked_at
           FROM actor_scopes
           WHERE workspace_id = ? AND actor_type = ? AND actor_id = ?`,
        )
        .get(workspaceId, actorType, actorId) as
        | {
            issuer_id: string
            allowed_collections: string | null
            allowed_views: string | null
            max_role: ResourceRole
            expires_at: number | null
            revoked_at: number | null
          }
        | undefined
      if (!row) return null
      return {
        issuerId: row.issuer_id,
        allowedCollections: row.allowed_collections ? (JSON.parse(row.allowed_collections) as string[]) : null,
        allowedViews: row.allowed_views ? (JSON.parse(row.allowed_views) as string[]) : null,
        maxRole: row.max_role,
        expiresAt: row.expires_at,
        revokedAt: row.revoked_at,
      }
    } catch {
      return null
    }
  }

  revokeActorScope(workspaceId: string, actorType: 'agent' | 'mcp' | 'public-link', actorId: string, now = Date.now()) {
    try {
      this.db
        .prepare(
          `UPDATE actor_scopes SET revoked_at = ?
           WHERE workspace_id = ? AND actor_type = ? AND actor_id = ? AND revoked_at IS NULL`,
        )
        .run(now, workspaceId, actorType, actorId)
    } catch {
      /* ignore */
    }
  }

  revokeActorScopesByIssuer(workspaceId: string, issuerId: string, now = Date.now()) {
    try {
      this.db
        .prepare(
          `UPDATE actor_scopes SET revoked_at = ?
           WHERE workspace_id = ? AND issuer_id = ? AND revoked_at IS NULL`,
        )
        .run(now, workspaceId, issuerId)
    } catch {
      /* ignore */
    }
  }

  /** 列表扫描前把这一张表的策略/授权一次读进内存，避免每行一次 SQLite。 */
  preloadCollection(workspaceId: string, collection: string, accountId = currentAccountId()) {
    if (!workspaceId || !collection || !accountId) return
    const key = collectionScanKey(workspaceId, collection, accountId)
    const hit = this.scans.get(key)
    if (hit) {
      hit.refs += 1
      return
    }
    const policies = new Map<string, PolicyRow>()
    const policyRows = this.db
      .prepare(`SELECT ${POLICY_SELECT} FROM resource_policies WHERE workspace_id = ? AND collection = ?`)
      .all(workspaceId, collection) as PolicyRow[]
    for (const row of policyRows) {
      policies.set(row.record_id, row)
    }
    const grants = new Map<string, ScanGrant[]>()
    const referencedMemberViews = new Set<string>()
    for (const row of this.db
      .prepare(
        `SELECT record_id, subject_type, subject_id, role
         FROM record_grants
         WHERE workspace_id = ? AND collection = ?`,
      )
      .all(workspaceId, collection) as Array<ScanGrant & { record_id: string }>) {
      const list = grants.get(row.record_id) ?? []
      list.push({ subject_type: row.subject_type, subject_id: row.subject_id, role: row.role })
      grants.set(row.record_id, list)
      if (row.subject_type === 'member_view' && row.subject_id) {
        referencedMemberViews.add(row.subject_id)
      }
    }
    const matchedMemberViews = new Set<string>()
    for (const viewId of referencedMemberViews) {
      if (this.matchesMemberView(workspaceId, viewId, accountId)) {
        matchedMemberViews.add(viewId)
      }
    }
    const membership = this.readMembership(accountId, workspaceId)
    const membershipKind = this.readMembershipKind(accountId, workspaceId)
    this.scans.set(key, {
      refs: 1,
      workspaceId,
      collection,
      accountId,
      policies,
      grants,
      matchedMemberViews,
      membership,
      membershipKind,
    })
  }

  releaseCollection(workspaceId: string, collection: string, accountId = currentAccountId()) {
    if (!workspaceId || !collection || !accountId) return
    const key = collectionScanKey(workspaceId, collection, accountId)
    const hit = this.scans.get(key)
    if (!hit) return
    hit.refs -= 1
    if (hit.refs <= 0) this.scans.delete(key)
  }

  authorize(actor: Actor | null, action: Action, resource: ResourceRef): Decision {
    if (!actor || actor.type === 'public-link') return { allowed: false, reason: 'UNAUTHENTICATED' }
    if (actor.workspaceId !== resource.workspaceId) return { allowed: false, reason: 'WRONG_WORKSPACE' }

    // Agent / MCP 代理边界：有效权限 = Eval(delegatedBy) ∩ Eval(invokerId) ∩ Scope(actor)
    if (actor.type === 'agent' || actor.type === 'mcp') {
      const delegated = this.authorize(
        { type: 'account', accountId: actor.delegatedBy || actor.accountId, workspaceId: actor.workspaceId },
        action,
        resource,
      )
      if (!delegated.allowed) return delegated
      let effectiveRole = delegated.effectiveRole
      if (actor.invokerId && actor.invokerId !== (actor.delegatedBy || actor.accountId)) {
        const invoked = this.authorize(
          { type: 'account', accountId: actor.invokerId, workspaceId: actor.workspaceId },
          action,
          resource,
        )
        if (!invoked.allowed) return invoked
        effectiveRole = minRole([effectiveRole, invoked.effectiveRole]) ?? 'viewer'
      }
      const scopeActorId = actor.type === 'agent' ? actor.sessionId : actor.credentialId
      const storedScope = scopeActorId ? this.getActorScope(actor.workspaceId, actor.type, scopeActorId) : null
      const scopes = [storedScope, actor.scope].filter(Boolean) as ActorScopeRule[]
      const now = Date.now()
      for (const scope of scopes) {
        if (scope.revokedAt) return { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
        if (scope.expiresAt && scope.expiresAt <= now) return { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
        if (
          scope.allowedCollections?.length &&
          resource.type !== 'workspace' &&
          !scope.allowedCollections.includes(resource.collection)
        ) {
          return { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
        }
        if (scope.maxRole) {
          effectiveRole = minRole([effectiveRole, scope.maxRole]) ?? 'viewer'
        }
      }
      if (!roleCoversAction(effectiveRole, action)) {
        return { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
      }
      // 群聊可见下界（RoomFloor）：防止 Agent 在群里读取/吐出私人数据或非全群可读数据
      if (actor.type === 'agent' && actor.roomContext && resource.type === 'record') {
        if (PERSONAL_ONLY_COLLECTIONS.has(resource.collection)) {
          return { allowed: false, reason: 'PRIVATE_RESOURCE' }
        }
        const room = actor.roomContext
        const audience = (room.audienceAccountIds ?? []).map((id) => id.trim()).filter(Boolean)
        if (room.denyPersonal) {
          const mode = this.effectiveAccessMode(resource)
          if (mode !== 'members') {
            // 仅当存在显式跨人共享（且群内非 owner 成员均具备读权限）时才允许读取；纯私人记录一律拒绝
            if (audience.length <= 1) {
              return { allowed: false, reason: 'PRIVATE_RESOURCE' }
            }
          }
        }
        if (audience.length > 0) {
          for (const memberId of audience) {
            const readable = this.authorize(
              { type: 'account', accountId: memberId, workspaceId: actor.workspaceId },
              'resource:read',
              resource,
            )
            if (!readable.allowed) {
              return { allowed: false, reason: 'PRIVATE_RESOURCE' }
            }
          }
        } else if (room.hasExternalMember) {
          return { allowed: false, reason: 'PRIVATE_RESOURCE' }
        }
      }
      return { allowed: true, effectiveRole, source: delegated.source }
    }

    const membership = this.membership(actor.accountId, resource.workspaceId)
    if (!membership) return { allowed: false, reason: 'NOT_A_MEMBER' }
    const memberKind = this.membershipKind(actor.accountId, resource.workspaceId)

    if (resource.type === 'workspace') {
      const allowed =
        membership === 'owner' ||
        (membership === 'admin' && action !== 'workspace:delete')
      return allowed
        ? { allowed: true, effectiveRole: membership === 'owner' ? 'owner' : 'manager', source: 'workspace-default' }
        : { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
    }

    if (resource.type === 'collection') {
      if (resource.collection === '/workspace-members') {
        const effectiveRole: ResourceRole =
          membership === 'owner' ? 'owner' : membership === 'admin' ? 'manager' : 'viewer'
        return roleCoversAction(effectiveRole, action)
          ? { allowed: true, effectiveRole, source: 'workspace-default' }
          : { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
      }
      const managing =
        action === 'resource:share' ||
        action === 'resource:manage-permissions' ||
        action === 'resource:delete'
      if (managing && membership !== 'owner' && membership !== 'admin') {
        return { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
      }
      const effectiveRole: ResourceRole = membership === 'owner' || membership === 'admin'
        ? 'manager'
        : membership === 'viewer' || memberKind === 'external' || memberKind === 'guest'
          ? 'viewer'
          : 'editor'
      return roleCoversAction(effectiveRole, action)
        ? { allowed: true, effectiveRole, source: 'workspace-default' }
        : { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
    }

    if (resource.collection === '/workspace-members') {
      const effectiveRole: ResourceRole =
        membership === 'owner' ? 'owner' : membership === 'admin' ? 'manager' : 'viewer'
      return roleCoversAction(effectiveRole, action)
        ? { allowed: true, effectiveRole, source: 'workspace-default' }
        : { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
    }

    if (resource.collection === '/channels') {
      if (action === 'resource:share' || action === 'resource:manage-permissions' || action === 'resource:delete') {
        return { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
      }
      // 频道级可见性与成员校验已由 ChannelService 严格按 workspace_id + channel_members 隔离
      const effectiveRole: ResourceRole =
        membership === 'owner' || membership === 'admin'
          ? 'manager'
          : membership === 'viewer' || memberKind === 'guest'
            ? 'viewer'
            : 'editor'
      return roleCoversAction(effectiveRole, action)
        ? { allowed: true, effectiveRole, source: 'workspace-default' }
        : { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
    }

    if (PERSONAL_ONLY_COLLECTIONS.has(resource.collection)) {
      if (action === 'resource:share' || action === 'resource:manage-permissions') {
        return { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
      }
      const policy = this.policy(resource)
      if (policy) {
        if (policy.owner_account_id !== actor.accountId) {
          return { allowed: false, reason: 'PRIVATE_RESOURCE' }
        }
        return { allowed: true, effectiveRole: 'owner', source: 'ownership' }
      }
      if (resource.collection === '/notices') {
        const recAccountId = typeof resource.record?.accountId === 'string' ? resource.record.accountId.trim() : ''
        if (!recAccountId || recAccountId === actor.accountId) {
          return { allowed: true, effectiveRole: 'owner', source: 'ownership' }
        }
      }
      return { allowed: false, reason: 'PRIVATE_RESOURCE' }
    }

    const resolved = this.effectiveRole(actor.accountId, resource, new Set(), 0)
    if (resolved && 'reason' in resolved) return resolved
    if (!resolved) return { allowed: false, reason: 'PRIVATE_RESOURCE' }
    let cappedRole: ResourceRole =
      membership === 'viewer' || memberKind === 'guest' ? 'viewer' : resolved.effectiveRole
    // /agents 仅支持可查看（看记录+Fork）与可编辑（改名/改配置，不可对话）；非创建者绝不允许 manager，不能替他人代理发消息执行
    if (resource.collection === '/agents' && resolved.source !== 'ownership') {
      const cap: ResourceRole = this.agentShareCap ? this.agentShareCap(resource.workspaceId) : 'editor'
      cappedRole = minRole([cappedRole, cap]) ?? 'viewer'
    }
    const effective = { effectiveRole: cappedRole, source: resolved.source }
    if (!roleCoversAction(effective.effectiveRole, action)) {
      return { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
    }
    return { allowed: true, ...effective }
  }

  authorizeCurrent(action: Action, resource: ResourceRef) {
    return this.authorize(this.currentActor(), action, resource)
  }

  requireCurrent(action: Action, resource: ResourceRef) {
    const decision = this.authorizeCurrent(action, resource)
    if (!decision.allowed) throw new Error(`permission denied: ${decision.reason}`)
    return decision
  }

  filterCurrent<T>(action: Action, resources: Array<{ resource: ResourceRef; value: T }>) {
    const actor = this.currentActor()
    return resources.filter(({ resource }) => this.authorize(actor, action, resource).allowed).map(({ value }) => value)
  }

  /** 解析记录在继承链上的有效通用访问模式（'members' 或 'private'）。 */
  effectiveAccessMode(
    resource: Extract<ResourceRef, { type: 'record' }>,
    visited = new Set<string>(),
    depth = 0,
  ): 'members' | 'private' {
    const key = `${resource.workspaceId}\t${resource.collection}\t${resource.recordId}`
    if (visited.has(key) || depth > 64) return 'private'
    visited.add(key)
    const policy = this.policy(resource)
    if (!policy) return 'private'
    const mode = normalizeStoredAccessMode(policy.access_mode)
    if (mode === 'members') return 'members'
    if (mode === 'inherit' && policy.parent_record_id) {
      return this.effectiveAccessMode(
        {
          type: 'record',
          workspaceId: resource.workspaceId,
          collection: policy.parent_collection || resource.collection,
          recordId: policy.parent_record_id,
        },
        visited,
        depth + 1,
      )
    }
    return 'private'
  }

  attach(
    actor: Actor,
    resource: Extract<ResourceRef, { type: 'record' }>,
    input: ResourcePolicyInput = {},
    now = Date.now(),
  ) {
    const accountId = actor.accountId
    if (!accountId) throw new Error('permission denied: UNAUTHENTICATED')
    const parentRecordId = input.parentRecordId?.trim() ?? ''
    const parentCollection = parentRecordId ? (input.parentCollection?.trim() || resource.collection) : ''
    const accessMode: AccessMode = input.accessMode ?? (parentRecordId ? 'inherit' : 'private')
    const memberDefaultRole: 'viewer' | 'editor' =
      input.memberDefaultRole ?? (accessMode === 'members' ? 'editor' : 'viewer')
    const inserted = this.db
      .prepare(
        `INSERT INTO resource_policies
          (workspace_id, collection, record_id, owner_account_id, access_mode,
           member_default_role, parent_collection, parent_record_id, created_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, collection, record_id) DO NOTHING`,
      )
      .run(
        resource.workspaceId,
        resource.collection,
        resource.recordId,
        accountId,
        accessMode,
        memberDefaultRole,
        parentCollection,
        parentRecordId,
        accountId,
        now,
      )
    if (Number(inserted.changes) > 0) {
      this.grant(accountId, resource, 'account', accountId, 'owner', now)
      this.dropScans(resource.workspaceId, resource.collection)
    }
  }

  grant(
    actorId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
    subjectType: GrantSubjectType,
    subjectId: string,
    role: ResourceRole,
    now = Date.now(),
    options: { skipInvalidate?: boolean } = {},
  ) {
    const actor: Actor = { type: 'account', accountId: actorId, workspaceId: resource.workspaceId }
    const decision = this.authorize(actor, 'resource:manage-permissions', resource)
    const policy = this.policy(resource)
    const isOwner = Boolean(policy && policy.owner_account_id === actorId)
    if (policy && !isOwner && !decision.allowed) {
      throw new Error('permission denied: INSUFFICIENT_PERMISSION')
    }
    // 原则 1（防自锁）：非创建者不能修改自己在当前记录上的直接授权，避免误降级把自己锁在门外
    if (policy && !isOwner && subjectType === 'account' && subjectId === actorId) {
      throw new Error('permission denied: CANNOT_MODIFY_OWN_GRANT')
    }
    // 原则 2（动态成员视图门禁）：member_view 仅允许引用管理员锁定的 /workspace-members 视图
    if (subjectType === 'member_view' && !this.isLockedMemberView(resource.workspaceId, subjectId)) {
      throw new Error('permission denied: LOCKED_MEMBER_VIEW_REQUIRED')
    }
    // 原则 3（禁止角色放大）：授权人不能授予高于自己有效角色的权限（例如 manager 不能授出 owner）
    if (policy) {
      const actorRole: ResourceRole = isOwner ? 'owner' : (decision.allowed ? decision.effectiveRole : 'viewer')
      if (ROLE_RANK[role] > ROLE_RANK[actorRole]) {
        throw new Error('permission denied: CANNOT_EXCEED_OWN_ROLE')
      }
    }
    const written = this.db
      .prepare(
        `INSERT INTO record_grants
          (workspace_id, collection, record_id, subject_type, subject_id, role, granted_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, collection, record_id, subject_type, subject_id)
         DO UPDATE SET role = excluded.role, granted_by = excluded.granted_by, created_at = excluded.created_at
         WHERE record_grants.role != excluded.role OR record_grants.granted_by != excluded.granted_by`,
      )
      .run(
        resource.workspaceId,
        resource.collection,
        resource.recordId,
        subjectType,
        subjectId,
        role,
        actorId,
        now,
      )
    if (!options.skipInvalidate && Number(written.changes) > 0) {
      this.dropScans(resource.workspaceId, resource.collection)
    }
  }

  /**
   * 切换单条记录的通用访问模式（Notion 正交槽位：'private' 仅受邀 ↔ 'members' 空间全员）。
   * 铁律：修改通用访问模式绝不覆写、绝不清空已有的定向协作者（record_grants）。
   */
  setAccessMode(
    actor: Actor,
    resource: Extract<ResourceRef, { type: 'record' }>,
    accessMode: 'private' | 'members',
    memberDefaultRole?: 'viewer' | 'editor',
    options: { skipInvalidate?: boolean } = {},
  ) {
    if (actor.type === 'public-link' || !actor.accountId) {
      throw new Error('permission denied: UNAUTHENTICATED')
    }
    if (actor.workspaceId !== resource.workspaceId) {
      throw new Error('permission denied: WRONG_WORKSPACE')
    }
    const decision = this.authorize(actor, 'resource:manage-permissions', resource)
    if (!decision.allowed) {
      throw new Error('permission denied: INSUFFICIENT_PERMISSION')
    }
    if (accessMode === 'members' && this.membershipKind(actor.accountId, resource.workspaceId) !== 'member') {
      throw new Error('permission denied: INSUFFICIENT_PERMISSION')
    }
    const policy = this.policy(resource)
    if (!policy) throw new Error('unknown resource')
    const nextDefaultRole: 'viewer' | 'editor' =
      memberDefaultRole ??
      (accessMode === 'members'
        ? (policy.access_mode === 'members' ? policy.member_default_role : 'editor')
        : policy.member_default_role)
    this.db
      .prepare(
        `UPDATE resource_policies
         SET access_mode = ?, member_default_role = ?
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .run(accessMode, nextDefaultRole, resource.workspaceId, resource.collection, resource.recordId)
    if (!options.skipInvalidate) this.dropScans(resource.workspaceId, resource.collection)
    return { accessMode, memberDefaultRole: nextDefaultRole }
  }

  move(
    actor: Actor,
    resource: Extract<ResourceRef, { type: 'record' }>,
    parent: Extract<ResourceRef, { type: 'record' }> | null,
    options: { inheritOnExpand?: boolean } = {},
  ) {
    this.validateMove(actor, resource, parent)
    const currentPolicy = this.policy(resource)
    const currentEffective = this.effectiveAccessMode(resource)
    const parentEffective = parent ? this.effectiveAccessMode(parent) : null
    // 将私密记录移入空间全员父级时，默认保持独立 private，避免静默扩大可见范围；
    // 仅调用方显式传 inheritOnExpand: true 时才切换为 inherit。
    const scopeExpanding =
      Boolean(parent) &&
      currentEffective === 'private' &&
      parentEffective === 'members'
    const currentMode = normalizeStoredAccessMode(currentPolicy?.access_mode)
    const nextAccessMode: AccessMode =
      scopeExpanding && options.inheritOnExpand
        ? 'inherit'
        : scopeExpanding && !options.inheritOnExpand
          ? 'private'
          : parent
            ? currentMode
            : currentMode === 'inherit'
              ? currentEffective
              : currentMode
    this.db
      .prepare(
        `UPDATE resource_policies
         SET parent_collection = ?, parent_record_id = ?, access_mode = ?
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .run(
        parent?.collection ?? '',
        parent?.recordId ?? '',
        nextAccessMode,
        resource.workspaceId,
        resource.collection,
        resource.recordId,
      )
    this.dropScans(resource.workspaceId, resource.collection)
    if (parent) this.dropScans(parent.workspaceId, parent.collection)
    return {
      scopeExpanded: scopeExpanding && Boolean(options.inheritOnExpand),
      preservedPrivate: scopeExpanding && !options.inheritOnExpand,
    }
  }

  validateMove(
    actor: Actor,
    resource: Extract<ResourceRef, { type: 'record' }>,
    parent: Extract<ResourceRef, { type: 'record' }> | null,
  ) {
    const source = this.authorize(actor, 'resource:move', resource)
    if (!source.allowed) throw new Error(`permission denied: ${source.reason}`)
    if (parent) {
      const target = this.authorize(actor, 'resource:create-child', parent)
      if (!target.allowed) throw new Error(`permission denied: ${target.reason}`)
      if (parent.workspaceId !== resource.workspaceId) throw new Error('permission denied: WRONG_WORKSPACE')
      let cursor: Extract<ResourceRef, { type: 'record' }> | null = parent
      const seen = new Set<string>()
      while (cursor) {
        const key = `${cursor.collection}\t${cursor.recordId}`
        if (key === `${resource.collection}\t${resource.recordId}`) throw new Error('resource parent cycle')
        if (seen.has(key)) throw new Error('resource parent cycle')
        seen.add(key)
        const policy = this.policy(cursor)
        cursor =
          policy?.parent_record_id
            ? {
                type: 'record',
                workspaceId: cursor.workspaceId,
                collection: policy.parent_collection || cursor.collection,
                recordId: policy.parent_record_id,
              }
            : null
      }
    }
  }

  /** 切换单条记录的父子继承模式（inherit 继承上级 / custom 独立设置，保留 parent_record_id 便于随时切回）。 */
  setInheritanceMode(
    actor: Actor,
    resource: Extract<ResourceRef, { type: 'record' }>,
    mode: 'inherit' | 'custom',
  ) {
    if (actor.type === 'public-link') throw new Error('permission denied: UNAUTHENTICATED')
    const decision = this.authorize(actor, 'resource:manage-permissions', resource)
    const policy = this.policy(resource)
    if (!policy) throw new Error('unknown resource')
    const isOwner = policy.owner_account_id === actor.accountId
    if (!isOwner && !decision.allowed) {
      throw new Error('permission denied: INSUFFICIENT_PERMISSION')
    }
    if (mode === 'inherit') {
      if (!policy.parent_record_id) throw new Error('这条内容没有上级记录')
      this.db
        .prepare(
          `UPDATE resource_policies
           SET access_mode = 'inherit'
           WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
        )
        .run(resource.workspaceId, resource.collection, resource.recordId)
    } else {
      const effectiveMode = this.effectiveAccessMode(resource)
      this.db
        .prepare(
          `UPDATE resource_policies
           SET access_mode = CASE WHEN access_mode = 'inherit' THEN ? ELSE access_mode END
           WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
        )
        .run(effectiveMode, resource.workspaceId, resource.collection, resource.recordId)
    }
    this.dropScans(resource.workspaceId, resource.collection)
  }

  /** 返回记录的父子继承配置与祖先链（从最顶层祖先到直接父级）。 */
  inheritanceInfo(resource: Extract<ResourceRef, { type: 'record' }>): {
    mode: 'inherit' | 'custom'
    hasParent: boolean
    parent: { collection: string; recordId: string } | null
    ancestors: Array<{ collection: string; recordId: string }>
  } {
    const first = this.policy(resource)
    const hasParent = Boolean(first?.parent_record_id)
    const parent = hasParent
      ? {
          collection: first!.parent_collection || resource.collection,
          recordId: first!.parent_record_id,
        }
      : null
    const mode: 'inherit' | 'custom' = first?.access_mode === 'inherit' && hasParent ? 'inherit' : 'custom'
    if (mode !== 'inherit' || !parent) return { mode, hasParent, parent, ancestors: [] }
    const ancestors: Array<{ collection: string; recordId: string }> = []
    const visited = new Set<string>([`${resource.workspaceId}\t${resource.collection}\t${resource.recordId}`])
    let cursor: Extract<ResourceRef, { type: 'record' }> | null = {
      type: 'record',
      workspaceId: resource.workspaceId,
      collection: parent.collection,
      recordId: parent.recordId,
    }
    let depth = 0
    while (cursor && depth < 64) {
      const key = `${cursor.workspaceId}\t${cursor.collection}\t${cursor.recordId}`
      if (visited.has(key)) break
      visited.add(key)
      ancestors.unshift({ collection: cursor.collection, recordId: cursor.recordId })
      const policy = this.policy(cursor)
      if (policy?.access_mode === 'inherit' && policy.parent_record_id) {
        cursor = {
          type: 'record',
          workspaceId: cursor.workspaceId,
          collection: policy.parent_collection || cursor.collection,
          recordId: policy.parent_record_id,
        }
      } else {
        cursor = null
      }
      depth += 1
    }
    return { mode, hasParent, parent, ancestors }
  }

  /** 当前用户在这条记录上的权限是怎么来的（含父子继承逐级展开）。 */
  roleChain(accountId: string, resource: Extract<ResourceRef, { type: 'record' }>) {
    return this.collectRoleChain(accountId, resource, new Set(), 0, true)
  }

  private resolveLocalPolicyRole(
    accountId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
    policy: PolicyRow | null | undefined,
  ): {
    role: ResourceRole
    source: 'ownership' | 'direct-grant' | 'member-view-grant' | 'workspace-default'
    detail: string
  } | null {
    if (!policy) return null
    if (policy.owner_account_id === accountId) {
      return { role: 'owner', source: 'ownership', detail: '你是创建者' }
    }
    const direct = this.directRole(accountId, resource)
    let workspaceBaseline: { role: ResourceRole; source: 'workspace-default'; detail: string } | null = null
    if (
      policy.access_mode === 'members' &&
      this.membershipKind(accountId, resource.workspaceId) === 'member'
    ) {
      const wsRole = this.membership(accountId, resource.workspaceId)
      if (wsRole === 'owner' || wsRole === 'admin') {
        workspaceBaseline = { role: 'manager', source: 'workspace-default', detail: '空间管理员默认可管理' }
      } else {
        const role = memberAccessRole(policy, wsRole)
        const detail = role === 'viewer' ? '空间全员默认可查看' : '空间全员默认可编辑'
        workspaceBaseline = { role, source: 'workspace-default', detail }
      }
    }
    if (direct && (!workspaceBaseline || ROLE_RANK[direct.effectiveRole] >= ROLE_RANK[workspaceBaseline.role])) {
      const detail = direct.source === 'member-view-grant'
        ? '通过锁定成员视图（动态组）授权'
        : direct.source === 'direct-grant'
          ? '直接授权给你'
          : '按空间角色授权'
      return { role: direct.effectiveRole, source: direct.source, detail }
    }
    return workspaceBaseline
  }

  private collectRoleChain(
    accountId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
    visited: Set<string>,
    depth: number,
    top: boolean,
  ): Array<{
    id: string
    collection: string
    recordId: string
    title: string
    detail: string
    role: ResourceRole
    source: 'ownership' | 'direct-grant' | 'member-view-grant' | 'workspace-default' | 'inherited'
  }> {
    const key = `${resource.workspaceId}\t${resource.collection}\t${resource.recordId}`
    if (visited.has(key) || depth > 64) return []
    visited.add(key)
    const title = top ? '这条内容' : '上一级内容'
    const base = { id: key, collection: resource.collection, recordId: resource.recordId, title }
    const policy = this.policy(resource)
    const local = this.resolveLocalPolicyRole(accountId, resource, policy)
    const parent = policy?.access_mode === 'inherit' && policy.parent_record_id
      ? this.collectRoleChain(
          accountId,
          {
            type: 'record',
            workspaceId: resource.workspaceId,
            collection: policy.parent_collection || resource.collection,
            recordId: policy.parent_record_id,
          },
          visited,
          depth + 1,
          false,
        )
      : []
    const inheritedRole = parent.length ? parent[parent.length - 1]!.role : null
    if (local && (!inheritedRole || ROLE_RANK[local.role] >= ROLE_RANK[inheritedRole])) {
      return [{ ...base, detail: local.detail, role: local.role, source: local.source }]
    }
    if (inheritedRole) {
      return [{ ...base, detail: '继承上级权限', role: inheritedRole, source: 'inherited' }, ...parent]
    }
    return []
  }

  private effectiveRole(
    accountId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
    visited: Set<string>,
    depth: number,
  ): Omit<Extract<Decision, { allowed: true }>, 'allowed'> | Extract<Decision, { allowed: false }> | null {
    const key = `${resource.workspaceId}\t${resource.collection}\t${resource.recordId}`
    if (visited.has(key) || depth > 64) return { allowed: false, reason: 'RELATION_CYCLE' }
    visited.add(key)

    const policy = this.policy(resource)
    const local = this.resolveLocalPolicyRole(accountId, resource, policy)
    if (local && (local.source === 'ownership' || !policy)) {
      return { effectiveRole: local.role, source: local.source }
    }
    const candidates: Array<Omit<Extract<Decision, { allowed: true }>, 'allowed'>> = []
    if (local) candidates.push({ effectiveRole: local.role, source: local.source })
    const shouldInherit = Boolean(
      policy &&
      policy.parent_record_id &&
      policy.access_mode === 'inherit',
    )
    if (shouldInherit && policy) {
      const parentRef: Extract<ResourceRef, { type: 'record' }> = {
        type: 'record',
        workspaceId: resource.workspaceId,
        collection: policy.parent_collection || resource.collection,
        recordId: policy.parent_record_id,
      }
      const inherited = this.effectiveRole(accountId, parentRef, visited, depth + 1)
      if (inherited && 'reason' in inherited) return inherited
      if (inherited) candidates.push({ effectiveRole: inherited.effectiveRole, source: 'inherited' })
    }
    if (!candidates.length) return null
    candidates.sort((a, b) => ROLE_RANK[b.effectiveRole] - ROLE_RANK[a.effectiveRole])
    return candidates[0]!
  }

  private directRole(accountId: string, resource: Extract<ResourceRef, { type: 'record' }>) {
    const scan = this.scans.get(collectionScanKey(resource.workspaceId, resource.collection, accountId))
    const matched = scan ? this.scanGrantsFor(scan, resource.recordId) : this.queryDirectGrants(accountId, resource)
    const role = maxRole(matched.map((row) => row.role))
    if (!role) return null
    const source = matched.some((row) => row.subject_type === 'account' && row.role === role)
      ? 'direct-grant'
      : 'member-view-grant'
    return { effectiveRole: role, source } as const
  }

  private queryDirectGrants(accountId: string, resource: Extract<ResourceRef, { type: 'record' }>) {
    const rows = this.db
      .prepare(
        `SELECT g.subject_type, g.subject_id, g.role
         FROM record_grants g
         WHERE g.workspace_id = ? AND g.collection = ? AND g.record_id = ?
           AND (
             (g.subject_type = 'account' AND g.subject_id = ?)
             OR g.subject_type = 'member_view'
           )`,
      )
      .all(
        resource.workspaceId,
        resource.collection,
        resource.recordId,
        accountId,
      ) as ScanGrant[]
    if (!rows.some((row) => row.subject_type === 'member_view')) return rows
    return rows.filter(
      (row) => row.subject_type !== 'member_view' || this.matchesMemberView(resource.workspaceId, row.subject_id, accountId),
    )
  }

  private scanGrantsFor(scan: CollectionScan, recordId: string) {
    return (scan.grants.get(recordId) ?? []).filter((row) => {
      if (row.subject_type === 'account') return row.subject_id === scan.accountId
      if (row.subject_type === 'member_view') return scan.matchedMemberViews.has(row.subject_id)
      return false
    })
  }

  private collectionScan(workspaceId: string, collection: string) {
    for (const scan of this.scans.values()) {
      if (scan.workspaceId === workspaceId && scan.collection === collection) return scan
    }
    return undefined
  }

  private dropScans(workspaceId: string, collection: string) {
    for (const [key, scan] of this.scans) {
      if (scan.workspaceId === workspaceId && scan.collection === collection) this.scans.delete(key)
    }
    this.notifyInvalidators()
  }

  private notifyInvalidators() {
    for (const fn of this.invalidators) fn()
  }

  private policy(resource: Extract<ResourceRef, { type: 'record' }>) {
    const scan = this.collectionScan(resource.workspaceId, resource.collection)
    if (scan) return scan.policies.get(resource.recordId)
    return this.db
      .prepare(
        `SELECT ${POLICY_SELECT} FROM resource_policies
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(resource.workspaceId, resource.collection, resource.recordId) as PolicyRow | undefined
  }

  private membership(accountId: string, workspaceId: string): WorkspaceRole | null {
    for (const scan of this.scans.values()) {
      if (scan.accountId === accountId && scan.workspaceId === workspaceId) return scan.membership
    }
    return this.readMembership(accountId, workspaceId)
  }

  membershipKind(accountId: string, workspaceId: string): 'member' | 'external' | 'guest' {
    for (const scan of this.scans.values()) {
      if (scan.accountId === accountId && scan.workspaceId === workspaceId) return scan.membershipKind
    }
    return this.readMembershipKind(accountId, workspaceId)
  }

  private readMembership(accountId: string, workspaceId: string): WorkspaceRole | null {
    const row = this.db
      .prepare('SELECT role FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { role: string } | undefined
    return row?.role === 'owner' || row?.role === 'admin' || row?.role === 'member' || row?.role === 'viewer'
      ? row.role
      : null
  }

  private readMembershipKind(accountId: string, workspaceId: string): 'member' | 'external' | 'guest' {
    const row = this.db
      .prepare('SELECT member_kind FROM workspace_members WHERE workspace_id = ? AND account_id = ?')
      .get(workspaceId, accountId) as { member_kind?: string } | undefined
    return row?.member_kind === 'external' || row?.member_kind === 'guest' ? row.member_kind : 'member'
  }
}
