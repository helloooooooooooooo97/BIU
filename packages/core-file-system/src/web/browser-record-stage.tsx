import { lazy, memo, Suspense, type ComponentProps, type Dispatch, type ReactNode, type RefObject, type SetStateAction } from 'react'
import { HashtagIcon } from '@heroicons/react/16/solid'
import type { CollectionInfo, CollectionSchema, DbRecord, FieldSpec } from '@biu/type-file-system'
import type { CollectionChrome, CollectionRowViewType, CollectionViewType } from '@biu/type-file-system/ui'
import { WindowedTable, type TableCheckStore, type TableChromeBag, type TablePaintBag, type TablePaintNode } from './windowed-table.tsx'
import type { TableHoldSnap } from './browser-list-cache.ts'
import type { BrowserTableColumn } from './browser-table-paint.tsx'
import { PluginSurface } from './browser-row-title.tsx'
import { UiGlyph } from './nav-glyphs.tsx'
import { PLUGINS_COLLECTION_PATH, isPersonalOnlyCollection } from './database-path.ts'
import { getDatabaseUi } from './database-ui.ts'
import { PageContentLoading } from './page-content-status.tsx'
import type { TableColumnSlice } from './table-window.ts'
import { normalizeAuthzRole } from '../shared/authz-labels.ts'
import type { TableSandboxItem } from '../shared/table-sandbox-model.ts'
import { AccessRequestGate, AccessUpgradeBar, isAccessRequestableCollection } from './access-request-gate.tsx'

const RecordDetail = lazy(() => import('./record-detail.tsx').then((m) => ({ default: m.RecordDetail })))
const LazySharePanel = lazy(() => import('./share-popover.tsx').then((m) => ({ default: m.SharePanel })))
const CollectionRowsShell = lazy(() => import('./rows-view.tsx').then((m) => ({ default: m.CollectionRowsShell })))
const CollectionSandboxHost = lazy(() => import('./collection-sandbox-host.tsx').then((m) => ({ default: m.CollectionSandboxHost })))

function SharePanel(props: ComponentProps<typeof LazySharePanel>) {
  return (
    <Suspense fallback={null}>
      <LazySharePanel {...props} />
    </Suspense>
  )
}

export type BrowserRecordStageProps = {
  detailId: string | null
  detailAccessDenied?: boolean
  onCloseAccessDenied?: () => void
  selected: DbRecord | null
  schema?: CollectionSchema
  listChrome: ReactNode
  error: string
  customView?: CollectionViewType
  rowView?: CollectionRowViewType
  sandboxView?: TableSandboxItem
  onPatchSandboxView?: (next: TableSandboxItem) => void
  canCreate?: boolean
  onCreateRecord?: () => Promise<void> | void
  onOpenRowSplit?: (row: DbRecord) => void
  onReload?: () => Promise<void> | void
  dataPath: string
  items: DbRecord[]
  columns: BrowserTableColumn[]
  columnWidths: Record<string, number>
  columnPinCount: number
  wrapCells: boolean
  truncateCells: boolean
  resizingCol: string | null
  held: TableHoldSnap | null
  tablePaintNodes: TablePaintNode[]
  pickMode: boolean
  tableResetKey: string
  cellViewStamp?: string
  pickedCount: number
  checkLayoutExtra: string
  tablePaintRef: RefObject<TablePaintBag>
  tableChromeRef: RefObject<TableChromeBag>
  colWindowRef: RefObject<TableColumnSlice>
  tableRef: RefObject<HTMLTableElement | null>
  tableWrapRef: RefObject<HTMLDivElement | null>
  tableStageRef: RefObject<HTMLDivElement | null>
  checkStackRef: RefObject<HTMLDivElement | null>
  checkHoverRef: RefObject<string | null>
  paintCheckHover: (next: string | null) => void
  renderCheckHead: () => ReactNode
  renderCheckRow: (id: string) => ReactNode
  checkStore: TableCheckStore
  onVisibleRange: (start: number, end: number) => void
  retainedCell: { id: string; key: string; rowKey?: string } | null
  preserveMountedRows: boolean
  grouping: boolean
  total: number
  page: number
  pageSize: number
  setPage: Dispatch<SetStateAction<number>>
  changePageSize: (next: number) => void
  openRow: (row: DbRecord) => void
  isDataOverview: boolean
  chrome?: CollectionChrome
  draft: Record<string, string>
  detailBody: unknown
  detailBodyStatus: 'loading' | 'failed' | 'ready'
  detailBodyError: string
  refreshOpenDetail: () => void
  labelOf: (row: DbRecord) => string
  renderCell: (row: DbRecord, key: string, field: FieldSpec, surface?: 'table' | 'detail') => ReactNode
  setDraft: Dispatch<SetStateAction<Record<string, string>>>
  writeOne: (row: DbRecord, key: string, field: FieldSpec, raw: string) => Promise<void>
  writePatch: (row: DbRecord, patch: Record<string, unknown>) => Promise<void>
  currentTable?: CollectionInfo
  collectionPath: string
  localData: boolean
  rowActionColumn: boolean
  renderRecordActions: (row: DbRecord) => ReactNode
  nested: boolean
  activeViewId: string | null
  detailRow: DbRecord | null
  title: string
  canDelete: boolean
  onRequestDeleteRecord: (row: DbRecord) => void
  onOpenRecord?: (recordId: string, viewId: string | null, collection?: string) => void
  stepViewRecord: (delta: -1 | 1) => Promise<void>
  canStepPrev: boolean
  canStepNext: boolean
  recordKind: string
  inspectorPaneId?: string
  visibleColumns: string[]
  setVisibleColumns: (next: string[]) => void
  renderVisibleColumnsFlyout: () => ReactNode
  onOpenHistory?: () => void
}

