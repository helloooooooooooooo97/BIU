import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import type { CollectionInfo, CollectionSpec, DbRecord } from '@biu/type-file-system'
import { normalizeSchemaValue, recordBuiltinValues } from '@biu/type-file-system'
import { builtinAllView, builtinAllViewId, isBuiltinAllViewId, isBuiltinCatalogViewId, stubBuiltinCatalogView } from '../catalog-views.ts'
import { normalizeColumnWidths, normalizeGroupConfig, normalizePageSize, normalizeViewProtection, normalizeViewScope, parseViewColumns, type SavedView } from '../shared/saved-view.ts'
import { normalizeColumnSummaries } from '../shared/column-summary.ts'
import { normalizeColumnViews } from '../shared/column-sandbox-model.ts'
import { normalizeTableSandboxViews } from '../shared/table-sandbox-model.ts'
import { isViewModeId } from '../shared/fields.ts'
import { DATA_COLLECTION_PATH, VIEWS_COLLECTION_PATH, WORKSPACE_MEMBERS_COLLECTION_PATH, isIndexCollection, normalizeCollectionPath } from '../paths.ts'
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

export type StoredView = Partial<SavedView> & Pick<SavedView, 'id' | 'name'> & { createdBy?: string; createdAt?: number }

export type PolicyViewGuard = {
  workspaceOwner?(workspaceId: string): string | null
  isWorkspaceAdmin?(workspaceId: string, accountId: string): boolean
  memberViewGrantCount?(workspaceId: string, viewId: string): number
  onMemberViewChanged?(workspaceId: string, viewId: string): void
  canSeeView?(workspaceId: string, collection: string, view: StoredView, accountId: string): boolean
  canModifyView?(workspaceId: string, collection: string, view: StoredView, accountId: string): boolean
  canRemoveView?(workspaceId: string, collection: string, view: StoredView, accountId: string): boolean
  viewRoleFor?(workspaceId: string, collection: string, view: StoredView, accountId: string): 'owner' | 'manager' | 'editor' | 'commenter' | 'viewer' | null
  onCreated?(workspaceId: string, collection: string, view: StoredView, accountId: string): void
  onRemoved?(workspaceId: string, collection: string, viewId: string): void
}

type ViewRow = { workspace_id?: string; collection: string; view_id?: string; payload_json: string }

function collectionHasBuiltinAllView(_collection: string): boolean {
  return true
}

