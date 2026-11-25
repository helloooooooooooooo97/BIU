import type { DatabaseSync } from 'node:sqlite'
import { currentAccountId, currentActorContext } from '@biu/host-plugin-loader/data-dir'

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
export type GrantEffect = 'allow' | 'deny'
export type AccessMode = 'inherit' | 'private' | 'members' | 'restricted'
export type WorkspaceRole = 'viewer' | 'member' | 'admin' | 'owner'

export type DataViewMatcher = (
  workspaceId: string,
  collection: string,
  viewId: string,
  recordId: string,
  context: {
    grantedBy?: string
    recordOwnerId?: string
    scope: 'personal' | 'workspace' | 'shared' | null
    record?: Record<string, unknown>
  },
) => boolean

export type Decision =
  | {
      allowed: true
      effectiveRole: ResourceRole
      source: 'ownership' | 'direct-grant' | 'group-grant' | 'view-grant' | 'data-view-grant' | 'workspace-default' | 'inherited' | 'legacy'
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
  access_mode: AccessMode
  member_default_role: 'viewer' | 'editor'
  parent_collection: string
  parent_record_id: string
}

type ScanGrant = {
  subject_type: 'account' | 'group' | 'workspace_role' | 'member_view'
  subject_id: string
  role: ResourceRole
  effect?: GrantEffect
}

type ScanViewGrant = {
  view_id: string
  subject_type: 'account' | 'member_view'
  subject_id: string
  role: ResourceRole
  effect?: GrantEffect
  granted_by: string
}

type CollectionScan = {
  refs: number
  workspaceId: string
  collection: string
  accountId: string
  policies: Map<string, PolicyRow>
  owners: Map<string, string>
  grants: Map<string, ScanGrant[]>
  viewGrants: ScanViewGrant[]
  actorViewGrants: ScanViewGrant[]
  memberViewCache: Map<string, boolean>
  groups: Set<string>
  membership: WorkspaceRole | null
  membershipKind: 'member' | 'external' | 'guest'
}

const POLICY_SELECT = `workspace_id, collection, record_id, owner_account_id, access_mode,
                member_default_role, parent_collection, parent_record_id`

const ROLE_RANK: Record<ResourceRole, number> = { viewer: 1, commenter: 2, editor: 3, manager: 4, owner: 5 }

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

export function actionForCapability(cap: Capability): Action {
  switch (cap) {
    case 'read':
      return 'resource:read'
    case 'comment':
      return 'resource:comment'
    case 'write':
      return 'resource:update'
    case 'move':
      return 'resource:move'
    case 'delete':
      return 'resource:delete'
    case 'grant':
      return 'resource:manage-permissions'
    default:
      return 'workspace:delete'
  }
}

function collectionScanKey(workspaceId: string, collection: string, accountId: string) {
  return `${workspaceId}\t${collection}\t${accountId}`
}

function maxRole(roles: ResourceRole[]) {
  return roles.sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])[0] ?? null
}

/** 根据显式 deny 的最低角色裁剪允许角色：deny viewer = 全面拒绝；deny editor = 最高仅保留 commenter。 */
function applyRoleDeny(allowed: ResourceRole, denied: ResourceRole | null): ResourceRole | null {
  if (!denied) return allowed
  const capRank = ROLE_RANK[denied] - 1
  if (capRank < ROLE_RANK.viewer) return null
  if (ROLE_RANK[allowed] <= capRank) return allowed
  if (capRank >= ROLE_RANK.manager) return 'manager'
  if (capRank >= ROLE_RANK.editor) return 'editor'
  if (capRank >= ROLE_RANK.commenter) return 'commenter'
  return 'viewer'
}

function minRole(roles: ResourceRole[]): ResourceRole | null {
  if (!roles.length) return null
  return roles.sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b])[0] ?? null
}

export function roleCoversAction(role: ResourceRole, action: Action) {
  return ROLE_CAPABILITIES[role].has(requiredCapability(action))
}

function memberAccessRole(policy: PolicyRow, membership: string | null): ResourceRole {
  if (membership === 'owner' || membership === 'admin') return 'manager'
  if (membership === 'viewer') return 'viewer'
  if (policy.access_mode === 'members' || policy.member_default_role === 'editor') return 'editor'
  return 'viewer'
}

