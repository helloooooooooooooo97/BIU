import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import type { CollectionInfo, CollectionSpec, DbRecord } from '@biu/type-file-system'
import { normalizeSchemaValue, recordBuiltinValues } from '@biu/type-file-system'
import { defaultSeedViewsForCollection, type TableRef } from '../catalog-views.ts'
import {
  normalizeColumnWidths,
  normalizeGroupConfig,
  normalizePageSize,
  parseViewColumns,
  type SavedView,
  type SavedViewFieldPatch,
  type ViewRole,
  type ViewShareScope,
} from '../shared/saved-view.ts'
import { normalizeColumnSummaries } from '../shared/column-summary.ts'
import { normalizeColumnViews } from '../shared/column-sandbox-model.ts'
import { normalizeTableSandboxViews } from '../shared/table-sandbox-model.ts'
import { isViewModeId } from '../shared/fields.ts'
import {
  DATA_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  WORKSPACE_MEMBERS_COLLECTION_PATH,
  isIndexCollection,
  normalizeCollectionPath,
} from '../paths.ts'
import {
  countFilterRules,
  flatFiltersToTree,
  looksLikeFilterTree,
  normalizeFilterGroup,
  parseSortsInput,
  VIEW_COLUMNS_DESCRIPTION,
  VIEW_FILTERS_DESCRIPTION,
  VIEW_FILTER_TREE_DESCRIPTION,
  VIEW_SORTS_DESCRIPTION,
  type FilterGroup,
  type SortRule,
} from '../query-logic.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export type StoredView = Partial<SavedView> &
  Pick<SavedView, 'id' | 'name'> & {
    createdBy?: string
    createdAt?: number
    locked?: boolean
    revision?: number
  }

export type InitialViewPolicy = {
  accessMode: 'private' | 'members'
  memberDefaultRole?: 'viewer' | 'editor'
}

export type PolicyViewGuard = {
  workspaceOwner?(workspaceId: string): string | null
  isWorkspaceAdmin?(workspaceId: string, accountId: string): boolean
  isInternalMember?(workspaceId: string, accountId: string): boolean
  memberViewGrantCount?(workspaceId: string, viewId: string): number
  onMemberViewChanged?(workspaceId: string, viewId: string): void
  canSeeView?(workspaceId: string, collection: string, view: StoredView, accountId: string): boolean
  canModifyView?(workspaceId: string, collection: string, view: StoredView, accountId: string): boolean
  canManageView?(workspaceId: string, collection: string, view: StoredView, accountId: string): boolean
  canRemoveView?(workspaceId: string, collection: string, view: StoredView, accountId: string): boolean
  viewRoleFor?(workspaceId: string, collection: string, view: StoredView, accountId: string): ViewRole | null
  shareScopesFor?(workspaceId: string): Map<string, ViewShareScope>
  externalSharedIdsFor?(workspaceId: string): Set<string>
  onCreated?(
    workspaceId: string,
    collection: string,
    view: StoredView,
    ownerAccountId: string,
    policy?: InitialViewPolicy,
  ): void
  onRemoved?(workspaceId: string, collection: string, viewId: string): void
}

type ViewRow = {
  workspace_id?: string
  collection: string
  view_id?: string
  payload_json: string
  revision?: number
}

function bucketKey(workspaceId: string, collectionPath: string) {
  return `${workspaceId}\t${normalizeCollectionPath(collectionPath)}`
}

export function viewRecordId(collectionPath: string, viewId: string): string {
  const table = normalizeCollectionPath(collectionPath).replace(/^\/+/, '')
  const id = String(viewId ?? '').trim()
  if (!table || !id) return ''
  return `${table}::${id}`
}

const PATCH_META_KEYS = new Set([
  'id',
  'updatedAt',
  'createdAt',
  'createdBy',
  'revision',
  'baseRevision',
  'baseUpdatedAt',
  'shareScope',
  'viewRole',
  'hasExternal',
  'ephemeral',
  'accessMode',
  'memberDefaultRole',
])

export class SavedViewsStore {
  private byPath = new Map<string, StoredView[]>()
  private db: DatabaseSync | null = null
  private workspaceResolver?: () => string
  private policyGuard?: PolicyViewGuard

  setWorkspaceResolver(resolver: () => string) {
    this.workspaceResolver = resolver
  }

  setPolicyGuard(guard: PolicyViewGuard) {
    this.policyGuard = guard
  }

  private resolveWorkspaceId(explicit?: string): string {
    if (explicit !== undefined) return explicit
    return this.workspaceResolver?.() ?? ''
  }

  private isForeignOwned(prev: StoredView | undefined, accountId: string): boolean {
    if (!prev?.createdBy || !accountId || prev.createdBy === accountId) return false
    return true
  }

  /** 查找 `/workspace-members` 下的某个存储视图（用于动态成员视图匹配与瞬时展开）。 */
  getMemberView(workspaceId: string, viewId: string): StoredView | null {
    const id = viewId.trim()
    if (!id) return null
    const list = this.byPath.get(bucketKey(workspaceId, WORKSPACE_MEMBERS_COLLECTION_PATH)) ?? []
    const hit = list.find((v) => String(v.id) === id)
    if (hit) return hit
    if (workspaceId) {
      const globalList = this.byPath.get(bucketKey('', WORKSPACE_MEMBERS_COLLECTION_PATH)) ?? []
      return globalList.find((v) => String(v.id) === id) ?? null
    }
    return null
  }

  /** 判断指定 `/workspace-members` 视图是否为管理员锁定视图（可作为动态成员组授权）。 */
  isLockedMemberView(workspaceId: string, viewId: string): boolean {
    const view = this.getMemberView(workspaceId, viewId)
    return Boolean(view && view.locked === true)
  }

  /** 列出当前用户可见的所有 `/workspace-members` 视图（区分管理员锁定动态组与普通快捷名单）。 */
  listMemberViews(workspaceId: string, accountId: string): StoredView[] {
    this.ensureSeedViews(
      WORKSPACE_MEMBERS_COLLECTION_PATH,
      { path: WORKSPACE_MEMBERS_COLLECTION_PATH, label: '空间成员' },
      workspaceId,
    )
    const list = this.byPath.get(bucketKey(workspaceId, WORKSPACE_MEMBERS_COLLECTION_PATH)) ?? []
    return list.filter((v) => this.canAccountSeeView(workspaceId, WORKSPACE_MEMBERS_COLLECTION_PATH, v, accountId))
  }

