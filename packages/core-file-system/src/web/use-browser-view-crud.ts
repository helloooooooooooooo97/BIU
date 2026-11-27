import { writeStorageString } from '@biu/biu-ui/client-storage'
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import type { DataScope } from '../catalog-views.ts'
import { DATA_COLLECTION_PATH, WORKSPACE_MEMBERS_COLLECTION_PATH, normalizeCollectionPath } from '../paths.ts'
import { fetchMemberViews, releaseMemberView } from './authz-api.ts'
import type { FilterGroup, SortRule } from '../query-logic.ts'
import type { ViewMode } from './fields.ts'
import { FSDB_CRUMB_LABELS_EVENT, FSDB_SHARES_CHANGE_EVENT, emitFsdbEvent } from './fsdb-events.ts'
import {
  canDeleteSavedView,
  canEditSavedView,
  canManageSavedView,
  canRemoveCollectionView,
  type GroupConfig,
  type SavedView,
  type SavedViewFieldPatch,
} from './saved-view.ts'
import {
  activeViewStorageKey,
  beginPendingViewOp,
  commitPendingViewOp,
  getStarredViews,
  isViewStarred,
  loadViews,
  persistStarredViews,
  pullSavedViews,
  pushSavedViewsMutation,
  removeStarredViews,
  rollbackPendingViewOp,
  viewWriteQueue,
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
  setViewsSaveError: Dispatch<SetStateAction<string>>
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
  confirmReleaseMemberView?: (info: {
    viewName: string
    action: 'unlock' | 'delete'
    grantCount: number
  }) => Promise<'freeze' | 'revoke' | null>
  externalViews?: {
    onChange?: (views: SavedView[], activeViewId: string) => void
  }
}

