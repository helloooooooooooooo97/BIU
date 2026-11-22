import type { PointerEvent as ReactPointerEvent } from 'react'

export type ColumnDropSide = 'before' | 'after'

export function computeReorderedColumns(
  keys: readonly string[],
  fromKey: string,
  targetKey: string,
  side: ColumnDropSide,
): string[] | null {
  if (!fromKey || !targetKey || fromKey === targetKey) return null
  const fromIdx = keys.indexOf(fromKey)
  if (fromIdx < 0 || !keys.includes(targetKey)) return null
  const without = keys.filter((key) => key !== fromKey)
  const targetIdx = without.indexOf(targetKey)
  if (targetIdx < 0) return null
  const insertAt = side === 'before' ? targetIdx : targetIdx + 1
  const next = [...without.slice(0, insertAt), fromKey, ...without.slice(insertAt)]
  if (next.length === keys.length && next.every((key, index) => key === keys[index])) return null
  return next
}

export type TableColumnDragOptions = {
  colKey: string
  getColumnKeys: () => string[]
  onReorder: (next: string[]) => void
}

const DRAG_THRESHOLD_PX = 6

export function startTableColumnDrag(
  event: ReactPointerEvent<HTMLTableCellElement>,
  options: TableColumnDragOptions,
) {
  if (event.button !== 0) return
  if ((event.target as Element | null)?.closest('.fsdb-col-resizer')) return
  const sourceTh = event.currentTarget
  const headerRow = sourceTh.closest('tr')
  if (!headerRow) return

  const startX = event.clientX
  const startY = event.clientY
  const sourceRect = sourceTh.getBoundingClientRect()
  const offsetX = Math.max(12, Math.min(sourceRect.width - 12, startX - sourceRect.left))

  let active = false
  let ghost: HTMLDivElement | null = null
  let dropTh: HTMLTableCellElement | null = null
  let dropKey = ''
  let dropSide: ColumnDropSide = 'before'

  const clearDrop = () => {
    if (dropTh) {
      dropTh.classList.remove('is-col-drop-before', 'is-col-drop-after')
      dropTh = null
    }
    dropKey = ''
  }

  const updateDropTarget = (clientX: number) => {
    const cells = Array.from(headerRow.querySelectorAll<HTMLTableCellElement>('th[data-col-key]'))
    if (!cells.length) {
      clearDrop()
      return
    }
    let hit: HTMLTableCellElement | null = null
    let side: ColumnDropSide = 'before'

    for (const cell of cells) {
      const rect = cell.getBoundingClientRect()
      if (clientX >= rect.left && clientX <= rect.right) {
        hit = cell
        side = clientX < rect.left + rect.width / 2 ? 'before' : 'after'
        break
      }
    }
    if (!hit) {
      const firstRect = cells[0]!.getBoundingClientRect()
      const lastRect = cells[cells.length - 1]!.getBoundingClientRect()
      if (clientX < firstRect.left) {
        hit = cells[0]!
        side = 'before'
      } else if (clientX > lastRect.right) {
        hit = cells[cells.length - 1]!
        side = 'after'
      }
    }

    const candidateKey = hit?.dataset.colKey ?? ''
    if (!hit || !candidateKey || !computeReorderedColumns(options.getColumnKeys(), options.colKey, candidateKey, side)) {
      clearDrop()
      return
    }

    if (dropTh !== hit || dropSide !== side) {
      clearDrop()
      dropTh = hit
      dropKey = candidateKey
      dropSide = side
      hit.classList.add(side === 'before' ? 'is-col-drop-before' : 'is-col-drop-after')
    }
  }

  const activate = (clientX: number) => {
    active = true
    sourceTh.classList.add('is-col-dragging')
    document.body.classList.add('is-col-reordering')

    const el = document.createElement('div')
    el.className = 'fsdb-col-drag-ghost'
    const inner = sourceTh.querySelector('.tasks-th')
    if (inner) {
      const clone = inner.cloneNode(true) as HTMLElement
      clone.removeAttribute('data-dock-tip')
      el.appendChild(clone)
    } else {
      el.textContent = sourceTh.textContent ?? ''
    }
    el.style.width = `${Math.max(84, Math.min(260, Math.round(sourceRect.width)))}px`
    el.style.height = `${Math.round(sourceRect.height)}px`
    el.style.top = `${Math.round(sourceRect.top)}px`
    el.style.left = `${Math.round(clientX - offsetX)}px`
    document.body.appendChild(el)
    ghost = el
  }

  const suppressNextClick = () => {
    const swallow = (ev: MouseEvent) => {
      ev.preventDefault()
      ev.stopPropagation()
      window.removeEventListener('click', swallow, true)
    }
    window.addEventListener('click', swallow, true)
    window.setTimeout(() => window.removeEventListener('click', swallow, true), 0)
  }

  const cleanup = (commit: boolean) => {
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
    window.removeEventListener('pointercancel', onCancel)
    window.removeEventListener('keydown', onKeyDown, true)

    const targetKey = dropKey
    const targetSide = dropSide
    clearDrop()
    sourceTh.classList.remove('is-col-dragging')
    document.body.classList.remove('is-col-reordering')
    if (ghost) {
      ghost.remove()
      ghost = null
    }
    if (active) {
      suppressNextClick()
      if (commit && targetKey) {
        const next = computeReorderedColumns(options.getColumnKeys(), options.colKey, targetKey, targetSide)
        if (next) options.onReorder(next)
      }
    }
  }

  const onMove = (ev: PointerEvent) => {
    if (!active) {
      const dx = Math.abs(ev.clientX - startX)
      const dy = Math.abs(ev.clientY - startY)
      if (dx < DRAG_THRESHOLD_PX) return
      if (dy > dx * 1.5 && dy > 10) {
        cleanup(false)
        return
      }
      activate(ev.clientX)
    }
    ev.preventDefault()
    if (ghost) {
      ghost.style.left = `${Math.round(ev.clientX - offsetX)}px`
    }
    updateDropTarget(ev.clientX)
  }

  const onUp = () => cleanup(true)
  const onCancel = () => cleanup(false)
  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'Escape') {
      ev.preventDefault()
      ev.stopPropagation()
      cleanup(false)
    }
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
  window.addEventListener('pointercancel', onCancel)
  window.addEventListener('keydown', onKeyDown, true)
}