function requiredRole(action: Action): ResourceRole {
  switch (action) {
    case 'resource:list':
    case 'resource:read':
      return 'viewer'
    case 'resource:comment':
      return 'commenter'
    case 'resource:create':
    case 'resource:create-child':
    case 'resource:update':
      return 'editor'
    case 'resource:move':
    case 'resource:delete':
    case 'resource:restore':
    case 'resource:share':
    case 'resource:manage-permissions':
      return 'manager'
    default:
      return 'owner'
  }
}

export class AuthorizationService {
  private memberViewMatcher?: (workspaceId: string, viewId: string, accountId: string) => boolean
  private dataViewMatcher?: DataViewMatcher
  private scans = new Map<string, CollectionScan>()
  private invalidators = new Set<() => void>()

  constructor(
    private db: DatabaseSync,
    private activeWorkspaceFor: (accountId: string) => string | null,
  ) {}

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

  setMemberViewMatcher(matcher: (workspaceId: string, viewId: string, accountId: string) => boolean) {
    this.memberViewMatcher = matcher
  }

  setDataViewMatcher(matcher: DataViewMatcher) {
    this.dataViewMatcher = matcher
  }

  hasDataViewMatcher() {
    return Boolean(this.dataViewMatcher)
  }

  /** 判断某视图是否已绑定权限规则（作为数据视图或成员视图），绑定后其 filters / filterTree / columns 进入锁定状态。 */
  isViewPolicyBound(workspaceId: string, collection: string, viewId: string): boolean {
    if (!workspaceId || !collection || !viewId) return false
    try {
      const dataGrant = this.db
        .prepare(
          `SELECT 1 AS ok FROM view_grants
           WHERE workspace_id = ? AND collection = ? AND view_id = ?
           LIMIT 1`,
        )
        .get(workspaceId, collection, viewId) as { ok?: number } | undefined
      if (dataGrant?.ok) return true
      if (collection === '/workspace-members') {
        const memberRecordGrant = this.db
          .prepare(
            `SELECT 1 AS ok FROM record_grants
             WHERE workspace_id = ? AND subject_type = 'member_view' AND subject_id = ?
             LIMIT 1`,
          )
          .get(workspaceId, viewId) as { ok?: number } | undefined
        if (memberRecordGrant?.ok) return true
        const memberViewGrant = this.db
          .prepare(
            `SELECT 1 AS ok FROM view_grants
             WHERE workspace_id = ? AND subject_type = 'member_view' AND subject_id = ?
             LIMIT 1`,
          )
          .get(workspaceId, viewId) as { ok?: number } | undefined
        if (memberViewGrant?.ok) return true
      }
    } catch {
      return false
    }
    return false
  }

