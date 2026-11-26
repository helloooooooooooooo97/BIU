import { currentAccountId, currentRequestWorkspaceId } from '@biu/host-plugin-loader/data-dir'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import { roleCoversAction, type Action as PermissionAction, type AuthorizationService } from '@biu/host-account/authorization'
import { isRegisteredBuiltinPlugin } from '@biu/host-account/store'
import type { CollectionSchema, CollectionSchemaPack, CollectionSpec, DbRecord } from '@biu/type-file-system'
import { builtinAllView, builtinAllViewId, builtinMemberViews, isBuiltinAllViewId } from '../catalog-views.ts'
import {
  assertWritableColumns,
  fullColumnPolicy,
  isContentReadable,
  isContentWritable,
  mergeColumnPolicies,
  parseColumnList,
  projectRecordColumns,
  type ColumnPolicy,
} from '../column-access.ts'
import { recordMatchesSharedView, resolveSharedView, type SharedViewDef } from '../share-view-match.ts'
import { recordMatchesAccessRule, type DataScopeName, type ViewGrantRole } from '../view-access.ts'
import {
  DATA_COLLECTION_PATH,
  EDITOR_BLOCKS_COLLECTION_PATH,
  PLUGINS_COLLECTION_PATH,
  TAGS_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
  WORKSPACE_MEMBERS_COLLECTION_PATH,
} from '../paths.ts'
import type { SharesStore } from './shares-store.ts'
import { parseStampRecordId } from './tags-collection.ts'
import type { TagStore } from './tags-store.ts'

export type WorkspaceMembership = {
  active: string | null
  home: string | null
  mine: Set<string>
  any: Set<string>
  strict?: boolean
}

export type WorkspaceFiles = {
  activeWorkspaceId(): string | null
  workspacePerson?(accountId: string): { accountId: string; workspaceId: string; name: string } | null
  membership(): WorkspaceMembership
  attach(
    workspaceId: string,
    collection: string,
    recordId: string,
    now?: number,
    policy?: {
      accessMode?: 'inherit' | 'private' | 'members' | 'restricted'
      memberDefaultRole?: 'viewer' | 'editor'
      parentCollection?: string
      parentRecordId?: string
    },
  ): void
  grantMap?(workspaceId: string, collection: string): Map<string, Set<string>>
  collectionOwnership?(workspaceId: string, collection: string): Map<string, 'personal' | 'workspace' | 'shared'>
  listActiveAccessRulesForCollection?(
    workspaceId: string,
    collection: string,
  ): Array<{
    id: string
    workspaceId: string
    collection: string
    name: string
    createdBy: string
    createdByName?: string
    ownerTable?: string
    scope?: 'workspace' | 'personal'
    filterTree: Record<string, unknown>
    columns: string[] | null
    enabled: boolean
    grants: Array<{
      id: string
      subjectType: 'account' | 'workspace' | 'group'
      subjectId: string
      role: 'viewer' | 'editor' | 'manager'
      subjectName?: string
    }>
  }>
  collectionRecordOwners?(workspaceId: string, collection: string): Map<string, string>
  isMember?(accountId: string, workspaceId: string): boolean
  members?(accountId: string, workspaceId: string): Array<{ id: string; member_kind?: string }>
  isSuperAdmin?(accountId?: string | null): boolean
}

export const SHARE_SCOPE_LABEL = {
  personal: '私人',
  workspace: '空间',
  shared: '共享',
} as const

export const ACCESS_RANK = { viewer: 1, commenter: 2, editor: 3, manager: 4, owner: 5 } as const

export function accessLabel(role: keyof typeof ACCESS_RANK | null | undefined) {
  if (role === 'editor') return '编辑'
  if (role === 'commenter') return '评论'
  if (role === 'viewer') return '查看'
  if (role === 'manager' || role === 'owner') return '管理'
  return '查看'
}