  /**
   * 集合首次初始化时幂等写入默认种子视图（写库即普通视图，后续可自由改名、修改权限、锁定或删除）。
   * 只要该集合在当前工作区下已有至少 1 条持久化视图，即不再重复 seed。
   */
  ensureSeedViews(
    collectionPath: string,
    table?: TableRef,
    workspaceId = this.resolveWorkspaceId(),
  ): StoredView[] {
    const path = normalizeCollectionPath(collectionPath)
    if (!path || path === '/' || path === VIEWS_COLLECTION_PATH) return []
    const key = bucketKey(workspaceId, path)
    const existing = this.byPath.get(key)
    if (existing && existing.length > 0) return existing
    const seeds = defaultSeedViewsForCollection(
      table ?? { path, label: path.replace(/^\//, '') },
    )
    if (!seeds.length) return existing ?? []
    const now = Date.now()
    const ownerId = this.policyGuard?.workspaceOwner?.(workspaceId)?.trim() || ''
    const created: StoredView[] = seeds.map((spec) => ({
      ...spec.view,
      locked: Boolean(spec.view.locked),
      revision: 1,
      createdAt: now,
      updatedAt: now,
      ...(ownerId ? { createdBy: ownerId } : {}),
    }))
    this.persistDelta(path, created, [], workspaceId)
    this.byPath.set(key, created)
    for (let i = 0; i < created.length; i++) {
      const view = created[i]!
      const spec = seeds[i]!
      this.policyGuard?.onCreated?.(workspaceId, path, view, ownerId, {
        accessMode: spec.accessMode,
        memberDefaultRole: spec.memberDefaultRole,
      })
      if (path === WORKSPACE_MEMBERS_COLLECTION_PATH) {
        this.policyGuard?.onMemberViewChanged?.(workspaceId, view.id)
      }
    }
    return created
  }

  private assertCanModifyView(
    workspaceId: string,
    path: string,
    prev: StoredView | undefined,
    next: StoredView,
    changedFields: string[],
    accountId: string,
  ) {
    const viewId = String(prev?.id ?? next.id ?? '')
    const prevLocked = Boolean(prev?.locked)
    const nextLocked = Boolean(next.locked)
    const lockChanged = prev ? prevLocked !== nextLocked : nextLocked
    const configFields = changedFields.filter((field) => field !== 'locked' && field !== 'rank')

    // 1. /workspace-members 锁定视图作为动态成员组，严格限管理员开关锁、改配置、删视图
    if (path === WORKSPACE_MEMBERS_COLLECTION_PATH && (prevLocked || nextLocked)) {
      const isAdmin = !accountId || !this.policyGuard?.isWorkspaceAdmin
        ? true
        : this.policyGuard.isWorkspaceAdmin(workspaceId, accountId)
      if (!isAdmin) {
        throw new Error('permission denied: MEMBER_LOCKED_VIEW_ADMIN_ONLY')
      }
      if (prevLocked && !nextLocked) {
        const refCount = this.policyGuard?.memberViewGrantCount?.(workspaceId, viewId) ?? 0
        if (refCount > 0) {
          throw new Error(`MEMBER_VIEW_REFERENCED: 该锁定成员视图正被 ${refCount} 条记录动态引用，请先固化为名单或取消关联授权`)
        }
      }
    }

    if (!prev) return

    // 2. 切换 locked 开关需要管理权限（owner / manager / 空间管理员）
    if (lockChanged) {
      if (accountId && this.policyGuard?.canManageView) {
        if (!this.policyGuard.canManageView(workspaceId, path, prev, accountId)) {
          throw new Error('permission denied: VIEW_MANAGE_REQUIRED')
        }
      } else if (this.isForeignOwned(prev, accountId)) {
        throw new Error('permission denied: VIEW_MANAGE_REQUIRED')
      }
    }

    // 3. 视图处于 locked = true 时冻结配置修改（须先解锁；仅允许解锁或纯排序 rank 调整）
    if (prevLocked && nextLocked && configFields.length > 0) {
      throw new Error('permission denied: VIEW_LOCKED')
    }

    // 4. 修改配置需要 update 权限（owner / manager / editor）
    if (!lockChanged || configFields.length > 0 || changedFields.includes('rank')) {
      if (accountId && this.policyGuard?.canModifyView) {
        if (!this.policyGuard.canModifyView(workspaceId, path, prev, accountId)) {
          throw new Error('permission denied: VIEW_EDIT_REQUIRED')
        }
      } else if (this.isForeignOwned(prev, accountId)) {
        throw new Error('permission denied: VIEW_OWNER_ONLY')
      }
    }
  }

  private assertWorkspaceViewRemains(
    workspaceId: string,
    path: string,
    prevViews: StoredView[],
    remainingViews: StoredView[],
  ) {
    if (remainingViews.length < 1) {
      throw new Error('至少保留一个视图')
    }
    if (isIndexCollection(path) || !workspaceId || !this.policyGuard?.shareScopesFor) return
    const scopes = this.policyGuard.shareScopesFor(workspaceId)
    const countWorkspace = (list: StoredView[]) =>
      list.filter((view) => scopes.get(viewRecordId(path, view.id)) === 'workspace').length
    if (countWorkspace(prevViews) >= 1 && countWorkspace(remainingViews) < 1) {
      throw new Error('至少保留一个空间视图')
    }
  }

  private assertCanRemoveView(
    workspaceId: string,
    path: string,
    viewId: string,
    accountId: string,
    prev?: StoredView,
  ) {
    if (path === WORKSPACE_MEMBERS_COLLECTION_PATH && prev?.locked === true) {
      const isAdmin = !accountId || !this.policyGuard?.isWorkspaceAdmin
        ? true
        : this.policyGuard.isWorkspaceAdmin(workspaceId, accountId)
      if (!isAdmin) {
        throw new Error('permission denied: MEMBER_LOCKED_VIEW_ADMIN_ONLY')
      }
      const refCount = this.policyGuard?.memberViewGrantCount?.(workspaceId, viewId) ?? 0
      if (refCount > 0) {
        throw new Error(`MEMBER_VIEW_REFERENCED: 该锁定成员视图正被 ${refCount} 条记录动态引用，请先固化为名单或取消关联授权`)
      }
    }
    if (this.policyGuard?.canRemoveView && accountId && prev) {
      if (!this.policyGuard.canRemoveView(workspaceId, path, prev, accountId)) {
        throw new Error('permission denied: VIEW_DELETE_REQUIRED')
      }
    } else if (this.isForeignOwned(prev, accountId)) {
      throw new Error('permission denied: VIEW_OWNER_ONLY')
    }
  }

  open(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = openAndMigrateBiu(path, { foreignKeys: false })
    this.hydrate()
    return this
  }

  private hydrate() {
    if (!this.db) return
    this.byPath.clear()
    let rows: ViewRow[] = []
    try {
      rows = this.db
        .prepare('SELECT workspace_id, collection, view_id, payload_json, revision FROM saved_views')
        .all() as ViewRow[]
    } catch {
      try {
        rows = this.db
          .prepare('SELECT workspace_id, collection, view_id, payload_json FROM saved_views')
          .all() as ViewRow[]
      } catch {
        rows = this.db.prepare('SELECT collection, view_id, payload_json FROM saved_views').all() as ViewRow[]
      }
    }
    for (const row of rows) {
      const workspaceId = String(row.workspace_id ?? '')
      const collection = normalizeCollectionPath(row.collection)
      if (!collection || collection === '/' || collection === VIEWS_COLLECTION_PATH) continue
      let parsed: StoredView | null = null
      try {
        parsed = JSON.parse(row.payload_json) as StoredView
      } catch {
        continue
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
      const id = String(parsed.id ?? row.view_id ?? '').trim()
      const name = String(parsed.name ?? id).trim()
      if (!id) continue
      const cleaned: StoredView = {
        ...parsed,
        id,
        name,
        locked: Boolean(parsed.locked || (parsed as { protection?: unknown }).protection === 'locked'),
        revision: Math.max(1, Number(row.revision ?? parsed.revision) || 1),
      }
      delete (cleaned as Record<string, unknown>).protection
      delete (cleaned as Record<string, unknown>).scope
      delete (cleaned as Record<string, unknown>).builtin
      delete (cleaned as Record<string, unknown>).ownerTable
      const key = bucketKey(workspaceId, collection)
      const list = this.byPath.get(key) ?? []
      list.push(cleaned)
      this.byPath.set(key, list)
    }
  }

  /** 增量写盘：只 upsert/delete 本次变更的 view_id，写入服务端单调 revision。 */
  private persistDelta(
    collectionPath: string,
    upserted: StoredView[],
    removedKeys: string[],
    workspaceId: string,
  ) {
    if (!this.db || (!upserted.length && !removedKeys.length)) return
    const path = normalizeCollectionPath(collectionPath)
    const now = Date.now()
    let hasRevisionCol = true
    let upsert: ReturnType<DatabaseSync['prepare']>
    try {
      upsert = this.db.prepare(
        `INSERT INTO saved_views (workspace_id, collection, view_id, payload_json, updated_at, revision)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, collection, view_id) DO UPDATE SET
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at,
           revision = excluded.revision`,
      )
    } catch {
      hasRevisionCol = false
      upsert = this.db.prepare(
        `INSERT INTO saved_views (workspace_id, collection, view_id, payload_json, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(workspace_id, collection, view_id) DO UPDATE SET
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`,
      )
    }
    const delView = this.db.prepare('DELETE FROM saved_views WHERE workspace_id = ? AND collection = ? AND view_id = ?')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const view of upserted) {
        const id = String(view.id ?? '').trim()
        if (!id) continue
        const rev = Math.max(1, Number(view.revision) || 1)
        const storedPayload = stripTransientFields({ ...view, revision: rev })
        if (hasRevisionCol) upsert.run(workspaceId, path, id, JSON.stringify(storedPayload), now, rev)
        else upsert.run(workspaceId, path, id, JSON.stringify(storedPayload), now)
      }
      for (const rawId of removedKeys) {
        const viewId = String(rawId ?? '').trim()
        if (viewId) delView.run(workspaceId, path, viewId)
      }
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
  }

  private workspacePaths(workspaceId: string): string[] {
    const prefix = `${workspaceId}\t`
    const paths: string[] = []
    for (const key of this.byPath.keys()) {
      if (key.startsWith(prefix)) paths.push(key.slice(prefix.length))
    }
    return paths
  }

  private canAccountSeeView(workspaceId: string, path: string, view: StoredView, accountId: string): boolean {
    if (isIndexCollection(path) && accountId && view.createdBy) {
      return view.createdBy === accountId
    }
    if (accountId && this.policyGuard?.canSeeView) {
      return this.policyGuard.canSeeView(workspaceId, path, view, accountId)
    }
    return true
  }

  clearWorkspace(workspaceId: string) {
    const prefix = `${workspaceId}\t`
    for (const key of [...this.byPath.keys()]) {
      if (key.startsWith(prefix)) this.byPath.delete(key)
    }
  }

  viewsFor(collectionPath: string, accountId = '', workspaceId = this.resolveWorkspaceId()): StoredView[] {
    const path = normalizeCollectionPath(collectionPath)
    const views = this.byPath.get(bucketKey(workspaceId, path)) ?? []
    return views.filter((view) => this.canAccountSeeView(workspaceId, path, view, accountId))
  }

  /** 返回给前端/HTTP 响应的权威视图列表（附带 viewRole、shareScope、hasExternal、locked、revision）。 */
  clientViewsFor(collectionPath: string, accountId = '', workspaceId = this.resolveWorkspaceId()): StoredView[] {
    const path = normalizeCollectionPath(collectionPath)
    const visible = this.viewsFor(path, accountId, workspaceId)
    const scopes = workspaceId ? this.policyGuard?.shareScopesFor?.(workspaceId) : undefined
    const externals = workspaceId ? this.policyGuard?.externalSharedIdsFor?.(workspaceId) : undefined
    return visible.map((view) => {
      const recId = viewRecordId(path, view.id)
      const viewRole = accountId && this.policyGuard?.viewRoleFor
        ? this.policyGuard.viewRoleFor(workspaceId, path, view, accountId) ?? undefined
        : undefined
      const shareScope: ViewShareScope | undefined = scopes?.get(recId)
      const hasExternal = externals?.has(recId) || undefined
      return {
        ...view,
        locked: Boolean(view.locked),
        revision: Math.max(1, Number(view.revision) || 1),
        ...(viewRole ? { viewRole } : {}),
        ...(shareScope ? { shareScope } : {}),
        ...(hasExternal ? { hasExternal: true } : {}),
      }
    })
  }

  exportAll(accountId = '', workspaceId = this.resolveWorkspaceId()): Record<string, StoredView[]> {
    const out: Record<string, StoredView[]> = {}
    for (const path of this.workspacePaths(workspaceId)) {
      const views = this.viewsFor(path, accountId, workspaceId)
      if (views.length) out[path] = views
    }
    return out
  }

  private resolveInitialPolicy(
    workspaceId: string,
    path: string,
    incoming: SavedViewFieldPatch & Record<string, unknown>,
    accountId: string,
  ): InitialViewPolicy {
    const isInternal = !accountId || !this.policyGuard?.isInternalMember
      ? true
      : this.policyGuard.isInternalMember(workspaceId, accountId)
    if (!isInternal) {
      return { accessMode: 'private', memberDefaultRole: 'viewer' }
    }
    if (incoming.accessMode === 'private' || incoming.shareScope === 'personal') {
      return { accessMode: 'private', memberDefaultRole: 'viewer' }
    }
    if (incoming.accessMode === 'members' || incoming.shareScope === 'workspace') {
      const defaultRole =
        incoming.memberDefaultRole === 'viewer' || incoming.memberDefaultRole === 'editor'
          ? incoming.memberDefaultRole
          : incoming.locked
            ? 'viewer'
            : 'editor'
      return { accessMode: 'members', memberDefaultRole: defaultRole }
    }
    // 默认新建视图均为私人（仅创建者可见），需共享或公开给全员时通过分享弹窗主动调整
    return {
      accessMode: 'private',
      memberDefaultRole: 'viewer',
    }
  }

  replace(collectionPath: string, views: StoredView[], accountId = '', workspaceId = this.resolveWorkspaceId()) {
    const path = normalizeCollectionPath(collectionPath)
    const key = bucketKey(workspaceId, path)
    const prev = this.byPath.get(key) ?? []
    const isHiddenFromActor = (view: StoredView) => !this.canAccountSeeView(workspaceId, path, view, accountId)
    const keptForeign = prev.filter(isHiddenFromActor)
    const foreignIds = new Set(keptForeign.map((view) => String(view.id)))
    const prevVisible = prev.filter((view) => !isHiddenFromActor(view))
    const prevById = new Map(prevVisible.map((view) => [String(view.id), view]))

    const now = Date.now()
    const incomingList: StoredView[] = []
    const createdList: Array<{ view: StoredView; policy: InitialViewPolicy }> = []
    for (const raw of views) {
      const id = String(raw.id ?? '').trim()
      if (!id || foreignIds.has(id)) continue
      const oldView = prevById.get(id)
      const merged = mergeFieldPatch(oldView, raw as SavedViewFieldPatch & Record<string, unknown>, id, accountId, now)
      const changedFields = oldView ? diffChangedFieldKeys(oldView, merged) : Object.keys(raw)
      this.assertCanModifyView(workspaceId, path, oldView, merged, changedFields, accountId)
      incomingList.push(merged)
      if (!oldView) {
        createdList.push({
          view: merged,
          policy: this.resolveInitialPolicy(workspaceId, path, raw as SavedViewFieldPatch & Record<string, unknown>, accountId),
        })
      }
    }

    const incomingIds = new Set(incomingList.map((view) => String(view.id)))
    const removedIds: string[] = []
    for (const oldView of prevVisible) {
      const oldId = String(oldView.id)
      if (!incomingIds.has(oldId)) {
        this.assertCanRemoveView(workspaceId, path, oldId, accountId, oldView)
        removedIds.push(oldId)
      }
    }

    const mergedAll = [...keptForeign, ...incomingList]
    if (removedIds.length > 0) {
      this.assertWorkspaceViewRemains(workspaceId, path, prev, mergedAll)
    }
    this.persistDelta(path, incomingList, removedIds, workspaceId)
    this.byPath.set(key, mergedAll)
    for (const item of createdList) {
      this.policyGuard?.onCreated?.(workspaceId, path, item.view, item.view.createdBy || accountId, item.policy)
    }
    for (const id of removedIds) this.policyGuard?.onRemoved?.(workspaceId, path, id)
    if (path === WORKSPACE_MEMBERS_COLLECTION_PATH) {
      for (const view of incomingList) this.policyGuard?.onMemberViewChanged?.(workspaceId, String(view.id))
      for (const id of removedIds) this.policyGuard?.onMemberViewChanged?.(workspaceId, id)
    }
  }

  /**
   * 字段级增量 Patch + 服务端单调 revision：
   * - 对已有视图只合并本次传入的字段，绝不因为客户端时钟偏差而静默丢弃修改；
   * - 对新建视图写库并同步初始化 `/views` 的 `resource_policies`；
   * - 先落盘 SQLite 再更新内存，返回权威客户端视图列表。
   */
  applyPatch(
    collectionPath: string,
    patch: { upsert?: Array<SavedViewFieldPatch | StoredView>; remove?: string[] },
    accountId = '',
    workspaceId = this.resolveWorkspaceId(),
  ) {
    const path = normalizeCollectionPath(collectionPath)
    const key = bucketKey(workspaceId, path)
    const prev = this.byPath.get(key) ?? []
    const removed = new Set((patch.remove ?? []).map(String).filter(Boolean))
    const removedIds: string[] = []
    for (const viewId of removed) {
      const prevView = prev.find((view) => String(view.id) === viewId)
      if (!prevView) continue
      this.assertCanRemoveView(workspaceId, path, viewId, accountId, prevView)
      removedIds.push(viewId)
    }

    const next = prev.filter((view) => !removed.has(String(view.id)))
    const upsertedViews: StoredView[] = []
    const createdEntries: Array<{ view: StoredView; policy: InitialViewPolicy }> = []
    const now = Date.now()

    for (const rawItem of patch.upsert ?? []) {
      const raw = rawItem as SavedViewFieldPatch & Record<string, unknown>
      const id = String(raw?.id ?? '').trim()
      if (!id) continue
      const prevIdx = next.findIndex((view) => String(view.id) === id)
      const prevView = prevIdx >= 0 ? next[prevIdx] : undefined
      const changedFields = Object.keys(raw).filter((k) => !PATCH_META_KEYS.has(k) && raw[k] !== undefined)
      const merged = mergeFieldPatch(prevView, raw, id, accountId, now)
      this.assertCanModifyView(workspaceId, path, prevView, merged, changedFields, accountId)
      if (prevIdx >= 0) next[prevIdx] = merged
      else next.push(merged)
      upsertedViews.push(merged)
      if (!prevView) {
        createdEntries.push({
          view: merged,
          policy: this.resolveInitialPolicy(workspaceId, path, raw, accountId),
        })
      }
    }

    if (removedIds.length > 0) {
      this.assertWorkspaceViewRemains(workspaceId, path, prev, next)
    }

    this.persistDelta(path, upsertedViews, removedIds, workspaceId)
    this.byPath.set(key, next)
    for (const entry of createdEntries) {
      this.policyGuard?.onCreated?.(
        workspaceId,
        path,
        entry.view,
        entry.view.createdBy || accountId,
        entry.policy,
      )
    }
    for (const id of removedIds) this.policyGuard?.onRemoved?.(workspaceId, path, id)
    if (path === WORKSPACE_MEMBERS_COLLECTION_PATH) {
      for (const view of upsertedViews) this.policyGuard?.onMemberViewChanged?.(workspaceId, String(view.id))
      for (const id of removedIds) this.policyGuard?.onMemberViewChanged?.(workspaceId, id)
    }
    return {
      upserted: upsertedViews,
      removed: removedIds,
      views: this.clientViewsFor(path, accountId, workspaceId),
    }
  }

  rows(tables: CollectionInfo[], accountId = '', workspaceId = this.resolveWorkspaceId()): DbRecord[] {
    const labels = new Map(tables.map((item) => [normalizeCollectionPath(item.path), item.view?.title ?? item.label]))
    const icons = new Map(tables.map((item) => [normalizeCollectionPath(item.path), item.view?.icon]))
    const scopes = workspaceId ? this.policyGuard?.shareScopesFor?.(workspaceId) : undefined
    const out: DbRecord[] = []
    const seen = new Set<string>()
    const emit = (path: string, tableName: string, view: StoredView) => {
      const viewRole = accountId && this.policyGuard?.viewRoleFor
        ? this.policyGuard.viewRoleFor(workspaceId, path, view, accountId) ?? undefined
        : undefined
      const shareScope = scopes?.get(viewRecordId(path, view.id))
      const rec = asRecord(path, tableName, view, icons.get(path), viewRole, shareScope)
      if (seen.has(rec.id)) return
      seen.add(rec.id)
      out.push(rec)
    }
    for (const table of tables) {
      const path = normalizeCollectionPath(table.path)
      if (!path || path === '/' || path === VIEWS_COLLECTION_PATH) continue
      const label = String(labels.get(path) ?? table.label ?? path)
      const stored = this.ensureSeedViews(path, table, workspaceId)
      for (const view of stored) {
        if (this.canAccountSeeView(workspaceId, path, view, accountId)) {
          emit(path, label, view)
        }
      }
    }
    for (const path of this.workspacePaths(workspaceId)) {
      if (path === VIEWS_COLLECTION_PATH) continue
      if (tables.some((table) => normalizeCollectionPath(table.path) === path)) continue
      for (const view of this.byPath.get(bucketKey(workspaceId, path)) ?? []) {
        if (this.canAccountSeeView(workspaceId, path, view, accountId)) {
          emit(path, labels.get(path) ?? path, view)
        }
      }
    }
    return out.sort((a, b) => String(a.table).localeCompare(String(b.table)) || String(a.title).localeCompare(String(b.title)))
  }

  create(
    fields: Record<string, unknown>,
    tables: CollectionInfo[],
    accountId = '',
    workspaceId = this.resolveWorkspaceId(),
  ): DbRecord {
    const tablePath = tablePathOf(fields)
    if (!tablePath || tablePath === '/' || tablePath === VIEWS_COLLECTION_PATH) throw new Error('tablePath required')
    if (
      tablePath !== DATA_COLLECTION_PATH &&
      !tables.some((item) => normalizeCollectionPath(item.path) === tablePath)
    ) {
      throw new Error(`unknown collection: ${tablePath}`)
    }
    const table = tables.find((item) => normalizeCollectionPath(item.path) === tablePath)
    const label = table?.view?.title ?? table?.label ?? tablePath
    const id = String(fields.viewId ?? '').trim() || randomUUID()
    const key = bucketKey(workspaceId, tablePath)
    const views = this.byPath.get(key) ?? []
    if (views.some((view) => view.id === id)) throw new Error(`view exists: ${id}`)
    const name = uniqueViewName(String(fields.title ?? fields.name ?? '新视图').trim() || '新视图', views)
    const now = Date.now()
    const base: StoredView = {
      id,
      name,
      mode: 'table',
      locked: Boolean(fields.locked),
      revision: 1,
      query: '',
      groupBy: '',
      columns: [],
      filters: {},
      sortField: 'id',
      sortDir: 'asc',
      sorts: [{ id: 's:id', field: 'id', dir: 'asc' }],
      tree: false,
      wrap: false,
      truncate: true,
      rowNumbers: false,
      freezeTitle: false,
      pageSize: normalizePageSize(fields.pageSize),
      columnWidths: {},
      rank: views.length,
      createdAt: now,
      updatedAt: now,
      ...(accountId ? { createdBy: accountId } : {}),
    }
    const view = applyViewPatch(base, {
      ...fields,
      title: name,
      filters: fields.filters ?? {},
      sorts: fields.sorts,
      sortField: typeof fields.sortField === 'string' && fields.sortField.trim() ? fields.sortField : 'id',
    })
    view.revision = 1
    this.assertCanModifyView(workspaceId, tablePath, undefined, view, Object.keys(fields), accountId)
    const policy = this.resolveInitialPolicy(workspaceId, tablePath, fields as SavedViewFieldPatch & Record<string, unknown>, accountId)
    this.persistDelta(tablePath, [view], [], workspaceId)
    this.byPath.set(key, [...views, view])
    this.policyGuard?.onCreated?.(workspaceId, tablePath, view, accountId, policy)
    if (tablePath === WORKSPACE_MEMBERS_COLLECTION_PATH) {
      this.policyGuard?.onMemberViewChanged?.(workspaceId, view.id)
    }
    return asRecord(tablePath, label, view, table?.view?.icon)
  }

  remove(id: string, accountId = '', tables: CollectionInfo[] = [], workspaceId = this.resolveWorkspaceId()): boolean {
    const { tablePath, viewId } = parseViewRowId(id)
    const candidates = tablePath
      ? [tablePath]
      : [...this.workspacePaths(workspaceId), ...tables.map((table) => normalizeCollectionPath(table.path))]
    for (const path of candidates) {
      if (!path) continue
      const key = bucketKey(workspaceId, path)
      const views = this.byPath.get(key) ?? []
      const hit = views.find((item) => String(item.id) === viewId)
      if (!hit) continue
      this.assertCanRemoveView(workspaceId, path, viewId, accountId, hit)
      const remaining = views.filter((view) => view !== hit)
      this.assertWorkspaceViewRemains(workspaceId, path, views, remaining)
      this.persistDelta(path, [], [viewId], workspaceId)
      this.byPath.set(key, remaining)
      this.policyGuard?.onRemoved?.(workspaceId, path, viewId)
      if (path === WORKSPACE_MEMBERS_COLLECTION_PATH) {
        this.policyGuard?.onMemberViewChanged?.(workspaceId, viewId)
      }
      return true
    }
    throw new Error(`unknown view: ${id}`)
  }

  write(
    id: string,
    patch: Record<string, unknown>,
    accountId = '',
    tables: CollectionInfo[] = [],
    workspaceId = this.resolveWorkspaceId(),
  ): DbRecord {
    const { tablePath, viewId } = parseViewRowId(id)
    const wsPaths = this.workspacePaths(workspaceId)
    const tablePaths = tables.map((table) => normalizeCollectionPath(table.path))
    const candidates = [...new Set(tablePath ? [tablePath, ...wsPaths, ...tablePaths] : [...wsPaths, ...tablePaths])].filter(Boolean)
    for (const path of candidates) {
      const key = bucketKey(workspaceId, path)
      const table = tables.find((item) => normalizeCollectionPath(item.path) === path)
      const views = this.byPath.get(key) ?? (table ? this.ensureSeedViews(path, table, workspaceId) : [])
      const idx = views.findIndex((item) => String(item.id) === viewId)
      if (idx < 0) continue
      const cur = views[idx]!
      const next = applyViewPatch(cur, patch)
      const changedFields = Object.keys(patch).filter((k) => !PATCH_META_KEYS.has(k) && patch[k] !== undefined)
      this.assertCanModifyView(workspaceId, path, cur, next, changedFields, accountId)
      const nextViews = views.slice()
      nextViews[idx] = next
      this.persistDelta(path, [next], [], workspaceId)
      this.byPath.set(key, nextViews)
      if (path === WORKSPACE_MEMBERS_COLLECTION_PATH) {
        this.policyGuard?.onMemberViewChanged?.(workspaceId, next.id)
      }
      return asRecord(path, tableLabelOf(table, path), next, table?.view?.icon)
    }
    throw new Error(`unknown view: ${id}`)
  }
}

function stripTransientFields(view: StoredView): StoredView {
  const copy: Record<string, unknown> = { ...view }
  delete copy.viewRole
  delete copy.shareScope
  delete copy.hasExternal
  delete copy.ephemeral
  delete copy.protection
  delete copy.scope
  delete copy.builtin
  delete copy.ownerTable
  delete copy.accessMode
  delete copy.memberDefaultRole
  delete copy.baseRevision
  delete copy.baseUpdatedAt
  return copy as StoredView
}

function parseViewRowId(id: string) {
  const cut = id.indexOf('::')
  const tablePath = cut >= 0 ? normalizeCollectionPath(id.slice(0, cut)) : ''
  return { tablePath, viewId: tablePath ? id.slice(cut + 2) : id }
}

function diffChangedFieldKeys(prev: StoredView, next: StoredView): string[] {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)])
  const changed: string[] = []
  for (const key of keys) {
    if (PATCH_META_KEYS.has(key)) continue
    if (JSON.stringify((prev as Record<string, unknown>)[key]) !== JSON.stringify((next as Record<string, unknown>)[key])) {
      changed.push(key)
    }
  }
  return changed
}

