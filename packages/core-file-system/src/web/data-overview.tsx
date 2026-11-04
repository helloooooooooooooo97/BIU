import type { CollectionActionInfo, CollectionInfo, DbRecord } from '@biu/type-file-system'
import { builtinAllView, builtinAllViewId, collectionNoun, stampRowOpenTarget } from '../catalog-views.ts'
import { normalizeCollectionPath } from '../paths.ts'
import { CollectionBrowser } from './browser.tsx'
import type { CrumbTarget } from './sidebar-nav.ts'
import { viewsForRegisteredCollection } from './collection-nav.ts'
import { dataChrome } from './data-chrome.ts'
import { actionIcon } from './fsdb-cells.tsx'
import { DATA_COLLECTION_PATH, DATA_MODULE_ID } from './database-path.ts'
import { idleTableIconKind } from './nav-glyphs.tsx'
import type { SavedView } from './saved-view.ts'

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
  const shown = actions.filter((action) => allowed.has(action.id))
  if (!shown.length) return null
  return (
    <>
      {shown.map((action) => (
        <button
          key={action.id}
          type="button"
          className={`fsdb-action-tag${action.tone === 'danger' ? ' is-danger' : ''}`}
          aria-label={action.label}
          disabled={busy}
          onClick={() => run(action)}
        >
          {actionIcon(action.id)}
          <span>{action.label}</span>
        </button>
      ))}
    </>
  )
}

function SourceTableCell({
  record,
  tables,
  onOpenTable,
}: {
  record: DbRecord
  tables: CollectionInfo[]
  onOpenTable: (path: string, viewId?: string) => void
}) {
  const path = normalizeCollectionPath(String(record.tablePath ?? ''))
  if (!path || path === '/') return null
  const table = tables.find((item) => item.path === path)
  const viewId = builtinAllViewId(path)
  const name = collectionNoun({ path, label: table?.label, view: table?.view })
  const jump = builtinAllView({ path, label: table?.label, view: table?.view }).name
  return (
    <button
      type="button"
      className="fsdb-source-table"
      data-biu-ignore
      title={jump}
      aria-label={jump}
      onClick={(event) => {
        event.stopPropagation()
        onOpenTable(path, viewId)
      }}
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="fsdb-record-mark is-sm" data-icon={idleTableIconKind(table?.view?.icon)} aria-hidden />
      <span className="fsdb-title-text">{name}</span>
    </button>
  )
}

export function DataOverview({
  tables,
  routeViewId,
  onOpenTable,
  onOpenView,
  onOpenRecord,
  onCrumbTarget,
  expandedViewKey,
  onExpandedViewKeyChange,
}: {
  tables: CollectionInfo[]
  routeViewId?: string
  onOpenTable: (path: string, viewId?: string) => void
  onOpenView?: (viewId: string) => void
  onOpenRecord?: (path: string, view: SavedView, recordId: string) => void
  onCrumbTarget?: (target: CrumbTarget) => void
  expandedViewKey?: string | null
  onExpandedViewKeyChange?: (key: string | null) => void
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
        tables={tables}
        routeViewId={routeViewId}
        onOpenTable={onOpenTable}
        onOpenView={onOpenView}
        onCrumbTarget={onCrumbTarget}
        onOpenRecord={(recordId, viewId, collection) => {
          const stamp =
            collection && collection !== DATA_COLLECTION_PATH
              ? { collection, recordId }
              : stampRowOpenTarget({ id: recordId })
          if (!stamp) return
          onOpenRecord?.(
            stamp.collection,
            { id: viewId || builtinAllViewId(stamp.collection) } as SavedView,
            stamp.recordId,
          )
        }}
        resolveViews={(path, user) => viewsForRegisteredCollection(path, tables, user)}
        expandedViewKey={expandedViewKey}
        onExpandedViewKeyChange={onExpandedViewKeyChange}
      />
    </div>
  )
}