export function higherAccess(left: keyof typeof ACCESS_RANK | null, right: keyof typeof ACCESS_RANK | null) {
  if (!left) return right
  if (!right) return left
  return ACCESS_RANK[left] >= ACCESS_RANK[right] ? left : right
}

export function resolveScopeTarget(
  collection: string,
  id: string,
  row?: Record<string, unknown> | null,
) {
  if (collection === TRASH_COLLECTION_PATH || collection === DATA_COLLECTION_PATH) {
    const tablePath = String(row?.tablePath ?? '')
    const sourceId = String(row?.sourceId ?? '')
    if (tablePath && sourceId) return { collection: tablePath, id: sourceId }
    const parsed = parseStampRecordId(id)
    if (parsed) return { collection: parsed.collection, id: parsed.recordId }
  }
  if (collection === TAGS_COLLECTION_PATH) {
    const tablePath = String(row?.tablePath ?? '')
    const sourceId = String(row?.sourceId ?? '')
    if (tablePath && sourceId) return { collection: tablePath, id: sourceId }
  }
  if (collection === EDITOR_BLOCKS_COLLECTION_PATH) {
    const pageId = String(row?.pageId ?? '')
    const parent = String(row?.collection ?? '')
    if (pageId && parent) return { collection: parent, id: pageId }
    const parts = id.split('::')
    if (parts.length >= 3) {
      const parent = parts[0]!.startsWith('/') ? parts[0]! : `/${parts[0]}`
      return { collection: parent, id: parts[1]! }
    }
  }
  return { collection, id }
}

export function isRecordInWorkspace(membership: WorkspaceMembership, collection: string, id: string) {
  const key = `${collection}\t${id}`
  if (membership.mine.has(key)) return true
  if (membership.any.has(key)) return false
  if (membership.strict) return false
  return membership.active === membership.home
}

export function isBuiltinPluginRow(collection: string, row?: Record<string, unknown> | null): boolean {
  return collection === PLUGINS_COLLECTION_PATH && row?.builtin === true
}

export function isBuiltinPluginRecord(spec: CollectionSpec, id: string, record?: Record<string, unknown> | null) {
  if (spec.path !== PLUGINS_COLLECTION_PATH) return false
  return record?.builtin === true || isRegisteredBuiltinPlugin(id)
}

export type AccessPolicyHost = {
  tags: TagStore
  shares: SharesStore
  viewCatalog?: { viewsFor(collectionPath: string): SharedViewDef[] }
  collabStore(): WorkspaceFiles | undefined
  authorization(): AuthorizationService | undefined
  deviceWorkspace(): boolean
  markDeviceRecord(collection: string, id: string): void
  collection(pathOrId: string): CollectionSpec | undefined
  schemaFor(spec: CollectionSpec): CollectionSchema
  applyTagOverlay(spec: CollectionSpec, row: DbRecord): DbRecord
}

const DEFAULT_CACHE_CAPACITY = 256

class BoundedLru<K, V> {
  private readonly map = new Map<K, V>()

  constructor(private readonly maxEntries = DEFAULT_CACHE_CAPACITY) {}

  get(key: K): V | undefined {
    const value = this.map.get(key)
    if (value === undefined) return undefined
    this.map.delete(key)
    this.map.set(key, value)
    return value
  }

  set(key: K, value: V): void {
    if (this.map.has(key)) this.map.delete(key)
    else if (this.map.size >= this.maxEntries) {
      const oldest = this.map.keys().next().value
      if (oldest !== undefined) this.map.delete(oldest)
    }
    this.map.set(key, value)
  }

  delete(key: K): void {
    this.map.delete(key)
  }

  clear(): void {
    this.map.clear()
  }

  get size(): number {
    return this.map.size
  }
}

/**
 * 封装工作区数据归属（K+1 逻辑表）、权限判定（管理 / 编辑 / 阅读）、
 * 独立访问规则（access_rules）列策略与多租户有界分享状态缓存。
 */