/** 统一归一化 create / write 传入的视图字段。 */
function applyViewPatch(cur: StoredView, patch: Record<string, unknown>): StoredView {
  const next: StoredView = {
    ...cur,
    ...(typeof patch.title === 'string' ? { name: patch.title } : {}),
    ...(typeof patch.name === 'string' ? { name: patch.name } : {}),
    ...(typeof patch.mode === 'string' && isViewModeId(patch.mode) ? { mode: patch.mode } : {}),
    ...(typeof patch.locked === 'boolean' ? { locked: patch.locked } : {}),
    ...(typeof patch.sortField === 'string' ? { sortField: patch.sortField } : {}),
    ...(patch.sortDir === 'asc' || patch.sortDir === 'desc' ? { sortDir: patch.sortDir } : {}),
    ...(typeof patch.query === 'string' ? { query: patch.query } : {}),
    ...(typeof patch.groupBy === 'string' ? { groupBy: patch.groupBy } : {}),
    ...('filters' in patch ? filtersFromPatch(patch.filters) : {}),
    ...('filterTree' in patch ? { filterTree: normalizeFilterGroup(parseJsonValue(patch.filterTree)) } : {}),
    ...('sorts' in patch ? sortsFromPatch(patch.sorts, patch.sortField ?? cur.sortField, patch.sortDir ?? cur.sortDir) : {}),
    ...('columns' in patch ? { columns: parseViewColumns(patch.columns) } : {}),
    ...(typeof patch.pageSize === 'number' ? { pageSize: normalizePageSize(patch.pageSize) } : {}),
    ...(typeof patch.tree === 'boolean' ? { tree: patch.tree } : {}),
    ...(typeof patch.wrap === 'boolean' ? { wrap: patch.wrap } : {}),
    ...(typeof patch.truncate === 'boolean' ? { truncate: patch.truncate } : {}),
    ...(typeof patch.rowNumbers === 'boolean' ? { rowNumbers: patch.rowNumbers } : {}),
    ...(typeof patch.freezeTitle === 'boolean' ? { freezeTitle: patch.freezeTitle } : {}),
    ...(Number.isFinite(Number(patch.rank)) ? { rank: Math.round(Number(patch.rank)) } : {}),
    ...('emoji' in patch ? { emoji: String(patch.emoji ?? '') } : {}),
    ...('tag' in patch ? { tag: normalizeSchemaValue(patch.tag) } : {}),
    revision: (Number(cur.revision) || 0) + 1,
    updatedAt: Date.now(),
    createdAt: Number(cur.createdAt) || Date.now(),
  }
  normalizeOptionalViewFields(next, patch, false)
  next.locked = Boolean(next.locked)
  return stripTransientFields(next)
}

