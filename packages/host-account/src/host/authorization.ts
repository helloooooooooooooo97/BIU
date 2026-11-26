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
export type AccessMode = 'inherit' | 'private' | 'members' | 'restricted'
export type WorkspaceRole = 'viewer' | 'member' | 'admin' | 'owner'

export type DynamicGroupMatcher = (
  workspaceId: string,
  filterTreeJson: string,
  accountId: string,
) => boolean

export type AccessRuleMatcher = (
  workspaceId: string,
  collection: string,
  filterTreeJson: string,
  recordId: string,
  context: {
    createdBy?: string
    recordOwnerId?: string
    scope: 'personal' | 'workspace' | 'shared' | null
    record?: Record<string, unknown>
  },
) => boolean

export type Decision =
  | {
      allowed: true
      effectiveRole: ResourceRole
      source: 'ownership' | 'direct-grant' | 'group-grant' | 'access-rule' | 'workspace-default' | 'inherited' | 'legacy'
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
  ownerTable?: string
  inheritParent?: boolean
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
  owner_table?: string
  inherit_parent?: number
}

export function ownerTableForPolicy(
  policy: Pick<PolicyRow, 'owner_table' | 'access_mode' | 'owner_account_id'>,
): string {
  const explicit = policy.owner_table?.trim()
  if (explicit) return explicit
  if (policy.access_mode === 'members') return 'workspace'
  return policy.owner_account_id ? `account:${policy.owner_account_id}` : 'workspace'
}

type ScanGrant = {
  subject_type: 'account' | 'group' | 'workspace_role'
  subject_id: string
  role: ResourceRole
}

type ScanAccessRuleGrant = {
  rule_id: string
  created_by: string
  owner_table?: string
  filter_tree_json: string
  subject_type: 'account' | 'workspace' | 'group'
  subject_id: string
  role: ResourceRole
}

type CollectionScan = {
  refs: number
  workspaceId: string
  collection: string
  accountId: string
  policies: Map<string, PolicyRow>
  owners: Map<string, string>
  grants: Map<string, ScanGrant[]>
  accessRuleGrants: ScanAccessRuleGrant[]
  actorAccessRuleGrants: ScanAccessRuleGrant[]
  groups: Set<string>
  membership: WorkspaceRole | null
  membershipKind: 'member' | 'external' | 'guest'
}

const POLICY_SELECT = `workspace_id, collection, record_id, owner_account_id, access_mode,
                member_default_role, parent_collection, parent_record_id, owner_table, inherit_parent`
