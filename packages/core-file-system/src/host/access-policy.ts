import { BoundedMap } from '@biu/biu-ui/cache'
import { currentAccountId, currentRequestWorkspaceId } from '@biu/host-plugin-loader/data-dir'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
import { type Action as PermissionAction, type AuthorizationService } from '@biu/host-account/authorization'
import { isRegisteredBuiltinPlugin } from '@biu/host-account/store'
import type { CollectionSpec, DbRecord } from '@biu/type-file-system'
import {
  COMMENTS_COLLECTION_PATH,
  DATA_COLLECTION_PATH,
  EDITOR_BLOCKS_COLLECTION_PATH,
  PLUGINS_COLLECTION_PATH,
  TAGS_COLLECTION_PATH,
  TRASH_COLLECTION_PATH,
  splitResourcePath,
} from '../paths.ts'
import type { SharesStore } from './shares-store.ts'
import { collectEffectivePublicRecordIds } from './share-payload.ts'
import { parseStampRecordId } from './tags-collection.ts'
import type { TagStore } from './tags-store.ts'

export type WorkspaceMembership = {
  active: string | null
  home: string | null
  mine: Set<string>
  any: Set<string>
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
      accessMode?: 'inherit' | 'private' | 'members'
      memberDefaultRole?: 'viewer' | 'editor'
      parentCollection?: string
      parentRecordId?: string
    },
  ): void
  collectionOwnership?(workspaceId: string, collection: string): Map<string, 'personal' | 'workspace' | 'shared'>
  collectionExternalCollaborators?(workspaceId: string, collection: string): Set<string>
  collectionInheritedSources?(
    workspaceId: string,
    collection: string,
    directKeys: ReadonlySet<string>,
  ): Map<string, { collection: string; recordId: string }>
  recordInheritance?(
    workspaceId: string,
    collection: string,
    recordId: string,
  ): {
    mode: 'inherit' | 'custom'
    hasParent: boolean
    parent: { collection: string; recordId: string } | null
    ancestors: Array<{ collection: string; recordId: string }>
  }
  collectInheritingDescendants?(
    workspaceId: string,
    collection: string,
    rootRecordId: string,
    maxCount?: number,
  ): Array<{ collection: string; recordId: string; parentCollection: string; parentRecordId: string }>
  collectionRecordOwners?(workspaceId: string, collection: string): Map<string, string>
  isMember?(accountId: string, workspaceId: string): boolean
  members?(accountId: string, workspaceId: string): Array<{ id: string; member_kind?: string }>
  isSuperAdmin?(accountId?: string | null): boolean
}

import { accessLabel, SHARE_SCOPE_LABEL } from '../shared/authz-labels.ts'
export { accessLabel, SHARE_SCOPE_LABEL }

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
  if (collection === COMMENTS_COLLECTION_PATH) {
    const targetPath = String(row?.targetPath ?? '').trim()
    const parsed = targetPath ? splitResourcePath(targetPath) : null
    if (parsed?.collection && parsed.recordId && parsed.collection !== COMMENTS_COLLECTION_PATH) {
      return { collection: parsed.collection, id: parsed.recordId }
    }
  }
  return { collection, id }
}

export function isRecordInWorkspace(membership: WorkspaceMembership, collection: string, id: string) {
  const key = `${collection}\t${id}`
  if (membership.mine.has(key)) return true
  if (membership.any.has(key)) return false
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
  collabStore(): WorkspaceFiles | undefined
  authorization(): AuthorizationService | undefined
  deviceWorkspace(): boolean
}

const DEFAULT_CACHE_CAPACITY = 256

/**
 * 封装单逻辑表工作区数据归属（Notion 三态：私人 / 共享 / 空间 + 正交外部标记）、
 * 静态权限判定与 100% SQL 下推 ID 预计算。
 */
export class DatabaseAccessPolicy {
  private readonly ownershipCache = new BoundedMap<string, Map<string, 'personal' | 'workspace' | 'shared'>>(DEFAULT_CACHE_CAPACITY)
  private readonly externalCollaboratorCache = new BoundedMap<string, Set<string>>(DEFAULT_CACHE_CAPACITY)
  private readonly ownerCache = new BoundedMap<string, Map<string, string>>(DEFAULT_CACHE_CAPACITY)
  private readonly recordShareCache = new BoundedMap<string, Set<string>>(DEFAULT_CACHE_CAPACITY)

