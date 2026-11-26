import type { Dispatch, PointerEvent as ReactPointerEvent, ReactNode, RefObject, SetStateAction } from 'react'
import { PlusIcon } from '@heroicons/react/16/solid'
import type { CollectionInfo, CollectionSchema, DbRecord, FieldSpec, FieldType } from '@biu/type-file-system'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import { tagTone as schemaTagTone } from '@biu/biu-ui/tag-chip'
import { TagFieldChips } from './schema-field.tsx'
import { computeColumnSummary, type ColumnSummaryOp } from './column-summary.ts'
import { activeColumnSandboxItem, ColumnSandboxCell, resolveColumnSandboxItems, type ColumnViewConfig } from './column-sandbox-view.tsx'
import { loadTags } from './tag-catalog.ts'
import type { ColumnHeaderMenuTarget } from './column-header-menu.tsx'
import {
  asStringList,
  columnHeadTip,
  enumDisplayLabel,
  formatField,
  isRecordLinkField,
  parseTagFlatColumnKey,
  readTagFlatValue,
  resolveFieldType,
  tagColumnHeadLabel,
  tagSourceKey,
  type ViewMode,
} from './fields.ts'
import { padColBox, type TablePaintBag, type TablePaintNode } from './windowed-table.tsx'
import type { NativeCellDescribe, NativeCellSpec } from './table-native-pool.ts'
import { EMPTY_HOLD_NODES, type TableHoldSnap } from './browser-list-cache.ts'
import { RecordTitle } from './browser-row-title.tsx'
import { FieldGlyph } from './fsdb-cells.tsx'
import { TableGlyph, UiGlyph } from './nav-glyphs.tsx'
import { TAGS_COLLECTION_PATH } from './database-path.ts'
import { persistCollapsedGroups } from './view-storage.ts'
import { tableColWidthVar, tablePinColOffsets, type PinnedColOffset, type TableColumnSlice } from './table-window.ts'
import { startTableColumnDrag } from './table-col-reorder.ts'
import { tableCellRangeKey, tableNavKeys, type TableCellCursor } from './table-keys.ts'
import { isViewCatalogField } from './view-catalog.ts'

export type BrowserTableColumn = {
  key: string
  field: FieldSpec
  kind: FieldType
  label?: string
  tagPackId?: string
  tagLabel?: string
}

export type BrowserTableIconLookup = {
  byPath: ReadonlyMap<string, string | undefined>
  byLabel: ReadonlyMap<string, string | undefined>
}

export function buildTableIconLookup(tables: CollectionInfo[]): BrowserTableIconLookup {
  const byPath = new Map<string, string | undefined>()
  const byLabel = new Map<string, string | undefined>()
  for (const table of tables) {
    const icon = table.view?.icon
    byPath.set(table.path, icon)
    const title = table.view?.title ?? table.label
    if (title && !byLabel.has(title)) byLabel.set(title, icon)
  }
  return { byPath, byLabel }
}

