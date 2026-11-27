import { writeStorageString } from '@biu/biu-ui/client-storage'
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import { isBuiltinAllViewId, isReadOnlyViewId, type DataScope } from '../catalog-views.ts'
import { DATA_COLLECTION_PATH, WORKSPACE_MEMBERS_COLLECTION_PATH, normalizeCollectionPath } from '../paths.ts'
import { apiFetch } from '@biu/biu-ui/api-client'
import type { FilterGroup, SortRule } from '../query-logic.ts'
import type { ViewMode } from './fields.ts'
import { FSDB_CRUMB_LABELS_EVENT, FSDB_SHARES_CHANGE_EVENT, emitFsdbEvent } from './fsdb-events.ts'
import { canDeleteSavedView, canEditSavedView, canRemoveCollectionView, type GroupConfig, type SavedView } from './saved-view.ts'
import {
  activeViewStorageKey,
  beginPendingViewOp,
  commitPendingViewOp,
  getStarredViews,
  isViewStarred,
  loadViews,
  omitSavedViewIds,
  persistStarredViews,
  pullSavedViews,
  pushSavedViewsMutation,
  removeStarredViews,
  reviveSavedViewIds,
  rollbackPendingViewOp,
  stampSavedView,
  viewWriteQueue,
  withViewDisplay,
} from './view-storage.ts'

export type BrowserViewCrudOptions = {
  sheet: boolean
  collectionPath: string
  title: string
  routeScope: DataScope | null
  catalogLocks: Record<string, string>
  schemaDefaultKeys: string[]
  views: SavedView[]
  viewsRef: MutableRefObject<SavedView[]>
  setViews: Dispatch<SetStateAction<SavedView[]>>
  activeViewId: string | null
  activeView?: SavedView
  activeViewIdRef: MutableRefObject<string | null>
  viewsWriteGenRef: MutableRefObject<number>
  setViewsSaveError: Dispatch<SetStateAction<boolean>>
  setViewMenuOpen: Dispatch<SetStateAction<boolean>>
  pageRef: RefObject<HTMLDivElement | null>
  mode: ViewMode
  sortField: string
  sortDir: 'asc' | 'desc'
  sorts: SortRule[]
  filterTree: FilterGroup
  columnKeys: string[]
  columnWidths: Record<string, number>
  groupBy: string
  groupConfig?: GroupConfig
  showTree: boolean
  wrapCells: boolean
  truncateCells: boolean
  freezeTitle: boolean
  query: string
  listedViews: (path: string, user: SavedView[]) => SavedView[]
  paintListedViews: (path: string) => SavedView[]
  rankListedViews: (listed: SavedView[], order?: SavedView[]) => SavedView[]
  selectView: (view: SavedView) => void
  onOpenTable?: (path: string, viewId?: string) => void
  externalViews?: {
    onChange?: (views: SavedView[], activeViewId: string) => void
  }
}

