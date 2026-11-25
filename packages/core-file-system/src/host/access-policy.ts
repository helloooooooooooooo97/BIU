import { currentAccountId, currentRequestWorkspaceId } from '@biu/host-plugin-loader/data-dir'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import { roleCoversAction, type Action as PermissionAction, type AuthorizationService } from '@biu/host-account/authorization'
import { isRegisteredBuiltinPlugin } from '@biu/host-account/store'
import type { CollectionSchema, CollectionSchemaPack, CollectionSpec, DbRecord } from '@biu/type-file-system'
import { builtinAllView, builtinAllViewId, builtinMemberViews } from '../catalog-views.ts'
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
import { effectiveDataScope, highestViewRole, recordMatchesGrantedView, type DataScopeName, type ViewGrantRole } from '../view-access.ts'
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
  viewGrantAudiences?(
    workspaceId: string,
    collection: string,
  ): Array<{
    view_id: string
    subject_type: 'account' | 'member_view'
    subject_id: string
    granted_by?: string
    member_kind: string
  }>
  viewGrantsFor?(
    workspaceId: string,
    collection: string,
  ): Array<{
    view_id: string
    subject_type: 'account' | 'member_view'
    subject_id: string
    role: ViewGrantRole
    readable_columns?: string | null
    writable_columns?: string | null
    granted_by?: string
  }>
  collectionRecordOwners?(workspaceId: string, collection: string): Map<string, string>
  isMember?(accountId: string, workspaceId: string): boolean
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

type ViewAudienceEntry = {
  grants: Array<{ viewId: string; subjectType: 'account' | 'member_view'; subjectId: string; memberKind?: string; grantedBy?: string }>
  dataViews: Array<{ id: string; filters?: Record<string, unknown> }>
  memberViews: Array<{ id: string; filters?: Record<string, unknown> }>
}

/**
 * 封装工作区数据归属（私人 / 空间 / 共享）、权限判定（管理 / 编辑 / 阅读）、
 * 视图级授权匹配与多租户有界分享状态缓存。
 */
export class DatabaseAccessPolicy {
  private readonly ownershipCache = new BoundedLru<string, Map<string, 'personal' | 'workspace' | 'shared'>>()
  private readonly ownerCache = new BoundedLru<string, Map<string, string>>()
  private readonly viewAudienceCache = new BoundedLru<string, ViewAudienceEntry>()
  private readonly viewShareCache = new BoundedLru<string, SharedViewDef[]>()
  private readonly recordShareCache = new BoundedLru<string, Set<string>>()

  constructor(private readonly host: AccessPolicyHost) {}

  clearCaches() {
    this.ownershipCache.clear()
    this.ownerCache.clear()
    this.viewAudienceCache.clear()
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

  viewGrantRole(
    workspaceId: string,
    collection: string,
    record: { id?: unknown },
    accountId: string,
  ): ViewGrantRole | null {
    const store = this.host.collabStore()
    const authorization = this.host.authorization()
    if (!store?.viewGrantsFor || !authorization) return null
    const grants = store.viewGrantsFor(workspaceId, collection)
    if (!grants.length) return null
    const saved = [builtinAllView({ path: collection }), ...(this.host.viewCatalog?.viewsFor(collection) ?? [])]
    const target = resolveScopeTarget(collection, String(record.id ?? ''), record)
    const targetRef = {
      type: 'record' as const,
      workspaceId,
      collection: target.collection,
      recordId: target.id,
    }
    const scope = authorization.scopeCurrent(targetRef)
    const ownerId = this.recordOwner(target.collection, target.id)
    const roles: ViewGrantRole[] = []
    for (const grant of grants) {
      const subjectMatches = grant.subject_type === 'account'
        ? grant.subject_id === accountId
        : authorization.matchesMemberView(workspaceId, grant.subject_id, accountId)
      if (!subjectMatches) continue
      if (!authorization.canGrantorShareRecord(grant.granted_by ?? '', targetRef)) {
        continue
      }
      if (recordMatchesGrantedView(record as never, grant.view_id, saved, scope, { grantedBy: grant.granted_by, recordOwnerId: ownerId })) {
        roles.push(grant.role)
      }
    }
    return highestViewRole(roles)
  }

  allowsViaView(collection: string, record: { id?: unknown }, action: PermissionAction = 'resource:read') {
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!authorization || !actor) return false
    const role = this.viewGrantRole(actor.workspaceId, collection, record, actor.accountId)
    return Boolean(role && roleCoversAction(role, action))
  }