function bucketKey(workspaceId: string, collectionPath: string) {
  return `${workspaceId}\t${normalizeCollectionPath(collectionPath)}`
}

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

  private isBuiltinView(viewId: string, view?: { builtin?: unknown }): boolean {
    return Boolean(view?.builtin) || isBuiltinAllViewId(viewId)
  }

  /** 内置聚合视图（builtin-all:*、builtin:*）按用户隔离存储；自定义 /data 视图拥有独立 id，按 protection 决定可见性。 */
  private isPerUserPrivateView(viewId: string, _view?: StoredView, _path = ''): boolean {
    return isBuiltinAllViewId(viewId) || isBuiltinCatalogViewId(viewId)
  }

  private storageViewId(viewId: string, createdBy?: string): string {
    if ((isBuiltinAllViewId(viewId) || isBuiltinCatalogViewId(viewId)) && createdBy) return `${viewId}::user:${createdBy}`
    return viewId
  }

  private withBuiltinOwner(workspaceId: string, view: StoredView, accountId = ''): StoredView {
    const id = String(view.id)
    if (isBuiltinAllViewId(id) || isBuiltinCatalogViewId(id)) {
      const owner = view.createdBy || accountId || undefined
      return {
        ...view,
        ...(owner ? { createdBy: owner } : {}),
        scope: 'personal',
        protection: 'personal',
      }
    }
    if (!this.isBuiltinView(id, view)) return view
    const owner = this.policyGuard?.workspaceOwner?.(workspaceId)?.trim()
    if (!owner) return view
    if (view.createdBy === owner && view.scope === 'workspace') return view
    return { ...view, createdBy: owner, scope: 'workspace' }
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
    return Boolean(view && view.protection === 'locked')
  }

  /** 列出当前用户可见的所有 `/workspace-members` 视图（区分管理员锁定动态组与普通快捷名单）。 */
  listMemberViews(workspaceId: string, accountId: string): StoredView[] {
    const list = this.byPath.get(bucketKey(workspaceId, WORKSPACE_MEMBERS_COLLECTION_PATH)) ?? []
    return list.filter(
      (v) => !isBuiltinAllViewId(String(v.id)) && this.canAccountSeeView(workspaceId, WORKSPACE_MEMBERS_COLLECTION_PATH, v, accountId),
    )
  }

  private assertCanModifyView(
    workspaceId: string,
    path: string,
    prev: StoredView | undefined,
    next: StoredView,
    accountId: string,
  ) {
    const viewId = String(prev?.id ?? next.id ?? '')
    if (path === WORKSPACE_MEMBERS_COLLECTION_PATH && !this.isBuiltinView(viewId, prev ?? next)) {
      const isAdmin = !accountId || !this.policyGuard?.isWorkspaceAdmin
        ? true
        : this.policyGuard.isWorkspaceAdmin(workspaceId, accountId)
      if ((next.protection === 'locked' || prev?.protection === 'locked') && !isAdmin) {
        throw new Error('permission denied: MEMBER_LOCKED_VIEW_ADMIN_ONLY')
      }
      if (prev?.protection === 'locked' && next.protection !== 'locked') {
        const refCount = this.policyGuard?.memberViewGrantCount?.(workspaceId, viewId) ?? 0
        if (refCount > 0) {
          throw new Error(`MEMBER_VIEW_REFERENCED: 该锁定成员视图正被 ${refCount} 条记录动态引用，请先固化为名单或取消关联授权`)
        }
      }
    }
    if (this.isPerUserPrivateView(viewId, prev ?? next)) {
      if (prev?.createdBy && accountId && prev.createdBy !== accountId) {
        throw new Error('permission denied: VIEW_OWNER_ONLY')
      }
      return
    }
    if (this.isBuiltinView(viewId, prev ?? next)) {
      const owner = this.policyGuard?.workspaceOwner?.(workspaceId)?.trim()
      const isAdmin = Boolean(accountId && this.policyGuard?.isWorkspaceAdmin?.(workspaceId, accountId))
      if (owner && accountId && accountId !== owner && !isAdmin) {
        throw new Error('permission denied: BUILTIN_VIEW_OWNER_ONLY')
      }
      return
    }
    if (!prev) return
    if (this.policyGuard?.canModifyView && accountId) {
      if (!this.policyGuard.canModifyView(workspaceId, path, prev, accountId)) {
        throw new Error('permission denied: VIEW_OWNER_ONLY')
      }
    } else if (this.isForeignOwned(prev, accountId)) {
      throw new Error('permission denied: VIEW_OWNER_ONLY')
    }
  }

  private assertCanRemoveView(
    workspaceId: string,
    path: string,
    viewId: string,
    accountId: string,
    prev?: StoredView,
  ) {
    if (path === WORKSPACE_MEMBERS_COLLECTION_PATH && prev?.protection === 'locked') {
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
    if (this.isPerUserPrivateView(viewId, prev)) {
      if (prev?.createdBy && accountId && prev.createdBy !== accountId) {
        throw new Error('permission denied: VIEW_OWNER_ONLY')
      }
      return
    }
    if (this.isBuiltinView(viewId, prev)) {
      const owner = this.policyGuard?.workspaceOwner?.(workspaceId)?.trim()
      const isAdmin = Boolean(accountId && this.policyGuard?.isWorkspaceAdmin?.(workspaceId, accountId))
      if (owner && accountId && accountId !== owner && !isAdmin) {
        throw new Error('permission denied: BUILTIN_VIEW_OWNER_ONLY')
      }
      return
    }
    if (this.policyGuard?.canRemoveView && accountId && prev) {
      if (!this.policyGuard.canRemoveView(workspaceId, path, prev, accountId)) {
        throw new Error('permission denied: VIEW_OWNER_ONLY')
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

  private visibleCount(path: string, views: StoredView[]) {
    const ids = new Set(views.map((view) => String(view.id)).filter(Boolean))
    if (collectionHasBuiltinAllView(path)) ids.add(builtinAllViewId(path))
    return ids.size
  }

  private hydrate() {
    if (!this.db) return
    this.byPath.clear()
    let rows: ViewRow[] = []
    let hasWorkspaceId = true
    try {
      rows = this.db.prepare('SELECT workspace_id, collection, view_id, payload_json FROM saved_views').all() as ViewRow[]
    } catch {
      hasWorkspaceId = false
      rows = this.db.prepare('SELECT collection, view_id, payload_json FROM saved_views').all() as ViewRow[]
    }
    const staleRows: Array<{ workspaceId: string; collection: string; viewId: string }> = []
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
      const id = String(parsed.id ?? '').trim()
      const name = String(parsed.name ?? id).trim()
      if (!id) continue
      const key = bucketKey(workspaceId, collection)
      const list = this.byPath.get(key) ?? []
      if (collection === DATA_COLLECTION_PATH) {
        const isBuiltinData = isBuiltinAllViewId(id) || isBuiltinCatalogViewId(id)
        const storedProtection = isBuiltinData
          ? 'personal'
          : normalizeViewProtection(parsed.protection, normalizeViewScope(parsed.scope))
        const storedScope = storedProtection === 'personal' ? 'personal' : 'workspace'
        list.push({ ...parsed, id, name, scope: storedScope, protection: storedProtection })
      } else {
        const cleaned = { ...parsed, id, name }
        delete (cleaned as { ownerTable?: unknown }).ownerTable
        list.push(cleaned)
      }
      this.byPath.set(key, list)
    }
    if (staleRows.length > 0) {
      const del = hasWorkspaceId
        ? this.db.prepare('DELETE FROM saved_views WHERE workspace_id = ? AND collection = ? AND view_id = ?')
        : this.db.prepare('DELETE FROM saved_views WHERE collection = ? AND view_id = ?')
      this.db.exec('BEGIN IMMEDIATE')
      try {
        for (const item of staleRows) {
          if (hasWorkspaceId) del.run(item.workspaceId, item.collection, item.viewId)
          else del.run(item.collection, item.viewId)
        }
        this.db.exec('COMMIT')
      } catch {
        this.db.exec('ROLLBACK')
      }
    }
  }

  /** 增量写盘：只 upsert/delete 本次变更的 view_id。 */
  private persistDelta(
    collectionPath: string,
    upserted: StoredView[],
    removedKeys: string[],
    workspaceId: string,
  ) {
    if (!this.db || (!upserted.length && !removedKeys.length)) return
    const path = normalizeCollectionPath(collectionPath)
    const now = Date.now()
    const upsert = this.db.prepare(
      `INSERT INTO saved_views (workspace_id, collection, view_id, payload_json, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, collection, view_id) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at`,
    )
    const delView = this.db.prepare('DELETE FROM saved_views WHERE workspace_id = ? AND collection = ? AND view_id = ?')
    this.db.exec('BEGIN IMMEDIATE')
    try {
      for (const view of upserted) {
        const id = String(view.id ?? '').trim()
        if (id) upsert.run(workspaceId, path, this.storageViewId(id, view.createdBy), JSON.stringify(view), now)
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
    if (isIndexCollection(path)) return view.createdBy === accountId
    if (this.isPerUserPrivateView(String(view.id), view, path)) {
      return !accountId || view.createdBy === accountId
    }
    if (accountId && this.policyGuard?.canSeeView) {
      return this.policyGuard.canSeeView(workspaceId, path, view, accountId)
    }
    return isViewVisibleTo(view, path, accountId)
  }

  clearWorkspace(workspaceId: string) {
    const prefix = `${workspaceId}\t`
    for (const key of [...this.byPath.keys()]) {
      if (key.startsWith(prefix)) this.byPath.delete(key)
    }
  }

  viewsFor(collectionPath: string, accountId = '', workspaceId = this.resolveWorkspaceId()): StoredView[] {
    const path = normalizeCollectionPath(collectionPath)
    const views = (this.byPath.get(bucketKey(workspaceId, path)) ?? []).map((view) =>
      this.withBuiltinOwner(workspaceId, view),
    )
    return views.filter((view) => this.canAccountSeeView(workspaceId, path, view, accountId))
  }

  /** 返回给前端/HTTP 响应的权威视图列表（附带当前操作者 viewRole）。 */
  clientViewsFor(collectionPath: string, accountId = '', workspaceId = this.resolveWorkspaceId()): StoredView[] {
    const path = normalizeCollectionPath(collectionPath)
    return this.viewsFor(path, accountId, workspaceId).map((view) => {
      const viewRole = accountId && this.policyGuard?.viewRoleFor
        ? this.policyGuard.viewRoleFor(workspaceId, path, view, accountId) ?? undefined
        : undefined
      return viewRole ? { ...view, viewRole } : view
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

  replace(collectionPath: string, views: StoredView[], accountId = '', workspaceId = this.resolveWorkspaceId()) {
    const path = normalizeCollectionPath(collectionPath)
    const key = bucketKey(workspaceId, path)
    const prev = this.byPath.get(key) ?? []
    const indexScoped = isIndexCollection(path)
    const isForeign = (view: StoredView) => {
      if (!accountId || !view.createdBy || view.createdBy === accountId) return false
      if (indexScoped || this.isPerUserPrivateView(String(view.id), view, path)) return true
      const protection = normalizeViewProtection(view.protection, normalizeViewScope(view.scope))
      if (protection === 'personal') return true
      return !this.canAccountSeeView(workspaceId, path, view, accountId)
    }
    const keptForeign = prev.filter(isForeign)
    const foreignNonPerUserIds = new Set(
      keptForeign
        .filter((view) => !this.isPerUserPrivateView(String(view.id), view))
        .map((view) => String(view.id)),
    )
    const incomingList = views
      .filter((view) => !foreignNonPerUserIds.has(String(view.id)))
      .map((view) => {
        const id = String(view.id)
        const perUser = indexScoped || this.isPerUserPrivateView(id, view)
        return this.withBuiltinOwner(
          workspaceId,
          {
            ...view,
            id,
            name: String(view.name || id),
            ...(perUser && accountId ? { createdBy: accountId } : {}),
          },
          accountId,
        )
      })
    const incomingIds = new Set(incomingList.map((view) => String(view.id)))
    const prevOwned = prev.filter((view) => !isForeign(view))
    const removedRows: Array<{ id: string; storageKey: string }> = []
    for (const oldView of prevOwned) {
      const oldId = String(oldView.id)
      if (!incomingIds.has(oldId)) {
        this.assertCanRemoveView(workspaceId, path, oldId, accountId, oldView)
        removedRows.push({ id: oldId, storageKey: this.storageViewId(oldId, oldView.createdBy) })
      }
    }
    for (const nextView of incomingList) {
      const oldView = prevOwned.find((item) => String(item.id) === String(nextView.id))
      this.assertCanModifyView(workspaceId, path, oldView, nextView, accountId)
    }
    const merged = [...keptForeign, ...incomingList]
    this.persistDelta(
      path,
      incomingList,
      removedRows.map((item) => item.storageKey),
      workspaceId,
    )
    this.byPath.set(key, merged)
    for (const item of removedRows) this.policyGuard?.onRemoved?.(workspaceId, path, item.id)
    if (path === WORKSPACE_MEMBERS_COLLECTION_PATH) {
      for (const view of incomingList) this.policyGuard?.onMemberViewChanged?.(workspaceId, String(view.id))
      for (const item of removedRows) this.policyGuard?.onMemberViewChanged?.(workspaceId, item.id)
    }
  }

  private assertTableKeepsPublicView(_path: string, _prev: StoredView[], _next: StoredView[]) {
    // 单逻辑表下每张集合始终保留内置顶层视图，不再维护 K+1 分表保底约束
  }

  private ensureDefaultTableViews(
    workspaceId: string,
    path: string,
    _table: CollectionInfo,
    _label: string,
    _accountId: string,
  ): StoredView[] {
    return this.byPath.get(bucketKey(workspaceId, path)) ?? []
  }

  /** 按差异写视图：只动当前账号本次变更的条目；先落盘 SQLite 再更新内存，返回权威视图列表。 */
  applyPatch(
    collectionPath: string,
    patch: { upsert?: Array<StoredView & { baseUpdatedAt?: number }>; remove?: string[] },
    accountId = '',
    workspaceId = this.resolveWorkspaceId(),
  ) {
    const path = normalizeCollectionPath(collectionPath)
    const key = bucketKey(workspaceId, path)
    const indexScoped = isIndexCollection(path)
    const prev = this.byPath.get(key) ?? []
    const isRowOwnedByActor = (view: StoredView) => {
      if (indexScoped || this.isPerUserPrivateView(String(view.id), view, path)) {
        return !accountId || !view.createdBy || view.createdBy === accountId
      }
      return true
    }
    const matchesTarget = (view: StoredView, viewId: string) =>
      String(view.id) === viewId && isRowOwnedByActor(view)
    const removed = new Set((patch.remove ?? []).map(String).filter(Boolean))
    const removedRows: Array<{ id: string; storageKey: string }> = []
    for (const viewId of removed) {
      const prevView = prev.find((view) => matchesTarget(view, viewId))
      if (!prevView && prev.some((view) => String(view.id) === viewId)) continue
      this.assertCanRemoveView(workspaceId, path, viewId, accountId, prevView)
      removedRows.push({
        id: viewId,
        storageKey: this.storageViewId(viewId, prevView?.createdBy ?? accountId),
      })
    }
    const kept = prev.filter((view) => !(removed.has(String(view.id)) && isRowOwnedByActor(view)))
    const next = kept.slice()
    const upsertedViews: StoredView[] = []
    const createdViews: StoredView[] = []
    const skippedIds: string[] = []
    for (const rawIncoming of patch.upsert ?? []) {
      const { baseUpdatedAt: rawBaseAt, ...incoming } = rawIncoming
      const id = String(incoming.id ?? '').trim()
      if (!id) continue
      const isWsAdmin = !accountId || !this.policyGuard?.isWorkspaceAdmin
        ? true
        : this.policyGuard.isWorkspaceAdmin(workspaceId, accountId)
      const allowAllPublic = Boolean(isWsAdmin && !isBuiltinAllViewId(id) && !isBuiltinCatalogViewId(id))
      const requestedDataProtection =
        allowAllPublic &&
        (incoming.protection === 'public' || incoming.protection === 'locked' || incoming.protection === 'personal')
          ? incoming.protection
          : 'personal'
      const cleanedIncoming: StoredView = { ...incoming }
      delete (cleanedIncoming as { ownerTable?: unknown }).ownerTable
      const normalizedIncoming =
        path === DATA_COLLECTION_PATH
          ? {
              ...cleanedIncoming,
              protection: requestedDataProtection,
              scope: requestedDataProtection === 'personal' ? ('personal' as const) : ('workspace' as const),
            }
          : cleanedIncoming
      const perUser = indexScoped || this.isPerUserPrivateView(id, normalizedIncoming, path)
      const prevView = prev.find((view) =>
        perUser
          ? String(view.id) === id && (!accountId || view.createdBy === accountId)
          : String(view.id) === id,
      )
      if (!perUser && prevView && !isRowOwnedByActor(prevView)) continue
      const incomingAt = Number((normalizedIncoming as { updatedAt?: unknown }).updatedAt) || 0
      const storedAt = Number((prevView as { updatedAt?: unknown } | undefined)?.updatedAt) || 0
      const baseAt = Number(rawBaseAt) || 0
      const matchesBase = Boolean(baseAt && storedAt && baseAt === storedAt)
      if (prevView && incomingAt && storedAt && incomingAt < storedAt && !matchesBase) {
        skippedIds.push(id)
        continue
      }
      const effectiveAt = incomingAt
        ? (prevView && storedAt && incomingAt <= storedAt ? storedAt + 1 : incomingAt)
        : Math.max(Date.now(), storedAt + 1)
      const stampedIncoming: StoredView = { ...normalizedIncoming, updatedAt: effectiveAt }
      const view = this.withBuiltinOwner(
        workspaceId,
        mergeIncomingStoredView(prevView, stampedIncoming, id, effectiveAt, perUser, accountId, allowAllPublic),
        accountId,
      )
      this.assertCanModifyView(workspaceId, path, prevView, view, accountId)
      const at = next.findIndex((item) =>
        perUser
          ? String(item.id) === id && (!accountId || item.createdBy === accountId)
          : String(item.id) === id,
      )
      if (at >= 0) next[at] = view
      else next.push(view)
      upsertedViews.push(view)
      if (!prevView) createdViews.push(view)
    }
    if (removedRows.length && this.visibleCount(path, next) < 1) {
      throw new Error('至少保留一个视图')
    }
    this.assertTableKeepsPublicView(path, prev, next)
    this.persistDelta(
      path,
      upsertedViews,
      removedRows.map((item) => item.storageKey),
      workspaceId,
    )
    this.byPath.set(key, next)
    for (const created of createdViews) this.policyGuard?.onCreated?.(workspaceId, path, created, accountId)
    for (const item of removedRows) this.policyGuard?.onRemoved?.(workspaceId, path, item.id)
    if (path === WORKSPACE_MEMBERS_COLLECTION_PATH) {
      for (const view of upsertedViews) this.policyGuard?.onMemberViewChanged?.(workspaceId, String(view.id))
      for (const item of removedRows) this.policyGuard?.onMemberViewChanged?.(workspaceId, item.id)
    }
    return {
      upserted: upsertedViews,
      removed: removedRows.map((item) => item.id),
      skipped: skippedIds,
      views: this.clientViewsFor(path, accountId, workspaceId),
    }
  }

  rows(tables: CollectionInfo[], accountId = '', workspaceId = this.resolveWorkspaceId()): DbRecord[] {
    const labels = new Map(tables.map((item) => [normalizeCollectionPath(item.path), item.view?.title ?? item.label]))
    const icons = new Map(tables.map((item) => [normalizeCollectionPath(item.path), item.view?.icon]))
    const out: DbRecord[] = []
    const seen = new Set<string>()
    const emit = (path: string, tableName: string, view: StoredView) => {
      const owned = this.withBuiltinOwner(workspaceId, view, accountId)
      const viewRole = accountId && this.policyGuard?.viewRoleFor
        ? this.policyGuard.viewRoleFor(workspaceId, path, owned, accountId) ?? undefined
        : undefined
      const rec = asRecord(path, tableName, owned, icons.get(path), viewRole)
      if (seen.has(rec.id)) return
      seen.add(rec.id)
      out.push(rec)
    }
    for (const table of tables) {
      const path = normalizeCollectionPath(table.path)
      if (!path || path === '/') continue
      const label = String(labels.get(path) ?? table.label ?? path)
      const stored = this.ensureDefaultTableViews(workspaceId, path, table, label, accountId)
      if (collectionHasBuiltinAllView(path)) {
        const all = builtinAllView({ path, label, view: table.view })
        const myAll =
          stored.find((view) => String(view.id) === all.id && (!accountId || view.createdBy === accountId)) ?? {
            ...all,
            ...(accountId ? { createdBy: accountId } : {}),
            scope: 'personal',
            protection: 'personal',
          }
        emit(path, label, myAll)
      }
      for (const view of stored) {
        if (this.canAccountSeeView(workspaceId, path, view, accountId)) {
          emit(path, label, view)
        }
      }
    }
    for (const path of this.workspacePaths(workspaceId)) {
      if (tables.some((table) => normalizeCollectionPath(table.path) === path)) continue
      for (const view of this.byPath.get(bucketKey(workspaceId, path)) ?? []) {
        if (this.canAccountSeeView(workspaceId, path, view, accountId)) {
          emit(path, labels.get(path) ?? path, view)
        }
      }
    }
    return out.sort((a, b) => String(a.table).localeCompare(String(b.table)) || String(a.title).localeCompare(String(b.title)))
  }

  create(fields: Record<string, unknown>, tables: CollectionInfo[], accountId = '', workspaceId = this.resolveWorkspaceId()): DbRecord {
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
    const isWsAdmin = !accountId || !this.policyGuard?.isWorkspaceAdmin
      ? true
      : this.policyGuard.isWorkspaceAdmin(workspaceId, accountId)
    const allowAllPublic = Boolean(isWsAdmin && !isBuiltinAllViewId(id) && !isBuiltinCatalogViewId(id))
    const view = applyViewPatch(
      base,
      {
        ...fields,
        title: name,
        filters: fields.filters ?? {},
        sorts: fields.sorts,
        sortField: typeof fields.sortField === 'string' && fields.sortField.trim() ? fields.sortField : 'id',
      },
      allowAllPublic,
    )
    this.assertCanModifyView(workspaceId, tablePath, undefined, view, accountId)
    this.persistDelta(tablePath, [view], [], workspaceId)
    this.byPath.set(key, [...views, view])
    this.policyGuard?.onCreated?.(workspaceId, tablePath, view, accountId)
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
      const hit = findView(views, path, viewId, accountId)
      const targetId = String(hit?.id ?? viewId)
      if (!hit && views.some((view) => String(view.id) === viewId)) throw new Error(`unknown view: ${id}`)
      if (!hit) continue
      this.assertCanRemoveView(workspaceId, path, targetId, accountId, hit)
      const remaining = views.filter((view) => view !== hit)
      if (this.visibleCount(path, remaining) < 1) throw new Error('至少保留一个视图')
      this.assertTableKeepsPublicView(path, views, remaining)
      this.persistDelta(path, [], [this.storageViewId(targetId, hit.createdBy)], workspaceId)
      this.byPath.set(key, remaining)
      this.policyGuard?.onRemoved?.(workspaceId, path, targetId)
      if (path === WORKSPACE_MEMBERS_COLLECTION_PATH) {
        this.policyGuard?.onMemberViewChanged?.(workspaceId, targetId)
      }
      return true
    }
    throw new Error(`unknown view: ${id}`)
  }

  write(id: string, patch: Record<string, unknown>, accountId = '', tables: CollectionInfo[] = [], workspaceId = this.resolveWorkspaceId()): DbRecord {
    const { tablePath, viewId } = parseViewRowId(id)
    const wsPaths = this.workspacePaths(workspaceId)
    const tablePaths = tables.map((table) => normalizeCollectionPath(table.path))
    const candidates = [...new Set(tablePath ? [tablePath, ...wsPaths, ...tablePaths] : [...wsPaths, ...tablePaths])].filter(Boolean)
    for (const path of candidates) {
      const key = bucketKey(workspaceId, path)
      const views = this.byPath.get(key) ?? []
      const hit = findView(views, path, viewId, accountId)
      if (!hit && !isBuiltinAllViewId(viewId) && !(path === DATA_COLLECTION_PATH && isBuiltinCatalogViewId(viewId)) && views.some((view) => String(view.id) === viewId)) {
        throw new Error(`unknown view: ${id}`)
      }
      const table = tables.find((item) => normalizeCollectionPath(item.path) === path)
      const catalogTargetPath = path === DATA_COLLECTION_PATH && isBuiltinCatalogViewId(viewId)
        ? normalizeCollectionPath(viewId.slice('builtin:'.length))
        : ''
      const catalogTargetTable = catalogTargetPath
        ? tables.find((item) => normalizeCollectionPath(item.path) === catalogTargetPath)
        : undefined
      const seed =
        hit ??
        (viewId === builtinAllViewId(path)
          ? {
              ...builtinAllView({ path, label: tableLabelOf(table, path), view: table?.view }),
              ...(accountId ? { createdBy: accountId } : {}),
              scope: 'personal' as const,
              protection: 'personal' as const,
            }
          : catalogTargetPath
            ? {
                ...(stubBuiltinCatalogView(viewId) ?? {}),
                name: tableLabelOf(catalogTargetTable, catalogTargetPath),
                ...(accountId ? { createdBy: accountId } : {}),
                scope: 'personal' as const,
                protection: 'personal' as const,
              }
            : null)
      if (!seed) continue
      const idx = hit ? views.indexOf(hit) : -1
      const cur = (hit ?? seed) as StoredView
      const isWsAdmin = !accountId || !this.policyGuard?.isWorkspaceAdmin
        ? true
        : this.policyGuard.isWorkspaceAdmin(workspaceId, accountId)
      const allowAllPublic = Boolean(isWsAdmin && !isBuiltinAllViewId(cur.id) && !isBuiltinCatalogViewId(cur.id))
      const next = this.withBuiltinOwner(workspaceId, applyViewPatch(cur, patch, allowAllPublic), accountId)
      this.assertCanModifyView(workspaceId, path, cur, next, accountId)
      const nextViews = views.slice()
      if (idx >= 0) nextViews[idx] = next
      else nextViews.push(next)
      this.assertTableKeepsPublicView(path, views, nextViews)
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

function parseViewRowId(id: string) {
  const cut = id.indexOf('::')
  const tablePath = cut >= 0 ? normalizeCollectionPath(id.slice(0, cut)) : ''
  return { tablePath, viewId: tablePath ? id.slice(cut + 2) : id }
}

/** 统一归一化 create / write 传入的视图字段。 */
function applyViewPatch(cur: StoredView, patch: Record<string, unknown>, _allowAllPublic = false): StoredView {
  const isBuiltinPersonal = isBuiltinAllViewId(cur.id) || isBuiltinCatalogViewId(cur.id)
  const nextScope = isBuiltinPersonal ? 'personal' : normalizeViewScope(patch.scope)
  const nextProtection = isBuiltinPersonal ? 'personal' : normalizeViewProtection(patch.protection)
  const prevUpdatedAt = Number(cur.updatedAt) || 0
  const next: StoredView = {
    ...cur,
    ...(typeof patch.title === 'string' ? { name: patch.title } : {}),
    ...(typeof patch.name === 'string' ? { name: patch.name } : {}),
    ...(typeof patch.mode === 'string' && isViewModeId(patch.mode) ? { mode: patch.mode } : {}),
    ...(nextScope ? { scope: nextScope } : {}),
    ...(nextProtection ? { protection: nextProtection } : {}),
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
    updatedAt: Math.max(Date.now(), prevUpdatedAt + 1),
    createdAt: Number(cur.createdAt) || Date.now(),
  }
  delete (next as { ownerTable?: unknown }).ownerTable
  normalizeOptionalViewFields(next, patch, false)
  if (isBuiltinPersonal) {
    next.protection = 'personal'
    next.scope = 'personal'
  } else {
    next.protection = normalizeViewProtection(next.protection, normalizeViewScope(next.scope))
    next.scope = next.protection === 'personal' ? 'personal' : 'workspace'
  }
  return next
}

/** 规范化可清空的可选字段；clearEmpty=true 时传 null/空值会彻底删除旧键。 */
function normalizeOptionalViewFields(view: StoredView, raw: Record<string, unknown>, clearEmpty: boolean) {
  if ('scope' in raw) {
    const sc = normalizeViewScope(raw.scope)
    if (sc) view.scope = sc
    else if (clearEmpty) delete view.scope
    else view.scope = undefined
  }
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
  if (clearEmpty && 'filterTree' in raw) {
    const parsedTree = raw.filterTree == null ? null : normalizeFilterGroup(parseJsonValue(raw.filterTree))
    if (parsedTree && countFilterRules(parsedTree) > 0) view.filterTree = parsedTree
    else delete view.filterTree
  }
}

/** 合并 upsert 载荷并规范化可显式清空的字段（传 null / '' / {} / 空筛选树时彻底删除旧值）。 */
function mergeIncomingStoredView(
  prevView: StoredView | undefined,
  incoming: StoredView,
  id: string,
  incomingAt: number,
  indexScoped: boolean,
  accountId: string,
  _allowAllPublic = false,
): StoredView {
  const owner = prevView?.createdBy || (accountId ? accountId : undefined)
  const view: StoredView = {
    ...prevView,
    ...incoming,
    id,
    name: String(incoming.name || prevView?.name || id),
    ...(incomingAt ? {} : { updatedAt: Date.now() }),
    ...(owner ? { createdBy: owner } : indexScoped ? { createdBy: accountId } : {}),
  }
  delete (view as { ownerTable?: unknown }).ownerTable
  normalizeOptionalViewFields(view, incoming as Record<string, unknown>, true)
  if (isBuiltinAllViewId(id) || isBuiltinCatalogViewId(id)) {
    view.protection = 'personal'
    view.scope = 'personal'
  } else {
    view.protection = normalizeViewProtection(view.protection, normalizeViewScope(view.scope))
    view.scope = view.protection === 'personal' ? 'personal' : 'workspace'
  }
  return view
}

/**
 * 可见性判定（无 policyGuard 时的兜底）：
 * - 索引表（/tags 等）与内置聚合视图（builtin-all:*）按创建者严格隔离；
 * - protection === 'personal'（含 scope === 'personal'）仅创建者可见；
 * - public / locked 视图空间成员均可见。
 */
function isViewVisibleTo(view: StoredView, path: string, accountId: string): boolean {
  if (isIndexCollection(path)) return view.createdBy === accountId
  if ((isBuiltinAllViewId(String(view.id)) || isBuiltinCatalogViewId(String(view.id))) && accountId) {
    return view.createdBy === accountId
  }
  const protection = normalizeViewProtection(view.protection, normalizeViewScope(view.scope))
  if (protection === 'personal' && accountId) {
    return view.createdBy === accountId
  }
  return true
}

/**
 * 标签表（/tags 这类索引表）的视图按创建人分开存，同一个 viewId 可能属于多个账号。
 * 只在当前账号可见的视图里找，避免把别人的视图当成「未知视图」或误改误删。
 */
function findView(views: StoredView[], path: string, viewId: string, accountId: string) {
  const owned = isIndexCollection(path)
    ? views.filter((item) => !item.createdBy || item.createdBy === accountId)
    : views.filter((item) => isViewVisibleTo(item, path, accountId))
  return owned.find((item) => String(item.id) === viewId)
}

function tableLabelOf(table: CollectionInfo | undefined, tablePath: string) {
  return table?.view?.title ?? table?.label ?? tablePath
}

function rowId(path: string, viewId: string) {
  return `${path.replace(/^\//, '')}::${viewId}`
}

function viewIdOfRow(id: string) {
  const cut = id.indexOf('::')
  return cut >= 0 ? id.slice(cut + 2) : id
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
  viewRole?: 'owner' | 'manager' | 'editor' | 'commenter' | 'viewer',
): DbRecord {
  const filters = view.filters && typeof view.filters === 'object' ? view.filters : {}
  const sorts = parseSortsInput(view.sorts, view.sortField, view.sortDir === 'desc' ? 'desc' : 'asc')
  const filterTree = view.filterTree
  const isBuiltinCrossAll = isBuiltinAllViewId(String(view.id)) || isBuiltinCatalogViewId(String(view.id))
  const resolvedProtection = isBuiltinCrossAll
    ? 'personal'
    : normalizeViewProtection(view.protection, normalizeViewScope(view.scope))
  const resolvedScope = resolvedProtection === 'personal' ? 'personal' : 'workspace'
  return {
    id: rowId(path, view.id),
    title: view.name,
    table: tableName,
    tablePath: path,
    tableIcon,
    viewId: view.id,
    ...(viewRole ? { viewRole } : {}),
    mode: view.mode ?? 'table',
    scope: resolvedScope,
    protection: resolvedProtection,
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
    scope: normalizeViewScope(row.scope),
    protection: normalizeViewProtection(row.protection, normalizeViewScope(row.scope)),
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
    builtin: false,
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
      columns: ['title', 'table', 'mode', 'sortField', 'sortDir', 'query', 'groupBy', 'pageSize'],
      fields: {
        title: { type: 'string', label: '视图', writable: true },
        table: { type: 'select', label: '来源表', computed: true },
        tablePath: { type: 'string', label: '表路径', writable: true },
        viewId: { type: 'string', label: '视图 ID' },
        mode: { type: 'string', label: '呈现', writable: true },
        scope: { type: 'select', label: '可见范围', writable: true, enum: ['personal', 'workspace'] },
        protection: { type: 'select', label: '保护视图', writable: true, enum: ['public', 'locked', 'personal'] },
        ownerTable: { type: 'string', label: '归属表', writable: true },
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