  /** 只有空间 owner / admin 可以修改或删除已绑定权限规则（Policy-Locked）的视图边界。 */
  canModifyPolicyLockedView(workspaceId: string, accountId: string): boolean {
    if (!workspaceId || !accountId) return false
    const role = this.membership(accountId, workspaceId)
    return role === 'owner' || role === 'admin'
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
    for (const row of this.db
      .prepare(`SELECT ${POLICY_SELECT} FROM resource_policies WHERE workspace_id = ? AND collection = ?`)
      .all(workspaceId, collection) as PolicyRow[]) {
      policies.set(row.record_id, row)
    }
    const owners = new Map<string, string>()
    for (const row of this.db
      .prepare(
        'SELECT record_id, owner_id FROM record_owners WHERE workspace_id = ? AND collection = ?',
      )
      .all(workspaceId, collection) as Array<{ record_id: string; owner_id: string }>) {
      owners.set(row.record_id, row.owner_id)
    }
    const grants = new Map<string, ScanGrant[]>()
    for (const row of this.db
      .prepare(
        `SELECT record_id, subject_type, subject_id, role, COALESCE(effect, 'allow') AS effect
         FROM record_grants
         WHERE workspace_id = ? AND collection = ?`,
      )
      .all(workspaceId, collection) as Array<ScanGrant & { record_id: string }>) {
      const list = grants.get(row.record_id) ?? []
      list.push({ subject_type: row.subject_type, subject_id: row.subject_id, role: row.role, effect: row.effect ?? 'allow' })
      grants.set(row.record_id, list)
    }
    const groups = new Set<string>()
    for (const row of this.db
      .prepare(
        `SELECT gm.group_id AS group_id
         FROM workspace_group_members gm
         JOIN workspace_groups wg ON wg.id = gm.group_id
         WHERE gm.account_id = ? AND wg.workspace_id = ?`,
      )
      .all(accountId, workspaceId) as Array<{ group_id: string }>) {
      groups.add(row.group_id)
    }
    let viewGrants: ScanViewGrant[] = []
    try {
      viewGrants = this.db
        .prepare(
          `SELECT view_id, subject_type, subject_id, role, COALESCE(effect, 'allow') AS effect, COALESCE(granted_by, '') AS granted_by
           FROM view_grants
           WHERE workspace_id = ? AND collection = ?
           ORDER BY created_at`,
        )
        .all(workspaceId, collection) as ScanViewGrant[]
    } catch {
      viewGrants = []
    }
    const memberViewCache = new Map<string, boolean>()
    const matchMemberViewCached = (viewId: string) => {
      const hit = memberViewCache.get(viewId)
      if (hit !== undefined) return hit
      const matched = Boolean(this.memberViewMatcher?.(workspaceId, viewId, accountId))
      memberViewCache.set(viewId, matched)
      return matched
    }
    const actorViewGrants = viewGrants.filter((grant) =>
      grant.subject_type === 'account'
        ? grant.subject_id === accountId
        : matchMemberViewCached(grant.subject_id),
    )
    this.scans.set(key, {
      refs: 1,
      workspaceId,
      collection,
      accountId,
      policies,
      owners,
      grants,
      viewGrants,
      actorViewGrants,
      memberViewCache,
      groups,
      membership: this.readMembership(accountId, workspaceId),
      membershipKind: this.readMembershipKind(accountId, workspaceId),
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

  matchesMemberView(workspaceId: string, viewId: string, accountId: string) {
    for (const scan of this.scans.values()) {
      if (scan.workspaceId === workspaceId && scan.accountId === accountId) {
        const hit = scan.memberViewCache.get(viewId)
        if (hit !== undefined) return hit
        const matched = Boolean(this.memberViewMatcher?.(workspaceId, viewId, accountId))
        scan.memberViewCache.set(viewId, matched)
        return matched
      }
    }
    return Boolean(this.memberViewMatcher?.(workspaceId, viewId, accountId))
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
        return ROLE_RANK[effectiveRole] >= ROLE_RANK[requiredRole(action)]
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
      return ROLE_RANK[effectiveRole] >= ROLE_RANK[requiredRole(action)]
        ? { allowed: true, effectiveRole, source: 'workspace-default' }
        : { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
    }

    if (resource.collection === '/workspace-members') {
      const effectiveRole: ResourceRole =
        membership === 'owner' ? 'owner' : membership === 'admin' ? 'manager' : 'viewer'
      return ROLE_RANK[effectiveRole] >= ROLE_RANK[requiredRole(action)]
        ? { allowed: true, effectiveRole, source: 'workspace-default' }
        : { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
    }
    if (resource.collection === '/views') {
      const effectiveRole: ResourceRole =
        membership === 'owner'
          ? 'owner'
          : membership === 'viewer' || memberKind === 'external' || memberKind === 'guest'
            ? 'viewer'
            : 'manager'
      return ROLE_RANK[effectiveRole] >= ROLE_RANK[requiredRole(action)]
        ? { allowed: true, effectiveRole, source: 'workspace-default' }
        : { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
    }

    const resolved = this.effectiveRole(actor.accountId, resource, new Set(), 0)
    if (resolved && 'reason' in resolved) return resolved
    const viaView = this.dataViewRole(actor.accountId, resource)
    const combined = resolved && viaView.allow
      ? (ROLE_RANK[resolved.effectiveRole] >= ROLE_RANK[viaView.allow.effectiveRole] ? resolved : viaView.allow)
      : (resolved ?? viaView.allow)
    if (!combined) return { allowed: false, reason: 'PRIVATE_RESOURCE' }
    // 显式 Deny 优先于 Allow（但不会锁死记录创建者本人）
    const deniedRole = combined.source === 'ownership'
      ? null
      : minRole([this.directDenyRole(actor.accountId, resource), viaView.deny].filter(Boolean) as ResourceRole[])
    const afterDeny = applyRoleDeny(combined.effectiveRole, deniedRole)
    if (!afterDeny) return { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
    const effective = membership === 'viewer'
      ? { effectiveRole: 'viewer' as const, source: combined.source }
      : { effectiveRole: afterDeny, source: combined.source }
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

  scopeCurrent(resource: Extract<ResourceRef, { type: 'record' }>): 'personal' | 'workspace' | 'shared' | null {
    const actor = this.currentActor()
    if (!actor || actor.workspaceId !== resource.workspaceId) return null
    return this.resourceScope(resource, new Set(), 0)
  }

  private resourceScope(
    resource: Extract<ResourceRef, { type: 'record' }>,
    visited: Set<string>,
    depth: number,
  ): 'personal' | 'workspace' | 'shared' | null {
    const key = `${resource.workspaceId}\t${resource.collection}\t${resource.recordId}`
    if (visited.has(key) || depth > 64) return null
    visited.add(key)
    const policy = this.policy(resource)
    if (!policy) {
      return this.legacyOwnerId(resource) ? 'workspace' : null
    }
    if (policy.access_mode === 'inherit' && policy.parent_record_id) {
      return this.resourceScope(
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
    return policy.access_mode === 'members' ? 'workspace' : 'personal'
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
    const accessMode = input.accessMode ?? (parentRecordId ? 'inherit' : 'private')
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
        input.memberDefaultRole ?? 'viewer',
        parentCollection,
        parentRecordId,
        accountId,
        now,
      )
    this.grant(accountId, resource, 'account', accountId, 'owner', now)
    if (Number(inserted.changes) > 0) this.dropScans(resource.workspaceId, resource.collection)
  }

  grant(
    actorId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
    subjectType: 'account' | 'group' | 'workspace_role' | 'member_view',
    subjectId: string,
    role: ResourceRole,
    now = Date.now(),
    effect: GrantEffect = 'allow',
  ) {
    const actor: Actor = { type: 'account', accountId: actorId, workspaceId: resource.workspaceId }
    const decision = this.authorize(actor, 'resource:manage-permissions', resource)
    const policy = this.policy(resource)
    const isOwner = Boolean(policy && policy.owner_account_id === actorId)
    if (policy && !isOwner && !decision.allowed) {
      throw new Error('permission denied: INSUFFICIENT_PERMISSION')
    }
    // 禁止角色放大：授权人不能授予高于自己有效角色的权限（例如 manager 不能授出 owner）
    if (effect === 'allow' && policy) {
      const actorRole: ResourceRole = isOwner ? 'owner' : (decision.allowed ? decision.effectiveRole : 'viewer')
      if (ROLE_RANK[role] > ROLE_RANK[actorRole]) {
        throw new Error('permission denied: CANNOT_EXCEED_OWN_ROLE')
      }
    }
    const written = this.db
      .prepare(
        `INSERT INTO record_grants
          (workspace_id, collection, record_id, subject_type, subject_id, role, effect, granted_by, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, collection, record_id, subject_type, subject_id)
         DO UPDATE SET role = excluded.role, effect = excluded.effect, granted_by = excluded.granted_by, created_at = excluded.created_at
         WHERE record_grants.role != excluded.role OR record_grants.effect != excluded.effect OR record_grants.granted_by != excluded.granted_by`,
      )
      .run(
        resource.workspaceId,
        resource.collection,
        resource.recordId,
        subjectType,
        subjectId,
        role,
        effect,
        actorId,
        now,
      )
    if (Number(written.changes) > 0) this.dropScans(resource.workspaceId, resource.collection)
  }

  /** 显式拒绝某主体对记录的指定及以上权限（如 deny viewer = 全面拒绝；deny editor = 禁止写及以上）。 */
  deny(
    actorId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
    subjectType: 'account' | 'group' | 'workspace_role' | 'member_view',
    subjectId: string,
    role: ResourceRole = 'viewer',
    now = Date.now(),
  ) {
    this.grant(actorId, resource, subjectType, subjectId, role, now, 'deny')
  }

  move(
    actor: Actor,
    resource: Extract<ResourceRef, { type: 'record' }>,
    parent: Extract<ResourceRef, { type: 'record' }> | null,
    options: { inheritOnExpand?: boolean } = {},
  ) {
    this.validateMove(actor, resource, parent)
    const currentPolicy = this.policy(resource)
    const currentScope = this.resourceScope(resource, new Set(), 0)
    const parentScope = parent ? this.resourceScope(parent, new Set(), 0) : null
    // 将私密记录移入更公开的父级（如 workspace）时，默认保持独立权限，避免静默扩大可见范围；
    // 只有调用方显式传 inheritOnExpand: true 时才保持 inherit。
    const scopeExpanding =
      Boolean(parent) &&
      currentScope === 'personal' &&
      (parentScope === 'workspace' || parentScope === 'shared')
    const nextAccessMode =
      scopeExpanding && !options.inheritOnExpand && currentPolicy?.access_mode === 'inherit'
        ? 'private'
        : currentPolicy?.access_mode ?? 'private'
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
    return { scopeExpanded: scopeExpanding && Boolean(options.inheritOnExpand), preservedPrivate: scopeExpanding && !options.inheritOnExpand }
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
    if (policy.owner_account_id !== actor.accountId && !decision.allowed) {
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
      this.db
        .prepare(
          `UPDATE resource_policies
           SET access_mode = CASE WHEN access_mode = 'inherit' THEN 'private' ELSE access_mode END
           WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
        )
        .run(resource.workspaceId, resource.collection, resource.recordId)
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

  /** 当前用户在这条记录上的权限是怎么来的。继承会逐级展开，视图授权由调用方另算。 */
  roleChain(accountId: string, resource: Extract<ResourceRef, { type: 'record' }>) {
    return this.collectRoleChain(accountId, resource, new Set(), 0, true)
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
    source: 'ownership' | 'direct-grant' | 'group-grant' | 'view-grant' | 'workspace-default' | 'inherited' | 'legacy'
  }> {
    const key = `${resource.workspaceId}\t${resource.collection}\t${resource.recordId}`
    if (visited.has(key) || depth > 64) return []
    visited.add(key)
    const title = top ? '这条内容' : '上一级内容'
    const base = { id: key, collection: resource.collection, recordId: resource.recordId, title }
    const policy = this.policy(resource)
    if (!policy) {
      const ownerId = this.legacyOwnerId(resource)
      if (!ownerId) return []
      if (ownerId === accountId) return [{ ...base, detail: '你是创建者', role: 'owner', source: 'ownership' }]
      if (this.membershipKind(accountId, resource.workspaceId) !== 'member') return []
      const role: ResourceRole = this.membership(accountId, resource.workspaceId) === 'viewer' ? 'viewer' : 'editor'
      return [{ ...base, detail: '沿用空间里的旧记录', role, source: 'legacy' }]
    }
    if (policy.owner_account_id === accountId) return [{ ...base, detail: '你是创建者', role: 'owner', source: 'ownership' }]
    const direct = this.directRole(accountId, resource)
    if (direct) {
      const detail = direct.source === 'group-grant'
        ? '通过成员组授权'
        : direct.source === 'view-grant'
          ? '通过成员视图授权'
          : direct.source === 'direct-grant'
            ? '直接授权给你'
            : '按空间角色授权'
      return [{ ...base, detail, role: direct.effectiveRole, source: direct.source }]
    }
    if (policy.access_mode === 'members' && this.membershipKind(accountId, resource.workspaceId) === 'member') {
      const membership = this.membership(accountId, resource.workspaceId)
      const role = memberAccessRole(policy, membership)
      const detail = role === 'manager' ? '空间管理员默认可管理' : role === 'viewer' ? '查看者默认可查看' : '空间成员默认可编辑'
      return [{ ...base, detail, role, source: 'workspace-default' }]
    }
    if (policy.access_mode === 'inherit' && policy.parent_record_id) {
      const parent = this.collectRoleChain(
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
      if (!parent.length) return []
      const concrete = parent[parent.length - 1]!
      return [{ ...base, detail: '继承上级权限', role: concrete.role, source: 'inherited' }, ...parent]
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
    if (!policy) {
      const ownerId = this.legacyOwnerId(resource)
      if (!ownerId) return null
      if (ownerId === accountId) return { effectiveRole: 'owner', source: 'legacy' }
      if (this.membershipKind(accountId, resource.workspaceId) !== 'member') return null
      return {
        effectiveRole: this.membership(accountId, resource.workspaceId) === 'viewer' ? 'viewer' : 'editor',
        source: 'legacy',
      }
    }
    if (policy.owner_account_id === accountId) return { effectiveRole: 'owner', source: 'ownership' }

    const candidates: Array<Omit<Extract<Decision, { allowed: true }>, 'allowed'>> = []
    const direct = this.directRole(accountId, resource)
    if (direct) candidates.push(direct)

    // 显式授权（直接授权 / 成员组 / 成员视图如「全部成员=可编辑」）优先于空间默认兜底，
    // 保证与 collectRoleChain 一致，不再把空间管理员静默抬升为可管理导致列表与弹窗跳变。
    if (!direct && policy.access_mode === 'members' && this.membershipKind(accountId, resource.workspaceId) === 'member') {
      candidates.push({
        effectiveRole: memberAccessRole(policy, this.membership(accountId, resource.workspaceId)),
        source: 'workspace-default',
      })
    }
    if (policy.access_mode === 'inherit' && policy.parent_record_id) {
      const inherited = this.effectiveRole(
        accountId,
        {
          type: 'record',
          workspaceId: resource.workspaceId,
          collection: policy.parent_collection || resource.collection,
          recordId: policy.parent_record_id,
        },
        visited,
        depth + 1,
      )
      if (inherited && 'reason' in inherited) return inherited
      if (inherited) candidates.push({ effectiveRole: inherited.effectiveRole, source: 'inherited' })
    }
    if (!candidates.length) return null
    candidates.sort((a, b) => ROLE_RANK[b.effectiveRole] - ROLE_RANK[a.effectiveRole])
    return candidates[0]!
  }

  /**
   * 非提权公理（No-Amplification Axiom）：
   * 仅校验授权人 grantedBy 通过非视图路径（所有权 / 直接授权 / 成员组 / 空间默认 / 父子继承）
   * 对目标记录具备分享权（manager / owner）。绝不递归使用 view_grants 背书，从根上杜绝：
   * 1. 分享自定义视图 A 时把其他成员的私密记录混进结果集（10 条变 20 条）；
   * 2. 被授权人 B 把通过视图看到的 A 的数据二次转授给第三方。
   */
  canGrantorShareRecord(
    grantorId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
  ): boolean {
    if (!grantorId) return false
    const membership = this.membership(grantorId, resource.workspaceId)
    if (!membership || membership === 'viewer') return false
    const resolved = this.effectiveRole(grantorId, resource, new Set(), 0)
    if (!resolved || 'reason' in resolved) return false
    const denied = resolved.source === 'ownership' ? null : this.directDenyRole(grantorId, resource)
    const afterDeny = applyRoleDeny(resolved.effectiveRole, denied)
    if (!afterDeny) return false
    return roleCoversAction(afterDeny, 'resource:share')
  }

  private dataViewRole(
    accountId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
  ): { allow: { effectiveRole: ResourceRole; source: 'data-view-grant' } | null; deny: ResourceRole | null } {
    if (!this.dataViewMatcher) return { allow: null, deny: null }
    const scan = this.scans.get(collectionScanKey(resource.workspaceId, resource.collection, accountId))
    let rows: ScanViewGrant[]
    let prefiltered = false
    if (scan) {
      rows = scan.actorViewGrants
      prefiltered = true
    } else {
      try {
        rows = this.db
          .prepare(
            `SELECT view_id, subject_type, subject_id, role, COALESCE(effect, 'allow') AS effect, COALESCE(granted_by, '') AS granted_by
             FROM view_grants
             WHERE workspace_id = ? AND collection = ?
             ORDER BY created_at`,
          )
          .all(resource.workspaceId, resource.collection) as ScanViewGrant[]
      } catch {
        rows = []
      }
    }
    if (!rows.length) return { allow: null, deny: null }
    const policy = this.policy(resource)
    const recordOwnerId = policy?.owner_account_id || this.legacyOwnerId(resource) || ''
    const scope = this.resourceScope(resource, new Set(), 0)
    const allowRoles: ResourceRole[] = []
    const denyRoles: ResourceRole[] = []
    for (const grant of rows) {
      if (!prefiltered) {
        const subjectMatches = grant.subject_type === 'account'
          ? grant.subject_id === accountId
          : this.matchesMemberView(resource.workspaceId, grant.subject_id, accountId)
        if (!subjectMatches) continue
      }
      // 任何 allow 视图授权都必须满足非提权公理：授权人本人必须对该记录拥有非视图来源的分享/管理权
      if (grant.effect !== 'deny' && !this.canGrantorShareRecord(grant.granted_by, resource)) {
        continue
      }
      const matched = this.dataViewMatcher(
        resource.workspaceId,
        resource.collection,
        grant.view_id,
        resource.recordId,
        {
          grantedBy: grant.granted_by,
          recordOwnerId,
          scope,
          record: resource.record,
        },
      )
      if (!matched) continue
      if (grant.effect === 'deny') denyRoles.push(grant.role)
      else allowRoles.push(grant.role)
    }
    const best = maxRole(allowRoles)
    return {
      allow: best ? { effectiveRole: best, source: 'data-view-grant' } : null,
      deny: minRole(denyRoles),
    }
  }

  private directRole(accountId: string, resource: Extract<ResourceRef, { type: 'record' }>) {
    const scan = this.scans.get(collectionScanKey(resource.workspaceId, resource.collection, accountId))
    const rows = scan ? this.scanGrantsFor(scan, resource.recordId) : this.queryDirectGrants(accountId, resource)
    const matched = rows.filter((row) =>
      row.effect !== 'deny' && (
        row.subject_type !== 'member_view'
        || this.matchesMemberView(resource.workspaceId, row.subject_id, accountId)
      ),
    )
    const role = maxRole(matched.map((row) => row.role))
    if (!role) return null
    const source = matched.some((row) => row.subject_type === 'account' && row.role === role)
      ? 'direct-grant'
      : matched.some((row) => row.subject_type === 'group' && row.role === role)
        ? 'group-grant'
        : matched.some((row) => row.subject_type === 'member_view' && row.role === role)
          ? 'view-grant'
          : 'workspace-default'
    return { effectiveRole: role, source } as const
  }

  private directDenyRole(accountId: string, resource: Extract<ResourceRef, { type: 'record' }>): ResourceRole | null {
    const scan = this.scans.get(collectionScanKey(resource.workspaceId, resource.collection, accountId))
    const rows = scan ? this.scanGrantsFor(scan, resource.recordId) : this.queryDirectGrants(accountId, resource)
    const denied = rows.filter((row) =>
      row.effect === 'deny' && (
        row.subject_type !== 'member_view'
        || this.matchesMemberView(resource.workspaceId, row.subject_id, accountId)
      ),
    )
    return minRole(denied.map((row) => row.role))
  }

  private queryDirectGrants(accountId: string, resource: Extract<ResourceRef, { type: 'record' }>) {
    return this.db
      .prepare(
        `SELECT g.subject_type, g.subject_id, g.role, COALESCE(g.effect, 'allow') AS effect
         FROM record_grants g
         WHERE g.workspace_id = ? AND g.collection = ? AND g.record_id = ?
           AND (
             (g.subject_type = 'account' AND g.subject_id = ?)
             OR (g.subject_type = 'workspace_role' AND g.subject_id = ?)
             OR (
               g.subject_type = 'group' AND EXISTS (
                 SELECT 1 FROM workspace_group_members gm
                 JOIN workspace_groups wg ON wg.id = gm.group_id
                 WHERE gm.group_id = g.subject_id
                   AND gm.account_id = ?
                   AND wg.workspace_id = g.workspace_id
               )
             )
             OR g.subject_type = 'member_view'
           )`,
      )
      .all(
        resource.workspaceId,
        resource.collection,
        resource.recordId,
        accountId,
        this.membership(accountId, resource.workspaceId) ?? '',
        accountId,
      ) as ScanGrant[]
  }

  private scanGrantsFor(scan: CollectionScan, recordId: string) {
    return (scan.grants.get(recordId) ?? []).filter((row) => {
      if (row.subject_type === 'account') return row.subject_id === scan.accountId
      if (row.subject_type === 'workspace_role') return row.subject_id === (scan.membership ?? '')
      if (row.subject_type === 'group') return scan.groups.has(row.subject_id)
      return row.subject_type === 'member_view'
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

  private legacyOwnerId(resource: Extract<ResourceRef, { type: 'record' }>) {
    const scan = this.collectionScan(resource.workspaceId, resource.collection)
    if (scan) return scan.owners.get(resource.recordId)
    const row = this.db
      .prepare(
        `SELECT owner_id FROM record_owners
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .get(resource.workspaceId, resource.collection, resource.recordId) as { owner_id: string } | undefined
    return row?.owner_id
  }

  private membership(accountId: string, workspaceId: string): WorkspaceRole | null {
    for (const scan of this.scans.values()) {
      if (scan.accountId === accountId && scan.workspaceId === workspaceId) return scan.membership
    }
    return this.readMembership(accountId, workspaceId)
  }

  private membershipKind(accountId: string, workspaceId: string): 'member' | 'external' | 'guest' {
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