export const BrowserRecordStage = memo(function BrowserRecordStage(props: BrowserRecordStageProps) {
  const {
    detailId,
    detailAccessDenied = false,
    onCloseAccessDenied,
    selected,
    schema,
    listChrome,
    error,
    customView,
    rowView,
    sandboxView,
    onPatchSandboxView,
    canCreate,
    onCreateRecord,
    onOpenRowSplit,
    onReload,
    dataPath,
    items,
    columns,
    columnWidths,
    columnPinCount,
    wrapCells,
    truncateCells,
    resizingCol,
    held,
    tablePaintNodes,
    pickMode,
    tableResetKey,
    cellViewStamp,
    pickedCount,
    checkLayoutExtra,
    tablePaintRef,
    tableChromeRef,
    colWindowRef,
    tableRef,
    tableWrapRef,
    tableStageRef,
    checkStackRef,
    checkHoverRef,
    paintCheckHover,
    renderCheckHead,
    renderCheckRow,
    checkStore,
    onVisibleRange,
    retainedCell,
    preserveMountedRows,
    grouping,
    total,
    page,
    pageSize,
    setPage,
    changePageSize,
    openRow,
    isDataOverview,
    chrome,
    draft,
    detailBody,
    detailBodyStatus,
    detailBodyError,
    refreshOpenDetail,
    labelOf,
    renderCell,
    setDraft,
    writeOne,
    writePatch,
    currentTable,
    collectionPath,
    localData,
    rowActionColumn,
    renderRecordActions,
    nested,
    activeViewId,
    detailRow,
    title,
    canDelete,
    onRequestDeleteRecord,
    onOpenRecord,
    stepViewRecord,
    canStepPrev,
    canStepNext,
    recordKind,
    inspectorPaneId,
    visibleColumns,
    setVisibleColumns,
    renderVisibleColumnsFlyout,
    onOpenHistory,
  } = props

  if (!detailId) {
    return (
      <div className="tasks-main fsdb-main">
        {listChrome}
        {error ? <p className="tasks-error">{error}</p> : null}

        <div className="fsdb-workspace">
          <div className="fsdb-stage">
            {customView ? (
              <PluginSurface plugin={customView.plugin} label={customView.label}>
                <customView.View path={dataPath} rows={items} schema={schema} onOpen={openRow} />
              </PluginSurface>
            ) : null}
            {rowView ? (
              <PluginSurface plugin={rowView.plugin} label={rowView.label}>
                <Suspense fallback={null}>
                  <CollectionRowsShell
                    rows={items}
                    schema={schema}
                    columns={columns.map((item) => item.key)}
                    onOpen={openRow}
                    Row={rowView.Row}
                  />
                </Suspense>
              </PluginSurface>
            ) : null}
            {sandboxView && onPatchSandboxView ? (
              <Suspense fallback={null}>
                <CollectionSandboxHost
                  view={sandboxView}
                  collectionPath={dataPath}
                  title={title}
                  rows={items}
                  total={total}
                  schema={schema}
                  columns={columns}
                  canCreate={Boolean(canCreate)}
                  onOpenRow={openRow}
                  onOpenRowSplit={(row) => onOpenRowSplit?.(row)}
                  onCreateRecord={() => onCreateRecord?.()}
                  onRequestDeleteRecord={canDelete ? onRequestDeleteRecord : undefined}
                  onPatchView={onPatchSandboxView}
                  onReload={onReload}
                />
              </Suspense>
            ) : null}
            {!customView && !rowView && !sandboxView ? (
              <div className="tasks-table-shell" onMouseLeave={() => paintCheckHover(null)}>
                <div className="tasks-table-wrap" ref={tableWrapRef}>
                  <WindowedTable
                    columns={held?.columns ?? columns}
                    columnWidths={held?.columnWidths ?? columnWidths}
                    columnPinCount={held?.columnPinCount ?? columnPinCount}
                    wrapCells={held?.wrapCells ?? wrapCells}
                    truncateCells={held?.truncateCells ?? truncateCells}
                    resizingCol={held ? null : resizingCol}
                    nodes={held?.nodes ?? tablePaintNodes}
                    error={held ? '' : error}
                    pickMode={pickMode}
                    resetKey={held?.resetKey ?? tableResetKey}
                    forceLiveChecks={!held && pickedCount > 0}
                    checkLayoutExtra={held?.checkLayoutExtra ?? checkLayoutExtra}
                    paintRef={tablePaintRef}
                    chromeRef={tableChromeRef}
                    colWindowRef={colWindowRef}
                    tableRef={tableRef}
                    wrapRef={tableWrapRef}
                    stageRef={tableStageRef}
                    checkStackRef={checkStackRef}
                    checkHoverRef={checkHoverRef}
                    paintCheckHover={paintCheckHover}
                    renderCheckHead={renderCheckHead}
                    renderCheckRow={renderCheckRow}
                    checkStore={checkStore}
                    onVisibleRange={onVisibleRange}
                    frozen={Boolean(held)}
                    activeRowId={detailId}
                    cellViewStamp={cellViewStamp}
                    retainedRowId={retainedCell?.id}
                    retainedRowKey={retainedCell?.rowKey}
                    retainedColumnKey={retainedCell?.key}
                    preserveMountedRows={preserveMountedRows}
                  />
                </div>
              </div>
            ) : null}
          </div>
          {grouping || total <= pageSize ? null : (
            <div className="fsdb-pager" data-biu-ignore>
              <span className="fsdb-pager-meta" title={`共 ${total} 条`}>
                <HashtagIcon aria-hidden className="size-[14px]" />
                <span>{total}</span>
              </span>
              <div className="fsdb-pager-nav">
                <button
                  type="button"
                  className="tasks-icon-btn"
                  aria-label="上一页"
                  disabled={page <= 0}
                  onClick={() => setPage((prev) => Math.max(0, prev - 1))}
                >
                  <UiGlyph icon="chevron-left" />
                </button>
                <button
                  type="button"
                  className="tasks-icon-btn"
                  aria-label="下一页"
                  disabled={total <= 0 || (page + 1) * pageSize >= total}
                  onClick={() => setPage((prev) => prev + 1)}
                >
                  <UiGlyph icon="chevron-right" />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  if (detailId && detailAccessDenied && !selected) {
    return (
      <AccessRequestGate
        collection={collectionPath}
        recordId={detailId}
        onRetry={refreshOpenDetail}
        onBack={onCloseAccessDenied}
      />
    )
  }

  if (!selected || !schema) return null

  const isViewerUpgradeable =
    !localData &&
    isAccessRequestableCollection(collectionPath) &&
    normalizeAuthzRole(selected.shareRole) === 'viewer' &&
    !(collectionPath === PLUGINS_COLLECTION_PATH && selected.builtin === true)

  return (
    <Suspense fallback={<PageContentLoading />}>
      {isViewerUpgradeable ? <AccessUpgradeBar collection={collectionPath} recordId={selected.id} /> : null}
      <RecordDetail
        selected={selected}
        schema={schema}
        chrome={
          isDataOverview
            ? {
                ...chrome,
                ...getDatabaseUi()?.chrome(String(selected.tablePath ?? '')),
                openRow: chrome?.openRow,
                listViews: chrome?.listViews,
                cells: chrome?.cells,
                Actions: chrome?.Actions,
              }
            : chrome
        }
        draft={draft}
        detailBody={detailBody}
        detailBodyStatus={detailBodyStatus}
        detailBodyError={detailBodyError}
        onRetryBody={refreshOpenDetail}
        labelOf={labelOf}
        renderCell={renderCell}
        setDraft={setDraft}
        writeOne={writeOne}
        writePatch={writePatch}
        tableIcon={currentTable?.view?.icon}
        readOnly={
          (collectionPath === PLUGINS_COLLECTION_PATH && selected.builtin === true && selected.canManagePackage !== true) ||
          (normalizeAuthzRole(selected.shareRole) === 'viewer' &&
            !localData &&
            !(collectionPath === PLUGINS_COLLECTION_PATH && selected.builtin === true && selected.canManagePackage === true))
        }
        actionProperty={rowActionColumn ? renderRecordActions(selected) : null}
        share={
          nested && detailId && !isPersonalOnlyCollection(collectionPath) ? (
            <SharePanel
              embedded
              localOnly={localData}
              target={{
                kind: 'record',
                collection: collectionPath,
                viewId: activeViewId ?? undefined,
                recordId: detailId,
                title: String(detailRow?.title ?? title),
              }}
            />
          ) : undefined
        }
        onDelete={
          canDelete && !(collectionPath === PLUGINS_COLLECTION_PATH && selected.builtin === true)
            ? () => onRequestDeleteRecord(selected)
            : undefined
        }
        onHistory={onOpenHistory}
        onOpenRecord={(recordId, collection) => onOpenRecord?.(recordId, activeViewId, collection)}
        onPrev={() => void stepViewRecord(-1)}
        onNext={() => void stepViewRecord(1)}
        canPrev={canStepPrev}
        canNext={canStepNext}
        collectionPath={collectionPath}
        recordKind={recordKind}
        inspectorPaneId={inspectorPaneId}
        visibleColumns={visibleColumns}
        onVisibleColumns={setVisibleColumns}
        columnMenu={renderVisibleColumnsFlyout()}
      />
    </Suspense>
  )
})