export function createBrowserViewCrud(opts: BrowserViewCrudOptions) {
  const {
    sheet,
    collectionPath,
    title,
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
    confirmReleaseMemberView,
    externalViews,
  } = opts

  function syncPaintedState(path: string) {
    if (path !== collectionPath) return
    const live = loadViews(path)
    const painted = rankListedViews(listedViews(path, live), live)
    viewsRef.current = painted
    setViews(painted)
  }

  /**
   * 单一权威字段级增量写通道：
   * 1. 先在 ViewStore 登记独立 opId 的乐观变更；
   * 2. 按 collectionPath 串行 POST /api/db/saved-views（只发变更字段，服务端单调递增 revision）；
   * 3. 200 返回权威列表时直接结算 opId 并更新 serverViews；
   * 4. 失败时撤销当前 opId 并弹出明确错误信息，绝不静默丢改。
   */
  async function commitViewMutation(
    path: string,
    mutation: {
      upsert?: SavedViewFieldPatch[]
      remove?: string[]
      emitCrumb?: boolean
    },
  ): Promise<boolean> {
    if (sheet) return true
    const upsert = (mutation.upsert ?? []).filter((item) => Boolean(String(item.id ?? '').trim()))
    const remove = [...new Set((mutation.remove ?? []).map((id) => String(id ?? '').trim()).filter(Boolean))]
    if (!upsert.length && !remove.length) return true

    const opId = beginPendingViewOp(path, { upsert, remove })
    syncPaintedState(path)
    if (mutation.emitCrumb) window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))

    const gen = ++viewsWriteGenRef.current
    return viewWriteQueue.enqueue(path, async (queueGen) => {
      const outcome = await pushSavedViewsMutation(path, { upsert, remove })
      if (outcome.status === 'failed') {
        rollbackPendingViewOp(path, opId)
        syncPaintedState(path)
        if (viewWriteQueue.isLatest(path, queueGen) && gen === viewsWriteGenRef.current) {
          setViewsSaveError(outcome.error || '视图保存失败，请重试')
        }
        return false
      }
      if (remove.length) removeStarredViews(path, remove)
      commitPendingViewOp(path, opId, outcome.views)
      syncPaintedState(path)
      if (mutation.emitCrumb) window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))
      if (viewWriteQueue.isLatest(path, queueGen)) setViewsSaveError('')
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
    const changed: SavedViewFieldPatch[] = next
      .filter((view) => !view.ephemeral && prevById.get(view.id)?.rank !== view.rank)
      .map((view) => ({ id: view.id, rank: view.rank }))
    if (!changed.length) return
    void commitViewMutation(collectionPath, { upsert: changed })
  }

  function newSavedViewId() {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  async function commitView(
    view: SavedView,
    extra?: { accessMode?: 'private' | 'members'; memberDefaultRole?: 'viewer' | 'editor' },
  ) {
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
    const painted = paintListedViews(collectionPath).filter((item) => !item.ephemeral)
    const next: SavedViewFieldPatch = {
      ...view,
      ephemeral: undefined,
      rank: Number.isFinite(Number(view.rank)) ? view.rank : painted.length,
      ...(extra?.accessMode ? { accessMode: extra.accessMode } : {}),
      ...(extra?.memberDefaultRole ? { memberDefaultRole: extra.memberDefaultRole } : {}),
    }
    const ok = await commitViewMutation(collectionPath, { upsert: [next], emitCrumb: true })
    if (!ok) return
    selectView(viewsRef.current.find((item) => item.id === next.id) ?? view)
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
      locked: false,
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
      rank: listed.filter((item) => !item.ephemeral).length,
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
    const extraFilters: Record<string, string> =
      !isDataAgg && scope ? { $scope: scope } : {}
    const accessMode: 'private' | 'members' = !isDataAgg && scope === 'workspace' ? 'members' : 'private'
    const view: SavedViewFieldPatch = {
      ...makeEmptyView(
        listed,
        target === collectionPath ? [...schemaDefaultKeys] : [],
        extraFilters,
      ),
      shareScope: accessMode === 'members' ? 'workspace' : 'personal',
      accessMode,
      ...(accessMode === 'members' ? { memberDefaultRole: 'editor' } : {}),
    }
    void commitViewMutation(target, { upsert: [view], emitCrumb: true }).then((ok) => {
      if (!ok) return
      if (target === collectionPath) {
        selectView(viewsRef.current.find((item) => item.id === view.id) ?? (view as SavedView))
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

  function copyView(
    source?: SavedView,
    overrides?: Partial<SavedView> & { accessMode?: 'private' | 'members' },
  ) {
    const isDataAgg = normalizeCollectionPath(collectionPath) === DATA_COLLECTION_PATH
    const { accessMode: explicitAccessMode, ...viewOverrides } = overrides ?? {}
    const accessMode: 'private' | 'members' =
      explicitAccessMode ?? (!isDataAgg && viewOverrides.shareScope === 'workspace' ? 'members' : 'private')
    const baseView: SavedView = source
      ? {
          ...source,
          ...viewOverrides,
          id: newSavedViewId(),
          name: uniqueViewName(`${source.name} 副本`),
          locked: false,
          ephemeral: undefined,
          createdBy: undefined,
          viewRole: undefined,
          shareScope: accessMode === 'members' ? 'workspace' : 'personal',
          hasExternal: undefined,
          revision: undefined,
        }
      : {
          id: newSavedViewId(),
          name: uniqueViewName(`${activeView?.name ?? title} 副本`),
          mode,
          locked: false,
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
          ...viewOverrides,
        }
    void commitView(baseView, { accessMode })
  }

  function patchActiveView(patch: Partial<SavedView>) {
    const targetId = activeViewIdRef.current ?? activeViewId
    if (!targetId) return
    const latest = viewsRef.current
    const current = latest.find((view) => view.id === targetId)
    if (!current) return
    // 已锁定 / 只读 / 临时兜底视角：筛选、排序、分组、列与排版仅在当前会话内存中临时生效，
    // 不写 ViewStore 也不发 POST /api/db/saved-views。
    if (!externalViews && !canEditSavedView(current)) {
      const localNext = latest.map((view) => (view.id === targetId ? { ...view, ...patch } : view))
      viewsRef.current = localNext
      setViews(localNext)
      return
    }
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
    if (externalViews) {
      const updated = { ...current, ...syncedPatch, updatedAt: Date.now() }
      const nextList = latest.map((view) => (view.id === targetId ? updated : view))
      viewsRef.current = nextList
      setViews(nextList)
      externalViews.onChange?.(nextList, targetId)
      return
    }
    // 严格字段级增量 Patch：只发送本次实际改动的字段 + baseRevision
    const fieldPatch: SavedViewFieldPatch = {
      id: targetId,
      ...syncedPatch,
      ...(current.revision ? { baseRevision: current.revision } : {}),
    }
    void commitViewMutation(collectionPath, { upsert: [fieldPatch] })
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
    if (externalViews) {
      const listed = current.map((item) => (item.id === viewId ? { ...item, name: nextName, updatedAt: Date.now() } : item))
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
    void commitViewMutation(collectionPath, {
      upsert: [{ id: viewId, name: nextName, ...(target.revision ? { baseRevision: target.revision } : {}) }],
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

  async function releaseReferencedMemberView(
    path: string,
    view: SavedView,
    action: 'unlock' | 'delete',
  ): Promise<'none' | 'done' | 'cancelled'> {
    try {
      const data = await fetchMemberViews()
      const hit = (data.views ?? []).find((item) => item.id === view.id)
      const grantCount = Number(hit?.grantCount ?? 0)
      if (grantCount <= 0) return 'none'
      if (!confirmReleaseMemberView) return 'cancelled'
      const mode = await confirmReleaseMemberView({
        viewName: view.name,
        action,
        grantCount,
      })
      if (!mode) return 'cancelled'
      if (!(await releaseMemberView(view.id, action, mode))) return 'cancelled'
      await pullSavedViews([path], { force: true })
      syncPaintedState(path)
      emitFsdbEvent(FSDB_SHARES_CHANGE_EVENT)
      window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))
      return 'done'
    } catch {
      return 'none'
    }
  }

  function deleteView(view: SavedView, path = collectionPath) {
    setViewMenuOpen(false)
    if (view.ephemeral) return
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
    if (!canDeleteSavedView(view)) return
    const stored = loadViews(path)
    const currentVisible = path === collectionPath ? viewsRef.current : stored
    if (!canRemoveCollectionView(currentVisible, view)) {
      setViewsSaveError(view.shareScope === 'workspace' ? '至少保留一个空间视图' : '至少保留一个视图')
      return
    }
    const removedId = view.id
    const performRemove = () => {
      void commitViewMutation(path, { remove: [removedId], emitCrumb: true }).then((ok) => {
        if (!ok) return
        if (path === collectionPath && activeViewIdRef.current === removedId) {
          const nextActive = viewsRef.current[0]
          if (nextActive) selectView(nextActive)
        }
      })
    }
    if (normalizeCollectionPath(path) === WORKSPACE_MEMBERS_COLLECTION_PATH && view.locked) {
      void releaseReferencedMemberView(path, view, 'delete').then((handled) => {
        if (handled === 'done') {
          if (path === collectionPath && activeViewIdRef.current === removedId) {
            const nextActive = viewsRef.current[0]
            if (nextActive) selectView(nextActive)
          }
          return
        }
        if (handled === 'cancelled') return
        performRemove()
      })
      return
    }
    performRemove()
  }

  function toggleViewLock(view: SavedView) {
    if (view.ephemeral) return
    const current = viewsRef.current
    const target = current.find((item) => item.id === view.id) ?? view
    if (!externalViews && !canManageSavedView(target)) return
    const nextLocked = !target.locked
    if (externalViews) {
      const next = current.map((item) => (item.id === target.id ? { ...item, locked: nextLocked, updatedAt: Date.now() } : item))
      viewsRef.current = next
      setViews(next)
      externalViews.onChange?.(next, activeViewIdRef.current ?? target.id)
      return
    }
    const commitLock = () => {
      void commitViewMutation(collectionPath, {
        upsert: [{ id: target.id, locked: nextLocked, ...(target.revision ? { baseRevision: target.revision } : {}) }],
      })
    }
    if (
      normalizeCollectionPath(collectionPath) === WORKSPACE_MEMBERS_COLLECTION_PATH &&
      target.locked &&
      !nextLocked
    ) {
      void releaseReferencedMemberView(collectionPath, target, 'unlock').then((handled) => {
        if (handled !== 'none') return
        commitLock()
      })
      return
    }
    commitLock()
  }

  return {
    persistViewOrder,
    commitView,
    addEmptyView,
    copyView,
    patchActiveView,
    toggleViewLock,
    commitViewName,
    renameView,
    deleteView,
  }
}