/** 规范化可清空的可选字段；clearEmpty=true 时传 null/空值会彻底删除旧键。 */
function normalizeOptionalViewFields(view: StoredView, raw: Record<string, unknown>, clearEmpty: boolean) {
  if ('groupConfig' in raw) {
    const gc = normalizeGroupConfig(raw.groupConfig)
    if (gc) view.groupConfig = gc
    else if (clearEmpty) delete view.groupConfig
    else view.groupConfig = undefined
  }
  if ('freezeUntil' in raw) {
    const fu = typeof raw.freezeUntil === 'string' && raw.freezeUntil.trim() ? raw.freezeUntil.trim() : undefined
    if (fu) view.freezeUntil = fu
    else if (clearEmpty) delete view.freezeUntil
    else view.freezeUntil = undefined
  }
  if ('columnSummaries' in raw) {
    const cs = normalizeColumnSummaries(parseJsonValue(raw.columnSummaries) ?? raw.columnSummaries)
    if (cs) view.columnSummaries = cs
    else if (clearEmpty) delete view.columnSummaries
    else view.columnSummaries = undefined
  }
  if ('columnViews' in raw) {
    const cv = normalizeColumnViews(raw.columnViews)
    if (cv) view.columnViews = cv
    else if (clearEmpty) delete view.columnViews
    else view.columnViews = undefined
  }
  if ('sandboxViews' in raw) {
    const sv = normalizeTableSandboxViews(raw.sandboxViews)
    if (sv) view.sandboxViews = sv
    else if (clearEmpty) delete view.sandboxViews
    else view.sandboxViews = undefined
  }
  if ('columnWidths' in raw) {
    const cw = normalizeColumnWidths(raw.columnWidths)
    if (Object.keys(cw).length) view.columnWidths = cw
    else if (clearEmpty) delete view.columnWidths
    else view.columnWidths = cw
  }
  if ('filterTree' in raw) {
    const parsedTree = raw.filterTree == null ? null : normalizeFilterGroup(parseJsonValue(raw.filterTree))
    if (parsedTree && countFilterRules(parsedTree) > 0) view.filterTree = parsedTree
    else if (clearEmpty) delete view.filterTree
    else view.filterTree = undefined
  }
}