export function createBrowserViewCrud(opts: BrowserViewCrudOptions) {
  const {
    sheet,
    collectionPath,
    title,
    routeScope,
    catalogLocks,
    schemaDefaultKeys,
    viewsRef,
    setViews,
    activeViewId,
    activeView,
    activeViewIdRef,
    viewsWriteGenRef,
    setViewsSaveError,
    setViewMenuOpen,
    pageRef,
    mode,
    sortField,
    sortDir,
    sorts,
    filterTree,
    columnKeys,
    columnWidths,
    groupBy,
    groupConfig,
    showTree,
    wrapCells,
    truncateCells,
    freezeTitle,
    query,
    listedViews,
    paintListedViews,
    rankListedViews,
    selectView,
    onOpenTable,
    externalViews,
  } = opts

  function syncPaintedState(path: string) {
    if (path !== collectionPath) return
    const live = loadViews(path)
    const painted = rankListedViews(
      listedViews(path, live).map((view) => withViewDisplay(path, view)),
      live,
    )
    viewsRef.current = painted
    setViews(painted)
  }

  /**
   * 单一权威写通道：
   * 1. 先在 ViewStore 登记独立 opId 的乐观变更（并发操作互不覆盖）；
   * 2. 按 collectionPath 串行 POST /api/db/saved-views；
   * 3. 200 返回权威列表时直接结算 opId 并更新 serverViews（不再自我触发 GET /views 回弹）；
   * 4. 失败时仅撤销当前 opId，绝不回滚期间并发成功的其他视图变更。
   */
  async function commitViewMutation(
    path: string,
    mutation: {
      upsert?: SavedView[]
      remove?: string[]
      baseUpdatedAtById?: Record<string, number>
      emitCrumb?: boolean
    },
  ): Promise<boolean> {
    if (sheet) return true
    const rawUpsert = mutation.upsert ?? []
    const remove = [...new Set((mutation.remove ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))]
    if (!rawUpsert.length && !remove.length) return true

    const baseUpdatedAtById: Record<string, number> = { ...(mutation.baseUpdatedAtById ?? {}) }
    const existing = loadViews(path)
    const stamped = rawUpsert.map((view) => {
      if (baseUpdatedAtById[view.id] === undefined) {
        const prev = existing.find((item) => item.id === view.id)
        if (prev?.updatedAt) baseUpdatedAtById[view.id] = prev.updatedAt
      }
      return stampSavedView(withViewDisplay(path, view))
    })

    const opId = beginPendingViewOp(path, { upsert: stamped, remove })
    syncPaintedState(path)
    if (mutation.emitCrumb) window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))

    const gen = ++viewsWriteGenRef.current
    return viewWriteQueue.enqueue(path, async (queueGen) => {
      const outcome = await pushSavedViewsMutation(path, { upsert: stamped, remove, baseUpdatedAtById })
      if (outcome.status === 'failed') {
        rollbackPendingViewOp(path, opId)
        syncPaintedState(path)
        if (viewWriteQueue.isLatest(path, queueGen) && gen === viewsWriteGenRef.current) {
          setViewsSaveError(true)
        }
        return false
      }
      if (remove.length) removeStarredViews(path, remove)
      commitPendingViewOp(path, opId, outcome.views)
      syncPaintedState(path)
      if (mutation.emitCrumb) window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))
      if (viewWriteQueue.isLatest(path, queueGen)) setViewsSaveError(false)
      return true
    })
  }

  function persistViewOrder(ids: string[]) {
    const current = viewsRef.current
    const byId = new Map(current.map((view) => [view.id, view]))
    const ranked: SavedView[] = []
    ids.forEach((id, rank) => {
      const view = byId.get(id)
      if (!view) return
      ranked.push({ ...view, rank })
      byId.delete(id)
    })
    for (const view of current) {
      if (byId.has(view.id)) ranked.push(view)
    }
    const next = rankListedViews(ranked, ranked)
    if (externalViews) {
      viewsRef.current = next
      setViews(next)
      externalViews.onChange?.(next, activeViewIdRef.current ?? activeViewId ?? next[0]?.id ?? '')
      return
    }
    const prevById = new Map(current.map((view) => [view.id, view]))
    const changed = next.filter((view) => prevById.get(view.id)?.rank !== view.rank)
    if (!changed.length) return
    const baseUpdatedAtById: Record<string, number> = {}
    for (const view of changed) {
      const prevAt = prevById.get(view.id)?.updatedAt
      if (prevAt) baseUpdatedAtById[view.id] = prevAt
    }
    void commitViewMutation(collectionPath, { upsert: changed, baseUpdatedAtById })
  }

  function newSavedViewId() {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  async function commitView(view: SavedView) {
    if (externalViews) {
      const current = viewsRef.current
      const next = { ...view, rank: Number.isFinite(Number(view.rank)) ? view.rank : current.length }
      const list = [...current.filter((item) => item.id !== next.id), next]
      viewsRef.current = list
      setViews(list)
      selectView(next)
      externalViews.onChange?.(list, next.id)
      return
    }
    const painted = paintListedViews(collectionPath)
    const next = { ...view, rank: Number.isFinite(Number(view.rank)) ? view.rank : painted.length }
    const ok = await commitViewMutation(collectionPath, { upsert: [next], emitCrumb: true })
    if (!ok) return
    selectView(viewsRef.current.find((item) => item.id === next.id) ?? next)
  }

  function uniqueViewName(base: string, listed: SavedView[] = paintListedViews(collectionPath)) {
    const names = new Set(listed.map((item) => item.name))
    if (base === '新视图' || !names.has(base)) return base
    let n = 2
    while (names.has(`${base} ${n}`)) n += 1
    return `${base} ${n}`
  }

  function makeEmptyView(listed: SavedView[], columns: string[], extraFilters: Record<string, string> = {}): SavedView {
    return {
      id: newSavedViewId(),
      name: uniqueViewName('新视图', listed),
      mode: 'table',
      sortField: 'title',
      sortDir: 'asc',
      filters: { ...catalogLocks, ...extraFilters },
      columns,
      groupBy: '',
      tree: false,
      freezeTitle: false,
      wrap: false,
      truncate: true,
      query: '',
      rank: listed.length,
    }
  }

  function addEmptyView(path?: string, scope?: DataScope) {
    if (externalViews) {
      const current = viewsRef.current
      const view = makeEmptyView(current, [...schemaDefaultKeys])
      const next = [...current, view]
      viewsRef.current = next
      setViews(next)
      selectView(view)
      externalViews.onChange?.(next, view.id)
      return
    }
    const target = path || collectionPath
    const isDataAgg = normalizeCollectionPath(target) === DATA_COLLECTION_PATH
    const stored = loadViews(target)
    const allListed = listedViews(target, stored)
    const listed = target === collectionPath ? paintListedViews(target) : allListed
    const bindingPatch: Partial<SavedView> = isDataAgg
      ? { scope: 'personal', protection: 'personal' }
      : { scope: 'workspace', protection: 'public' }
    const extraFilters: Record<string, string> =
      !isDataAgg && scope ? { $scope: scope } : {}
    const view: SavedView = {
      ...makeEmptyView(
        listed,
        target === collectionPath ? [...schemaDefaultKeys] : [],
        extraFilters,
      ),
      ...bindingPatch,
    }
    void commitViewMutation(target, { upsert: [view], emitCrumb: true }).then((ok) => {
      if (!ok) return
      if (target === collectionPath) {
        selectView(viewsRef.current.find((item) => item.id === view.id) ?? view)
        return
      }
      try {
        writeStorageString(activeViewStorageKey(target), view.id)
      } catch {
        /* ignore */
      }
      onOpenTable?.(target, view.id)
    })
  }

  function copyView(source?: SavedView, overrides?: Partial<SavedView>) {
    const isDataAgg = normalizeCollectionPath(collectionPath) === DATA_COLLECTION_PATH
    const scopeBinding: Partial<SavedView> = isDataAgg
      ? { scope: 'personal', protection: 'personal' }
      : { scope: 'workspace', protection: 'public' }
    void commitView(
      source
        ? {
            ...source,
            ...scopeBinding,
            ...overrides,
            id: newSavedViewId(),
            name: uniqueViewName(`${source.name} 副本`),
            builtin: false,
            createdBy: undefined,
            viewRole: undefined,
          }
        : {
            id: newSavedViewId(),
            name: uniqueViewName(`${activeView?.name ?? title} 副本`),
            ...scopeBinding,
            mode,
            sortField,
            sortDir,
            sorts,
            filters: { ...catalogLocks },
            filterTree,
            columns: columnKeys,
            groupBy,
            groupConfig,
            tree: showTree,
            wrap: wrapCells,
            truncate: truncateCells,
            freezeTitle,
            query,
            columnWidths,
            ...overrides,
          },
    )
  }

  function patchActiveView(patch: Partial<SavedView>) {
    const targetId = activeViewIdRef.current ?? activeViewId
    if (!targetId) return
    const latest = viewsRef.current
    const current = latest.find((view) => view.id === targetId)
    if (!current) return
    // 只读视图（viewer / commenter）：筛选、排序、分组、列与排版仅在当前会话内存中临时生效，
    // 不写 ViewStore 也不发 POST /api/db/saved-views，避免 400 弹回和本地缓存污染。
    if (!externalViews && !canEditSavedView(current)) {
      const localNext = latest.map((view) => (view.id === targetId ? { ...view, ...patch } : view))
      viewsRef.current = localNext
      setViews(localNext)
      return
    }
    const baseUpdatedAt = Number(current.updatedAt) || 0
    const syncedPatch: Partial<SavedView> =
      ('sortField' in patch || 'sortDir' in patch) && !('sorts' in patch)
        ? {
            ...patch,
            sorts: [
              {
                id: current.sorts?.[0]?.id || `s:${patch.sortField ?? current.sortField ?? 'title'}`,
                field: patch.sortField ?? current.sortField ?? 'title',
                dir: patch.sortDir ?? current.sortDir ?? 'asc',
              },
              ...(current.sorts?.slice(1) ?? []),
            ],
          }
        : patch
    const updated = { ...current, ...syncedPatch }
    if (externalViews) {
      const stamped = stampSavedView(updated)
      const nextList = latest.map((view) => (view.id === targetId ? stamped : view))
      viewsRef.current = nextList
      setViews(nextList)
      externalViews.onChange?.(nextList, targetId)
      return
    }
    void commitViewMutation(collectionPath, {
      upsert: [updated],
      ...(baseUpdatedAt ? { baseUpdatedAtById: { [targetId]: baseUpdatedAt } } : {}),
    })
  }

  function commitViewName(viewId: string, raw: string) {
    const nextName = raw.trim()
    if (!nextName) return
    const current = viewsRef.current
    const target = current.find((item) => item.id === viewId)
    if (!target || target.name === nextName) return
    if (!externalViews && !canEditSavedView(target)) return
    if (current.some((item) => item.id !== viewId && item.name === nextName)) return
    const prevName = target.name
    const baseUpdatedAt = Number(target.updatedAt) || 0
    const updated = { ...target, name: nextName }
    if (externalViews) {
      const stamped = stampSavedView(updated)
      const listed = current.map((item) => (item.id === viewId ? stamped : item))
      viewsRef.current = listed
      setViews(listed)
      externalViews.onChange?.(listed, activeViewIdRef.current ?? activeViewId ?? viewId)
      return
    }
    const stars = getStarredViews()
    const wasStarred = isViewStarred(stars, collectionPath, viewId)
    if (wasStarred) {
      persistStarredViews(
        stars.map((item) => (item.path === collectionPath && item.viewId === viewId ? { ...item, name: nextName } : item)),
      )
    }
    if (isReadOnlyViewId(viewId) && !isBuiltinAllViewId(viewId)) {
      const stamped = stampSavedView(updated)
      const listed = current.map((item) => (item.id === viewId ? stamped : item))
      viewsRef.current = listed
      setViews(listed)
      window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))
      return
    }
    void commitViewMutation(collectionPath, {
      upsert: [updated],
      ...(baseUpdatedAt ? { baseUpdatedAtById: { [viewId]: baseUpdatedAt } } : {}),
      emitCrumb: true,
    }).then((ok) => {
      if (!ok && wasStarred) {
        const liveStars = getStarredViews()
        persistStarredViews(
          liveStars.map((item) => (item.path === collectionPath && item.viewId === viewId ? { ...item, name: prevName } : item)),
        )
      }
    })
  }

  function renameView(view: SavedView) {
    setViewMenuOpen(false)
    if (view.id !== activeViewId) selectView(view)
    window.requestAnimationFrame(() => {
      const el = pageRef.current?.querySelector<HTMLTextAreaElement>('.fsdb-main > .fsdb-detail-title-row .fsdb-detail-title-input')
      el?.focus()
      el?.select()
    })
  }

  function deleteView(view: SavedView, path = collectionPath) {
    setViewMenuOpen(false)
    if (externalViews) {
      const current = viewsRef.current
      if (current.length <= 1) return
      const remaining = current.filter((item) => item.id !== view.id)
      viewsRef.current = remaining
      setViews(remaining)
      const nextActive =
        activeViewIdRef.current === view.id ? remaining[0] : remaining.find((item) => item.id === activeViewIdRef.current) ?? remaining[0]
      if (nextActive && activeViewIdRef.current === view.id) selectView(nextActive)
      externalViews.onChange?.(remaining, nextActive?.id ?? '')
      return
    }
    if (isReadOnlyViewId(view.id)) return
    if (!canDeleteSavedView(view)) return
    const stored = loadViews(path)
    const currentVisible = path === collectionPath ? viewsRef.current : stored
    if (!canRemoveCollectionView(currentVisible)) return
    const removedId = view.id
    if (normalizeCollectionPath(path) === WORKSPACE_MEMBERS_COLLECTION_PATH && view.protection === 'locked') {
      void releaseReferencedMemberView(path, view, 'delete').then((handled) => {
        if (handled === 'done') {
          if (path === collectionPath && activeViewIdRef.current === removedId) {
            const nextActive = viewsRef.current[0]
            if (nextActive) selectView(nextActive)
          }
          return
        }
        if (handled === 'cancelled') return
        omitSavedViewIds(path, [removedId])
        void commitViewMutation(path, { remove: [removedId], emitCrumb: true }).then((ok) => {
          if (ok) {
            if (path === collectionPath && activeViewIdRef.current === removedId) {
              const nextActive = viewsRef.current[0]
              if (nextActive) selectView(nextActive)
            }
            return
          }
          reviveSavedViewIds(path, [removedId])
          syncPaintedState(path)
        })
      })
      return
    }
    // 仅虚拟内置种子视图写入 omittedViews；普通数据库视图通过 pendingOps 隐藏并在 200 后由服务端权威列表移除。
    omitSavedViewIds(path, [removedId])
    void commitViewMutation(path, { remove: [removedId], emitCrumb: true }).then((ok) => {
      if (ok) {
        if (path === collectionPath && activeViewIdRef.current === removedId) {
          const nextActive = viewsRef.current[0]
          if (nextActive) selectView(nextActive)
        }
        return
      }
      reviveSavedViewIds(path, [removedId])
      syncPaintedState(path)
    })
  }

  async function releaseReferencedMemberView(
    path: string,
    view: SavedView,
    action: 'unlock' | 'delete',
    targetProtection?: 'public' | 'personal',
  ): Promise<'none' | 'done' | 'cancelled'> {
    try {
      const res = await apiFetch('/api/db/member-views')
      if (!res.ok) return 'none'
      const data = (await res.json()) as { views?: Array<{ id: string; grantCount?: number }> }
      const hit = (data.views ?? []).find((item) => item.id === view.id)
      const grantCount = Number(hit?.grantCount ?? 0)
      if (grantCount <= 0) return 'none'
      const verb = action === 'delete' ? '删除' : '解锁'
      const freeze = window.confirm(
        `锁定成员视图「${view.name}」正被 ${grantCount} 条记录动态引用。\n\n点击「确定」：将当前匹配成员固化为静态授权后${verb}；\n点击「取消」：选择撤销关联授权或放弃操作。`,
      )
      let mode: 'freeze' | 'revoke' | null = freeze ? 'freeze' : null
      if (!mode) {
        const revoke = window.confirm(
          `是否改为「取消所有关联授权」并${verb}「${view.name}」？\n\n点击「确定」将撤销这 ${grantCount} 条记录对该视图的动态授权；点击「取消」放弃本次操作。`,
        )
        if (!revoke) return 'cancelled'
        mode = 'revoke'
      }
      const releaseRes = await apiFetch(`/api/db/member-views/${encodeURIComponent(view.id)}/release`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          action,
          mode,
          ...(targetProtection ? { targetProtection } : {}),
        }),
      })
      if (!releaseRes.ok) return 'cancelled'
      await pullSavedViews([path], { force: true })
      syncPaintedState(path)
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))
      return 'done'
    } catch {
      return 'none'
    }
  }

  function updateViewProtection(view: SavedView, protection: 'public' | 'locked' | 'personal') {
    if (isReadOnlyViewId(view.id)) return
    const nextScope = protection === 'personal' ? 'personal' : 'workspace'
    const current = viewsRef.current
    const target = current.find((item) => item.id === view.id)
    if (!target) return
    if (
      !externalViews &&
      normalizeCollectionPath(collectionPath) === WORKSPACE_MEMBERS_COLLECTION_PATH &&
      target.protection === 'locked' &&
      protection !== 'locked'
    ) {
      void releaseReferencedMemberView(collectionPath, target, 'unlock', protection).then((handled) => {
        if (handled !== 'none') return
        const baseUpdatedAt = Number(target.updatedAt) || 0
        const updated: SavedView = { ...target, protection, scope: nextScope }
        void commitViewMutation(collectionPath, {
          upsert: [updated],
          ...(baseUpdatedAt ? { baseUpdatedAtById: { [target.id]: baseUpdatedAt } } : {}),
        })
      })
      return
    }
    const baseUpdatedAt = Number(target.updatedAt) || 0
    const updated: SavedView = { ...target, protection, scope: nextScope }
    if (externalViews) {
      const stamped = stampSavedView(updated)
      const next = current.map((item) => (item.id === view.id ? stamped : item))
      viewsRef.current = next
      setViews(next)
      externalViews.onChange?.(next, activeViewIdRef.current ?? view.id)
      return
    }
    void commitViewMutation(collectionPath, {
      upsert: [updated],
      ...(baseUpdatedAt ? { baseUpdatedAtById: { [target.id]: baseUpdatedAt } } : {}),
    })
  }

  return {
    persistViewOrder,
    commitView,
    addEmptyView,
    copyView,
    patchActiveView,
    updateViewProtection,
    commitViewName,
    renameView,
    deleteView,
  }
}