export class DatabaseAccessPolicy {
  private readonly ownershipCache = new BoundedLru<string, Map<string, 'personal' | 'workspace' | 'shared'>>()
  private readonly ownerCache = new BoundedLru<string, Map<string, string>>()
  private readonly viewShareCache = new BoundedLru<string, SharedViewDef[]>()
  private readonly recordShareCache = new BoundedLru<string, Set<string>>()

  constructor(private readonly host: AccessPolicyHost) {}

  clearCaches() {
    this.ownershipCache.clear()
    this.ownerCache.clear()
    this.viewShareCache.clear()
    this.recordShareCache.clear()
  }

  clearShareCaches() {
    this.viewShareCache.clear()
    this.recordShareCache.clear()
  }

  private cacheWorkspaceId(): string {
    return currentRequestWorkspaceId().trim() || String(this.host.collabStore()?.activeWorkspaceId?.() ?? '').trim()
  }

  private resolveWorkspaceId(): string {
    const fromRequest = currentRequestWorkspaceId().trim()
    if (fromRequest) return fromRequest
    if (!getRuntimePolicy().allowImplicitActiveWorkspace) return ''
    return String(this.host.collabStore()?.activeWorkspaceId?.() ?? '').trim()
  }

  workspaceMembership(): WorkspaceMembership | null {
    const store = this.host.collabStore()
    if (!store || !this.resolveWorkspaceId()) return null
    return store.membership()
  }

  ownershipOf(collection: string, id: string): 'personal' | 'workspace' | 'shared' {
    const store = this.host.collabStore()
    const workspaceId = this.resolveWorkspaceId()
    if (!store?.collectionOwnership || !workspaceId) return 'personal'
    const key = `${workspaceId}\t${collection}`
    let map = this.ownershipCache.get(key)
    if (!map) {
      map = store.collectionOwnership(workspaceId, collection)
      this.ownershipCache.set(key, map)
    }
    return map.get(id) ?? 'personal'
  }

  recordOwner(collection: string, id: string): string {
    const store = this.host.collabStore()
    const workspaceId = this.resolveWorkspaceId()
    if (!store?.collectionRecordOwners || !workspaceId) return ''
    const key = `${workspaceId}\t${collection}`
    let map = this.ownerCache.get(key)
    if (!map) {
      map = store.collectionRecordOwners(workspaceId, collection)
      this.ownerCache.set(key, map)
    }
    return map.get(id) ?? ''
  }

  /** 计算当前操作者在某条记录上的有效列级策略（可读列并集、可写列并集）。 */
  columnPolicyFor(collection: string, record: { id?: unknown }): ColumnPolicy {
    const store = this.host.collabStore()
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!store || !authorization || !actor) return fullColumnPolicy()
    const rules = store.listActiveAccessRulesForCollection?.(actor.workspaceId, collection) ?? []
    if (!rules.length) return fullColumnPolicy()

    const target = resolveScopeTarget(collection, String(record.id ?? ''), record)
    const targetRef = {
      type: 'record' as const,
      workspaceId: actor.workspaceId,
      collection: target.collection,
      recordId: target.id,
      record: record as Record<string, unknown>,
    }
    const decision = authorization.authorize(actor, 'resource:read', targetRef)
    if (decision.allowed && decision.source === 'ownership') return fullColumnPolicy()