export type BrowserTablePaintDeps = {
  collectionPath: string
  activeViewId: string | null
  routeViewId?: string
  detailId: string | null
  mode: ViewMode
  sheet: boolean
  embed: boolean
  schema?: CollectionSchema | null
  columns: BrowserTableColumn[]
  columnsByKey: ReadonlyMap<string, BrowserTableColumn>
  chrome?: CollectionChrome
  currentTable?: CollectionInfo
  tableIcons: BrowserTableIconLookup
  groupBy: string
  collapsedGroups: Record<string, boolean>
  setCollapsedGroups: Dispatch<SetStateAction<Record<string, boolean>>>
  collapsed: Record<string, boolean>
  setCollapsed: Dispatch<SetStateAction<Record<string, boolean>>>
  treeOn: boolean
  canCreate: boolean
  creatingGroup: string | null
  freezeTitle: boolean
  pinOffsets: ReadonlyMap<string, PinnedColOffset>
  queryFields: ReadonlySet<string>
  resizingCol: string | null
  columnSummaries: Record<string, ColumnSummaryOp>
  columnViews: Record<string, ColumnViewConfig>
  openColMenuKey: string | null
  onOpenColMenu?: (target: ColumnHeaderMenuTarget) => void
  onReorderColumns?: (next: string[]) => void
  pageSize: number
  error: string
  setGroupPages: Dispatch<SetStateAction<Record<string, number>>>
  changePageSize: (next: number) => void
  tableHoldRef: RefObject<TableHoldSnap | null>
  cellPickRef: RefObject<TableCellCursor | null>
  cellRangeSetRef: RefObject<Set<string>>
  colWindowRef: RefObject<TableColumnSlice>
  tablePaintRef: RefObject<TablePaintBag>
  listReadySent: RefObject<boolean>
  captureTableFoldSnapshot: () => void
  groupCreateSeed: (groupKey: string) => Record<string, unknown> | null
  createInGroup: (groupKey: string) => Promise<void>
  startColResize: (event: ReactPointerEvent<HTMLElement>, key: string) => void
  renderCell: (row: DbRecord, key: string, field: FieldSpec, surface?: 'table' | 'detail') => ReactNode
  cellValueText: (row: DbRecord, key: string, field: FieldSpec) => string
  cellPickOf: (row: DbRecord, key: string, field: FieldSpec) => Record<string, string | undefined>
  cellFieldWritable: (field: FieldSpec) => boolean
  recordPick: (row: DbRecord) => Record<string, string>
  renderRecordActions: (row: DbRecord) => ReactNode
  openRow: (row: DbRecord) => void
  openRowSplit: (row: DbRecord) => void
  writePatch: (row: DbRecord, patch: Record<string, unknown>) => Promise<void>
  writeCellValue?: (row: DbRecord, key: string, field: FieldSpec, value: unknown) => Promise<void> | void
  items?: DbRecord[]
  loadTreeKids: (parentId: string) => Promise<void>
  flattenRows: (rows: DbRecord[]) => Array<{ row: DbRecord; depth: number; hasKids: boolean; kidCount: number }>
}

