import { useMemo, useState } from 'react'
import { ShieldCheckIcon } from '@heroicons/react/16/solid'
import { DATA_COLLECTION_PATH, isIndexCollection, WORKSPACE_MEMBERS_COLLECTION_PATH } from '../paths.ts'
import { BatchShareDialog } from './batch-share-dialog.tsx'
import type { SavedView } from './saved-view.ts'

export function TableCollaboratorsButton({
  collectionPath,
  activeView,
  localOnly,
}: {
  collectionPath: string
  activeView?: SavedView
  viewerAccountId?: string
  localOnly?: boolean
}) {
  const [open, setOpen] = useState(false)

  const disabledCollection =
    !collectionPath ||
    collectionPath === '/' ||
    collectionPath === DATA_COLLECTION_PATH ||
    collectionPath === WORKSPACE_MEMBERS_COLLECTION_PATH ||
    isIndexCollection(collectionPath)

  const viewFilter = useMemo(() => {
    if (!activeView) return undefined
    const out: Record<string, unknown> = {}
    if (activeView.filters && typeof activeView.filters === 'object') {
      Object.assign(out, activeView.filters)
    }
    if (activeView.filterTree) {
      out.$tree = activeView.filterTree
    }
    return Object.keys(out).length ? out : undefined
  }, [activeView])

  if (localOnly || disabledCollection) return null

  return (
    <>
      <button
        type="button"
        className="tasks-refresh tasks-rbar-btn fsdb-collab-btn"
        data-testid="fsdb-table-collaborators-btn"
        aria-label="批量权限"
        title="批量权限：对当前视图筛选命中的全部记录批量设置权限"
        onClick={() => setOpen(true)}
      >
        <ShieldCheckIcon aria-hidden className="size-[15px]" />
      </button>
      <BatchShareDialog
        open={open}
        target={{
          collectionPath,
          viewId: activeView?.id,
          viewName: activeView?.name,
          filter: viewFilter,
          q: activeView?.query || undefined,
        }}
        onClose={() => setOpen(false)}
      />
    </>
  )
}
