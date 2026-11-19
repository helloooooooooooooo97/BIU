import { useSyncExternalStore } from 'react'
import type { CollectionInfo, DbRecord } from '@biu/type-file-system'
import type { DataScope } from '../catalog-views.ts'
import type { SavedView } from './saved-view.ts'

export type DataSidebarLive = {
  tables: CollectionInfo[]
  collectionPath: string
  title: string
  views: SavedView[]
  activeViewId: string | null
  onOpenTable?: (path: string, viewId?: string) => void
  onApplyView: (view: SavedView) => void
  onDeleteView: (view: SavedView, path?: string) => void
  onAddView: (path?: string, scope?: DataScope) => void
  onOpenRecord?: (path: string, view: SavedView, recordId: string, row?: DbRecord) => void
  expandedViewKey?: string | null
  onExpandedViewKeyChange?: (key: string | null) => void
  onCollapse?: () => void
}

function sameSidebarData(a: DataSidebarLive | null, b: DataSidebarLive) {
  if (!a) return false
  return (
    a.tables === b.tables &&
    a.collectionPath === b.collectionPath &&
    a.title === b.title &&
    a.views === b.views &&
    a.activeViewId === b.activeViewId &&
    a.expandedViewKey === b.expandedViewKey &&
    Boolean(a.onOpenTable) === Boolean(b.onOpenTable) &&
    Boolean(a.onOpenRecord) === Boolean(b.onOpenRecord) &&
    Boolean(a.onExpandedViewKeyChange) === Boolean(b.onExpandedViewKeyChange) &&
    Boolean(a.onCollapse) === Boolean(b.onCollapse)
  )
}

/** 可重置的 live 通道；默认一份给 slots 用，测试里 `createDataSidebarHost()` 隔离。 */
export function createDataSidebarHost() {
  let live: DataSidebarLive | null = null
  let callbacks: DataSidebarLive | null = null
  let epoch = 0
  const listeners = new Set<() => void>()

  const stableHandlers = {
    onOpenTable: (path: string, viewId?: string) => callbacks?.onOpenTable?.(path, viewId),
    onApplyView: (view: SavedView) => callbacks?.onApplyView(view),
    onDeleteView: (view: SavedView, path?: string) => callbacks?.onDeleteView(view, path),
    onAddView: (path?: string, scope?: DataScope) => callbacks?.onAddView(path, scope),
    onOpenRecord: (path: string, view: SavedView, recordId: string, row?: DbRecord) =>
      callbacks?.onOpenRecord?.(path, view, recordId, row),
    onExpandedViewKeyChange: (key: string | null) => callbacks?.onExpandedViewKeyChange?.(key),
    onCollapse: () => callbacks?.onCollapse?.(),
  }

  function emit() {
    for (const fn of listeners) fn()
  }

  function getLive() {
    return live
  }

  function subscribe(fn: () => void) {
    listeners.add(fn)
    return () => {
      listeners.delete(fn)
    }
  }

  function publish(next: DataSidebarLive | null) {
    epoch += 1
    if (!next) {
      callbacks = null
      if (live === null) return
      live = null
      emit()
      return
    }
    callbacks = next
    if (sameSidebarData(live, next)) return
    live = {
      tables: next.tables,
      collectionPath: next.collectionPath,
      title: next.title,
      views: next.views,
      activeViewId: next.activeViewId,
      expandedViewKey: next.expandedViewKey,
      onApplyView: stableHandlers.onApplyView,
      onDeleteView: stableHandlers.onDeleteView,
      onAddView: stableHandlers.onAddView,
      ...(next.onOpenTable ? { onOpenTable: stableHandlers.onOpenTable } : {}),
      ...(next.onOpenRecord ? { onOpenRecord: stableHandlers.onOpenRecord } : {}),
      ...(next.onExpandedViewKeyChange ? { onExpandedViewKeyChange: stableHandlers.onExpandedViewKeyChange } : {}),
      ...(next.onCollapse ? { onCollapse: stableHandlers.onCollapse } : {}),
    }
    emit()
  }

  /** 延迟一微任务清空，避免切换表/路由重挂载时把侧边栏瞬间闪回骨架屏。 */
  function release() {
    const at = epoch
    queueMicrotask(() => {
      if (epoch !== at) return
      publish(null)
    })
  }

  function useLive() {
    return useSyncExternalStore(subscribe, getLive, () => null)
  }

  return { publish, release, subscribe, getLive, useLive, reset: () => publish(null) }
}

const host = createDataSidebarHost()
export const publishDataSidebar = host.publish
export const releaseDataSidebar = host.release
export const useDataSidebarLive = host.useLive
export const resetDataSidebarLive = host.reset
