import type {
  Dispatch,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  RefObject,
  SetStateAction,
} from 'react'
import type { CollectionSchema, DbRecord, FieldSpec } from '@biu/type-file-system'
import type { CellPopState } from './browser-cell-renderer.tsx'
import { cellUsesPop } from './cell-pop.tsx'
import { rememberPickClipboard } from '@biu/core-pick/web'
import { parseTagFlatColumnKey, readTagFlatValue, resolveFieldType, tagSourceKey } from './fields.ts'
import { buildTableSelectionPicks } from './table-pick.ts'
import { tableCursorFromCell, type TableSelectionModel } from './table-cell-selection.ts'
import { bindTableDragScroll, tableVertScroller } from './table-drag-scroll.ts'
import {
  TableEditHistory,
  tableEditHistoryKey,
  tableEditHistoryOwned,
  tableNativeUndoModifier,
} from './table-edit-history.ts'
import {
  firstTableTitleCell,
  moveTableCell,
  readTablePaneRest,
  rememberTablePaneRest,
  tableActionArrowLeave,
  tableActionButtons,
  tableActionButtonStep,
  tableCellRange,
  tableCellRangeRowIds,
  tableClearKey,
  tableCopyHotkey,
  tableCreateKey,
  tableKeyDir,
  tableKeyFromEditingTarget,
  tableNavKeys,
  tablePaneFromEvent,
  tableSendChatHotkey,
  tableTitleOpenWhere,
  tableTreeArrowAction,
  tableTypeToEditChar,
  writeClipboardText,
  type TableCellCursor,
} from './table-keys.ts'
import {
  buildTableClipboardPayload,
  buildTablePastePlan,
  formatTablePasteNotice,
  isPasteColumnWritable,
  parseClipboardMatrix,
  rememberTableClipboard,
  tableFillDownHotkey,
  type TableClipboardCell,
} from './table-paste.ts'
import { focusRecordTitleNear } from './title-content-nav.ts'
import type { TablePaintBag, TablePaintNode } from './windowed-table.tsx'

/** 与选区拖选同一阈值：位移超过这个距离只当拖，不当点击。 */
export const CELL_POP_DRAG_PX = 6
export const CELL_POP_IGNORE =
  '.fsdb-row-check, .fsdb-col-resizer, .tasks-row-tools, .tasks-title-open, .tasks-tree-toggle, .fsdb-action-btn, .tasks-row-actions, .fsdb-boolbtn, .fsdb-thumb-btn, .fsdb-thumb, .biu-image, .fsdb-file-tools, .fsdb-ref-chip, .biu-tag-wrap, .db-datetime, .biu-calendar, .fsdb-scope-detail, .fsdb-source-table'
export const CELL_RANGE_IGNORE =
  '.fsdb-row-check, .fsdb-col-resizer, .tasks-row-tools, .tasks-title-open, .tasks-tree-toggle, .fsdb-action-btn, .tasks-row-actions, .fsdb-file-tools, .fsdb-scope-detail'

export type BrowserTableNavOptions = {
  sheet: boolean
  embed: boolean
  collectionPath: string
  collectionLabel?: string
  activeViewId: string | null
  detailId: string | null
  schema?: CollectionSchema
  schemaRef: MutableRefObject<CollectionSchema | undefined>
  columns: Array<{ key: string; field: FieldSpec }>
  items: DbRecord[]
  itemsRef: MutableRefObject<DbRecord[]>
  tablePaintNodes: TablePaintNode[]
  treeKidsByParentRef: MutableRefObject<Record<string, DbRecord[]>>
  selectionModelRef: MutableRefObject<TableSelectionModel>
  tableRef: RefObject<HTMLTableElement | null>
  tableWrapRef: RefObject<HTMLDivElement | null>
  pageRef: RefObject<HTMLDivElement | null>
  tablePaintRef: MutableRefObject<TablePaintBag>
  cellAnchorRef: MutableRefObject<HTMLElement | null>
  cellPickRef: MutableRefObject<TableCellCursor | null>
  cellRangeRef: MutableRefObject<{ anchor: TableCellCursor; focus: TableCellCursor } | null>
  cellRangeSetRef: MutableRefObject<Set<string>>
  cellRepickRef: MutableRefObject<boolean>
  cellPopPtrRef: MutableRefObject<{ x: number; y: number; dragged: boolean } | null>
  tableDragScrollStopRef: MutableRefObject<(() => void) | null>
  actionHoverIndexRef: MutableRefObject<number>
  cellPop: CellPopState | null
  setCellPop: Dispatch<SetStateAction<CellPopState | null>>
  setCellPickEpoch: Dispatch<SetStateAction<number>>
  pickedIds: string[]
  setPickedIds: Dispatch<SetStateAction<string[]>>
  canCreate: boolean
  treeOn: boolean
  collapsed: Record<string, boolean>
  setCollapsed: Dispatch<SetStateAction<Record<string, boolean>>>
  recordKind: string
  tableEditHistory: TableEditHistory
  setError: Dispatch<SetStateAction<string>>
  cellFieldWritable: (field: FieldSpec) => boolean
  markCellOn: (td: HTMLElement, writable: boolean) => void
  applyCellRange: (anchor: TableCellCursor, focus: TableCellCursor, commit?: boolean) => void
  tableCellFromPoint: (x: number, y: number) => (TableCellCursor & { td: HTMLElement }) | null
  claimThisTableCell: () => void
  jumpTag: (id: string) => void
  cellValueText: (row: DbRecord, key: string, field: FieldSpec) => string
  recordPathOf: (row: DbRecord) => string
  labelOf: (row: DbRecord) => string
  openRow: (row: DbRecord) => void
  openRowSplit: (row: DbRecord) => void
  createRecord: () => Promise<void> | void
  captureTableFoldSnapshot: () => void
  loadTreeKids: (parentId: string) => Promise<void> | void
  writeCellValue: (row: DbRecord, key: string, field: FieldSpec, next: unknown) => void
  writeBatchCellValues: (
    mutations: Array<{ row: DbRecord; key: string; field: FieldSpec; value: unknown }>,
  ) => Promise<void> | void
  flashNotice?: (message: string) => void
}