export function createBrowserTablePaint(deps: BrowserTablePaintDeps) {
  const {
    collectionPath,
    activeViewId,
    routeViewId,
    detailId,
    mode,
    sheet,
    embed,
    schema,
    columns,
    columnsByKey,
    chrome,
    currentTable,
    tableIcons,
    groupBy,
    collapsedGroups,
    setCollapsedGroups,
    collapsed,
    setCollapsed,
    treeOn,
    canCreate,
    creatingGroup,
    freezeTitle,
    pinOffsets,
    queryFields,
    resizingCol,
    columnSummaries,
    columnViews,
    openColMenuKey,
    onOpenColMenu,
    onReorderColumns,
    pageSize,
    error,
    setGroupPages,
    changePageSize,
    tableHoldRef,
    cellPickRef,
    cellRangeSetRef,
    colWindowRef,
    tablePaintRef,
    listReadySent,
    captureTableFoldSnapshot,
    groupCreateSeed,
    createInGroup,
    startColResize,
    renderCell,
    cellValueText,
    cellPickOf,
    cellFieldWritable,
    recordPick,
    renderRecordActions,
    openRow,
    openRowSplit,
    writePatch,
    writeCellValue,
    items,
    loadTreeKids,
    flattenRows,
  } = deps

  // Precompute held-view cursor once per render instead of scanning nodes/columns on every cell.
  let cachedHoldSnap: TableHoldSnap | null = null
  let cachedHoldPick: TableCellCursor | null = null
  function resolveHeldCellPick(held: TableHoldSnap): TableCellCursor | null {
    if (held === cachedHoldSnap) return cachedHoldPick
    cachedHoldSnap = held
    if (held.nodes !== EMPTY_HOLD_NODES && !sheet && !embed && mode === 'table' && !detailId) {
      const paintSchema = held.schema ?? schema
      const firstRow = held.nodes.find((item): item is Extract<TablePaintNode, { kind: 'row' }> => item.kind === 'row')
      const heldKeys = tableNavKeys(held.columns as BrowserTableColumn[])
      const labelKey = paintSchema?.labelField
      const targetKey = labelKey && heldKeys.includes(labelKey) ? labelKey : heldKeys[0]
      cachedHoldPick = firstRow && targetKey ? { id: String(firstRow.row.id), key: targetKey, rowKey: firstRow.key } : null
    } else {
      cachedHoldPick = null
    }
    return cachedHoldPick
  }

  let cachedHoldPinSnap: TableHoldSnap | null = null
  let cachedHoldPinMap: ReadonlyMap<string, PinnedColOffset> | undefined = pinOffsets
  function resolvePinOf(colKey: string): PinnedColOffset | undefined {
    const held = tableHoldRef.current
    if (!held || held.nodes === EMPTY_HOLD_NODES) return pinOffsets?.get(colKey)
    if (held !== cachedHoldPinSnap) {
      cachedHoldPinSnap = held
      cachedHoldPinMap = tablePinColOffsets(
        (held.columns as BrowserTableColumn[]).map((c) => c.key),
        held.columnWidths ?? {},
        held.columnPinCount ?? 0,
        (held.schema ?? schema)?.labelField,
      )
    }
    return cachedHoldPinMap?.get(colKey)
  }

  function pinClassFor(pin: PinnedColOffset | undefined) {
    if (!pin) return ''
    return pin.isEdge ? 'is-pin-col is-pin-edge' : 'is-pin-col'
  }

  void freezeTitle

  function renderGroupHead(groupKey: string, label: string) {
    const folded = Boolean(collapsedGroups[groupKey])
    const tableIcon =
      groupBy === 'tablePath'
        ? tableIcons?.byPath?.get(groupKey)
        : (tableIcons?.byLabel?.get(groupKey) ?? tableIcons?.byPath?.get(groupKey))
    return (
      <header className="tasks-queue-ghead">
        <button
          type="button"
          className="tasks-group-fold"
          aria-expanded={!folded}
          aria-label={folded ? '展开分组' : '收起分组'}
          title={folded ? '展开分组' : '收起分组'}
          onClick={() => {
            captureTableFoldSnapshot()
            const next = { ...collapsedGroups, [groupKey]: !collapsedGroups[groupKey] }
            setCollapsedGroups(next)
            persistCollapsedGroups(collectionPath, activeViewId ?? routeViewId ?? '', groupBy, next)
          }}
        >
          <span className="sidebar-rail-icon sidebar-group-fold" aria-hidden>
            <span className="sidebar-group-fold-face">
              {groupBy === 'shareScope' ? (
                <UiGlyph
                  icon={label === '共享' ? 'globe' : label === '空间' ? 'users' : 'user'}
                  className={label === '共享' ? 'tasks-queue-gshare' : undefined}
                />
              ) : groupBy === 'table' || groupBy === 'tablePath' ? (
                <TableGlyph icon={tableIcon} className="size-4" />
              ) : (
                <UiGlyph icon="stack" />
              )}
            </span>
            <span className="sidebar-group-fold-chevron">
              <UiGlyph icon="chevron-right" className={`sidebar-chevron${folded ? '' : ' is-open'}`} />
            </span>
          </span>
        </button>
        <span className="tasks-queue-glabel">{label}</span>
        {canCreate ? (
          <button
            type="button"
            className="tasks-icon-btn tasks-group-create"
            aria-label={`在「${label}」分组中新增`}
            title={groupCreateSeed(groupKey) ? `在「${label}」分组中新增` : '当前分组属性无法在新建时指定'}
            disabled={Boolean(creatingGroup) || !groupCreateSeed(groupKey)}
            onClick={() => void createInGroup(groupKey)}
          >
            <PlusIcon aria-hidden className="size-[14px]" />
          </button>
        ) : null}
      </header>
    )
  }

  function paintColPad(px: number, side: 'left' | 'right') {
    if (px <= 0) return null
    return <td key={`pad-${side}`} className="fsdb-col-pad" aria-hidden style={padColBox(px)} />
  }

  function colCellBox(colKey: string, extra?: Record<string, string>): Record<string, string> {
    const w = `var(${tableColWidthVar(colKey)})`
    return {
      width: w,
      minWidth: w,
      maxWidth: w,
      ...extra,
    }
  }

  function paintHeadTh(col: BrowserTableColumn) {
    if (col.key === '__rowNumber') {
      const pin = resolvePinOf(col.key)
      const thStyle = colCellBox(col.key, pin ? { '--fsdb-pin-left': `${pin.left}px` } : undefined)
      return (
        <th
          key={col.key}
          data-col-key={col.key}
          className={[pinClassFor(pin), 'fsdb-rownum-th'].filter(Boolean).join(' ')}
          style={thStyle}
          aria-label="序号"
        >
          <span className="fsdb-rownum-head">#</span>
        </th>
      )
    }
    const flat = parseTagFlatColumnKey(col.key)
    const tone = flat ? schemaTagTone(flat.packId) : undefined
    const headTip = columnHeadTip(col)
    const interactive = Boolean(onOpenColMenu && col.key !== 'actions')
    const draggableCol = Boolean(onReorderColumns)
    const menuOpen = interactive && openColMenuKey === col.key
    const pin = resolvePinOf(col.key)
    const thStyle = colCellBox(col.key, {
      ...(tone ? { '--biu-tag': tone } : {}),
      ...(pin ? { '--fsdb-pin-left': `${pin.left}px` } : {}),
    })
    return (
      <th
        key={col.key}
        data-col-key={col.key}
        className={[
          pinClassFor(pin),
          tone ? 'is-tag-col' : '',
          interactive ? 'is-col-clickable' : '',
          draggableCol ? 'is-col-draggable' : '',
          menuOpen ? 'is-col-menu-open' : '',
        ].filter(Boolean).join(' ') || undefined}
        style={thStyle}
        onPointerDown={
          draggableCol
            ? (event) =>
                startTableColumnDrag(event, {
                  colKey: col.key,
                  getColumnKeys: () => columns.map((item) => item.key),
                  onReorder: onReorderColumns!,
                })
            : undefined
        }
        onClick={
          interactive
            ? (event) => {
                if ((event.target as Element | null)?.closest('.fsdb-col-resizer')) return
                event.stopPropagation()
                onOpenColMenu?.({
                  col,
                  rect: event.currentTarget.getBoundingClientRect(),
                  anchorEl: event.currentTarget,
                  mode: 'header',
                })
              }
            : undefined
        }
      >
        <span
          className={`tasks-th${queryFields.has(col.key) ? ' is-on' : ''}`}
          data-dock-tip={headTip || undefined}
        >
          <span className="tasks-th-ico">
            <FieldGlyph kind={col.kind} />
          </span>
          {tagColumnHeadLabel(col)}
        </span>
        <span
          className={`fsdb-col-resizer${resizingCol === col.key ? ' is-active' : ''}`}
          data-testid="fsdb-col-resizer"
          onPointerDown={(event) => startColResize(event, col.key)}
          onClick={(event) => event.stopPropagation()}
        />
      </th>
    )
  }

  function paintTableCell(row: DbRecord, key: string, field: FieldSpec) {
    const activeSandbox = activeColumnSandboxItem(
      columnViews[key],
      resolveColumnSandboxItems(key, columnViews[key], loadTags()),
    )
    if (activeSandbox) {
      const rawValue = parseTagFlatColumnKey(key) ? readTagFlatValue(row, key) : row[key]
      return (
        <ColumnSandboxCell
          code={activeSandbox.code}
          value={rawValue}
          row={row}
          columnKey={key}
          label={field.label ?? key}
          kind={resolveFieldType(field)}
        />
      )
    }
    if (key === 'shareScope' || key === 'shareRole' || key === 'ownerTable') {
      return renderCell(row, key, field, 'table')
    }
    const kind = resolveFieldType(field)
    if (
      kind === 'boolean' ||
      kind === 'action' ||
      kind === 'tag' ||
      kind === 'select' ||
      kind === 'multi-select' ||
      kind === 'person' ||
      kind === 'url' ||
      kind === 'image' ||
      kind === 'attachment' ||
      kind === 'document' ||
      kind === 'file'
    ) {
      return renderCell(row, key, field, 'table')
    }
    if (
      parseTagFlatColumnKey(key) ||
      isRecordLinkField(field, key) ||
      isViewCatalogField(key) ||
      chrome?.cells?.[key]
    ) {
      if (key === 'usage' && !(Number(row[key]) > 0)) return <span className="traj-usage-empty">—</span>
      return renderCell(row, key, field, 'table')
    }
    if (key === 'fields' && collectionPath === TAGS_COLLECTION_PATH) {
      return <TagFieldChips value={row[key]} />
    }
    const text = cellValueText(row, key, field)
    return text ? <span>{text}</span> : null
  }

  function paintLiveCell(row: DbRecord, col: BrowserTableColumn, depth: number, hasKids: boolean, kidCount: number, rowKey: string, toolsArmed = true) {
    const held = tableHoldRef.current
    const paintSchema = held?.schema ?? schema
    const cellPick = held ? resolveHeldCellPick(held) : cellPickRef.current
    const rangeSet = held ? null : cellRangeSetRef.current
    const pin = resolvePinOf(col.key)
    return (
      <td
        key={col.key}
        data-col-key={col.key}
        {...cellPickOf(row, col.key, col.field)}
        style={colCellBox(col.key, pin ? { '--fsdb-pin-left': `${pin.left}px` } : undefined)}
        className={[
          pinClassFor(pin),
          Boolean(cellPick && (cellPick.rowKey ? cellPick.rowKey === rowKey : cellPick.id === row.id) && cellPick.key === col.key)
            ? col.field && cellFieldWritable(col.field)
              ? 'is-cell-on'
              : 'is-cell-on is-cell-ro'
            : rangeSet?.has(tableCellRangeKey(row.id, col.key))
              ? 'is-cell-range'
              : '',
        ].filter(Boolean).join(' ') || undefined}
      >
        {col.key === paintSchema?.labelField ? (
          <RecordTitle
            row={row}
            label={String(row[paintSchema?.labelField ?? 'title'] ?? '')}
            Title={chrome?.Title}
            depth={depth}
            hasKids={hasKids}
            kidCount={kidCount}
            treeOn={treeOn}
            collapsed={collapsed[row.id] !== false}
            onToggleCollapsed={() => {
              const expanding = collapsed[row.id] !== false
              captureTableFoldSnapshot()
              setCollapsed((prev) => ({ ...prev, [row.id]: prev[row.id] === false }))
              if (expanding) void loadTreeKids(String(row.id))
            }}
            tableIcon={currentTable?.view?.icon}
            Icon={chrome?.Icon}
            pick={recordPick(row)}
            onOpenSplit={() => openRowSplit(row)}
            onOpenRow={() => openRow(row)}
            onWriteEmoji={(next) => void writePatch(row, { emoji: next })}
            toolsArmed={toolsArmed}
          />
        ) : col.key === 'actions' ? (
          renderRecordActions(row)
        ) : (
          <span className="fsdb-cell">{paintTableCell(row, col.key, col.field)}</span>
        )}
      </td>
    )
  }

  function resolvePaintColumn(colKey: string): BrowserTableColumn | undefined {
    const held = tableHoldRef.current
    return held && held.nodes !== EMPTY_HOLD_NODES && held.columns.length
      ? (held.columns as BrowserTableColumn[]).find((item) => item.key === colKey)
      : columnsByKey?.get(colKey)
  }

  function resolveNativeCellSpec(row: DbRecord, col: BrowserTableColumn, paintSchema: CollectionSchema | null | undefined): NativeCellSpec {
    const key = col.key
    if (
      key === paintSchema?.labelField ||
      key === 'actions' ||
      key === 'shareScope' ||
      key === 'shareRole' ||
      key === 'ownerTable' ||
      key === 'table' ||
      (key === 'fields' && collectionPath === TAGS_COLLECTION_PATH) ||
      Boolean(chrome?.cells?.[key]) ||
      isRecordLinkField(col.field, key) ||
      isViewCatalogField(key) ||
      (key === 'usage' && !(Number(row[key]) > 0))
    ) {
      return { kind: 'portal' }
    }
    const activeSandbox = activeColumnSandboxItem(
      columnViews[key],
      resolveColumnSandboxItems(key, columnViews[key], loadTags()),
    )
    if (activeSandbox) return { kind: 'portal' }

    const kind = resolveFieldType(col.field)
    const flat = parseTagFlatColumnKey(key)
    const tagSrc = flat ? tagSourceKey(paintSchema ?? undefined) : undefined

    if (kind === 'boolean') {
      const raw = flat ? readTagFlatValue(row, key, tagSrc) : row[key]
      return { kind: 'bool', on: raw === true || raw === 'true', writable: Boolean(col.field.writable) }
    }
    if (kind === 'select' || kind === 'multi-select') {
      const raw = flat ? readTagFlatValue(row, key, tagSrc) : row[key]
      const tags = kind === 'multi-select' ? asStringList(raw) : String(raw ?? '') ? [String(raw)] : []
      return {
        kind: 'tags',
        items: tags.map((tag) => ({
          id: tag,
          label: enumDisplayLabel(col.field, tag),
          tone: schemaTagTone(tag),
        })),
      }
    }
    if (
      kind === 'string' ||
      kind === 'number' ||
      (kind === 'datetime' && !(flat && col.field.writable))
    ) {
      const text = flat
        ? formatField(col.field, readTagFlatValue(row, key, tagSrc))
        : cellValueText(row, key, col.field)
      return { kind: 'text', text }
    }
    return { kind: 'portal' }
  }

  function describeNativeCell(node: Extract<TablePaintNode, { kind: 'row' }>, colKey: string): NativeCellDescribe | null {
    const col = resolvePaintColumn(colKey)
    if (!col) return null
    if (col.key === '__rowNumber') {
      const pin = resolvePinOf(col.key)
      return {
        spec: { kind: 'text', text: node.rowNumber != null ? String(node.rowNumber) : '' },
        pinLeft: pin?.left,
        pinEdge: pin?.isEdge,
        cellClass: 'fsdb-rownum-td',
      }
    }
    const row = node.row
    const held = tableHoldRef.current
    const paintSchema = held?.schema ?? schema
    const cellPick = held ? resolveHeldCellPick(held) : cellPickRef.current
    const rangeSet = held ? null : cellRangeSetRef.current
    const pin = resolvePinOf(col.key)
    const isSelected = Boolean(
      cellPick && (cellPick.rowKey ? cellPick.rowKey === node.key : cellPick.id === row.id) && cellPick.key === col.key,
    )
    const cellClass = isSelected
      ? col.field && cellFieldWritable(col.field)
        ? 'is-cell-on'
        : 'is-cell-on is-cell-ro'
      : rangeSet?.has(tableCellRangeKey(row.id, col.key))
        ? 'is-cell-range'
        : ''
    return {
      spec: resolveNativeCellSpec(row, col, paintSchema),
      pinLeft: pin?.left,
      pinEdge: pin?.isEdge,
      cellClass: cellClass || undefined,
      pickAttrs: cellPickOf(row, col.key, col.field),
    }
  }

  function renderPortalCellContent(node: Extract<TablePaintNode, { kind: 'row' }>, colKey: string): ReactNode {
    const col = resolvePaintColumn(colKey)
    if (!col) return null
    const row = node.row
    const held = tableHoldRef.current
    const paintSchema = held?.schema ?? schema
    if (col.key === paintSchema?.labelField) {
      return (
        <RecordTitle
          row={row}
          label={String(row[paintSchema?.labelField ?? 'title'] ?? '')}
          Title={chrome?.Title}
          depth={node.depth}
          hasKids={node.hasKids}
          kidCount={node.kidCount}
          treeOn={treeOn}
          collapsed={collapsed[row.id] !== false}
          onToggleCollapsed={() => {
            const expanding = collapsed[row.id] !== false
            captureTableFoldSnapshot()
            setCollapsed((prev) => ({ ...prev, [row.id]: prev[row.id] === false }))
            if (expanding) void loadTreeKids(String(row.id))
          }}
          tableIcon={currentTable?.view?.icon}
          Icon={chrome?.Icon}
          pick={recordPick(row)}
          onOpenSplit={() => openRowSplit(row)}
          onOpenRow={() => openRow(row)}
          onWriteEmoji={(next) => void writePatch(row, { emoji: next })}
          toolsArmed
        />
      )
    }
    if (col.key === 'actions') {
      return renderRecordActions(row)
    }
    return <span className="fsdb-cell">{paintTableCell(row, col.key, col.field)}</span>
  }

  function onNativeBoolToggle(rowId: string, colKey: string) {
    if (!writeCellValue || !items) return
    const col = resolvePaintColumn(colKey)
    if (!col || !col.field.writable) return
    const row = items.find((item) => String(item.id) === rowId)
    if (!row) return
    const flat = parseTagFlatColumnKey(colKey)
    const raw = flat ? readTagFlatValue(row, colKey, tagSourceKey(schema ?? undefined)) : row[colKey]
    const on = raw === true || raw === 'true'
    void writeCellValue(row, colKey, col.field, !on)
  }

  function renderPaintCell(node: TablePaintNode, colKey: string) {
    if (node.kind !== 'row') return null
    const col = resolvePaintColumn(colKey)
    if (!col) return null
    if (col.key === '__rowNumber') {
      const pin = resolvePinOf(col.key)
      const tdStyle = colCellBox(col.key, pin ? { '--fsdb-pin-left': `${pin.left}px` } : undefined)
      return (
        <td
          key={col.key}
          data-col-key={col.key}
          style={tdStyle}
          className={[pinClassFor(pin), 'fsdb-rownum-td'].filter(Boolean).join(' ')}
        >
          <span className="fsdb-cell">{node.rowNumber != null ? String(node.rowNumber) : ''}</span>
        </td>
      )
    }
    return paintLiveCell(node.row, col, node.depth, node.hasKids, node.kidCount, node.key)
  }

  function renderPaintRow(node: TablePaintNode, cells: ReactNode) {
    if (node.kind !== 'row') return renderPaintNode(node)
    const row = node.row
    return (
      <tr
        key={node.key}
        data-record-id={row.id}
        data-row-key={node.key}
        className={row.id === detailId ? 'is-active' : undefined}
        {...recordPick(row)}
      >
        {cells}
      </tr>
    )
  }

  function tableLiveRow(row: DbRecord, depth: number, hasKids: boolean, kidCount: number, rowKey: string, toolsArmed = true) {
    const colWindow = colWindowRef.current
    const held = tableHoldRef.current
    const paintColumns = (
      held && held.nodes !== EMPTY_HOLD_NODES && held.columns.length ? held.columns : columns
    ) as BrowserTableColumn[]
    const paintLiveTd = (col: BrowserTableColumn) => paintLiveCell(row, col, depth, hasKids, kidCount, rowKey, toolsArmed)
    return (
      <tr
        key={rowKey}
        data-record-id={row.id}
        data-row-key={rowKey}
        className={row.id === detailId ? 'is-active' : undefined}
        {...recordPick(row)}
      >
        {paintColumns.slice(0, colWindow.pin).map(paintLiveTd)}
        {paintColPad(colWindow.padLeft, 'left')}
        {paintColumns.slice(colWindow.start, colWindow.end).map(paintLiveTd)}
        {paintColPad(colWindow.padRight, 'right')}
        <td className="fsdb-col-fill" aria-hidden />
      </tr>
    )
  }

  function tableRecordRow(row: DbRecord, depth: number, hasKids: boolean, kidCount: number, rowKey: string) {
    return tableLiveRow(row, depth, hasKids, kidCount, rowKey, true)
  }

  function tableBodyRows(rows: DbRecord[], keyPrefix = '') {
    const listed = flattenRows(rows)
    if (!listed.length) {
      return (
        <tr key="empty">
          <td colSpan={tablePaintRef.current.colSpan} className="fsdb-empty">
            {error ? '加载失败' : tableHoldRef.current?.nodes === EMPTY_HOLD_NODES ? '' : listReadySent.current ? '暂无记录' : ''}
          </td>
        </tr>
      )
    }
    return <>{listed.map((item) => tableRecordRow(item.row, item.depth, item.hasKids, item.kidCount, `${keyPrefix}${item.row.id}`))}</>
  }

  function renderPaintNode(node: TablePaintNode) {
    if (node.kind === 'empty') return tableBodyRows([])
    if (node.kind === 'row') return tableRecordRow(node.row, node.depth, node.hasKids, node.kidCount, node.key)
    if (node.kind === 'summary') {
      const colWindow = colWindowRef.current
      const held = tableHoldRef.current
      const paintColumns = (
        held && held.nodes !== EMPTY_HOLD_NODES && held.columns.length ? held.columns : columns
      ) as BrowserTableColumn[]
      const paintSchema = held?.schema ?? schema
      const hasAnySummary = Object.keys(columnSummaries).length > 0
      const paintSummaryTd = (col: BrowserTableColumn) => {
        const pin = resolvePinOf(col.key)
        const pinCls = pinClassFor(pin)
        const pinStyle = colCellBox(col.key, pin ? { '--fsdb-pin-left': `${pin.left}px` } : undefined)
        if (col.key === 'actions' || col.key === '__rowNumber') {
          return <td key={col.key} data-col-key={col.key} style={pinStyle} className={[pinCls, 'fsdb-summary-td'].filter(Boolean).join(' ')} />
        }
        const op = columnSummaries[col.key] ?? 'none'
        const result = computeColumnSummary(node.rows, col.key, col.field, op)
        return (
          <td key={col.key} data-col-key={col.key} style={pinStyle} className={[pinCls, 'fsdb-summary-td'].filter(Boolean).join(' ')}>
            <button
              type="button"
              className={`fsdb-summary-btn${result ? ' is-set' : ''}`}
              onClick={(event) => {
                event.stopPropagation()
                onOpenColMenu?.({
                  col,
                  rect: event.currentTarget.getBoundingClientRect(),
                  anchorEl: event.currentTarget,
                  mode: 'summary',
                })
              }}
            >
              {result ? (
                <>
                  <span className="fsdb-summary-label">{result.label}</span>
                  <span className="fsdb-summary-val">{result.value}</span>
                </>
              ) : (
                <span className="fsdb-summary-hint">统计</span>
              )}
            </button>
          </td>
        )
      }
      return (
        <tr
          key={node.key}
          className={`fsdb-summary-row${hasAnySummary ? ' has-values' : ''}`}
          data-testid="fsdb-summary-row"
        >
          {paintColumns.slice(0, colWindow.pin).map(paintSummaryTd)}
          {paintColPad(colWindow.padLeft, 'left')}
          {paintColumns.slice(colWindow.start, colWindow.end).map(paintSummaryTd)}
          {paintColPad(colWindow.padRight, 'right')}
          <td className="fsdb-col-fill" aria-hidden />
        </tr>
      )
    }
    if (node.kind === 'group-head') {
      return (
        <tr key={node.key} className="fsdb-group-row" data-group-key={node.groupKey}>
          <td colSpan={tablePaintRef.current.colSpan}>
            {renderGroupHead(node.groupKey, node.label)}
          </td>
        </tr>
      )
    }
    const pages = Math.max(1, Math.ceil(node.count / pageSize))
    const pageIndex = Math.min(node.pageIndex, pages - 1)
    return (
      <tr key={node.key} className="fsdb-group-pager" data-group-pager={node.groupKey}>
        <td colSpan={tablePaintRef.current.colSpan}>
          <div className="fsdb-pager">
            <span className="fsdb-pager-meta">{node.count}</span>
            <div className="fsdb-pager-nav">
              <button
                type="button"
                className="tasks-icon-btn"
                aria-label="上一页"
                disabled={pageIndex <= 0}
                onClick={() => setGroupPages((prev) => ({ ...prev, [node.groupKey]: Math.max(0, pageIndex - 1) }))}
              >
                <UiGlyph icon="chevron-left" />
              </button>
              <button
                type="button"
                className="tasks-icon-btn"
                aria-label="下一页"
                disabled={(pageIndex + 1) * pageSize >= node.count}
                onClick={() => setGroupPages((prev) => ({ ...prev, [node.groupKey]: pageIndex + 1 }))}
              >
                <UiGlyph icon="chevron-right" />
              </button>
            </div>
          </div>
        </td>
      </tr>
    )
  }

  return {
    renderGroupHead,
    paintColPad,
    paintHeadTh,
    paintTableCell,
    paintLiveCell,
    describeNativeCell,
    renderPortalCellContent,
    onNativeBoolToggle,
    renderPaintCell,
    renderPaintRow,
    tableLiveRow,
    tableRecordRow,
    tableBodyRows,
    renderPaintNode,
  }
}
