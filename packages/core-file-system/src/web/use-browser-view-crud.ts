import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react'
import { emitFsdbChange } from '@biu/type-file-system'
import { isReadOnlyViewId, viewsForScope, type DataScope } from '../catalog-views.ts'
import type { FilterGroup, SortRule } from '../query-logic.ts'
import type { ViewMode } from './fields.ts'
import { FSDB_CRUMB_LABELS_EVENT } from './fsdb-events.ts'
import { canRemoveCollectionView, type GroupConfig, type SavedView } from './saved-view.ts'
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
  persistViewDisplay,
  pullSavedViews,
  pushSavedViewsPatch,
  rememberViews,
  removeStarredViews,
  reviveSavedViewIds,
  stampSavedView,
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
    if (extra?.remove?.length) omitSavedViewIds(path, extra.remove)
    if (forced.length) reviveSavedViewIds(path, forced.map((view) => view.id))
    const incoming = [
      ...next.filter((view) => !forced.some((item) => item.id === view.id)),
      ...forced,
    ]
    for (const view of incoming) persistViewDisplay(path, view.id, view)
    const listed = rankListedViews(
      listedViews(path, incoming).map((view) => {
        const painted = withViewDisplay(path, view)
        return Number.isFinite(Number(view.rank)) ? { ...painted, rank: Math.round(Number(view.rank)) } : painted
      }),
      incoming,
    )
    const stored = listed
    const previous = extra?.baseline ?? loadViews(path)
    // 只推这次改过的条目。快照里少了的视图不能当成删除——侧栏新加的视图经常不在中间栏那份 viewsRef 里。
    const patch = mergeSavedViewsPatch(
      { upsert: diffSavedViews(previous, stored).upsert, remove: [] },
      {
        upsert: forced.map((view) => stampSavedView(view)),
        remove: extra?.remove,
      },
    )
    const stamped = (patch.upsert ?? []).map((view) => stampSavedView(view))
    const stampById = new Map(stamped.map((view) => [view.id, view]))
    const adopted = listed.map((view) => stampById.get(view.id) ?? view)
    const gen = ++viewsWriteGenRef.current
    const result = await pushSavedViewsPatch(path, { ...patch, upsert: stamped })
    const intended = Boolean(forced.length || extra?.remove?.length)
    if (result === 'failed' || (result === 'skipped' && intended)) {
      if (gen === viewsWriteGenRef.current) setViewsSaveError(true)
      return false
    }
    if (gen !== viewsWriteGenRef.current) return false
    if (result === 'skipped') return true
    if (extra?.remove?.length) removeStarredViews(path, extra.remove)
    noteLocalSavedViewsWrite(path)
    const pulled = await pullSavedViews([path], { force: true })
    if (gen !== viewsWriteGenRef.current) return false
    if (pulled === false) adoptPersistedViews(path, adopted, extra?.remove)
    else {
      const listedNow = rankListedViews(
        listedViews(
          path,
          mergeSavedViewLists(loadViews(path), adopted, extra?.remove),
        ).map((view) => {
          const painted = withViewDisplay(path, view)
          const forcedView = stampById.get(view.id)
          return forcedView ? { ...painted, name: forcedView.name, updatedAt: forcedView.updatedAt } : painted
        }),
        adopted,
      )
      rememberViews(path, listedNow)
      if (path === collectionPath) {
        viewsRef.current = listedNow
        setViews(listedNow)
      }
      emitFsdbChange({ scope: 'views' })
      window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))
    }
    setViewsSaveError(false)
    return true
  }

  function persistViews(next: SavedView[]) {
    return persistViewsFor(collectionPath, next)
  }

  function persistViewOrder(ids: string[]) {
    const current = viewsRef.current
    // persistViewsFor 用 loadViews 当 baseline 算差异。先 rememberViews 的话
    // baseline 已经是新顺序，patch 会 skipped，库里的 rank 永远不更新。
    const baseline = loadViews(collectionPath)
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
    for (const view of next) persistViewDisplay(collectionPath, view.id, { rank: view.rank })
    viewsRef.current = next
    setViews(next)
    rememberViews(collectionPath, next)
    noteLocalSavedViewsWrite(collectionPath)
    void persistViewsFor(collectionPath, next, { baseline }).then((ok) => {
      if (ok || viewsRef.current !== next) return
      for (const view of current) persistViewDisplay(collectionPath, view.id, { rank: view.rank })
      viewsRef.current = current
      setViews(current)
      rememberViews(collectionPath, current)
    })
  }

  function persistViewsWith(
    path: string,
    next: SavedView[],
    extra?: { baseline?: SavedView[]; upsert?: SavedView[]; remove?: string[] },
  ) {
    return persistViewsFor(path, next, extra)
  }

  function newSavedViewId() {
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  }

  async function commitView(view: SavedView) {
    const painted = paintListedViews(collectionPath)
    const next = { ...view, rank: Number.isFinite(Number(view.rank)) ? view.rank : painted.length }
    const ok = await persistViewsWith(
      collectionPath,
      [...painted.filter((item) => item.id !== next.id), next],
      { upsert: [next] },
    )
    if (!ok) return
    selectView(next)
  }

  function uniqueViewName(base: string, listed: SavedView[] = paintListedViews(collectionPath)) {
    const names = new Set(listed.map((item) => item.name))
    if (base === '新视图') return base
    if (!names.has(base)) return base
    let n = 2
    while (names.has(`${base} ${n}`)) n += 1
    return `${base} ${n}`
  }

  function addEmptyView(path = collectionPath, scope?: DataScope) {
    const target = path || collectionPath
    const effectiveScope = scope ?? (target === collectionPath ? routeScope ?? undefined : undefined)
    const stored = loadViews(target)
    const allListed = listedViews(target, stored)
    const listed = target === collectionPath
      ? paintListedViews(target)
      : effectiveScope
        ? viewsForScope(allListed, effectiveScope)
        : allListed
    const view: SavedView = {
      id: newSavedViewId(),
      name: uniqueViewName('新视图', listed),
      mode: 'table',
      sortField: 'title',
      sortDir: 'asc',
      filters: { ...catalogLocks, ...(effectiveScope ? { $scope: effectiveScope } : {}) },
      columns: target === collectionPath ? [...schemaDefaultKeys] : [],
      groupBy: '',
      tree: false,
      freezeTitle: false,
      wrap: false,
      truncate: true,
      query: '',
      rank: listed.length,
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
        localStorage.setItem(activeViewStorageKey(target), view.id)
      } catch {
        /* ignore */
      }
      onOpenTable?.(target, view.id)
    })
  }

  function copyView(source?: SavedView) {
    void commitView(
      source
        ? { ...source, id: newSavedViewId(), name: uniqueViewName(`${source.name} 副本`), builtin: false }
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
          },
    )
  }

  function patchActiveView(patch: Partial<SavedView>) {
    if (!activeViewId) return
    const current = views.find((view) => view.id === activeViewId)
    if (!current) return
    void persistViews(views.map((view) => (view.id === activeViewId ? { ...view, ...patch } : view)))
  }

  function commitViewName(viewId: string, raw: string) {
    const nextName = raw.trim()
    if (!nextName) return
    const current = viewsRef.current
    const target = current.find((item) => item.id === viewId)
    if (!target || target.name === nextName) return
    if (current.some((item) => item.id !== viewId && item.name === nextName)) return
    const updated = stampSavedView({ ...target, name: nextName })
    const listed = current.map((item) => (item.id === viewId ? updated : item))
    viewsRef.current = listed
    setViews(listed)
    rememberViews(collectionPath, listed)
    persistViewDisplay(collectionPath, viewId, { name: nextName })
    const stars = getStarredViews()
    if (isViewStarred(stars, collectionPath, viewId)) {
      persistStarredViews(stars.map((item) => (item.path === collectionPath && item.viewId === viewId ? { ...item, name: nextName } : item)))
    }
    emitFsdbChange({ scope: 'views' })
    window.dispatchEvent(new Event(FSDB_CRUMB_LABELS_EVENT))
    if (isReadOnlyViewId(viewId)) return
    void persistViewsWith(collectionPath, listed, { upsert: [updated], baseline: current }).then((ok) => {
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
    if (isReadOnlyViewId(view.id)) return
    const current = path === collectionPath ? viewsRef.current : loadViews(path)
    if (!canRemoveCollectionView(current)) return
    const removedId = view.id
    const remaining = current.filter((item) => item.id !== removedId)
    void persistViewsWith(path, remaining, { remove: [removedId] }).then((ok) => {
      if (!ok) return
      if (path === collectionPath && activeViewIdRef.current === removedId) {
        const next = viewsRef.current[0]
        if (next) selectView(next)
      }
    })
  }

  return {
    adoptPersistedViews,
    persistViewsFor,
    persistViews,
    persistViewOrder,
    persistViewsWith,
    commitView,
    addEmptyView,
    copyView,
    patchActiveView,
    commitViewName,
    renameView,
    deleteView,
  }
}
