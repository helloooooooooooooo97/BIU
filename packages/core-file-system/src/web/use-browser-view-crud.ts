import { writeStorageString } from '@biu/biu-ui/client-storage'
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import { emitFsdbChange } from '@biu/type-file-system'
import { isBuiltinAllViewId, isReadOnlyViewId, viewsForScope, type DataScope } from '../catalog-views.ts'
import type { FilterGroup, SortRule } from '../query-logic.ts'
import type { ViewMode } from './fields.ts'
import { FSDB_CRUMB_LABELS_EVENT } from './fsdb-events.ts'
import { canDeleteSavedView, canEditSavedView, canRemoveCollectionView, normalizeViewScope, type GroupConfig, type SavedView } from './saved-view.ts'
import {
  activeViewStorageKey,
  diffSavedViews,
  getStarredViews,
  isViewStarred,
  loadViews,
  mergeSavedViewLists,
  mergeSavedViewsPatch,
  noteLocalSavedViewsWrite,
  omitSavedViewIds,
  persistStarredViews,
  pushSavedViewsPatch,
  rememberViews,
  removeStarredViews,
  reviveSavedViewIds,
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
    views,
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

  function adoptPersistedViews(path: string, listed: SavedView[], removed?: string[]) {
    const merged = rankListedViews(
      listedViews(path, mergeSavedViewLists(loadViews(path), listed, removed)).map((view) => withViewDisplay(path, view)),
      listed,
    )
    rememberViews(path, merged)
    noteLocalSavedViewsWrite(path)
    if (path === collectionPath) {
      viewsRef.current = merged
      setViews(merged)
    }
    emitFsdbChange({ scope: 'views' })
    window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))
  }

  async function persistViewsFor(
    path: string,
    next: SavedView[],
    extra?: { baseline?: SavedView[]; upsert?: SavedView[]; remove?: string[] },
  ) {
    if (sheet) return true
    const forced = extra?.upsert ?? []
    const incoming = [...next.filter((view) => !forced.some((item) => item.id === view.id)), ...forced]
    const listed = rankListedViews(
      listedViews(path, incoming).map((view) => {
        const painted = withViewDisplay(path, view)
        return Number.isFinite(Number(view.rank)) ? { ...painted, rank: Math.round(Number(view.rank)) } : painted
      }),
      incoming,
    )
    const previous = extra?.baseline ?? loadViews(path)
    const pureRemoval = Boolean(extra?.remove?.length && !forced.length)
    const patch = pureRemoval
      ? { upsert: [], remove: extra?.remove }
      : mergeSavedViewsPatch(
          { upsert: diffSavedViews(previous, listed).upsert, remove: [] },
          { upsert: forced.map((view) => stampSavedView(view)), remove: extra?.remove },
        )
    const stamped = (patch.upsert ?? []).map((view) => stampSavedView(view))
    const stampById = new Map(stamped.map((view) => [view.id, view]))
    const adopted = listed.map((view) => stampById.get(view.id) ?? view)
    const intended = Boolean(forced.length || extra?.remove?.length)
    const gen = ++viewsWriteGenRef.current
    return viewWriteQueue.enqueue(path, async (queueGen) => {
      const result = await pushSavedViewsPatch(path, { ...patch, upsert: stamped })
      if (result === 'failed' || (result === 'skipped' && intended)) {
        if (viewWriteQueue.isLatest(path, queueGen) && gen === viewsWriteGenRef.current) setViewsSaveError(true)
        return false
      }
      if (result === 'skipped') return true
      if (extra?.remove?.length) removeStarredViews(path, extra.remove)
      adoptPersistedViews(path, adopted, extra?.remove)
      setViewsSaveError(false)
      return true
    })
  }

  function persistViews(next: SavedView[]) {
    return persistViewsFor(collectionPath, next)
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
    // persistViewsFor 用 loadViews 当 baseline 算差异。先 rememberViews 的话
    // baseline 已经是新顺序，patch 会 skipped，库里的 rank 永远不更新。
    const baseline = loadViews(collectionPath)
    viewsRef.current = next
    setViews(next)
    rememberViews(collectionPath, next)
    noteLocalSavedViewsWrite(collectionPath)
    void persistViewsFor(collectionPath, next, { baseline }).then((ok) => {
      if (ok || viewsRef.current !== next) return
      viewsRef.current = current
      setViews(current)
      rememberViews(collectionPath, current)
    })
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
    const ok = await persistViewsFor(
      collectionPath,
      [...painted.filter((item) => item.id !== next.id), next],
      { upsert: [next] },
    )
    if (!ok) return
    selectView(next)
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
    const explicitTopLevel = path !== undefined && scope === undefined
    const effectiveScope: DataScope | undefined =
      scope ?? (explicitTopLevel ? undefined : (target === collectionPath ? routeScope ?? undefined : undefined))
    const stored = loadViews(target)
    const allListed = listedViews(target, stored)
    const listed = target === collectionPath
      ? paintListedViews(target)
      : effectiveScope
        ? viewsForScope(allListed, effectiveScope)
        : allListed
    const bindingPatch: Partial<SavedView> =
      effectiveScope === 'workspace'
        ? { scope: 'workspace', protection: 'public', ownerTable: 'workspace' }
        : effectiveScope === 'personal'
          ? { scope: 'workspace', protection: 'public' }
          : effectiveScope === 'shared'
            ? { scope: 'personal', protection: 'personal' }
            : { scope: 'personal', protection: 'personal', ownerTable: 'all' }
    const view: SavedView = {
      ...makeEmptyView(
        listed,
        target === collectionPath ? [...schemaDefaultKeys] : [],
        effectiveScope ? { $scope: effectiveScope } : {},
      ),
      ...bindingPatch,
    }
    const nextStored = mergeSavedViewLists(stored, [view])
    rememberViews(target, nextStored)
    if (target === collectionPath) {
      const painted = paintListedViews(target)
      viewsRef.current = painted
      setViews(painted)
    }
    emitFsdbChange({ scope: 'views' })
    void persistViewsFor(target, [...listed.filter((item) => item.id !== view.id), view], {
      upsert: [view],
      baseline: stored,
    }).then((ok) => {
      if (!ok) {
        rememberViews(target, stored)
        if (target === collectionPath) {
          const painted = paintListedViews(target)
          viewsRef.current = painted
          setViews(painted)
        }
        emitFsdbChange({ scope: 'views' })
        return
      }
      if (target === collectionPath) {
        selectView(view)
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
    void commitView(
      source
        ? { ...source, ...overrides, id: newSavedViewId(), name: uniqueViewName(`${source.name} 副本`), builtin: false }
        : {
            id: newSavedViewId(),
            name: uniqueViewName(`${activeView?.name ?? title} 副本`),
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
    // 不写 localStorage 也不发 POST /api/db/saved-views，避免 400 弹回和本地缓存污染。
    if (!externalViews && !canEditSavedView(current)) {
      const localNext = latest.map((view) => (view.id === targetId ? { ...view, ...patch } : view))
      viewsRef.current = localNext
      setViews(localNext)
      return
    }
    const updated = stampSavedView({ ...current, ...patch })
    const nextList = latest.map((view) => (view.id === targetId ? updated : view))
    // 立即同步更新 viewsRef 与内存缓存，保证连点改多个属性时后一次修改基于前一次最新状态。
    viewsRef.current = nextList
    setViews(nextList)
    if (externalViews) {
      externalViews.onChange?.(nextList, targetId)
      return
    }
    rememberViews(collectionPath, nextList)
    void persistViewsFor(collectionPath, nextList, { upsert: [updated], baseline: latest }).then((ok) => {
      if (ok || viewsRef.current !== nextList) return
      viewsRef.current = latest
      setViews(latest)
      rememberViews(collectionPath, latest)
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
    const updated = stampSavedView({ ...target, name: nextName })
    const listed = current.map((item) => (item.id === viewId ? updated : item))
    viewsRef.current = listed
    setViews(listed)
    if (externalViews) {
      externalViews.onChange?.(listed, activeViewIdRef.current ?? activeViewId ?? viewId)
      return
    }
    rememberViews(collectionPath, listed)
    const stars = getStarredViews()
    if (isViewStarred(stars, collectionPath, viewId)) {
      persistStarredViews(stars.map((item) => (item.path === collectionPath && item.viewId === viewId ? { ...item, name: nextName } : item)))
    }
    emitFsdbChange({ scope: 'views' })
    window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))
    if (isReadOnlyViewId(viewId) && !isBuiltinAllViewId(viewId)) return
    void persistViewsFor(collectionPath, listed, { upsert: [updated], baseline: current }).then((ok) => {
      if (ok) return
      const live = viewsRef.current
      const liveTarget = live.find((item) => item.id === viewId)
      if (liveTarget && liveTarget.name === nextName && live !== listed) return
      viewsRef.current = current
      setViews(current)
      rememberViews(collectionPath, current)
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
    const current = path === collectionPath ? viewsRef.current : loadViews(path)
    if (!canRemoveCollectionView(current)) return
    const removedId = view.id
    const remaining = current.filter((item) => item.id !== removedId)
    // 立即标记已删并移出本地缓存，彻底防止删除期间收到 WebSocket 刷新时从旧缓存复活；若服务端拒绝则回滚。
    omitSavedViewIds(path, [removedId])
    rememberViews(path, remaining)
    noteLocalSavedViewsWrite(path)
    if (path === collectionPath) {
      viewsRef.current = remaining
      setViews(remaining)
      if (activeViewIdRef.current === removedId && remaining[0]) {
        selectView(remaining[0])
      }
    }
    void persistViewsFor(path, remaining, { baseline: current, remove: [removedId] }).then((ok) => {
      if (ok) return
      reviveSavedViewIds(path, [removedId])
      rememberViews(path, current)
      if (path === collectionPath) {
        viewsRef.current = current
        setViews(current)
      }
    })
  }

  function updateViewProtection(view: SavedView, protection: 'public' | 'locked' | 'personal') {
    if (isReadOnlyViewId(view.id) || view.ownerTable === 'all') return
    const nextScope = protection === 'personal' ? 'personal' : 'workspace'
    const current = viewsRef.current
    const target = current.find((item) => item.id === view.id)
    if (!target) return
    const updated: SavedView = { ...target, protection, scope: nextScope }
    const next = current.map((item) => (item.id === view.id ? updated : item))
    viewsRef.current = next
    setViews(next)
    if (externalViews) {
      externalViews.onChange?.(next, activeViewIdRef.current ?? view.id)
      return
    }
    const baseline = loadViews(collectionPath)
    rememberViews(collectionPath, next)
    noteLocalSavedViewsWrite(collectionPath)
    void persistViewsFor(collectionPath, next, { baseline, upsert: [updated] }).then((ok) => {
      if (ok || viewsRef.current !== next) return
      viewsRef.current = current
      setViews(current)
      rememberViews(collectionPath, current)
    })
  }

  return {
    adoptPersistedViews,
    persistViewsFor,
    persistViews,
    persistViewOrder,
    persistViewsWith: persistViewsFor,
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
