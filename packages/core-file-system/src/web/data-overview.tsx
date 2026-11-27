import type { CollectionActionInfo, CollectionInfo, DbRecord } from '@biu/type-file-system'
import { stampRowOpenTarget } from '../catalog-views.ts'
import { CollectionBrowser } from './browser.tsx'
import type { CrumbTarget } from './sidebar-nav.ts'
import { viewsForRegisteredCollection } from './collection-nav.ts'
import { dataChrome, setViaDataCrumbs } from './data-chrome.ts'
import { actionIcon } from './fsdb-cells.tsx'
import { DATA_COLLECTION_PATH, DATA_MODULE_ID } from './database-path.ts'
import { SourceTableCell } from './source-table-cell.tsx'
import type { SavedView } from './saved-view.ts'
import { defaultViewId } from './view-storage.ts'

function SourceActions({
  actions,
  record,
  busy,
  run,
}: {
  actions: CollectionActionInfo[]
  record: DbRecord
  busy: boolean
  run: (action: CollectionActionInfo) => void
}) {
  const allowed = new Set((Array.isArray(record.actionIds) ? record.actionIds : []).map(String))
  const source = String(record.tablePath ?? '')
  const shown = actions.filter((action) => {
    if (!allowed.has(action.id)) return false
    return !action.collection || !source || action.collection === source
  })
  if (!shown.length) return null
  return (
    <>
      {shown.map((action) => (
        <button
          key={action.id}
          type="button"
          className={`tasks-icon-btn${action.tone === 'danger' ? ' is-danger' : ''}`}
          aria-label={action.label}
          data-dock-tip={action.label}
          disabled={busy}
          onClick={() => run(action)}
        >
          {actionIcon(action.id)}
        </button>
      ))}
    </>
  )
}

export function DataOverview({
  tables,
  routeViewId,
  routeRecordId,
  onOpenTable,
  onOpenView,
  onOpenRecord,
  onCrumbTarget,
  expandedViewKey,
  onExpandedViewKeyChange,
  embed = false,
  inspectorPaneId,
}: {
  tables: CollectionInfo[]
  routeViewId?: string
  routeRecordId?: string | null
  onOpenTable: (path: string, viewId?: string) => void
  onOpenView?: (viewId: string) => void
  onOpenRecord?: (path: string, view: SavedView, recordId: string) => void
  onCrumbTarget?: (target: CrumbTarget) => void
  expandedViewKey?: string | null
  onExpandedViewKeyChange?: (key: string | null) => void
  embed?: boolean
  inspectorPaneId?: string
}) {
  return (
    <div className="fsdb-data-overview" data-testid="fsdb-data-overview">
      <CollectionBrowser
        moduleId={DATA_MODULE_ID}
        collectionPath={DATA_COLLECTION_PATH}
        title="数据"
        blurb=""
        chrome={{
          ...dataChrome,
          cells: {
            table: ({ record }) => (
              <SourceTableCell record={record} tables={tables} onOpenTable={onOpenTable} />
            ),
          },
          Actions: ({ actions, record, busy, run }) => (
            <SourceActions actions={actions} record={record} busy={busy} run={run} />
          ),
        }}
        embed={embed}
        inspectorPaneId={inspectorPaneId}
        tables={tables}
        routeViewId={routeViewId}
        routeRecordId={routeRecordId}
        onOpenTable={onOpenTable}
        onOpenView={onOpenView}
        onCrumbTarget={onCrumbTarget}
        onOpenRecord={(recordId, viewId, collection) => {
          const stamp = stampRowOpenTarget({ id: recordId, tablePath: collection })
          const path = stamp?.collection ?? collection ?? DATA_COLLECTION_PATH
          if (path !== DATA_COLLECTION_PATH) {
            setViaDataCrumbs(true, viewId || defaultViewId(DATA_COLLECTION_PATH))
          }
          onOpenRecord?.(
            path,
            { id: defaultViewId(path) } as SavedView,
            stamp?.recordId ?? recordId,
          )
        }}
        resolveViews={(path, user) => viewsForRegisteredCollection(path, tables, user)}
        expandedViewKey={expandedViewKey}
        onExpandedViewKeyChange={onExpandedViewKeyChange}
      />
    </div>
  )
}