/** 字段级合并增量载荷，服务端单调自增 revision。 */
function mergeFieldPatch(
  prevView: StoredView | undefined,
  incoming: SavedViewFieldPatch & Record<string, unknown>,
  id: string,
  accountId: string,
  now: number,
): StoredView {
  const owner = prevView?.createdBy || (accountId ? accountId : undefined)
  const nextRevision = prevView ? (Number(prevView.revision) || 0) + 1 : 1
  const base: StoredView = prevView
    ? { ...prevView }
    : {
        id,
        name: String(incoming.name ?? id),
        mode: 'table',
        locked: false,
        sortField: 'title',
        sortDir: 'asc',
        filters: {},
        columns: [],
        groupBy: '',
        tree: false,
        wrap: false,
        truncate: true,
        rowNumbers: false,
        freezeTitle: false,
        query: '',
        pageSize: normalizePageSize(incoming.pageSize),
        columnWidths: {},
        createdAt: now,
      }
  const merged = {
    ...base,
    ...incoming,
    id,
    name: String((typeof incoming.name === 'string' && incoming.name.trim() ? incoming.name : base.name) || id),
    locked: 'locked' in incoming ? Boolean(incoming.locked) : Boolean(base.locked),
    revision: nextRevision,
    updatedAt: now,
    createdAt: Number(base.createdAt) || now,
    ...(owner ? { createdBy: owner } : {}),
  } as StoredView
  normalizeOptionalViewFields(merged, incoming, true)
  return stripTransientFields(merged)
}