  /** 计算当前操作者在某条记录上的有效列级策略（可读列并集、可写列并集、高敏拒绝列差集）。 */
  columnPolicyFor(collection: string, record: { id?: unknown }): ColumnPolicy {
    const store = this.host.collabStore()
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!store?.viewGrantsFor || !authorization || !actor) return fullColumnPolicy()
    const grants = store.viewGrantsFor(actor.workspaceId, collection)
    if (!grants.length) return fullColumnPolicy()

    const target = resolveScopeTarget(collection, String(record.id ?? ''), record)
    const decision = authorization.authorize(actor, 'resource:read', {
      type: 'record',
      workspaceId: actor.workspaceId,
      collection: target.collection,
      recordId: target.id,
      record: record as Record<string, unknown>,
    })
    if (decision.allowed && decision.source === 'ownership') return fullColumnPolicy()

    const saved = [builtinAllView({ path: collection }), ...(this.host.viewCatalog?.viewsFor(collection) ?? [])]
    const scope = authorization.scopeCurrent({
      type: 'record',
      workspaceId: actor.workspaceId,
      collection: target.collection,
      recordId: target.id,
    })
    const ownerId = this.recordOwner(target.collection, target.id)

    const policies: ColumnPolicy[] = []
    if (decision.allowed && decision.source !== 'data-view-grant') {
      policies.push(fullColumnPolicy())
    }
    for (const grant of grants) {
      const subjectMatches = grant.subject_type === 'account'
        ? grant.subject_id === actor.accountId
        : authorization.matchesMemberView(actor.workspaceId, grant.subject_id, actor.accountId)
      if (!subjectMatches) continue
      if (!recordMatchesGrantedView(record as never, grant.view_id, saved, scope, { grantedBy: grant.granted_by, recordOwnerId: ownerId })) {
        continue
      }
      const readableList = parseColumnList(grant.readable_columns)
      const writableList = parseColumnList(grant.writable_columns)
      const canWrite = roleCoversAction(grant.role, 'resource:update')
      policies.push({
        readable: readableList ? new Set(readableList) : '*',
        writable: canWrite ? (writableList ? new Set(writableList) : readableList ? new Set(readableList) : '*') : new Set<string>(),
      })
    }
    return mergeColumnPolicies(policies)
  }

  hasViewGrants(collection: string): boolean {
    const store = this.host.collabStore()
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!store?.viewGrantsFor || !authorization || !actor) return false
    return store.viewGrantsFor(actor.workspaceId, collection).length > 0
  }

  hasColumnRestrictions(collection: string): boolean {
    const store = this.host.collabStore()
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!store?.viewGrantsFor || !authorization || !actor) return false
    return store
      .viewGrantsFor(actor.workspaceId, collection)
      .some((g) => Boolean(g.readable_columns || g.writable_columns))
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
    if (!store?.viewGrantsFor || !authorization || !actor) return
    const grants = store.viewGrantsFor(actor.workspaceId, collection)
    if (!grants.length) return
    const target = resolveScopeTarget(collection, String(beforeRecord.id ?? ''), beforeRecord)
    const canShare = authorization.authorize(actor, 'resource:share', {
      type: 'record',
      workspaceId: actor.workspaceId,
      collection: target.collection,
      recordId: target.id,
      record: beforeRecord as Record<string, unknown>,
    }).allowed
    if (canShare) return

    const saved = [builtinAllView({ path: collection }), ...(this.host.viewCatalog?.viewsFor(collection) ?? [])]
    const scope = authorization.scopeCurrent({
      type: 'record',
      workspaceId: actor.workspaceId,
      collection: target.collection,
      recordId: target.id,
    })
    const ownerId = this.recordOwner(target.collection, target.id)
    for (const grant of grants) {
      const ownerCtx = { grantedBy: grant.granted_by, recordOwnerId: ownerId }
      const wasMatched = recordMatchesGrantedView(beforeRecord, grant.view_id, saved, scope, ownerCtx)
      const nowMatched = recordMatchesGrantedView(afterRecord, grant.view_id, saved, scope, ownerCtx)
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
        if (authorization.authorize(actor, action, resource).allowed) return true
        if (authorization.hasDataViewMatcher()) return false
        const viaView = this.viewGrantRole(actor.workspaceId, collection, row, actor.accountId)
        return Boolean(viaView && roleCoversAction(viaView, action))
      })
    }
    const membership = this.workspaceMembership()
    if (!membership) return rows
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

  recordsInScope<T extends { id?: unknown; pageId?: unknown; collection?: unknown; sessionId?: unknown; sourceId?: unknown; tablePath?: unknown }>(
    collection: string,
    rows: T[],
    scope: 'personal' | 'workspace' | 'shared' | '',
  ) {
    if (!scope) return rows
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!authorization || !actor) return rows
    return rows.filter((row) => {
      if (isBuiltinPluginRow(collection, row as { builtin?: unknown })) return scope === 'shared'
      const target = resolveScopeTarget(collection, String(row.id ?? ''), row)
      return authorization.scopeCurrent({
        type: 'record',
        workspaceId: actor.workspaceId,
        collection: target.collection,
        recordId: target.id,
      }) === scope
    })
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

  /** 分享里的「按成员视图批量授权」：全部成员可编辑。 */
  grantAllMembersEditable(collection: string, recordId: string) {
    const store = this.host.collabStore() as {
      grantMemberView?: (
        actorId: string,
        collection: string,
        recordId: string,
        viewId: string,
        role: 'editor',
      ) => void
    } | undefined
    const actorId = currentAccountId()
    if (!store?.grantMemberView || !actorId) return
    try {
      store.grantMemberView(actorId, collection, recordId, builtinAllViewId(WORKSPACE_MEMBERS_COLLECTION_PATH), 'editor')
      const workspaceId = this.cacheWorkspaceId()
      if (workspaceId) {
        const key = `${workspaceId}\t${collection}`
        this.ownerCache.delete(key)
        this.ownershipCache.delete(key)
      } else {
        this.ownerCache.clear()
        this.ownershipCache.clear()
      }
    } catch {
      /* 还没挂上工作区时，记录仍按空间归属保留 */
    }
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
    if (scope === 'workspace') this.grantAllMembersEditable(collection, recordId)
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
        if (authorization.hasDataViewMatcher()) {
          throw new Error(`unknown record: ${spec.path}/${id}`)
        }
        const viaView = record
          ? this.viewGrantRole(actor.workspaceId, spec.path, record, actor.accountId)
          : null
        if (!viaView || !roleCoversAction(viaView, action)) {
          throw new Error(`unknown record: ${spec.path}/${id}`)
        }
      }
      return
    }
    const membership = this.workspaceMembership()
    if (!membership) return
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

  effectiveScope(collection: string, record: DbRecord, stored: DataScopeName): DataScopeName {
    const store = this.host.collabStore()
    const workspaceId = this.resolveWorkspaceId()
    if (!workspaceId) return stored
    const key = `${workspaceId}\t${collection}`
    let entry = this.viewAudienceCache.get(key)
    if (!entry) {
      const grantRows = store?.viewGrantAudiences?.(workspaceId, collection)
        ?? store?.viewGrantsFor?.(workspaceId, collection)?.map((row) => ({
          view_id: row.view_id,
          subject_type: row.subject_type,
          subject_id: row.subject_id,
          granted_by: row.granted_by,
          member_kind: '',
        }))
        ?? []
      const grants = grantRows.map((row) => ({
        viewId: row.view_id,
        subjectType: row.subject_type,
        subjectId: row.subject_id,
        memberKind: row.member_kind,
        grantedBy: row.granted_by,
      }))
      const memberViews = grants.length
        ? [
            builtinAllView({ path: WORKSPACE_MEMBERS_COLLECTION_PATH }),
            ...builtinMemberViews(),
            ...(this.host.viewCatalog?.viewsFor(WORKSPACE_MEMBERS_COLLECTION_PATH) ?? []),
          ]
        : []
      const dataViews = grants.length
        ? [
            builtinAllView({ path: collection }),
            ...(this.host.viewCatalog?.viewsFor(collection) ?? []),
          ]
        : []
      entry = { grants, dataViews, memberViews }
      this.viewAudienceCache.set(key, entry)
    }
    if (!entry.grants.length) return stored
    return effectiveDataScope(
      stored,
      record,
      entry.grants,
      entry.dataViews,
      entry.memberViews,
      this.recordOwner(collection, String(record.id ?? '')),
    )
  }

  shareScopeLabel(collection: string, id: string, record: DbRecord, stored: 'personal' | 'workspace' | 'shared') {
    if (this.hasPublicShare(collection, id, record, stored)) return '共享'
    if (this.host.deviceWorkspace()) return '私人'
    const scope = this.effectiveScope(collection, record, stored)
    if (scope === 'workspace') return '空间'
    if (scope === 'personal') return '私人'
    return SHARE_SCOPE_LABEL[scope]
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
    const direct = decision.allowed ? decision.effectiveRole : null
    if (authorization.hasDataViewMatcher()) return accessLabel(direct)
    const via = this.viewGrantRole(actor.workspaceId, spec.path, record, actor.accountId)
    return accessLabel(higherAccess(direct, via))
  }
}