export function createBrowserTableNav(opts: BrowserTableNavOptions) {
  const {
    sheet,
    embed,
    collectionPath,
    collectionLabel,
    activeViewId,
    detailId,
    schema,
    schemaRef,
    columns,
    items,
    itemsRef,
    tablePaintNodes,
    treeKidsByParentRef,
    selectionModelRef,
    tableRef,
    tableWrapRef,
    pageRef,
    tablePaintRef,
    cellAnchorRef,
    cellPickRef,
    cellRangeRef,
    cellRangeSetRef,
    cellRepickRef,
    cellPopPtrRef,
    tableDragScrollStopRef,
    actionHoverIndexRef,
    cellPop,
    setCellPop,
    setCellPickEpoch,
    pickedIds,
    setPickedIds,
    canCreate,
    treeOn,
    collapsed,
    setCollapsed,
    recordKind,
    tableEditHistory,
    setError,
    cellFieldWritable,
    markCellOn,
    applyCellRange,
    tableCellFromPoint,
    claimThisTableCell,
    jumpTag,
    cellValueText,
    recordPathOf,
    labelOf,
    openRow,
    openRowSplit,
    createRecord,
    captureTableFoldSnapshot,
    loadTreeKids,
    writeCellValue,
    writeBatchCellValues,
    flashNotice,
  } = opts

  function tableCellFromEvent(
    event: { target: EventTarget | null; currentTarget: EventTarget },
    ignore = CELL_POP_IGNORE,
  ) {
    const hit = event.target as HTMLElement | null
    if (hit?.closest(ignore)) return null
    const table = event.currentTarget as HTMLElement
    const td = hit?.closest('td')
    if (!td || !table.contains(td)) return null
    const id = td.closest('tr')?.dataset.recordId
    const key = td.dataset.colKey
    if (!id || !key) return null
    const cursor = tableCursorFromCell(td)
    return cursor ? { td, ...cursor } : null
  }

  function onTablePointerDown(event: ReactPointerEvent<HTMLTableElement>) {
    if (event.button !== 0) return
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('pick-mode')) return
    const cell = tableCellFromEvent(event, CELL_RANGE_IGNORE)
    if (!cell) return
    const focus = { id: cell.id, key: cell.key, rowKey: cell.rowKey }
    const shifting = event.shiftKey && Boolean(cellRangeRef.current || cellPickRef.current)
    const anchor = shifting ? (cellRangeRef.current?.anchor ?? cellPickRef.current ?? focus) : focus
    cellAnchorRef.current = cell.td
    cellRepickRef.current =
      !shifting &&
      cellPickRef.current?.id === cell.id &&
      cellPickRef.current?.key === cell.key &&
      cellPickRef.current?.rowKey === cell.rowKey
    applyCellRange(anchor, focus)
    claimThisTableCell()
    const tableEl = event.currentTarget
    const pointerId = event.pointerId
    tableRef.current?.focus({ preventScroll: true })
    cellPopPtrRef.current = { x: event.clientX, y: event.clientY, dragged: false }
    tableRef.current?.classList.remove('is-cell-drag')
    tableDragScrollStopRef.current?.()
    tableDragScrollStopRef.current = bindTableDragScroll({
      scroller: () => tableVertScroller(tableWrapRef.current),
      headBottom: () =>
        (
          tableVertScroller(tableWrapRef.current)?.querySelector<HTMLElement>('.fsdb-pinned-head-viewport') ??
          tableRef.current?.tHead
        )?.getBoundingClientRect().bottom,
      overlayTop: () => {
        const overlay = document.querySelector('[data-testid="chat-overlay-panel"]')
        return overlay instanceof HTMLElement ? overlay.getBoundingClientRect().top : undefined
      },
      origin: { x: event.clientX, y: event.clientY },
      dragPx: CELL_POP_DRAG_PX,
      selectText: false,
      onArmed: () => {
        if (cellPopPtrRef.current) cellPopPtrRef.current.dragged = true
        tableRef.current?.classList.add('is-cell-drag')
        setCellPop(null)
        try {
          tableEl.setPointerCapture(pointerId)
        } catch {
          /* 捕获失败时仍用 window pointermove */
        }
      },
      onDrag: (ptr) => {
        const hit = tableCellFromPoint(ptr.x, ptr.y)
        if (!hit) return
        const cur = cellRangeRef.current
        if (cur?.focus.id === hit.id && cur.focus.key === hit.key && cur.focus.rowKey === hit.rowKey) return
        applyCellRange(cur?.anchor ?? focus, { id: hit.id, key: hit.key, rowKey: hit.rowKey }, false)
      },
      onEnd: () => {
        tableRef.current?.classList.remove('is-cell-drag')
        const cur = cellRangeRef.current
        if (cur) applyCellRange(cur.anchor, cur.focus)
      },
    })
  }

  function onTablePointerMove(event: ReactPointerEvent<HTMLTableElement>) {
    const start = cellPopPtrRef.current
    if (!start || start.dragged) return
    if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < CELL_POP_DRAG_PX) return
    start.dragged = true
    setCellPop(null)
  }

  function onTableClick(event: { target: EventTarget | null; currentTarget: EventTarget; clientX: number; clientY: number }) {
    const cell = tableCellFromEvent(event)
    const start = cellPopPtrRef.current
    cellPopPtrRef.current = null
    if (!cell || start?.dragged) return
    if (start && Math.hypot(event.clientX - start.x, event.clientY - start.y) >= CELL_POP_DRAG_PX) return
    const col = columns.find((item) => item.key === cell.key)
    if (!col) return
    const kind = resolveFieldType(col.field)
    if (kind === 'tag') {
      const tagId = (event.target as HTMLElement | null)?.closest('[data-tag-id]')?.getAttribute('data-tag-id')?.trim()
      if (tagId) {
        jumpTag(tagId)
        return
      }
    }
    if (!cellRepickRef.current) {
      setCellPop(null)
      return
    }
    setCellPop(cellUsesPop(kind, col.field.writable) ? { id: cell.id, key: cell.key, rowKey: cell.rowKey } : null)
  }

  function onTableContextMenu(event: ReactMouseEvent<HTMLTableElement>) {
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('pick-mode')) return
    const range = cellRangeRef.current
    if (!range) return
    const cells = tableCellRange(
      tableNavRowIds(),
      tableNavKeys(columns),
      range.anchor,
      range.focus,
      selectionModelRef.current.rowKeys,
    )
    if (cells.length < 2) return
    const ids = tableCellRangeRowIds(cells)
    if (!ids.length) return
    event.preventDefault()
    event.stopPropagation()
    setPickedIds(ids)
    setCellPop(null)
  }

  function tableNavRowIds() {
    return selectionModelRef.current.rowIds
  }

  function findPaintedRow(id: string) {
    const node = tablePaintNodes.find((item) => item.kind === 'row' && item.row.id === id)
    if (node?.kind === 'row') return node.row
    const listed = items.find((item) => item.id === id) ?? itemsRef.current.find((item) => item.id === id)
    if (listed) return listed
    for (const kids of Object.values(treeKidsByParentRef.current)) {
      const hit = kids.find((item) => item.id === id)
      if (hit) return hit
    }
    return undefined
  }

  function findPaintedCellTd(id: string, key: string, rowKey?: string) {
    const table = tableRef.current
    if (!table) return null
    const row = rowKey ? `tr[data-row-key="${CSS.escape(rowKey)}"]` : `tr[data-record-id="${CSS.escape(id)}"]`
    return table.querySelector(`${row} td[data-col-key="${CSS.escape(key)}"]`) as HTMLElement | null
  }

  function hoverActionCell(td: HTMLElement | null, index = 0) {
    const btns = tableActionButtons(td)
    if (!btns.length) return
    const i = Math.max(0, Math.min(index, btns.length - 1))
    actionHoverIndexRef.current = i
    btns[i]?.focus()
  }

  function revealTableCell(next: TableCellCursor, extend = false) {
    if (extend && (cellRangeRef.current || cellPickRef.current)) {
      applyCellRange(cellRangeRef.current?.anchor ?? cellPickRef.current ?? next, next)
    } else {
      applyCellRange(next, next)
    }
    claimThisTableCell()
    tablePaintRef.current.revealRow?.(next.id, next.rowKey ?? cellPickRef.current?.rowKey)
    tablePaintRef.current.revealColumn?.(next.key)
    const immediate = findPaintedCellTd(next.id, next.key, next.rowKey)
    if (immediate) {
      const col = columns.find((item) => item.key === next.key)
      cellAnchorRef.current = immediate
      if (!extend && cellRangeSetRef.current.size <= 1) markCellOn(immediate, col ? cellFieldWritable(col.field) : false)
    }
    let attempts = 0
    const apply = () => {
      if (
        cellPickRef.current?.id !== next.id ||
        cellPickRef.current.key !== next.key ||
        (next.rowKey && cellPickRef.current.rowKey !== next.rowKey)
      ) {
        return
      }
      const td = findPaintedCellTd(next.id, next.key, next.rowKey)
      if (!td) {
        if (attempts++ < 12) requestAnimationFrame(apply)
        return
      }
      const col = columns.find((item) => item.key === next.key)
      cellAnchorRef.current = td
      if (!extend && cellRangeSetRef.current.size <= 1) markCellOn(td, col ? cellFieldWritable(col.field) : false)
      const wrap = tableWrapRef.current
      const page = tableVertScroller(wrap)
      if (!wrap || !page) return
      const rect = td.getBoundingClientRect()
      const bounds = page.getBoundingClientRect()
      const docked = page.querySelector<HTMLElement>('.fsdb-pinned-head-viewport')
      const top = Math.max(bounds.top, (docked ?? tableRef.current?.tHead)?.getBoundingClientRect().bottom ?? bounds.top)
      if (rect.top < top) page.scrollTop += rect.top - top
      else if (rect.bottom > bounds.bottom) page.scrollTop += rect.bottom - bounds.bottom
      if (!td.classList.contains('is-pin-col')) {
        const viewport = wrap.getBoundingClientRect()
        const pinned = Array.from(tableRef.current?.querySelectorAll<HTMLElement>('thead th.is-pin-col') ?? [])
        const left = Math.max(viewport.left, ...pinned.map((head) => head.getBoundingClientRect().right))
        if (rect.left < left) wrap.scrollLeft += rect.left - left
        else if (rect.right > viewport.right) wrap.scrollLeft += rect.right - viewport.right
      }
    }
    if (immediate) apply()
    else requestAnimationFrame(apply)
  }

  function enterTableCell(cursor: TableCellCursor, seed?: string, attempt = 0) {
    const col = columns.find((item) => item.key === cursor.key)
    if (!col) return
    const kind = resolveFieldType(col.field)
    const td = findPaintedCellTd(cursor.id, cursor.key, cursor.rowKey)
    if (!td) {
      if (attempt < 12) {
        tablePaintRef.current.revealRow?.(cursor.id, cursor.rowKey)
        tablePaintRef.current.revealColumn?.(cursor.key)
        requestAnimationFrame(() => {
          if (
            cellPickRef.current?.id === cursor.id &&
            cellPickRef.current.key === cursor.key &&
            (!cursor.rowKey || cellPickRef.current.rowKey === cursor.rowKey)
          ) {
            enterTableCell(cursor, seed, attempt + 1)
          }
        })
      }
      return
    }
    cellAnchorRef.current = td
    if (kind === 'boolean' && col.field.writable) {
      const btn = td?.querySelector('button') as HTMLElement | null
      btn?.click()
      return
    }
    if (cursor.key === 'actions' || kind === 'action') {
      hoverActionCell(td, 0)
      return
    }
    if (cellUsesPop(kind, col.field.writable)) {
      setCellPop({ id: cursor.id, key: cursor.key, rowKey: cursor.rowKey, ...(seed ? { seed } : {}) })
    }
  }

  function landTableCell(next: TableCellCursor, extend = false) {
    revealTableCell(next, extend)
    if (next.key === 'actions') {
      requestAnimationFrame(() => enterTableCell(next))
      return
    }
    tableRef.current?.focus({ preventScroll: true })
  }

  function tablePaneOwnsFocus(pane: ReturnType<typeof tablePaneFromEvent>) {
    if (sheet || !pane) return false
    if (pane === 'inspector') return Boolean(embed)
    return !embed
  }

  function inspectorTableIsActive() {
    const root = tableRef.current ?? pageRef.current
    if (!root) return false
    const host = root.closest('.session-inspector')
    if (host instanceof HTMLElement && (host.classList.contains('is-closed') || host.hasAttribute('inert'))) return false
    const stage = root.closest('.inspector-stage-pane')
    if (stage instanceof HTMLElement && !stage.classList.contains('is-active')) return false
    return true
  }

  function panePlace() {
    return { path: collectionPath, viewId: activeViewId ?? '', detailId: detailId ?? '' }
  }

  function rememberThisPaneRest() {
    if (sheet) return
    const pane = embed ? 'inspector' : 'main'
    const place = panePlace()
    const pick = cellPickRef.current
    if (pick && !detailId) {
      rememberTablePaneRest(pane, { kind: 'cell', path: place.path, viewId: place.viewId, id: pick.id, key: pick.key })
      return
    }
    const active = typeof document !== 'undefined' ? document.activeElement : null
    if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) {
      if (pageRef.current?.contains(active) && active.classList.contains('fsdb-detail-title-input')) {
        rememberTablePaneRest(pane, {
          kind: 'title',
          path: place.path,
          viewId: place.viewId,
          detailId: place.detailId,
          start: active.selectionStart ?? active.value.length,
          end: active.selectionEnd ?? active.value.length,
        })
        return
      }
    }
    if (
      active instanceof HTMLElement &&
      pageRef.current?.contains(active) &&
      active.closest('.tiptap, .page-editor, [data-testid="page-editor"]')
    ) {
      rememberTablePaneRest(pane, { kind: 'content', path: place.path, viewId: place.viewId, detailId: place.detailId })
    }
  }

  function landFirstTableCell(editTitle = false) {
    const pane = embed ? 'inspector' : 'main'
    if (!tablePaneOwnsFocus(pane)) return false
    if (embed && !inspectorTableIsActive()) return false
    const keys = tableNavKeys(columns)
    const ids = tableNavRowIds()
    const next = firstTableTitleCell(ids, keys, schema?.labelField, selectionModelRef.current.rowKeys)
    if (!next) {
      tableRef.current?.focus({ preventScroll: true })
      return Boolean(tableRef.current)
    }
    landTableCell(next)
    if (editTitle) requestAnimationFrame(() => enterTableCell(next))
    return true
  }

  function landPaneSurface() {
    const pane = embed ? 'inspector' : 'main'
    if (!tablePaneOwnsFocus(pane)) return false
    if (embed && !inspectorTableIsActive()) return false
    claimThisTableCell()
    const rest = readTablePaneRest(pane, panePlace())
    if (rest?.kind === 'cell' && !detailId) {
      const keys = tableNavKeys(columns)
      const ids = tableNavRowIds()
      if (ids.includes(rest.id) && keys.includes(rest.key)) {
        landTableCell({ id: rest.id, key: rest.key })
        return true
      }
    }
    if (rest?.kind === 'title' && focusRecordTitleNear(pageRef.current)) {
      const el = pageRef.current?.querySelector<HTMLTextAreaElement | HTMLInputElement>('.fsdb-detail-title-input')
      if (el) {
        const n = el.value.length
        try {
          el.setSelectionRange(Math.min(rest.start, n), Math.min(rest.end, n))
        } catch {
          /* ignore */
        }
      }
      return true
    }
    if (rest?.kind === 'content') {
      const editor = pageRef.current?.querySelector<HTMLElement>('.tiptap, [data-testid="page-editor"]')
      if (editor) {
        editor.focus()
        return true
      }
    }
    if (!detailId && landFirstTableCell(false)) return true
    if (focusRecordTitleNear(pageRef.current)) return true
    const editor = pageRef.current?.querySelector<HTMLElement>('.tiptap, [data-testid="page-editor"]')
    if (editor) {
      editor.focus()
      return true
    }
    if (landFirstTableCell(false)) return true
    pageRef.current?.focus?.({ preventScroll: true } as FocusOptions)
    return Boolean(pageRef.current)
  }

  function landCreatedTitleCell(rowId: string) {
    const keys = tableNavKeys(columns)
    const label = schemaRef.current?.labelField
    const key = label && keys.includes(label) ? label : keys[0]
    if (!key) return
    const cursor = { id: rowId, key }
    cellPickRef.current = cursor
    setCellPickEpoch((n) => n + 1)
    requestAnimationFrame(() => {
      landTableCell(cursor)
    })
  }

  function sendSelectedCellToChat() {
    const live = typeof document !== 'undefined' ? document.activeElement : null
    if (
      live instanceof Element &&
      live.closest('.page-editor, .composer, .chat-composer-dock, .app-side-bar, .tasks-search-wrap')
    ) {
      return false
    }
    const range = cellRangeRef.current
    const cursors = range
      ? tableCellRange(
          tableNavRowIds(),
          tableNavKeys(columns),
          range.anchor,
          range.focus,
          selectionModelRef.current.rowKeys,
        )
      : cellPop || cellPickRef.current
        ? [cellPop ?? cellPickRef.current!]
        : []
    const picks = buildTableSelectionPicks({
      cursors,
      recordKind,
      collectionPath,
      collectionLabel,
      route: typeof window === 'undefined' ? '' : window.location.pathname,
      readCell: (cursor) => {
        const row = findPaintedRow(cursor.id)
        const col = columns.find((item) => item.key === cursor.key)
        if (!row || !col) return null
        const stored = cellValueText(row, cursor.key, col.field)
        const isFocus =
          cellPickRef.current?.id === cursor.id &&
          cellPickRef.current.key === cursor.key &&
          (!cursor.rowKey || cellPickRef.current.rowKey === cursor.rowKey)
        const draft =
          isFocus && (live instanceof HTMLInputElement || live instanceof HTMLTextAreaElement)
            ? live.value
            : isFocus && live instanceof HTMLElement && live.isContentEditable
              ? live.innerText
              : ''
        const sel = typeof window !== 'undefined' ? window.getSelection() : null
        const selected = isFocus && sel && !sel.isCollapsed ? sel.toString().trim() : ''
        const inCell = Boolean(
          live instanceof Element && live.closest('.fsdb-cell-pop, td.is-cell-on, .tasks-table'),
        )
        const text = (isFocus && inCell ? draft.trim() : '') || stored
        return {
          id: row.id,
          path: recordPathOf(row),
          title: labelOf(row),
          field: cursor.key,
          label: col.field.label ?? cursor.key,
          type: resolveFieldType(col.field),
          text,
          ...(inCell && selected ? { selection: selected } : {}),
        }
      },
    })
    if (!picks.length) return false
    void import('@biu/core-pick/web').then((mod) => {
      mod.getPick()?.attach(picks)
    })
    return true
  }

  function sendPickedRowsToChat() {
    const picks = pickedIds.flatMap((id) => {
      const row = findPaintedRow(id)
      if (!row) return []
      const path = recordPathOf(row)
      const title = labelOf(row)
      return [
        {
          kind: recordKind,
          id: row.id,
          label: title || recordKind,
          route: typeof window === 'undefined' ? '' : window.location.pathname,
          ...(path ? { path } : {}),
          ...(title ? { title } : {}),
        },
      ]
    })
    if (!picks.length) return false
    void import('@biu/core-pick/web').then((mod) => {
      mod.getPick()?.attach(picks)
    })
    return true
  }

  function sendTableSelectionToChat() {
    if (pickedIds.length) return sendPickedRowsToChat()
    return sendSelectedCellToChat()
  }

  function readCellRawValue(row: DbRecord, key: string) {
    if (parseTagFlatColumnKey(key)) {
      return readTagFlatValue(row, key, tagSourceKey(schemaRef.current ?? schema))
    }
    return row[key]
  }

  function navPasteColumns() {
    const keys = tableNavKeys(columns)
    const byKey = new Map(columns.map((col) => [col.key, col]))
    return keys.map((key) => byKey.get(key)).filter((col): col is { key: string; field: FieldSpec } => Boolean(col))
  }

  function currentSelectionRange(): { anchor: TableCellCursor; focus: TableCellCursor } | null {
    if (cellRangeRef.current) return cellRangeRef.current
    if (cellPickRef.current) return { anchor: cellPickRef.current, focus: cellPickRef.current }
    return null
  }

  function copySelectedTableCells(target: EventTarget | null) {
    if (detailId || cellPop) return false
    const hit = target instanceof Element ? target : null
    const page = hit?.closest('.fsdb-page') ?? null
    if (page && page !== pageRef.current) return false
    const live = typeof document !== 'undefined' ? document.activeElement : null
    if (
      live instanceof Element &&
      live.closest('.page-editor, .composer, .chat-composer-dock, .app-side-bar, .tasks-search-wrap')
    ) {
      return false
    }
    const sel = typeof window !== 'undefined' ? window.getSelection() : null
    if (sel && !sel.isCollapsed && sel.toString().length > 0) return false
    const range = cellRangeRef.current
    const cursors = range
      ? tableCellRange(
          tableNavRowIds(),
          tableNavKeys(columns),
          range.anchor,
          range.focus,
          selectionModelRef.current.rowKeys,
        )
      : cellPickRef.current
        ? [cellPickRef.current]
        : []
    if (!cursors.length) return false
    const payload = buildTableClipboardPayload(cursors, (cursor) => {
      const row = findPaintedRow(cursor.id)
      const col = columns.find((item) => item.key === cursor.key)
      if (!row || !col) return null
      const readonly = !isPasteColumnWritable(col, cellFieldWritable)
      if (cursor.key === 'actions') {
        return { text: '', raw: undefined, fieldType: 'action', fieldKey: cursor.key, readonly: true, empty: true }
      }
      const text = cellValueText(row, cursor.key, col.field)
      const raw = readCellRawValue(row, cursor.key)
      const kind = resolveFieldType(col.field)
      const empty =
        raw === null ||
        raw === undefined ||
        raw === '' ||
        (Array.isArray(raw) && raw.length === 0) ||
        (kind !== 'boolean' && text.trim() === '')
      return { text, raw, fieldType: kind, fieldKey: cursor.key, readonly, empty }
    })
    if (!payload) return false
    const copiedPicks = buildTableSelectionPicks({
      cursors,
      recordKind,
      collectionPath,
      collectionLabel,
      route: typeof window === 'undefined' ? '' : window.location.pathname,
      readCell: (cursor) => {
        const row = findPaintedRow(cursor.id)
        const col = columns.find((item) => item.key === cursor.key)
        if (!row || !col) return null
        return {
          id: row.id,
          path: recordPathOf(row),
          title: labelOf(row),
          field: cursor.key,
          label: col.field.label ?? cursor.key,
          type: resolveFieldType(col.field),
          text: cellValueText(row, cursor.key, col.field),
        }
      },
    })
    rememberTableClipboard(payload)
    rememberPickClipboard(payload.plain, copiedPicks)
    writeClipboardText(payload.plain)
    return true
  }

  function applySourceMatrixToSelection(
    sourceMatrix: TableClipboardCell[][],
    selection: { anchor: TableCellCursor; focus: TableCellCursor },
    verb: '粘贴' | '填充' | '清空',
  ) {
    const plan = buildTablePastePlan({
      sourceMatrix,
      rowIds: tableNavRowIds(),
      rowKeys: selectionModelRef.current.rowKeys,
      columns: navPasteColumns(),
      selection,
      findRow: findPaintedRow,
      readCurrentValue: (row, key) => readCellRawValue(row, key),
      cellFieldWritable,
    })
    if (plan.appliedRange) {
      applyCellRange(plan.appliedRange.anchor, plan.appliedRange.focus)
    }
    if (plan.mutations.length) {
      void writeBatchCellValues(plan.mutations)
    }
    const msg = formatTablePasteNotice(plan.stats, verb)
    if (msg) flashNotice?.(msg)
    return plan.stats.totalTargetCells > 0
  }

  function onTablePaste(event: ClipboardEvent) {
    if (event.defaultPrevented) return false
    if (detailId || cellPop) return false
    if (tableKeyFromEditingTarget(event.target)) return false
    const hit = event.target instanceof Element ? event.target : null
    const page = hit?.closest('.fsdb-page') ?? null
    if (page && page !== pageRef.current) return false
    const live = typeof document !== 'undefined' ? document.activeElement : null
    if (
      live instanceof Element &&
      (tableKeyFromEditingTarget(live) ||
        live.closest('.page-editor, .composer, .chat-composer-dock, .app-side-bar, .tasks-search-wrap'))
    ) {
      return false
    }
    const selection = currentSelectionRange()
    if (!selection) return false
    const plain = event.clipboardData?.getData('text/plain') ?? ''
    const html = event.clipboardData?.getData('text/html') ?? ''
    const matrix = parseClipboardMatrix({ plain, html })
    if (!matrix.length) return false
    event.preventDefault()
    return applySourceMatrixToSelection(matrix, selection, '粘贴')
  }

  function fillDownSelectedTableCells() {
    if (detailId || cellPop) return false
    const selection = currentSelectionRange()
    if (!selection) return false
    const rowIds = tableNavRowIds()
    const rowKeys = selectionModelRef.current.rowKeys
    const cols = navPasteColumns()
    const colKeys = cols.map((col) => col.key)
    const locateRow = (cursor: TableCellCursor) =>
      rowKeys && cursor.rowKey ? rowKeys.indexOf(cursor.rowKey) : rowIds.indexOf(cursor.id)
    const r1 = locateRow(selection.anchor)
    const r2 = locateRow(selection.focus)
    const c1 = colKeys.indexOf(selection.anchor.key)
    const c2 = colKeys.indexOf(selection.focus.key)
    if (r1 < 0 || r2 < 0 || c1 < 0 || c2 < 0) return false

    const rMin = Math.min(r1, r2)
    const rMax = Math.max(r1, r2)
    const cMin = Math.min(c1, c2)
    const cMax = Math.max(c1, c2)

    const sourceRowIdx = rMin === rMax ? rMin - 1 : rMin
    const targetRStart = rMin === rMax ? rMin : rMin + 1
    if (sourceRowIdx < 0 || targetRStart > rMax) return false
    const sourceRowId = rowIds[sourceRowIdx]
    const sourceRow = sourceRowId ? findPaintedRow(sourceRowId) : undefined
    if (!sourceRow) return false

    const sourceRowCells: TableClipboardCell[] = []
    for (let c = cMin; c <= cMax; c += 1) {
      const col = cols[c]!
      const readonly = !isPasteColumnWritable(col, cellFieldWritable)
      if (col.key === 'actions') {
        sourceRowCells.push({ text: '', raw: undefined, fieldType: 'action', fieldKey: col.key, readonly: true, empty: true, fromInternal: true })
        continue
      }
      const text = cellValueText(sourceRow, col.key, col.field)
      const raw = readCellRawValue(sourceRow, col.key)
      const kind = resolveFieldType(col.field)
      const empty =
        raw === null ||
        raw === undefined ||
        raw === '' ||
        (Array.isArray(raw) && raw.length === 0) ||
        (kind !== 'boolean' && text.trim() === '')
      sourceRowCells.push({ text, raw, fieldType: kind, fieldKey: col.key, readonly, empty, fromInternal: true })
    }

    const makeCursor = (r: number, c: number): TableCellCursor => ({
      id: rowIds[r]!,
      key: colKeys[c]!,
      ...(rowKeys?.[r] ? { rowKey: rowKeys[r] } : {}),
    })

    return applySourceMatrixToSelection(
      [sourceRowCells],
      { anchor: makeCursor(targetRStart, cMin), focus: makeCursor(rMax, cMax) },
      '填充',
    )
  }

  function clearSelectedTableCells() {
    const selection = currentSelectionRange()
    if (!selection) return false
    return applySourceMatrixToSelection(
      [[{ text: '', raw: null, empty: true, fromInternal: false }]],
      selection,
      '清空',
    )
  }

  function submitCellPopValue(row: DbRecord, key: string, field: FieldSpec, next: unknown) {
    const range = cellRangeRef.current
    if (range) {
      const cursors = tableCellRange(
        tableNavRowIds(),
        tableNavKeys(columns),
        range.anchor,
        range.focus,
        selectionModelRef.current.rowKeys,
      )
      const sameSingleColumn = cursors.length > 1 && cursors.every((c) => c.key === key)
      if (sameSingleColumn && isPasteColumnWritable({ key, field }, cellFieldWritable)) {
        const seen = new Set<string>()
        const mutations: Array<{ row: DbRecord; key: string; field: FieldSpec; value: unknown }> = []
        for (const cursor of cursors) {
          if (seen.has(cursor.id)) continue
          seen.add(cursor.id)
          const targetRow = findPaintedRow(cursor.id)
          if (targetRow) mutations.push({ row: targetRow, key, field, value: next })
        }
        if (mutations.length > 1) {
          void writeBatchCellValues(mutations)
          flashNotice?.(`已批量更新 ${mutations.length} 个单元格`)
          return
        }
      }
    }
    writeCellValue(row, key, field, next)
  }

  function onTableKeyDown(event: {
    key: string
    shiftKey: boolean
    metaKey: boolean
    ctrlKey: boolean
    altKey: boolean
    defaultPrevented: boolean
    target: EventTarget | null
    preventDefault: () => void
    isComposing?: boolean
  }) {
    if (event.defaultPrevented) return
    if (tableSendChatHotkey(event)) {
      if (sendTableSelectionToChat()) event.preventDefault()
      return
    }
    const historyAction = tableEditHistoryKey(event)
    if (historyAction) {
      const hit = event.target instanceof Element ? event.target : null
      const page = hit?.closest('.fsdb-page') ?? null
      const field = event.target instanceof HTMLElement ? event.target : null
      const apple = typeof navigator !== 'undefined' && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)
      const owned = tableEditHistoryOwned({
        inCellPop: Boolean(hit?.closest('.fsdb-cell-pop')),
        cellPopOpen: Boolean(cellPop),
        inThisTable: Boolean(hit && page === pageRef.current && hit.closest('.tasks-table')),
        foreignPage: Boolean(page && page !== pageRef.current),
        foreignEditor: Boolean(hit?.closest('.page-editor, .composer, .chat-composer-dock, .app-side-bar, .tasks-search-wrap')),
        inDialog: Boolean(hit?.closest('dialog, [role="dialog"], [role="menu"], [role="listbox"]')),
        nativeField: Boolean(
          field && (field.tagName === 'INPUT' || field.tagName === 'TEXTAREA' || field.tagName === 'SELECT' || field.isContentEditable),
        ),
        nativeUndoModifier: tableNativeUndoModifier(event, apple),
        hasCell: Boolean(cellPickRef.current || cellRangeRef.current),
      })
      if (!owned) {
        if (tableKeyFromEditingTarget(event.target)) return
      } else {
        event.preventDefault()
        void tableEditHistory[historyAction]().catch((err) => setError(String(err)))
        return
      }
    }
    if (tableKeyFromEditingTarget(event.target)) return
    if (tableCopyHotkey(event)) {
      if (copySelectedTableCells(event.target)) event.preventDefault()
      return
    }
    if (tableFillDownHotkey(event)) {
      if (fillDownSelectedTableCells()) event.preventDefault()
      return
    }
    const titleCursor = cellPickRef.current
    const titleOpen = titleCursor
      ? tableTitleOpenWhere({
          key: event.key,
          shift: event.shiftKey,
          meta: event.metaKey,
          ctrl: event.ctrlKey,
          alt: event.altKey,
          labelKey: schema?.labelField,
          cellKey: titleCursor.key,
        })
      : null
    if (titleOpen && titleCursor) {
      event.preventDefault()
      const row = findPaintedRow(titleCursor.id)
      if (row) {
        if (titleOpen === 'inspector') openRowSplit(row)
        else openRow(row)
      }
      return
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return
    if (!cellPickRef.current) return
    const table = tableRef.current
    const hit = event.target instanceof Element ? event.target : null
    if (hit && table && !table.contains(hit) && hit !== table) {
      if (tableKeyFromEditingTarget(hit)) return
      if (hit.closest('input, textarea, select, [contenteditable="true"], [role="textbox"], .composer, .page-editor, .app-side-bar')) return
    }
    const actionBtn = hit instanceof Element ? hit.closest('td[data-col-key="actions"] button, td[data-col-key="actions"] [role="button"]') : null
    if (event.key === 'Escape') {
      if (cellPop) {
        event.preventDefault()
        setCellPop(null)
        table?.focus({ preventScroll: true })
      } else if (actionBtn instanceof HTMLElement) {
        event.preventDefault()
        table?.focus({ preventScroll: true })
      }
      return
    }
    if (tableCreateKey({ key: event.key, shift: event.shiftKey, meta: event.metaKey, ctrl: event.ctrlKey, alt: event.altKey })) {
      if (!canCreate) return
      event.preventDefault()
      void createRecord()
      return
    }
    if (actionBtn instanceof HTMLElement && table?.contains(actionBtn) && (event.key === 'Enter' || event.key === ' ')) return
    if (cellPop || (hit && tableKeyFromEditingTarget(hit) && hit !== table && !table?.contains(hit))) return
    if (hit && table?.contains(hit) && tableKeyFromEditingTarget(hit)) return
    const dir = tableKeyDir(event.key, event.shiftKey)
    if (
      actionBtn instanceof HTMLElement &&
      table?.contains(actionBtn) &&
      !event.shiftKey &&
      (event.key === 'ArrowLeft' || event.key === 'ArrowRight')
    ) {
      const td = actionBtn.closest('td')
      const btns = tableActionButtons(td)
      const index = btns.indexOf(actionBtn)
      if (!tableActionArrowLeave(btns.length, Math.max(0, index), dir === 'left' ? 'left' : 'right')) {
        event.preventDefault()
        hoverActionCell(td, tableActionButtonStep(btns.length, Math.max(0, index), dir === 'left' ? 'left' : 'right'))
        return
      }
    }
    if (dir) {
      event.preventDefault()
      const cursor = cellPickRef.current
      if (cursor && event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
        const node = tablePaintNodes.find((item) => item.kind === 'row' && item.row.id === cursor.id)
        const fold = tableTreeArrowAction(dir, {
          shift: true,
          treeOn,
          labelKey: schema?.labelField,
          cellKey: cursor.key,
          hasKids: node?.kind === 'row' ? node.hasKids : false,
          collapsed: collapsed[cursor.id] !== false,
        })
        if (fold === 'expand') {
          captureTableFoldSnapshot()
          setCollapsed((prev) => ({ ...prev, [cursor.id]: false }))
          void loadTreeKids(String(cursor.id))
        } else if (fold === 'collapse') {
          captureTableFoldSnapshot()
          setCollapsed((prev) => ({ ...prev, [cursor.id]: true }))
        }
        table?.focus({ preventScroll: true })
        return
      }
      const keys = tableNavKeys(columns)
      const next = moveTableCell(tableNavRowIds(), keys, cursor, dir, selectionModelRef.current.rowKeys)
      if (next) landTableCell(next, event.shiftKey)
      else table?.focus({ preventScroll: true })
      return
    }
    const cursor = cellPickRef.current
    if (!cursor) return
    if (event.key === 'Enter') {
      event.preventDefault()
      enterTableCell(cursor)
      return
    }
    if (tableClearKey(event.key)) {
      const range = cellRangeRef.current
      const rangeSize = range
        ? tableCellRange(
            tableNavRowIds(),
            tableNavKeys(columns),
            range.anchor,
            range.focus,
            selectionModelRef.current.rowKeys,
          ).length
        : 1
      if (rangeSize > 1) {
        if (clearSelectedTableCells()) event.preventDefault()
        return
      }
      const col = columns.find((item) => item.key === cursor.key)
      if (!col || !isPasteColumnWritable(col, cellFieldWritable)) return
      if (clearSelectedTableCells()) event.preventDefault()
      return
    }
    const col = columns.find((item) => item.key === cursor.key)
    if (!col || !cellFieldWritable(col.field)) return
    const typed = tableTypeToEditChar(event.key, resolveFieldType(col.field))
    if (!typed) return
    event.preventDefault()
    enterTableCell(cursor, typed)
  }

  return {
    tableCellFromEvent,
    onTablePointerDown,
    onTablePointerMove,
    onTableClick,
    onTableContextMenu,
    tableNavRowIds,
    findPaintedRow,
    findPaintedCellTd,
    hoverActionCell,
    revealTableCell,
    enterTableCell,
    landTableCell,
    tablePaneOwnsFocus,
    inspectorTableIsActive,
    panePlace,
    rememberThisPaneRest,
    landPaneSurface,
    landCreatedTitleCell,
    landFirstTableCell,
    sendSelectedCellToChat,
    sendPickedRowsToChat,
    sendTableSelectionToChat,
    copySelectedTableCells,
    onTablePaste,
    fillDownSelectedTableCells,
    submitCellPopValue,
    onTableKeyDown,
  }
}