function tableLabelOf(table: CollectionInfo | undefined, tablePath: string) {
  return table?.view?.title ?? table?.label ?? tablePath
}

function tablePathOf(fields: Record<string, unknown>) {
  const raw = fields.tablePath ?? (typeof fields.table === 'string' && String(fields.table).startsWith('/') ? fields.table : '')
  return normalizeCollectionPath(String(raw ?? ''))
}

function uniqueViewName(base: string, views: StoredView[]) {
  const names = new Set(views.map((view) => view.name))
  if (base === '新视图') return base
  if (!names.has(base)) return base
  let n = 2
  while (names.has(`${base} ${n}`)) n += 1
  return `${base} ${n}`
}

function parseJsonValue(value: unknown): unknown {
  if (typeof value === 'string' && value.trim()) {
    try {
      return JSON.parse(value)
    } catch {
      return value
    }
  }
  return value
}

function filtersFromPatch(value: unknown): { filters: Record<string, string>; filterTree: FilterGroup } {
  const raw = parseJsonValue(value)
  if (looksLikeFilterTree(raw)) {
    return { filters: {}, filterTree: normalizeFilterGroup(raw) }
  }
  const filters = asFilters(raw)
  return { filters, filterTree: flatFiltersToTree(filters) }
}

function sortsFromPatch(value: unknown, sortField: unknown, sortDir: unknown): { sorts: SortRule[]; sortField: string; sortDir: 'asc' | 'desc' } {
  const sorts = parseSortsInput(value, String(sortField || 'title'), sortDir === 'desc' ? 'desc' : 'asc')
  return {
    sorts,
    sortField: sorts[0]?.field || 'title',
    sortDir: sorts[0]?.dir ?? 'asc',
  }
}

