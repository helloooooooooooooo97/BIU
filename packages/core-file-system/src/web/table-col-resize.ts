import { COL_WIDTH_MAX, COL_WIDTH_MIN } from './saved-view.ts'
import { tableColWidthVar } from './table-window.ts'

export type ColumnResizeOptions = {
  handle: HTMLElement
  table: HTMLTableElement
  pinnedTable?: HTMLTableElement | null
  colKey: string
  startX: number
  pointerId: number
  snapshot: Record<string, number>
  isPinnedFirst: boolean
  minWidth?: number
  maxWidth?: number
  onStart?: () => void
  onCommit: (nextWidths: Record<string, number>) => void
}

/**
 * Resize a table column using rAF-coalesced direct DOM updates on `<col>` elements
 * (main table + docked pinned header) and commit React state once on pointerup.
 */
function escapeAttr(value: string) {
  return typeof CSS !== 'undefined' && typeof CSS.escape === 'function'
    ? CSS.escape(value)
    : value.replace(/["\\]/g, '\\$&')
}

export function startTableColumnResize({
  handle,
  table,
  pinnedTable: pinnedTableProp,
  colKey,
  startX,
  pointerId,
  snapshot,
  isPinnedFirst,
  minWidth = COL_WIDTH_MIN,
  maxWidth = COL_WIDTH_MAX,
  onStart,
  onCommit,
}: ColumnResizeOptions) {
  const origin = snapshot[colKey] ?? minWidth
  const baseTablePx = parseFloat(table.style.getPropertyValue('--fsdb-table-px')) || table.getBoundingClientRect().width || 0
  const colSelector = `colgroup col[data-col-key="${escapeAttr(colKey)}"]`
  const mainCol = table.querySelector<HTMLTableColElement>(colSelector)
  const toolbar = table.closest('.fsdb-main')?.querySelector<HTMLElement>(':scope > .tasks-toolbar') ?? null

  let latestPx = origin
  let raf = 0

  const applyDomPreview = () => {
    raf = 0
    const px = `${latestPx}px`
    const colVar = tableColWidthVar(colKey)
    if (mainCol) {
      mainCol.style.width = px
      mainCol.style.minWidth = px
      mainCol.style.maxWidth = px
    }
    const nextTablePx = Math.max(1, Math.round(baseTablePx + (latestPx - origin)))
    table.style.minWidth = `${nextTablePx}px`
    table.style.setProperty('--fsdb-table-px', `${nextTablePx}px`)
    table.style.setProperty(colVar, px)
    if (isPinnedFirst) table.style.setProperty('--fsdb-pin-title', px)

    const pinnedCandidate =
      pinnedTableProp ??
      handle.closest<HTMLTableElement>('.fsdb-pinned-head-table') ??
      toolbar?.querySelector<HTMLTableElement>('.fsdb-pinned-head-table') ??
      null
    const pinnedTable = pinnedCandidate && pinnedCandidate !== table ? pinnedCandidate : null
    if (pinnedTable) {
      const pinnedCol = pinnedTable.querySelector<HTMLTableColElement>(colSelector)
      if (pinnedCol) {
        pinnedCol.style.width = px
        pinnedCol.style.minWidth = px
        pinnedCol.style.maxWidth = px
      }
      pinnedTable.style.width = `${nextTablePx}px`
      pinnedTable.style.setProperty(colVar, px)
      if (isPinnedFirst) pinnedTable.style.setProperty('--fsdb-pin-title', px)
      const pinnedStage = pinnedTable.closest<HTMLElement>('.fsdb-pinned-head-stage')
      if (pinnedStage) pinnedStage.style.width = `calc(${nextTablePx}px + var(--fsdb-check-gutter))`
    }
  }

  try {
    handle.setPointerCapture(pointerId)
  } catch {
    /* synthetic events in tests may not have an active pointer */
  }
  onStart?.()

  const onMove = (ev: PointerEvent) => {
    const nextPx = Math.round(Math.min(maxWidth, Math.max(minWidth, origin + ev.clientX - startX)))
    if (nextPx === latestPx) return
    latestPx = nextPx
    if (!raf) raf = requestAnimationFrame(applyDomPreview)
  }

  const finish = () => {
    if (raf) {
      cancelAnimationFrame(raf)
      raf = 0
    }
    handle.removeEventListener('pointermove', onMove)
    handle.removeEventListener('pointerup', finish)
    handle.removeEventListener('pointercancel', finish)
    onCommit({ ...snapshot, [colKey]: latestPx })
  }

  handle.addEventListener('pointermove', onMove)
  handle.addEventListener('pointerup', finish)
  handle.addEventListener('pointercancel', finish)
  return finish
}