const POLICY_SELECT_LEGACY = `workspace_id, collection, record_id, owner_account_id, access_mode,
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

function minRole(roles: ResourceRole[]): ResourceRole | null {
  if (!roles.length) return null
  return roles.sort((a, b) => ROLE_RANK[a] - ROLE_RANK[b])[0] ?? null
}

export function roleCoversAction(role: ResourceRole, action: Action) {
  return ROLE_CAPABILITIES[role].has(requiredCapability(action))
}

function memberAccessRole(policy: PolicyRow, membership: string | null): ResourceRole {
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
  private dynamicGroupMatcher?: DynamicGroupMatcher
  private accessRuleMatcher?: AccessRuleMatcher
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

  setDynamicGroupMatcher(matcher: DynamicGroupMatcher) {
    this.dynamicGroupMatcher = matcher
  }

  setAccessRuleMatcher(matcher: AccessRuleMatcher) {
    this.accessRuleMatcher = matcher
  }

  hasAccessRuleMatcher() {
    return Boolean(this.accessRuleMatcher)
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
    let policyRows: PolicyRow[]
    try {
      policyRows = this.db
        .prepare(`SELECT ${POLICY_SELECT} FROM resource_policies WHERE workspace_id = ? AND collection = ?`)
        .all(workspaceId, collection) as PolicyRow[]
    } catch {
      policyRows = this.db
        .prepare(`SELECT ${POLICY_SELECT_LEGACY} FROM resource_policies WHERE workspace_id = ? AND collection = ?`)
        .all(workspaceId, collection) as PolicyRow[]
    }
    for (const row of policyRows) {
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
        `SELECT record_id, subject_type, subject_id, role
         FROM record_grants
         WHERE workspace_id = ? AND collection = ?`,
      )
      .all(workspaceId, collection) as Array<ScanGrant & { record_id: string }>) {
      const list = grants.get(row.record_id) ?? []
      list.push({ subject_type: row.subject_type, subject_id: row.subject_id, role: row.role })
      grants.set(row.record_id, list)
    }
    const groups = this.computeMatchedGroups(workspaceId, accountId)
    const membership = this.readMembership(accountId, workspaceId)
    const membershipKind = this.readMembershipKind(accountId, workspaceId)
    let accessRuleGrants: ScanAccessRuleGrant[] = []
    try {
      accessRuleGrants = this.db
        .prepare(
          `SELECT r.id AS rule_id, r.created_by, r.owner_table, r.filter_tree_json, g.subject_type, g.subject_id, g.role
           FROM access_rules r
           JOIN access_rule_grants g ON g.rule_id = r.id
           WHERE r.workspace_id = ? AND r.collection = ? AND r.enabled = 1
           ORDER BY g.created_at`,
        )
        .all(workspaceId, collection) as ScanAccessRuleGrant[]
    } catch {
      try {
        accessRuleGrants = this.db
          .prepare(
            `SELECT r.id AS rule_id, r.created_by, r.filter_tree_json, g.subject_type, g.subject_id, g.role
             FROM access_rules r
             JOIN access_rule_grants g ON g.rule_id = r.id
             WHERE r.workspace_id = ? AND r.collection = ? AND r.enabled = 1
             ORDER BY g.created_at`,
          )
          .all(workspaceId, collection) as ScanAccessRuleGrant[]
      } catch {
        accessRuleGrants = []
      }
    }
    const actorAccessRuleGrants = accessRuleGrants.filter((grant) =>
      grant.subject_type === 'account'
        ? grant.subject_id === accountId
        : grant.subject_type === 'workspace'
          ? grant.subject_id === workspaceId && membershipKind === 'member'
          : grant.subject_type === 'group' && groups.has(grant.subject_id),
    )
    this.scans.set(key, {
      refs: 1,
      workspaceId,
      collection,
      accountId,
      policies,
      owners,
      grants,
      accessRuleGrants,
      actorAccessRuleGrants,
      groups,
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

  private computeMatchedGroups(workspaceId: string, accountId: string): Set<string> {
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
    if (this.dynamicGroupMatcher) {
      try {
        const dynamicGroups = this.db
          .prepare(
            `SELECT id, filter_tree_json
             FROM workspace_groups
             WHERE workspace_id = ? AND kind = 'dynamic'`,
          )
          .all(workspaceId) as Array<{ id: string; filter_tree_json: string | null }>
        for (const row of dynamicGroups) {
          if (this.dynamicGroupMatcher(workspaceId, row.filter_tree_json || '{}', accountId)) {
            groups.add(row.id)
          }
        }
      } catch {
        /* 兼容缺少 kind / filter_tree_json 列的旧测试库 */
      }
    }
    return groups
  }

  matchedGroupsFor(workspaceId: string, accountId: string): Set<string> {
    for (const scan of this.scans.values()) {
      if (scan.workspaceId === workspaceId && scan.accountId === accountId) {
        return scan.groups
      }
    }
    return this.computeMatchedGroups(workspaceId, accountId)
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

    const resolved = this.effectiveRole(actor.accountId, resource, new Set(), 0)
    if (resolved && 'reason' in resolved) return resolved
    // K+1 逻辑表：禁止在他人个人表父节点下新建子记录（多人共创统一走空间表）
    if (action === 'resource:create-child') {
      const targetOwnerTable = this.ownerTableOf(resource)
      if (targetOwnerTable && targetOwnerTable.startsWith('account:') && targetOwnerTable !== `account:${actor.accountId}`) {
        return { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
      }
    }
    // 视图归展示，规则归安全：底层数据记录只认本表基线、同表继承/单条授权与本表 access_rules
    const viaRule = this.accessRuleRole(actor.accountId, resource)
    const candidates = [resolved, viaRule].filter(Boolean) as Array<{
      effectiveRole: ResourceRole
      source: 'ownership' | 'direct-grant' | 'group-grant' | 'access-rule' | 'workspace-default' | 'inherited' | 'legacy'
    }>
    candidates.sort((a, b) => ROLE_RANK[b.effectiveRole] - ROLE_RANK[a.effectiveRole])
    const combined = candidates[0] ?? null
    if (!combined) return { allowed: false, reason: 'PRIVATE_RESOURCE' }
    const effective = membership === 'viewer' || memberKind === 'guest'
      ? { effectiveRole: 'viewer' as const, source: combined.source }
      : { effectiveRole: combined.effectiveRole, source: combined.source }
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

  /** 返回记录所属的逻辑表（'workspace' 或 'account:<id>'）。 */
  ownerTableOf(resource: Extract<ResourceRef, { type: 'record' }>): string | null {
    return this.resolveOwnerTable(resource, new Set(), 0)
  }

  private resolveOwnerTable(
    resource: Extract<ResourceRef, { type: 'record' }>,
    visited: Set<string>,
    depth: number,
  ): string | null {
    const key = `${resource.workspaceId}\t${resource.collection}\t${resource.recordId}`
    if (visited.has(key) || depth > 64) return null
    visited.add(key)
    const policy = this.policy(resource)
    if (!policy) {
      return this.legacyOwnerId(resource) ? 'workspace' : null
    }
    if (policy.owner_table && policy.owner_table.trim()) {
      return policy.owner_table.trim()
    }
    if (policy.access_mode === 'inherit' && policy.parent_record_id) {
      return this.resolveOwnerTable(
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
    return ownerTableForPolicy(policy)
  }

  private resourceScope(
    resource: Extract<ResourceRef, { type: 'record' }>,
    visited: Set<string>,
    depth: number,
  ): 'personal' | 'workspace' | 'shared' | null {
    const ownerTable = this.resolveOwnerTable(resource, visited, depth)
    if (!ownerTable) return null
    return ownerTable === 'workspace' ? 'workspace' : 'personal'
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
    let ownerTable = input.ownerTable?.trim() || ''
    if (!ownerTable) {
      if (accessMode === 'members') {
        ownerTable = 'workspace'
      } else if (parentRecordId && accessMode === 'inherit') {
        const parentTable = this.ownerTableOf({
          type: 'record',
          workspaceId: resource.workspaceId,
          collection: parentCollection,
          recordId: parentRecordId,
        })
        ownerTable = parentTable || `account:${accountId}`
      } else {
        ownerTable = `account:${accountId}`
      }
    }
    const inheritParent = input.inheritParent !== undefined
      ? (input.inheritParent ? 1 : 0)
      : (accessMode === 'inherit' && Boolean(parentRecordId) ? 1 : 0)
    let inserted: { changes: number | bigint }
    try {
      inserted = this.db
        .prepare(
          `INSERT INTO resource_policies
            (workspace_id, collection, record_id, owner_account_id, access_mode,
             member_default_role, parent_collection, parent_record_id, created_by, created_at, owner_table, inherit_parent)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
          ownerTable,
          inheritParent,
        )
    } catch {
      inserted = this.db
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
    }
    this.grant(accountId, resource, 'account', accountId, 'owner', now)
    if (Number(inserted.changes) > 0) this.dropScans(resource.workspaceId, resource.collection)
  }

  grant(
    actorId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
    subjectType: 'account' | 'group' | 'workspace_role',
    subjectId: string,
    role: ResourceRole,
    now = Date.now(),
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
    // 禁止角色放大：授权人不能授予高于自己有效角色的权限（例如 manager 不能授出 owner）
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
    if (Number(written.changes) > 0) this.dropScans(resource.workspaceId, resource.collection)
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
    // 只有调用方显式传 inheritOnExpand: true 时才保持 inherit 并转入父级归属表。
    const scopeExpanding =
      Boolean(parent) &&
      currentScope === 'personal' &&
      (parentScope === 'workspace' || parentScope === 'shared')
    const nextAccessMode =
      scopeExpanding && !options.inheritOnExpand && currentPolicy?.access_mode === 'inherit'
        ? 'private'
        : currentPolicy?.access_mode ?? 'private'
    const currentTable = this.ownerTableOf(resource) || (currentPolicy ? ownerTableForPolicy(currentPolicy) : `account:${actor.accountId ?? ''}`)
    const parentTable = parent ? this.ownerTableOf(parent) : null
    const nextOwnerTable =
      scopeExpanding && options.inheritOnExpand && parentTable
        ? parentTable
        : currentTable
    const nextInheritParent =
      Boolean(parent) && nextAccessMode === 'inherit' && (!parentTable || parentTable === nextOwnerTable) ? 1 : 0
    try {
      this.db
        .prepare(
          `UPDATE resource_policies
           SET parent_collection = ?, parent_record_id = ?, access_mode = ?, owner_table = ?, inherit_parent = ?
           WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
        )
        .run(
          parent?.collection ?? '',
          parent?.recordId ?? '',
          nextAccessMode,
          nextOwnerTable,
          nextInheritParent,
          resource.workspaceId,
          resource.collection,
          resource.recordId,
        )
    } catch {
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
    }
    this.dropScans(resource.workspaceId, resource.collection)
    if (parent) this.dropScans(parent.workspaceId, parent.collection)
    return { scopeExpanded: scopeExpanding && Boolean(options.inheritOnExpand), preservedPrivate: scopeExpanding && !options.inheritOnExpand }
  }

  /**
   * 显式转移记录的逻辑表归属（个人表 ↔ 空间表）。
   * 铁律：
   * 1. 个人表 → 空间表：仅个人表主人（owner）可操作，被授 manager 的协作者不可擅自转移归属。
   * 2. 空间表 → 个人表：仅空间 owner / admin 或原创建者（只能收归给自己）可操作。
   */
  transferOwnerTable(
    actor: Actor,
    resource: Extract<ResourceRef, { type: 'record' }>,
    targetOwnerTable: string,
  ) {
    if (actor.type === 'public-link' || !actor.accountId) {
      throw new Error('permission denied: UNAUTHENTICATED')
    }
    if (actor.workspaceId !== resource.workspaceId) {
      throw new Error('permission denied: WRONG_WORKSPACE')
    }
    const target = targetOwnerTable.trim()
    if (target !== 'workspace' && !target.startsWith('account:')) {
      throw new Error('invalid ownerTable')
    }
    const policy = this.policy(resource)
    if (!policy) throw new Error('unknown resource')
    const currentTable = this.ownerTableOf(resource) || ownerTableForPolicy(policy)
    if (currentTable === target) return { ownerTable: target, changed: false }

    const membership = this.membership(actor.accountId, resource.workspaceId)
    const isWsAdmin = membership === 'owner' || membership === 'admin'

    if (currentTable.startsWith('account:')) {
      // 个人表记录：仅表主人本人（owner）可转移归属
      const tableOwnerId = currentTable.slice('account:'.length)
      if (actor.accountId !== tableOwnerId && policy.owner_account_id !== actor.accountId) {
        throw new Error('permission denied: PERSONAL_OWNER_ONLY')
      }
      if (target === 'workspace' && this.membershipKind(actor.accountId, resource.workspaceId) !== 'member') {
        throw new Error('permission denied: INSUFFICIENT_PERMISSION')
      }
    } else {
      // 空间表记录 → 个人表：空间 owner/admin，或原创建者收归给自己
      const targetAccountId = target.startsWith('account:') ? target.slice('account:'.length) : ''
      const isCreatorReclaimingSelf =
        policy.owner_account_id === actor.accountId && targetAccountId === actor.accountId
      if (!isWsAdmin && !isCreatorReclaimingSelf) {
        throw new Error('permission denied: INSUFFICIENT_PERMISSION')
      }
    }

    const nextAccessMode: AccessMode = target === 'workspace' ? 'members' : 'private'
    const nextMemberDefaultRole = target === 'workspace' ? 'editor' : 'viewer'
    const nextOwnerAccountId = target.startsWith('account:') ? target.slice('account:'.length) : policy.owner_account_id
    try {
      this.db
        .prepare(
          `UPDATE resource_policies
           SET owner_table = ?, owner_account_id = ?, access_mode = ?, member_default_role = ?, inherit_parent = 0
           WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
        )
        .run(
          target,
          nextOwnerAccountId,
          nextAccessMode,
          nextMemberDefaultRole,
          resource.workspaceId,
          resource.collection,
          resource.recordId,
        )
    } catch {
      this.db
        .prepare(
          `UPDATE resource_policies
           SET owner_account_id = ?, access_mode = ?, member_default_role = ?
           WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
        )
        .run(
          nextOwnerAccountId,
          nextAccessMode,
          nextMemberDefaultRole,
          resource.workspaceId,
          resource.collection,
          resource.recordId,
        )
    }
    this.dropScans(resource.workspaceId, resource.collection)
    return { ownerTable: target, changed: true }
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
      const parentTable = this.ownerTableOf({
        type: 'record',
        workspaceId: resource.workspaceId,
        collection: policy.parent_collection || resource.collection,
        recordId: policy.parent_record_id,
      })
      const currentTable = this.ownerTableOf(resource)
      if (parentTable && currentTable && parentTable !== currentTable) {
        throw new Error('permission denied: CROSS_TABLE_INHERIT_FORBIDDEN')
      }
      try {
        this.db
          .prepare(
            `UPDATE resource_policies
             SET access_mode = 'inherit', inherit_parent = 1
             WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
          )
          .run(resource.workspaceId, resource.collection, resource.recordId)
      } catch {
        this.db
          .prepare(
            `UPDATE resource_policies
             SET access_mode = 'inherit'
             WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
          )
          .run(resource.workspaceId, resource.collection, resource.recordId)
      }
    } else {
      const currentTable = this.ownerTableOf(resource)
      const fallbackMode: AccessMode = currentTable === 'workspace' ? 'members' : 'private'
      try {
        this.db
          .prepare(
            `UPDATE resource_policies
             SET access_mode = CASE WHEN access_mode = 'inherit' THEN ? ELSE access_mode END,
                 inherit_parent = 0
             WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
          )
          .run(fallbackMode, resource.workspaceId, resource.collection, resource.recordId)
      } catch {
        this.db
          .prepare(
            `UPDATE resource_policies
             SET access_mode = CASE WHEN access_mode = 'inherit' THEN ? ELSE access_mode END
             WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
          )
          .run(fallbackMode, resource.workspaceId, resource.collection, resource.recordId)
      }
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

  private resolveLocalPolicyRole(
    accountId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
    policy: PolicyRow | null | undefined,
  ): {
    role: ResourceRole
    source: 'ownership' | 'direct-grant' | 'group-grant' | 'workspace-default' | 'legacy'
    detail: string
  } | null {
    if (!policy) {
      const ownerId = this.legacyOwnerId(resource)
      if (!ownerId) return null
      if (ownerId === accountId) return { role: 'owner', source: 'legacy', detail: '你是创建者' }
      if (this.membershipKind(accountId, resource.workspaceId) !== 'member') return null
      const wsRole = this.membership(accountId, resource.workspaceId)
      const role: ResourceRole =
        wsRole === 'owner' || wsRole === 'admin'
          ? 'manager'
          : wsRole === 'viewer'
            ? 'viewer'
            : 'editor'
      return { role, source: 'legacy', detail: '沿用空间里的旧记录' }
    }
    const ownerTable = ownerTableForPolicy(policy)
    const tableOwnerId = ownerTable.startsWith('account:') ? ownerTable.slice('account:'.length) : ''
    if (policy.owner_account_id === accountId || (tableOwnerId && tableOwnerId === accountId)) {
      return { role: 'owner', source: 'ownership', detail: '你是创建者' }
    }
    const direct = this.directRole(accountId, resource)
    let workspaceBaseline: { role: ResourceRole; source: 'workspace-default'; detail: string } | null = null
    if (
      (ownerTable === 'workspace' || policy.access_mode === 'members') &&
      this.membershipKind(accountId, resource.workspaceId) === 'member'
    ) {
      const wsRole = this.membership(accountId, resource.workspaceId)
      if (wsRole === 'owner' || wsRole === 'admin') {
        workspaceBaseline = { role: 'manager', source: 'workspace-default', detail: '空间管理员默认可管理' }
      } else {
        const role = memberAccessRole(policy, wsRole)
        const detail = role === 'viewer' ? '查看者默认可查看' : '空间成员默认可编辑'
        workspaceBaseline = { role, source: 'workspace-default', detail }
      }
    }
    if (direct && (!workspaceBaseline || ROLE_RANK[direct.effectiveRole] >= ROLE_RANK[workspaceBaseline.role])) {
      const detail = direct.source === 'group-grant'
        ? '通过成员组授权'
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
    source: 'ownership' | 'direct-grant' | 'group-grant' | 'workspace-default' | 'inherited' | 'legacy'
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
      return [{ ...base, detail: local.detail, role: local.role, source: local.source === 'legacy' && local.role === 'owner' ? 'ownership' : local.source }]
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
      (policy.inherit_parent === 1 || policy.access_mode === 'inherit'),
    )
    if (shouldInherit && policy) {
      const parentRef: Extract<ResourceRef, { type: 'record' }> = {
        type: 'record',
        workspaceId: resource.workspaceId,
        collection: policy.parent_collection || resource.collection,
        recordId: policy.parent_record_id,
      }
      // K+1 同表树继承：跨表时不继承父级授权（防静默扩权）
      const childTable = policy.owner_table?.trim()
      const parentTable = childTable ? this.ownerTableOf(parentRef) : null
      if (!childTable || !parentTable || childTable === parentTable) {
        const inherited = this.effectiveRole(accountId, parentRef, visited, depth + 1)
        if (inherited && 'reason' in inherited) return inherited
        if (inherited) candidates.push({ effectiveRole: inherited.effectiveRole, source: 'inherited' })
      }
    }
    if (!candidates.length) return null
    candidates.sort((a, b) => ROLE_RANK[b.effectiveRole] - ROLE_RANK[a.effectiveRole])
    return candidates[0]!
  }

  private accessRuleRole(
    accountId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
  ): { effectiveRole: ResourceRole; source: 'access-rule' } | null {
    if (!this.accessRuleMatcher) return null
    const scan = this.scans.get(collectionScanKey(resource.workspaceId, resource.collection, accountId))
    let rows: ScanAccessRuleGrant[]
    let prefiltered = false
    if (scan) {
      rows = scan.actorAccessRuleGrants
      prefiltered = true
    } else {
      try {
        rows = this.db
          .prepare(
            `SELECT r.id AS rule_id, r.created_by, r.owner_table, r.filter_tree_json, g.subject_type, g.subject_id, g.role
             FROM access_rules r
             JOIN access_rule_grants g ON g.rule_id = r.id
             WHERE r.workspace_id = ? AND r.collection = ? AND r.enabled = 1
             ORDER BY g.created_at`,
          )
          .all(resource.workspaceId, resource.collection) as ScanAccessRuleGrant[]
      } catch {
        try {
          rows = this.db
            .prepare(
              `SELECT r.id AS rule_id, r.created_by, r.filter_tree_json, g.subject_type, g.subject_id, g.role
               FROM access_rules r
               JOIN access_rule_grants g ON g.rule_id = r.id
               WHERE r.workspace_id = ? AND r.collection = ? AND r.enabled = 1
               ORDER BY g.created_at`,
            )
            .all(resource.workspaceId, resource.collection) as ScanAccessRuleGrant[]
        } catch {
          rows = []
        }
      }
    }
    if (!rows.length) return null
    const memberKind = scan ? scan.membershipKind : this.membershipKind(accountId, resource.workspaceId)
    const policy = this.policy(resource)
    const recordOwnerId = policy?.owner_account_id || this.legacyOwnerId(resource) || ''
    const recordOwnerTable = this.ownerTableOf(resource)
    if (!recordOwnerTable) return null
    const scope = recordOwnerTable === 'workspace' ? 'workspace' : 'personal'
    const allowRoles: ResourceRole[] = []
    let matchedGroups: Set<string> | null = null
    for (const grant of rows) {
      if (!prefiltered) {
        const subjectMatches = grant.subject_type === 'account'
          ? grant.subject_id === accountId
          : grant.subject_type === 'workspace'
            ? grant.subject_id === resource.workspaceId && memberKind === 'member'
            : grant.subject_type === 'group' && (matchedGroups ??= this.matchedGroupsFor(resource.workspaceId, accountId)).has(grant.subject_id)
        if (!subjectMatches) continue
      }
      // K+1 同表分区铁律：规则只匹配其所在 owner_table 的记录，杜绝跨表提权
      const ruleOwnerTable = grant.owner_table?.trim() || (grant.created_by ? `account:${grant.created_by}` : '')
      if (!ruleOwnerTable || ruleOwnerTable !== recordOwnerTable) continue
      const matched = this.accessRuleMatcher(
        resource.workspaceId,
        resource.collection,
        grant.filter_tree_json,
        resource.recordId,
        {
          createdBy: grant.created_by,
          recordOwnerId,
          scope,
          record: resource.record,
        },
      )
      if (matched) allowRoles.push(grant.role)
    }
    const best = maxRole(allowRoles)
    return best ? { effectiveRole: best, source: 'access-rule' } : null
  }

  private directRole(accountId: string, resource: Extract<ResourceRef, { type: 'record' }>) {
    const scan = this.scans.get(collectionScanKey(resource.workspaceId, resource.collection, accountId))
    const matched = scan ? this.scanGrantsFor(scan, resource.recordId) : this.queryDirectGrants(accountId, resource)
    const role = maxRole(matched.map((row) => row.role))
    if (!role) return null
    const source = matched.some((row) => row.subject_type === 'account' && row.role === role)
      ? 'direct-grant'
      : matched.some((row) => row.subject_type === 'group' && row.role === role)
        ? 'group-grant'
        : 'workspace-default'
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
             OR (g.subject_type = 'workspace_role' AND g.subject_id = ?)
             OR g.subject_type = 'group'
           )`,
      )
      .all(
        resource.workspaceId,
        resource.collection,
        resource.recordId,
        accountId,
        this.membership(accountId, resource.workspaceId) ?? '',
      ) as ScanGrant[]
    if (!rows.some((row) => row.subject_type === 'group')) return rows
    const matchedGroups = this.matchedGroupsFor(resource.workspaceId, accountId)
    return rows.filter((row) => row.subject_type !== 'group' || matchedGroups.has(row.subject_id))
  }

  private scanGrantsFor(scan: CollectionScan, recordId: string) {
    return (scan.grants.get(recordId) ?? []).filter((row) => {
      if (row.subject_type === 'account') return row.subject_id === scan.accountId
      if (row.subject_type === 'workspace_role') return row.subject_id === (scan.membership ?? '')
      if (row.subject_type === 'group') return scan.groups.has(row.subject_id)
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
    try {
      return this.db
        .prepare(
          `SELECT ${POLICY_SELECT} FROM resource_policies
           WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
        )
        .get(resource.workspaceId, resource.collection, resource.recordId) as PolicyRow | undefined
    } catch {
      return this.db
        .prepare(
          `SELECT ${POLICY_SELECT_LEGACY} FROM resource_policies
           WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
        )
        .get(resource.workspaceId, resource.collection, resource.recordId) as PolicyRow | undefined
    }
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
