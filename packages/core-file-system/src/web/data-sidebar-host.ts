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

/** 可重置的 live 通道；默认一份给 slots 用，测试里 `createDataSidebarHost()` 隔离。 */
export function createDataSidebarHost() {
  let live: DataSidebarLive | null = null
  const listeners = new Set<() => void>()

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
    live = next
    for (const fn of listeners) fn()
  }

  function useLive() {
    return useSyncExternalStore(subscribe, getLive, () => null)
  }

  return { publish, subscribe, getLive, useLive, reset: () => publish(null) }
}

const host = createDataSidebarHost()
export const publishDataSidebar = host.publish
export const useDataSidebarLive = host.useLive
export const resetDataSidebarLive = host.reset