function asFilters(value: unknown): Record<string, string> {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const out: Record<string, string> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (item == null || typeof item === 'object') continue
      out[key] = String(item)
    }
    return out
  }
  return {}
}

function asRecord(
  path: string,
  tableName: string,
  view: StoredView,
  tableIcon?: string,
  viewRole?: ViewRole,
  shareScope?: ViewShareScope,
): DbRecord {
  const filters = view.filters && typeof view.filters === 'object' ? view.filters : {}
  const sorts = parseSortsInput(view.sorts, view.sortField, view.sortDir === 'desc' ? 'desc' : 'asc')
  const filterTree = view.filterTree
  return {
    id: viewRecordId(path, view.id),
    title: view.name,
    table: tableName,
    tablePath: path,
    tableIcon,
    viewId: view.id,
    locked: Boolean(view.locked),
    revision: Math.max(1, Number(view.revision) || 1),
    ...(viewRole ? { viewRole } : {}),
    ...(shareScope ? { shareScope } : {}),
    mode: view.mode ?? 'table',
    sortField: sorts[0]?.field || view.sortField || 'title',
    sortDir: sorts[0]?.dir ?? (view.sortDir === 'desc' ? 'desc' : 'asc'),
    query: view.query ?? '',
    groupBy: view.groupBy ?? '',
    groupConfig: view.groupConfig ? JSON.stringify(view.groupConfig) : '',
    tree: Boolean(view.tree),
    wrap: Boolean(view.wrap),
    truncate: view.truncate !== false,
    rowNumbers: Boolean(view.rowNumbers),
    freezeTitle: Boolean(view.freezeTitle),
    freezeUntil: view.freezeUntil ?? '',
    pageSize: normalizePageSize(view.pageSize),
    columns: parseViewColumns(view.columns),
    columnWidths: view.columnWidths ?? {},
    columnSummaries: view.columnSummaries ?? {},
    columnViews: view.columnViews ?? {},
    sandboxViews: view.sandboxViews ?? [],
    rank: Number.isFinite(Number(view.rank)) ? Math.round(Number(view.rank)) : 0,
    filters: JSON.stringify(filters),
    sorts: JSON.stringify(sorts.map((item) => ({ field: item.field, dir: item.dir }))),
    filterTree: filterTree ? JSON.stringify(filterTree) : '',
    ...recordBuiltinValues({
      ...(view as Record<string, unknown>),
      ...(view.createdBy
        ? {
            createdBy: { kind: 'user', accountId: view.createdBy, name: view.createdBy },
            updatedBy: [{ kind: 'user', accountId: view.createdBy, name: view.createdBy }],
          }
        : {}),
    }),
  }
}