  constructor(private readonly host: AccessPolicyHost) {}

  clearCaches() {
    this.ownershipCache.clear()
    this.externalCollaboratorCache.clear()
    this.ownerCache.clear()
    this.recordShareCache.clear()
  }

  clearShareCaches() {
    this.recordShareCache.clear()
  }

  private cacheWorkspaceId(): string {
    return currentRequestWorkspaceId().trim() || String(this.host.collabStore()?.activeWorkspaceId?.() ?? '').trim()
  }

  private resolveWorkspaceId(): string {
    const fromRequest = currentRequestWorkspaceId().trim()
    if (fromRequest) return fromRequest
    const fromActor = this.host.authorization()?.currentActor()?.workspaceId?.trim()
    if (fromActor) return fromActor
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

  hasExternalCollaborator(collection: string, id: string): boolean {
    const store = this.host.collabStore()
    const workspaceId = this.resolveWorkspaceId()
    if (!store?.collectionExternalCollaborators || !workspaceId) return false
    const key = `${workspaceId}\t${collection}`
    let set = this.externalCollaboratorCache.get(key)
    if (!set) {
      set = store.collectionExternalCollaborators(workspaceId, collection)
      this.externalCollaboratorCache.set(key, set)
    }
    return set.has(id)
  }

  /** 正交外部访问标记：是否开启了公开链接或包含外部协作者/访客（不覆盖内部三态）。 */
  hasExternalAccess(collection: string, id: string): boolean {
    return this.hasPublicShare(collection, id) || this.hasExternalCollaborator(collection, id)
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

  /**
   * 100% 静态元数据预计算当前用户可见的 ID 集合（支持锁定成员视图动态组，不读任何业务行内容），
   * 使云端 RBAC 模式全场景走 spec.listPage SQL 下推快路径。
   */
  resolvePushdownAllowedIds(collection: string): string[] | null {
    const store = this.host.collabStore()
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!authorization || !actor) return null
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

  /** 批注为文档衍生数据：禁止独立分享；读/改/删跟随源文档，且批注作者本人在仍有批注权时可修改/删除自己的批注。 */
  private canActOnComment(
    authorization: AuthorizationService,
    actor: NonNullable<ReturnType<AuthorizationService['currentActor']>>,
    commentId: string,
    action: PermissionAction,
    targetResource: {
      type: 'record'
      workspaceId: string
      collection: string
      recordId: string
      record?: Record<string, unknown>
    },
  ): boolean {
    if (action === 'resource:share' || action === 'resource:manage-permissions') {
      return false
    }
    if (targetResource.collection === COMMENTS_COLLECTION_PATH) {
      return false
    }
    if (authorization.authorize(actor, action, targetResource).allowed) {
      return true
    }
    if (action === 'resource:update' || action === 'resource:delete') {
      const authorId = this.host.tags.recordMeta(COMMENTS_COLLECTION_PATH, commentId)?.createdBy?.accountId
      if (authorId && authorId === actor.accountId) {
        return authorization.authorize(actor, 'resource:comment', targetResource).allowed
      }
    }
    return false
  }

  visibleRecords<T extends { id?: unknown; pageId?: unknown; collection?: unknown; sessionId?: unknown; sourceId?: unknown; tablePath?: unknown; targetPath?: unknown }>(
    collection: string,
    rows: T[],
    action: PermissionAction = 'resource:read',
  ) {
    if (collection === '/views' && (action === 'resource:read' || action === 'resource:list')) {
      return rows
    }
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (authorization && actor) {
      return rows.filter((row) => {
        if (isBuiltinPluginRow(collection, row as { builtin?: unknown })) {
          return action === 'resource:read' || action === 'resource:list'
        }
        const rowId = String(row.id ?? '')
        const target = resolveScopeTarget(collection, rowId, row)
        const resource = {
          type: 'record' as const,
          workspaceId: actor.workspaceId,
          collection: target.collection,
          recordId: target.id,
          record: row as Record<string, unknown>,
        }
        if (collection === COMMENTS_COLLECTION_PATH) {
          return this.canActOnComment(authorization, actor, rowId, action, resource)
        }
        if (collection === TAGS_COLLECTION_PATH && !String(row.sourceId ?? '') && !String(row.tablePath ?? '')) {
          return this.indexTagVisible(rowId, actor.accountId)
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
    return rows.filter((row) => {
      if (isBuiltinPluginRow(collection, row as { builtin?: unknown })) {
        return action === 'resource:read' || action === 'resource:list'
      }
      const target = resolveScopeTarget(collection, String(row.id ?? ''), row)
      return isRecordInWorkspace(membership, target.collection, target.id)
    })
  }

  isCurrentActorExternal(): boolean {
    if (this.host.deviceWorkspace()) return false
    const authorization = this.host.authorization()
    const actor = authorization?.currentActor()
    if (!authorization || !actor?.workspaceId || !actor.accountId) return false
    return authorization.membershipKind(actor.accountId, actor.workspaceId) !== 'member'
  }

  /**
   * 判定一条已通过可见性鉴权的记录归属哪些逻辑域（Notion 对齐三态）：
   * - `workspace`：全空间内部成员可见（`access_mode = 'members'`，且当前用户为空间内部成员）；
   * - `shared`：非全空间记录中存在协作者（含他人分享给我、我分享给他人、外部访客看到的记录、内置插件）；
   * - `personal`：仅创建者本人可见的私密记录。
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
    if (this.host.deviceWorkspace()) {
      return this.hasPublicShare(collection, id)
        ? { personal: false, workspace: false, shared: true }
        : { personal: true, workspace: false, shared: false }
    }
    const target = resolveScopeTarget(collection, id, row)
    const stored = this.ownershipOf(target.collection, target.id)
    if (stored === 'workspace') {
      if (isExternal) return { personal: false, workspace: false, shared: true }
      return { personal: false, workspace: true, shared: false }
    }
    if (stored === 'shared') {
      return { personal: false, workspace: false, shared: true }
    }
    const ownerId = this.recordOwner(target.collection, target.id)
    if (ownerId && ownerId !== actor.accountId) {
      return { personal: false, workspace: false, shared: true }
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
      accessMode?: 'inherit' | 'private' | 'members'
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
    this.externalCollaboratorCache.delete(key)
    this.recordShareCache.delete(key)
  }

  markPublicView(collection: string, recordId: string) {
    try {
      this.host.shares.upsert({ kind: 'record', collection, recordId, password: null, allowCopy: false })
      this.clearShareCaches()
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
      const resource = {
        type: 'record' as const,
        workspaceId: actor.workspaceId,
        collection: target.collection,
        recordId: target.id,
        ...(record ? { record: record as Record<string, unknown> } : {}),
      }
      if (spec.path === COMMENTS_COLLECTION_PATH) {
        if (!this.canActOnComment(authorization, actor, id, action, resource)) {
          throw new Error(`unknown record: ${spec.path}/${id}`)
        }
        return
      }
      const decision = authorization.authorize(actor, action, resource)
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
    const target = resolveScopeTarget(spec.path, id, record)
    if (!isRecordInWorkspace(membership, target.collection, target.id)) {
      throw new Error(`unknown record: ${spec.path}/${id}`)
    }
  }

  recordShareIds(collection: string) {
    const workspaceId = this.resolveWorkspaceId()
    const key = `${workspaceId || this.cacheWorkspaceId()}\t${collection}`
    const cached = this.recordShareCache.get(key)
    if (cached) return cached
    let ids = new Set<string>()
    try {
      ids = collectEffectivePublicRecordIds(
        this.host.shares,
        collection,
        workspaceId,
        this.host.collabStore() ?? undefined,
      )
    } catch {
      /* 分享库还没打开时按无分享处理 */
    }
    this.recordShareCache.set(key, ids)
    return ids
  }

  hasPublicShare(collection: string, id: string) {
    return this.recordShareIds(collection).has(id)
  }

  /** Notion 对齐三态内部展示文案：私人 / 共享 / 空间（公开外链与外部协作者由 hasExternalAccess 正交呈现）。 */
  shareScopeLabel(collection: string, id: string, _record: DbRecord, stored: 'personal' | 'workspace' | 'shared') {
    if (this.host.deviceWorkspace()) {
      return this.hasPublicShare(collection, id) ? '共享' : '私人'
    }
    return SHARE_SCOPE_LABEL[stored]
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
