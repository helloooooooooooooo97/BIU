import type { DatabaseSync } from 'node:sqlite'
import { currentAccountId } from '@biu/host-plugin-loader/data-dir'

export type Actor =
  | { type: 'account'; accountId: string; workspaceId: string }
  | { type: 'agent'; accountId: string; delegatedBy: string; workspaceId: string; sessionId?: string }
  | { type: 'public-link'; shareTokenId: string; accountId?: string; workspaceId?: string }

export type Action =
  | 'resource:list'
  | 'resource:read'
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

export type ResourceRole = 'viewer' | 'editor' | 'manager' | 'owner'
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
}

type ScanViewGrant = {
  view_id: string
  subject_type: 'account' | 'member_view'
  subject_id: string
  role: ResourceRole
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

const ROLE_RANK: Record<ResourceRole, number> = { viewer: 1, editor: 2, manager: 3, owner: 4 }

function collectionScanKey(workspaceId: string, collection: string, accountId: string) {
  return `${workspaceId}\t${collection}\t${accountId}`
}

function maxRole(roles: ResourceRole[]) {
  return roles.sort((a, b) => ROLE_RANK[b] - ROLE_RANK[a])[0] ?? null
}

export function roleCoversAction(role: ResourceRole, action: Action) {
  return ROLE_RANK[role] >= ROLE_RANK[requiredRole(action)]
}

function memberAccessRole(policy: PolicyRow, membership: string): ResourceRole {
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

  currentActor(): Actor | null {
    const accountId = currentAccountId()
    if (!accountId) return null
    const workspaceId = this.activeWorkspaceFor(accountId)
    return workspaceId ? { type: 'account', accountId, workspaceId } : null
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
        `SELECT record_id, subject_type, subject_id, role
         FROM record_grants
         WHERE workspace_id = ? AND collection = ?`,
      )
      .all(workspaceId, collection) as Array<ScanGrant & { record_id: string }>) {
      const list = grants.get(row.record_id) ?? []
      list.push({ subject_type: row.subject_type, subject_id: row.subject_id, role: row.role })
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
          `SELECT view_id, subject_type, subject_id, role, COALESCE(granted_by, '') AS granted_by
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
        membership === 'owner' ? 'owner' : membership === 'viewer' ? 'viewer' : 'manager'
      return ROLE_RANK[effectiveRole] >= ROLE_RANK[requiredRole(action)]
        ? { allowed: true, effectiveRole, source: 'workspace-default' }
        : { allowed: false, reason: 'INSUFFICIENT_PERMISSION' }
    }

    const resolved = this.effectiveRole(actor.accountId, resource, new Set(), 0)
    if (resolved && 'reason' in resolved) return resolved
    const viaView = this.dataViewRole(actor.accountId, resource)
    const combined = resolved && viaView
      ? (ROLE_RANK[resolved.effectiveRole] >= ROLE_RANK[viaView.effectiveRole] ? resolved : viaView)
      : (resolved ?? viaView)
    if (!combined) return { allowed: false, reason: 'PRIVATE_RESOURCE' }
    const effective = membership === 'viewer'
      ? { effectiveRole: 'viewer' as const, source: combined.source }
      : combined
    if (ROLE_RANK[effective.effectiveRole] < ROLE_RANK[requiredRole(action)]) {
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
        actor.accountId,
        accessMode,
        input.memberDefaultRole ?? 'viewer',
        parentCollection,
        parentRecordId,
        actor.accountId,
        now,
      )
    this.grant(actor.accountId, resource, 'account', actor.accountId, 'owner', now)
    if (Number(inserted.changes) > 0) this.dropScans(resource.workspaceId, resource.collection)
  }

  grant(
    actorId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
    subjectType: 'account' | 'group' | 'workspace_role' | 'member_view',
    subjectId: string,
    role: ResourceRole,
    now = Date.now(),
  ) {
    const actor: Actor = { type: 'account', accountId: actorId, workspaceId: resource.workspaceId }
    const decision = this.authorize(actor, 'resource:manage-permissions', resource)
    const policy = this.policy(resource)
    if (policy && policy.owner_account_id !== actorId && !decision.allowed) {
      throw new Error('permission denied: INSUFFICIENT_PERMISSION')
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
  ) {
    this.validateMove(actor, resource, parent)
    this.db
      .prepare(
        `UPDATE resource_policies
         SET parent_collection = ?, parent_record_id = ?
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      .run(
        parent?.collection ?? '',
        parent?.recordId ?? '',
        resource.workspaceId,
        resource.collection,
        resource.recordId,
      )
    this.dropScans(resource.workspaceId, resource.collection)
    if (parent) this.dropScans(parent.workspaceId, parent.collection)
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
      return {
        effectiveRole: this.membership(accountId, resource.workspaceId) === 'viewer' ? 'viewer' : 'editor',
        source: 'legacy',
      }
    }
    if (policy.owner_account_id === accountId) return { effectiveRole: 'owner', source: 'ownership' }

    const direct = this.directRole(accountId, resource)
    if (direct) return direct

    if (policy.access_mode === 'private' || policy.access_mode === 'restricted') return null
    if (policy.access_mode === 'members') {
      if (this.membershipKind(accountId, resource.workspaceId) !== 'member') return null
      return {
        effectiveRole: memberAccessRole(policy, this.membership(accountId, resource.workspaceId)),
        source: 'workspace-default',
      }
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
      if (!inherited || 'reason' in inherited) return inherited
      return { effectiveRole: inherited.effectiveRole, source: 'inherited' }
    }
    return null
  }

  private dataViewRole(
    accountId: string,
    resource: Extract<ResourceRef, { type: 'record' }>,
  ): { effectiveRole: ResourceRole; source: 'data-view-grant' } | null {
    if (!this.dataViewMatcher) return null
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
            `SELECT view_id, subject_type, subject_id, role, COALESCE(granted_by, '') AS granted_by
             FROM view_grants
             WHERE workspace_id = ? AND collection = ?
             ORDER BY created_at`,
          )
          .all(resource.workspaceId, resource.collection) as ScanViewGrant[]
      } catch {
        rows = []
      }
    }
    if (!rows.length) return null
    const policy = this.policy(resource)
    const recordOwnerId = policy?.owner_account_id || this.legacyOwnerId(resource) || ''
    const scope = this.resourceScope(resource, new Set(), 0)
    const roles: ResourceRole[] = []
    for (const grant of rows) {
      if (!prefiltered) {
        const subjectMatches = grant.subject_type === 'account'
          ? grant.subject_id === accountId
          : this.matchesMemberView(resource.workspaceId, grant.subject_id, accountId)
        if (!subjectMatches) continue
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
      if (matched) roles.push(grant.role)
    }
    const best = maxRole(roles)
    return best ? { effectiveRole: best, source: 'data-view-grant' } : null
  }

  private directRole(accountId: string, resource: Extract<ResourceRef, { type: 'record' }>) {
    const scan = this.scans.get(collectionScanKey(resource.workspaceId, resource.collection, accountId))
    const rows = scan ? this.scanGrantsFor(scan, resource.recordId) : this.queryDirectGrants(accountId, resource)
    const matched = rows.filter((row) =>
      row.subject_type !== 'member_view'
      || this.matchesMemberView(resource.workspaceId, row.subject_id, accountId),
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

  private queryDirectGrants(accountId: string, resource: Extract<ResourceRef, { type: 'record' }>) {
    return this.db
      .prepare(
        `SELECT g.subject_type, g.subject_id, g.role
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