/** 工具广播给前端的视图快照（含扁平 filters / filterTree / sorts）。 */
export function clientViewFromDbRow(row: Record<string, unknown> | undefined) {
  if (!row) return undefined
  const id = String(row.viewId ?? '').trim()
  if (!id) return undefined
  const parsedFilters = filtersFromPatch(row.filters)
  const fromTree = parseJsonValue(row.filterTree)
  const tree = looksLikeFilterTree(fromTree) ? normalizeFilterGroup(fromTree) : parsedFilters.filterTree
  const sortsPatch = sortsFromPatch(row.sorts, row.sortField, row.sortDir)
  return {
    id,
    tablePath: normalizeCollectionPath(String(row.tablePath ?? '')),
    name: String(row.title ?? row.name ?? id),
    mode: row.mode,
    locked: Boolean(row.locked),
    revision: Math.max(1, Number(row.revision) || 1),
    ...(row.shareScope === 'personal' || row.shareScope === 'shared' || row.shareScope === 'workspace'
      ? { shareScope: row.shareScope }
      : {}),
    ...(typeof row.viewRole === 'string' ? { viewRole: row.viewRole } : {}),
    createdBy:
      typeof row.createdBy === 'string' && row.createdBy.trim()
        ? row.createdBy.trim()
        : row.createdBy && typeof row.createdBy === 'object' && typeof (row.createdBy as { accountId?: unknown }).accountId === 'string'
          ? String((row.createdBy as { accountId: string }).accountId).trim() || undefined
          : undefined,
    sortField: sortsPatch.sortField,
    sortDir: sortsPatch.sortDir,
    sorts: sortsPatch.sorts,
    query: String(row.query ?? ''),
    groupBy: String(row.groupBy ?? ''),
    groupConfig: normalizeGroupConfig(row.groupConfig),
    columns: parseViewColumns(row.columns),
    filters: parsedFilters.filters,
    filterTree: countFilterRules(tree) ? tree : undefined,
    tree: Boolean(row.tree),
    wrap: Boolean(row.wrap),
    truncate: row.truncate !== false,
    rowNumbers: Boolean(row.rowNumbers),
    freezeTitle: Boolean(row.freezeTitle),
    freezeUntil: typeof row.freezeUntil === 'string' && row.freezeUntil.trim() ? row.freezeUntil.trim() : undefined,
    pageSize: normalizePageSize(row.pageSize),
    columnWidths: row.columnWidths,
    columnSummaries: normalizeColumnSummaries(parseJsonValue(row.columnSummaries) ?? row.columnSummaries),
    columnViews: normalizeColumnViews(row.columnViews),
    sandboxViews: normalizeTableSandboxViews(row.sandboxViews),
    rank: Number.isFinite(Number(row.rank)) ? Math.round(Number(row.rank)) : undefined,
    updatedAt: Number(row.updatedAt) || 0,
  }
}

export function viewsCollection(
  store: SavedViewsStore,
  tables: () => CollectionInfo[],
  accountId: () => string = () => '',
): CollectionSpec {
  const list = () => store.rows(tables(), accountId())
  return {
    id: 'views',
    path: VIEWS_COLLECTION_PATH,
    label: '视图',
    view: {
      moduleId: 'views-db',
      route: '/db-views',
      title: '视图',
      inspector: false,
      blurb: '各表已保存的视图。列表 db_list /views。新建 db_create /views records=[{title, tablePath, mode}]，tablePath 如 /pages。改列 db_update 写 columns 数组或 JSON 数组字符串，标签属性列 key 为 tag::<标签id>::<字段key>。改筛选 db_update 写 filters 或 filterTree（JSON 字符串）。filters 扁平等于：{"project":"biu","status":"open"}。OR/复杂条件用 filterTree：{"kind":"group","combinator":"or","children":[{"kind":"rule","field":"tag","op":"eq","value":"dp"},{"kind":"rule","field":"status","op":"eq","value":"open"}]}。rule.op=eq|neq|contains|not_contains|is_empty|not_empty|gt|lt|within，value 是字符串。排序 sorts：[{"field":"title","dir":"asc"}]。同一数据类型至少保留一个视图。',
      order: 17,
      icon: 'eye',
    },
    records: { update: true, create: true, delete: true, allocateId: false },
    schema: {
      columns: ['title', 'table', 'mode', 'locked', 'sortField', 'sortDir', 'query', 'groupBy', 'pageSize'],
      fields: {
        title: { type: 'string', label: '视图', writable: true },
        table: { type: 'select', label: '来源表', computed: true },
        tablePath: { type: 'string', label: '表路径', writable: true },
        viewId: { type: 'string', label: '视图 ID' },
        mode: { type: 'string', label: '呈现', writable: true },
        locked: { type: 'boolean', label: '锁定配置', writable: true },
        createdBy: { type: 'person', label: '创建者', writable: false },
        sortField: { type: 'string', label: '排序字段', writable: true },
        sortDir: { type: 'select', label: '升降序', writable: true, enum: ['asc', 'desc'] },
        sorts: { type: 'string', label: '排序', writable: true, description: VIEW_SORTS_DESCRIPTION },
        query: { type: 'string', label: '搜索', writable: true },
        groupBy: { type: 'string', label: '分组', writable: true },
        groupConfig: { type: 'string', label: '分组配置', writable: true },
        tree: { type: 'boolean', label: '树形' },
        wrap: { type: 'boolean', label: '换行' },
        truncate: { type: 'boolean', label: '截断' },
        rowNumbers: { type: 'boolean', label: '序号' },
        freezeTitle: { type: 'boolean', label: '冻结标题列' },
        freezeUntil: { type: 'string', label: '冻结至此列', writable: true },
        pageSize: { type: 'number', label: '每页', writable: true },
        rank: { type: 'number', label: '顺序', writable: true },
        columns: {
          type: 'multi-select',
          label: '列',
          writable: true,
          description: VIEW_COLUMNS_DESCRIPTION,
          example: ['title', 'tag', 'tag::tag::category'],
        },
        filters: { type: 'string', label: '筛选', writable: true, description: VIEW_FILTERS_DESCRIPTION },
        filterTree: { type: 'string', label: '筛选树', writable: true, description: VIEW_FILTER_TREE_DESCRIPTION },
        columnSummaries: { type: 'string', label: '列统计', writable: true, description: '每列底部统计方式，JSON 对象：{ "<columnKey>": "sum"|"avg"|"count"|... }' },
        columnViews: { type: 'string', label: '属性视图', writable: true, description: '每列的属性沙箱视图选择，JSON 对象：标签属性列仅存 { activeId }（代码由标签字段 fields[*].views 持有），原生非标签列可内联 { activeId, items: [{ id, name, code }] }。' },
        sandboxViews: { type: 'string', label: '表级沙箱视图', writable: true, description: '表级自定义沙箱呈现视图列表，JSON 数组：[{ id, name, code, data }]。' },
      },
    },
    list,
    get: (id) => list().find((row) => row.id === id) ?? null,
    update: (id, patch) => store.write(id, patch, accountId(), tables()),
    create: (rows) => rows.map((fields) => store.create(fields, tables(), accountId())),
    remove: async (query) => {
      const ids = query.ids ?? []
      for (const id of ids) store.remove(id, accountId())
      return ids
    },
  }
}