    const policies: ColumnPolicy[] = []
    if (decision.allowed && decision.source !== 'access-rule') {
      policies.push(fullColumnPolicy())
    }
    const recordOwnerTable = authorization.ownerTableOf(targetRef)
    for (const rule of rules) {
      if (!rule.enabled) continue
      const ruleOwnerTable = rule.ownerTable?.trim() || (rule.createdBy ? `account:${rule.createdBy}` : '')
      if (!recordOwnerTable || !ruleOwnerTable || ruleOwnerTable !== recordOwnerTable) continue
      if (!recordMatchesAccessRule(record as never, rule.filterTree)) continue
      const ruleCols = Array.isArray(rule.columns) && rule.columns.length > 0
        ? [...rule.columns, '$content', 'shareScope', 'shareRole', 'ownerTable']
        : null
      let matchedGroups: Set<string> | null = null
      for (const grant of rule.grants) {
        const subjectMatches = grant.subjectType === 'account'
          ? grant.subjectId === actor.accountId
          : grant.subjectType === 'workspace'
            ? grant.subjectId === actor.workspaceId && authorization.membershipKind(actor.accountId, actor.workspaceId) === 'member'
            : grant.subjectType === 'group' && (matchedGroups ??= authorization.matchedGroupsFor(actor.workspaceId, actor.accountId)).has(grant.subjectId)
        if (!subjectMatches) continue
        const canWrite = roleCoversAction(grant.role, 'resource:update')
        policies.push({
          readable: ruleCols ? new Set(ruleCols) : '*',
          writable: canWrite ? (ruleCols ? new Set(ruleCols) : '*') : new Set<string>(),
        })
      }
    }
    return mergeColumnPolicies(policies)
  }

  hasViewGrants(collection: string): boolean {
    const store = this.host.collabStore()
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!store || !authorization || !actor) return false
    return (store.listActiveAccessRulesForCollection?.(actor.workspaceId, collection)?.length ?? 0) > 0
  }

  hasColumnRestrictions(collection: string): boolean {
    const store = this.host.collabStore()
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!store || !authorization || !actor) return false
    const rules = store.listActiveAccessRulesForCollection?.(actor.workspaceId, collection) ?? []
    return rules.some((r) => r.enabled && Array.isArray(r.columns) && r.columns.length > 0)
  }

  /**
   * 当集合没有数据视图过滤授权（view_grants）时，预先用已加载的 RBAC 策略计算当前用户可见的 ID 集合，
   * 使云端 RBAC 模式也能走 spec.listPage 的 SQL 下推快路径，避免全表拉取到内存排序。
   */
  resolvePushdownAllowedIds(collection: string): string[] | null {
    const store = this.host.collabStore()
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!authorization || !actor) return null
    if (this.hasViewGrants(collection)) return null
    const candidateMap = store?.collectionOwnership?.(actor.workspaceId, collection)
      ?? store?.collectionRecordOwners?.(actor.workspaceId, collection)
    if (!candidateMap) return null
    authorization.preloadCollection(actor.workspaceId, collection, actor.accountId)
    try {
      const allowed: string[] = []
      for (const id of candidateMap.keys()) {
        if (this.host.tags.isDeleted(collection, id)) continue
        const decision = authorization.authorize(actor, 'resource:read', {
          type: 'record',
          workspaceId: actor.workspaceId,
          collection,
          recordId: id,
        })
        if (decision.allowed) allowed.push(id)
      }
      return allowed
    } finally {
      authorization.releaseCollection(actor.workspaceId, collection, actor.accountId)
    }
  }

  projectRecordWithPolicy<T extends Record<string, unknown>>(record: T, policy: ColumnPolicy): T {
    return projectRecordColumns(record, policy)
  }

  projectRecord<T extends Record<string, unknown>>(collection: string, record: T): T {
    return projectRecordColumns(record, this.columnPolicyFor(collection, record))
  }

  assertWritablePatch(collection: string, record: { id?: unknown }, patch: Record<string, unknown>) {
    assertWritableColumns(patch, this.columnPolicyFor(collection, record))
  }

  assertContentAccess(collection: string, record: { id?: unknown }, mode: 'read' | 'write') {
    const policy = this.columnPolicyFor(collection, record)
    const ok = mode === 'read' ? isContentReadable(policy) : isContentWritable(policy)
    if (!ok) throw new Error('permission denied: FIELD_FORBIDDEN ($content)')
  }

  /**
   * 锚点字段扩散保护：当修改的字段导致一条记录新命中某条 view_grant（扩大了可见受众）时，
   * 必须要求当前操作者具备该记录的 resource:share 权限，防止普通编辑绕过分享审批把私密数据推入外部视图。
   */
  assertAnchorFieldSafe(collection: string, beforeRecord: DbRecord, afterRecord: DbRecord) {
    const store = this.host.collabStore()
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!store?.listActiveAccessRulesForCollection || !authorization || !actor) return
    const rules = store.listActiveAccessRulesForCollection(actor.workspaceId, collection)
    if (!rules.length) return
    const target = resolveScopeTarget(collection, String(beforeRecord.id ?? ''), beforeRecord)
    const targetRef = {
      type: 'record' as const,
      workspaceId: actor.workspaceId,
      collection: target.collection,
      recordId: target.id,
      record: beforeRecord as Record<string, unknown>,
    }
    const canShare = authorization.authorize(actor, 'resource:share', targetRef).allowed
    if (canShare) return

    const recordOwnerTable = authorization.ownerTableOf(targetRef)
    for (const rule of rules) {
      if (!rule.enabled) continue
      const ruleOwnerTable = rule.ownerTable?.trim() || (rule.createdBy ? `account:${rule.createdBy}` : '')
      if (!recordOwnerTable || !ruleOwnerTable || ruleOwnerTable !== recordOwnerTable) continue
      const wasMatched = recordMatchesAccessRule(beforeRecord, rule.filterTree)
      const nowMatched = recordMatchesAccessRule(afterRecord, rule.filterTree)
      if (!wasMatched && nowMatched) {
        throw new Error('permission denied: ANCHOR_FIELD_SCOPE_EXPANSION')
      }
    }
  }

  grantAllows(collection: string, id: string) {
    const membership = this.workspaceMembership()
    const store = this.host.collabStore()
    const workspaceId = this.resolveWorkspaceId()
    if (!membership?.strict || !store?.grantMap || !workspaceId) return true
    const people = store.grantMap(workspaceId, collection).get(id)
    if (!people || people.size === 0) return true
    return people.has(currentAccountId())
  }

  /** 标签目录只留下当前用户能读到的源记录上贴过的标签；还没贴到公开数据上的，只留给创建人。 */
  indexTagVisible(id: string, accountId: string) {
    const found = this.host.tags.collect(id)
    for (const item of found.items) {
      if (this.host.tags.isDeleted(item.collection, item.id)) continue
      if (item.collection === TAGS_COLLECTION_PATH) continue
      if (this.visibleRecords(item.collection, [{ id: item.id }]).length > 0) return true
    }
    const createdBy = this.host.tags.recordMeta(TAGS_COLLECTION_PATH, id)?.createdBy?.accountId
    if (createdBy) return createdBy === accountId
    if (getRuntimePolicy().authzMode === 'rbac') return false
    return Boolean(this.host.tags.get(id))
  }

  visibleRecords<T extends { id?: unknown; pageId?: unknown; collection?: unknown; sessionId?: unknown; sourceId?: unknown; tablePath?: unknown }>(
    collection: string,
    rows: T[],
    action: PermissionAction = 'resource:read',
  ) {
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (authorization && actor) {
      return rows.filter((row) => {
        if (isBuiltinPluginRow(collection, row as { builtin?: unknown })) {
          return action === 'resource:read' || action === 'resource:list'
        }
        const target = resolveScopeTarget(collection, String(row.id ?? ''), row)
        const resource = {
          type: 'record' as const,
          workspaceId: actor.workspaceId,
          collection: target.collection,
          recordId: target.id,
          record: row as Record<string, unknown>,
        }
        if (collection === TAGS_COLLECTION_PATH && !String(row.sourceId ?? '') && !String(row.tablePath ?? '')) {
          return this.indexTagVisible(String(row.id ?? ''), actor.accountId)
        }
        return authorization.authorize(actor, action, resource).allowed
      })
    }
    const rbac = getRuntimePolicy().authzMode === 'rbac'
    if (rbac && authorization && !actor) {
      return rows.filter(
        (row) => isBuiltinPluginRow(collection, row as { builtin?: unknown }) && (action === 'resource:read' || action === 'resource:list'),
      )
    }
    const membership = this.workspaceMembership()
    if (!membership) {
      if (rbac) {
        return rows.filter(
          (row) => isBuiltinPluginRow(collection, row as { builtin?: unknown }) && (action === 'resource:read' || action === 'resource:list'),
        )
      }
      return rows
    }
    const store = this.host.collabStore()
    const workspaceId = this.resolveWorkspaceId()
    const grants = new Map<string, Map<string, Set<string>>>()
    return rows.filter((row) => {
      if (isBuiltinPluginRow(collection, row as { builtin?: unknown })) {
        return action === 'resource:read' || action === 'resource:list'
      }
      const target = resolveScopeTarget(collection, String(row.id ?? ''), row)
      if (!isRecordInWorkspace(membership, target.collection, target.id)) return false
      if (!membership.strict || !store?.grantMap || !workspaceId) return true
      let map = grants.get(target.collection)
      if (!map) {
        map = store.grantMap(workspaceId, target.collection)
        grants.set(target.collection, map)
      }
      const people = map.get(target.id)
      if (!people || people.size === 0) return true
      return people.has(currentAccountId())
    })
  }

  isCurrentActorExternal(): boolean {
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!actor?.workspaceId || !actor.accountId) return false
    const list = this.host.collabStore()?.members?.(actor.accountId, actor.workspaceId)
    if (!list) return false
    const me = list.find((item) => item.id === actor.accountId)
    return Boolean(me?.member_kind && me.member_kind !== 'member')
  }

  /**
   * 判定一条已通过可见性鉴权的记录归属哪些逻辑域（K+1 严格归属绑定）：
   * - `workspace`：仅 `owner_table = 'workspace'` 的记录（且当前用户为空间内部成员）；
   * - `personal`：仅 `owner_table = 'account:<当前用户>'` 的记录（排除他人共享给我的个人记录，以及对外公开链接分享的记录）；
   * - `shared`：他人个人表共享给我的记录、外部协作者看到的记录、内置插件，以及对外公开/局域网分享的记录。
   */
  scopeBucketFor(
    collection: string,
    row: { id?: unknown; pageId?: unknown; collection?: unknown; sessionId?: unknown; sourceId?: unknown; tablePath?: unknown },
    isExternal = this.isCurrentActorExternal(),
  ): { personal: boolean; workspace: boolean; shared: boolean } {
    if (isBuiltinPluginRow(collection, row as { builtin?: unknown })) {
      return { personal: false, workspace: false, shared: true }
    }
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!authorization || !actor) {
      return { personal: true, workspace: true, shared: true }
    }
    const id = String(row.id ?? '')
    const stored = this.ownershipOf(collection, id)
    const isPublicShared = this.hasPublicShare(collection, id, row as DbRecord, stored)
    if (this.host.deviceWorkspace()) {
      return isPublicShared
        ? { personal: false, workspace: false, shared: true }
        : { personal: true, workspace: false, shared: false }
    }
    const target = resolveScopeTarget(collection, id, row)
    const ownerTable = authorization.ownerTableOf({
      type: 'record',
      workspaceId: actor.workspaceId,
      collection: target.collection,
      recordId: target.id,
      record: row as Record<string, unknown>,
    })
    const myTable = `account:${actor.accountId}`
    if (ownerTable === 'workspace') {
      if (isExternal) return { personal: false, workspace: false, shared: true }
      return { personal: false, workspace: true, shared: isPublicShared }
    }
    if (ownerTable && ownerTable.startsWith('account:')) {
      if (ownerTable === myTable) {
        return isPublicShared
          ? { personal: false, workspace: false, shared: true }
          : { personal: true, workspace: false, shared: false }
      }
      return { personal: false, workspace: false, shared: true }
    }
    const label = this.shareScopeLabel(collection, id, row as DbRecord, stored)
    if (label === '共享') return { personal: false, workspace: false, shared: true }
    if (label === '空间') {
      return isExternal
        ? { personal: false, workspace: false, shared: true }
        : { personal: false, workspace: true, shared: false }
    }
    return { personal: true, workspace: false, shared: false }
  }

  recordsInScope<T extends { id?: unknown; pageId?: unknown; collection?: unknown; sessionId?: unknown; sourceId?: unknown; tablePath?: unknown }>(
    collection: string,
    rows: T[],
    scope: 'personal' | 'workspace' | 'shared' | '',
  ) {
    if (!scope) return rows
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!authorization || !actor) return rows
    const isExternal = this.isCurrentActorExternal()
    return rows.filter((row) => this.scopeBucketFor(collection, row, isExternal)[scope])
  }

  attachWorkspaceRecord(
    collection: string,
    recordId: string,
    policy?: {
      accessMode?: 'inherit' | 'private' | 'members' | 'restricted'
      memberDefaultRole?: 'viewer' | 'editor'
      parentCollection?: string
      parentRecordId?: string
    },
  ) {
    const store = this.host.collabStore()
    const workspaceId = this.resolveWorkspaceId()
    if (!store || !workspaceId) return
    store.attach(workspaceId, collection, recordId, Date.now(), policy)
    const key = `${workspaceId}\t${collection}`
    this.ownerCache.delete(key)
    this.ownershipCache.delete(key)
  }

  markPublicView(collection: string, recordId: string) {
    try {
      this.host.shares.upsert({ kind: 'record', collection, recordId, password: null, allowCopy: false })
    } catch {
      /* 分享库还没打开时，列表仍按协作者计算 */
    }
  }

  rememberScope(collection: string, recordId: string, scope: 'personal' | 'workspace' | 'shared') {
    if (scope === 'shared') {
      const device = this.host.deviceWorkspace()
      this.attachWorkspaceRecord(collection, recordId, {
        accessMode: device ? 'private' : 'members',
        ...(!device ? { memberDefaultRole: 'viewer' as const } : {}),
      })
      this.markPublicView(collection, recordId)
      return
    }
    this.attachWorkspaceRecord(collection, recordId, {
      accessMode: scope === 'workspace' ? 'members' : 'private',
      ...(scope === 'workspace' ? { memberDefaultRole: 'editor' as const } : {}),
    })
  }

  assertLiveRecord(
    spec: CollectionSpec,
    id: string,
    action: PermissionAction = 'resource:read',
    record?: { id?: unknown },
  ) {
    if (isBuiltinPluginRecord(spec, id, record)) {
      if (action === 'resource:read' || action === 'resource:list') return
      if (this.host.collabStore()?.isSuperAdmin?.(currentAccountId())) return
      throw new Error('permission denied: INSUFFICIENT_PERMISSION')
    }
    if (this.host.tags.isDeleted(spec.path, id)) throw new Error(`unknown record: ${spec.path}/${id}`)
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (authorization && actor) {
      const target = resolveScopeTarget(spec.path, id, record)
      const decision = authorization.authorize(actor, action, {
        type: 'record',
        workspaceId: actor.workspaceId,
        collection: target.collection,
        recordId: target.id,
        ...(record ? { record: record as Record<string, unknown> } : {}),
      })
      if (!decision.allowed) {
        if (
          spec.path === TAGS_COLLECTION_PATH &&
          (action === 'resource:read' || action === 'resource:list') &&
          this.indexTagVisible(id, actor.accountId)
        ) {
          return
        }
        throw new Error(`unknown record: ${spec.path}/${id}`)
      }
      return
    }
    const rbac = getRuntimePolicy().authzMode === 'rbac'
    if (rbac && authorization && !actor) {
      throw new Error(`unknown record: ${spec.path}/${id}`)
    }
    const membership = this.workspaceMembership()
    if (!membership) {
      if (rbac) throw new Error(`unknown record: ${spec.path}/${id}`)
      return
    }
    const target = resolveScopeTarget(spec.path, id)
    if (!isRecordInWorkspace(membership, target.collection, target.id) || !this.grantAllows(target.collection, target.id)) {
      throw new Error(`unknown record: ${spec.path}/${id}`)
    }
  }

  recordShareIds(collection: string) {
    const key = `${this.cacheWorkspaceId()}\t${collection}`
    const cached = this.recordShareCache.get(key)
    if (cached) return cached
    const ids = new Set<string>()
    try {
      for (const share of this.host.shares.listRecords(collection)) {
        const recordId = String(share.recordId ?? '').trim()
        if (recordId) ids.add(recordId)
      }
    } catch {
      /* 分享库还没打开时，仍按视图链接现算 */
    }
    this.recordShareCache.set(key, ids)
    return ids
  }

  sharedViewsFor(collection: string): SharedViewDef[] {
    const key = `${this.cacheWorkspaceId()}\t${collection}`
    const cached = this.viewShareCache.get(key)
    if (cached) return cached
    let shares: Array<{ viewId: string }> = []
    try {
      shares = this.host.shares.listViews(collection)
    } catch {
      shares = []
    }
    const saved = [
      builtinAllView({ path: collection }),
      ...(this.host.viewCatalog?.viewsFor(collection) ?? []),
    ]
    const views: SharedViewDef[] = []
    for (const share of shares) {
      const view = resolveSharedView(share.viewId, saved)
      if (view) views.push(view)
    }
    this.viewShareCache.set(key, views)
    return views
  }

  hasPublicShare(collection: string, id: string, record?: DbRecord, stored?: DataScopeName) {
    if (this.recordShareIds(collection).has(id)) return true
    if (!record || !stored) return false
    const views = this.sharedViewsFor(collection)
    if (!views.length) return false
    const spec = this.host.collection(collection)
    const tagged = spec ? this.host.applyTagOverlay(spec, record) : record
    const schema = spec ? this.host.schemaFor(spec) : undefined
    const packs: CollectionSchemaPack[] = this.host.tags.list()
    return views.some((view) => recordMatchesSharedView(tagged, view, stored, schema, packs))
  }

  effectiveScope(_collection: string, _record: DbRecord, stored: DataScopeName): DataScopeName {
    return stored
  }

  shareScopeLabel(collection: string, id: string, record: DbRecord, stored: 'personal' | 'workspace' | 'shared') {
    if (this.hasPublicShare(collection, id, record, stored)) return '共享'
    if (this.host.deviceWorkspace()) return '私人'
    const scope = this.effectiveScope(collection, record, stored)
    if (scope === 'workspace') return '空间'
    if (scope === 'personal') return '私人'
    return SHARE_SCOPE_LABEL[scope]
  }

  ownerTableLabel(spec: CollectionSpec, record: DbRecord): string {
    if (this.host.deviceWorkspace()) return '个人'
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!authorization || !actor) return '个人'
    const target = resolveScopeTarget(spec.path, String(record.id ?? ''), record)
    const ownerTable = authorization.ownerTableOf({
      type: 'record',
      workspaceId: actor.workspaceId,
      collection: target.collection,
      recordId: target.id,
      record: record as Record<string, unknown>,
    })
    if (!ownerTable || ownerTable === 'workspace') return '空间'
    if (ownerTable.startsWith('account:')) {
      const accountId = ownerTable.slice('account:'.length)
      const person = this.host.collabStore()?.workspacePerson?.(accountId)
      return person?.name?.trim() || (accountId === actor.accountId ? '我' : '个人')
    }
    return ownerTable
  }

  shareRoleLabel(spec: CollectionSpec, record: DbRecord) {
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!authorization || !actor) return '管理'
    const target = resolveScopeTarget(spec.path, String(record.id ?? ''), record)
    const decision = authorization.authorize(actor, 'resource:read', {
      type: 'record',
      workspaceId: actor.workspaceId,
      collection: target.collection,
      recordId: target.id,
      record: record as Record<string, unknown>,
    })
    return accessLabel(decision.allowed ? decision.effectiveRole : null)
  }
}
