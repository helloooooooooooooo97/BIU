import { tableColWidthVar } from './table-window.ts'

export type NativeTagChipItem = {
  id: string
  label: string
  tone: string
}

export type NativeCellSpec =
  | { kind: 'text'; text: string }
  | { kind: 'bool'; on: boolean; writable: boolean }
  | { kind: 'tags'; items: NativeTagChipItem[] }
  | { kind: 'portal' }

export type NativeCellDescribe = {
  spec: NativeCellSpec
  pinLeft?: number
  pinEdge?: boolean
  cellClass?: string
  pickAttrs?: Record<string, string | undefined>
}

export type NativePoolRowInput = {
  key: string
  index: number
  top: number
  recordId: string
  active: boolean
  delayMs: number
  pickAttrs?: Record<string, string>
  cells: Array<{
    colKey: string
    stamp: string
    describe: NativeCellDescribe
  }>
}

export type NativePoolFrame = {
  rows: NativePoolRowInput[]
  pinCount: number
  padLeft: number
  padRight: number
  visibleColKeys: string[]
}

export type PortalCellMount = {
  id: string
  rowKey: string
  colKey: string
  td: HTMLTableCellElement
}

export type NativeRowPoolStats = {
  rowsCreated: number
  rowsRecycled: number
  cellsCreated: number
  cellsRecycled: number
  nativeCellsPainted: number
  portalCellsMounted: number
}

const SVG_NS = 'http://www.w3.org/2000/svg'
const CHECK_PATH_D =
  'M12.416 3.376a.75.75 0 0 1 .208 1.04l-5 7.5a.75.75 0 0 1-1.154.114l-3-3a.75.75 0 0 1 1.06-1.06l2.353 2.353 4.493-6.74a.75.75 0 0 1 1.04-.207Z'

function makeCheckSvg(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('aria-hidden', 'true')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('fill', 'currentColor')
  svg.setAttribute('class', 'size-3')
  const path = document.createElementNS(SVG_NS, 'path')
  path.setAttribute('fill-rule', 'evenodd')
  path.setAttribute('clip-rule', 'evenodd')
  path.setAttribute('d', CHECK_PATH_D)
  svg.appendChild(path)
  return svg
}

type PooledCellSlot = {
  td: HTMLTableCellElement
  colKey: string
  lastStamp: string
  lastMode: NativeCellSpec['kind'] | ''
  lastPickKeys: string[]
  cellWrap: HTMLSpanElement | null
  textSpan: HTMLSpanElement | null
  boolHost: HTMLElement | null
  boolBox: HTMLSpanElement | null
  boolCheck: SVGSVGElement | null
  tagsWrap: HTMLSpanElement | null
}

type PooledRowSlot = {
  tr: HTMLTableRowElement
  activeKey: string
  cellsByKey: Map<string, PooledCellSlot>
  orderSig: string
  padLeftTd: HTMLTableCellElement
  padRightTd: HTMLTableCellElement
  fillTd: HTMLTableCellElement
  lastPickKeys: string[]
}

function applyBoxWidth(td: HTMLTableCellElement, colKey: string) {
  const w = `var(${tableColWidthVar(colKey)})`
  td.style.width = w
  td.style.minWidth = w
  td.style.maxWidth = w
}

function applyPadWidth(td: HTMLTableCellElement, px: number) {
  const v = `${px}px`
  td.style.width = v
  td.style.minWidth = v
  td.style.maxWidth = v
}

function syncDataAttrs(el: HTMLElement, next: Record<string, string | undefined> | undefined, prevKeys: string[]): string[] {
  for (const key of prevKeys) {
    if (!next || next[key] === undefined) el.removeAttribute(key)
  }
  const kept: string[] = []
  if (next) {
    for (const [key, value] of Object.entries(next)) {
      if (value === undefined) continue
      if (el.getAttribute(key) !== value) el.setAttribute(key, value)
      kept.push(key)
    }
  }
  return kept
}

function clearNativeChildren(slot: PooledCellSlot) {
  if (slot.cellWrap) {
    slot.cellWrap.remove()
    slot.cellWrap = null
    slot.textSpan = null
    slot.boolHost = null
    slot.boolBox = null
    slot.boolCheck = null
    slot.tagsWrap = null
  }
}

function ensureCellWrap(slot: PooledCellSlot): HTMLSpanElement {
  if (!slot.cellWrap) {
    slot.td.textContent = ''
    const wrap = document.createElement('span')
    wrap.className = 'fsdb-cell'
    slot.td.appendChild(wrap)
    slot.cellWrap = wrap
  }
  return slot.cellWrap
}

function paintNativeSpec(slot: PooledCellSlot, spec: Exclude<NativeCellSpec, { kind: 'portal' }>) {
  if (slot.lastMode === 'portal') {
    slot.td.textContent = ''
    slot.cellWrap = null
    slot.textSpan = null
    slot.boolHost = null
    slot.boolBox = null
    slot.boolCheck = null
    slot.tagsWrap = null
  } else if (slot.lastMode && slot.lastMode !== spec.kind) {
    clearNativeChildren(slot)
  }

  const wrap = ensureCellWrap(slot)

  if (spec.kind === 'text') {
    if (!spec.text) {
      if (slot.textSpan) {
        slot.textSpan.remove()
        slot.textSpan = null
      }
      slot.lastMode = 'text'
      return
    }
    if (!slot.textSpan) {
      const span = document.createElement('span')
      wrap.appendChild(span)
      slot.textSpan = span
    }
    if (slot.textSpan.textContent !== spec.text) {
      slot.textSpan.textContent = spec.text
    }
    slot.lastMode = 'text'
    return
  }

  if (spec.kind === 'bool') {
    const needBtn = spec.writable
    const isBtn = slot.boolHost?.tagName === 'BUTTON'
    if (!slot.boolHost || isBtn !== needBtn) {
      wrap.textContent = ''
      const host = document.createElement(needBtn ? 'button' : 'span')
      if (needBtn) {
        ;(host as HTMLButtonElement).type = 'button'
        host.className = 'fsdb-boolbtn'
        host.setAttribute('data-native-bool', '1')
      } else {
        host.className = 'fsdb-bool'
      }
      const box = document.createElement('span')
      host.appendChild(box)
      wrap.appendChild(host)
      slot.boolHost = host
      slot.boolBox = box
      slot.boolCheck = null
    }
    const host = slot.boolHost
    const box = slot.boolBox!
    if (needBtn) {
      host.setAttribute('aria-pressed', spec.on ? 'true' : 'false')
    } else {
      host.setAttribute('title', spec.on ? '是' : '否')
    }
    box.className = `fsdb-boolbox${spec.on ? ' is-on' : ''}${spec.writable ? '' : ' is-locked'}`
    if (spec.on) {
      if (!slot.boolCheck) {
        slot.boolCheck = makeCheckSvg()
        box.appendChild(slot.boolCheck)
      }
    } else if (slot.boolCheck) {
      slot.boolCheck.remove()
      slot.boolCheck = null
    }
    slot.lastMode = 'bool'
    return
  }

  // kind === 'tags'
  if (!spec.items.length) {
    if (slot.tagsWrap) {
      slot.tagsWrap.remove()
      slot.tagsWrap = null
    }
    slot.lastMode = 'tags'
    return
  }
  if (!slot.tagsWrap) {
    const tags = document.createElement('span')
    tags.className = 'biu-tags'
    wrap.appendChild(tags)
    slot.tagsWrap = tags
  }
  const tags = slot.tagsWrap
  // Reuse existing chip spans in place when possible
  while (tags.children.length > spec.items.length) {
    tags.lastElementChild?.remove()
  }
  for (let i = 0; i < spec.items.length; i += 1) {
    const item = spec.items[i]!
    let chip = tags.children[i] as HTMLSpanElement | undefined
    let labelEl: HTMLSpanElement | null = null
    if (!chip) {
      chip = document.createElement('span')
      chip.className = 'biu-tag'
      labelEl = document.createElement('span')
      labelEl.className = 'biu-tag-label'
      chip.appendChild(labelEl)
      tags.appendChild(chip)
    } else {
      labelEl = chip.firstElementChild as HTMLSpanElement | null
      if (!labelEl) {
        labelEl = document.createElement('span')
        labelEl.className = 'biu-tag-label'
        chip.appendChild(labelEl)
      }
    }
    chip.setAttribute('data-tag-id', item.id)
    chip.setAttribute('title', item.label)
    chip.style.setProperty('--biu-tag', item.tone)
    if (labelEl.textContent !== item.label) labelEl.textContent = item.label
  }
  slot.lastMode = 'tags'
}

/**
 * AG Grid 风格命令式原生行池引擎：
 * - 固定复用 <tr> 与 <td> DOM 槽位，稳态滚动期间 0 次 createElement / removeChild；
 * - 标准列（text / number / datetime / boolean / select / multi-select）原地改 DOM 零 React 开销；
 * - 复杂/自定义列（title / actions / sandbox 等）返回宿主 <td> 列表，由 React createPortal 精准挂载。
 */
export class NativeRowPool {
  private tbody: HTMLTableSectionElement
  private activeByKey = new Map<string, PooledRowSlot>()
  private freeSlots: PooledRowSlot[] = []
  readonly stats: NativeRowPoolStats = {
    rowsCreated: 0,
    rowsRecycled: 0,
    cellsCreated: 0,
    cellsRecycled: 0,
    nativeCellsPainted: 0,
    portalCellsMounted: 0,
  }

  constructor(tbody: HTMLTableSectionElement) {
    this.tbody = tbody
  }

  resetStats() {
    this.stats.rowsCreated = 0
    this.stats.rowsRecycled = 0
    this.stats.cellsCreated = 0
    this.stats.cellsRecycled = 0
    this.stats.nativeCellsPainted = 0
    this.stats.portalCellsMounted = 0
  }

  private createRowSlot(): PooledRowSlot {
    const tr = document.createElement('tr')
    const padLeftTd = document.createElement('td')
    padLeftTd.className = 'fsdb-col-pad'
    padLeftTd.setAttribute('aria-hidden', 'true')
    const padRightTd = document.createElement('td')
    padRightTd.className = 'fsdb-col-pad'
    padRightTd.setAttribute('aria-hidden', 'true')
    const fillTd = document.createElement('td')
    fillTd.className = 'fsdb-col-fill'
    fillTd.setAttribute('aria-hidden', 'true')
    this.tbody.appendChild(tr)
    this.stats.rowsCreated += 1
    return {
      tr,
      activeKey: '',
      cellsByKey: new Map(),
      orderSig: '',
      padLeftTd,
      padRightTd,
      fillTd,
      lastPickKeys: [],
    }
  }

  private getOrCreateCell(slot: PooledRowSlot, colKey: string): PooledCellSlot {
    let cell = slot.cellsByKey.get(colKey)
    if (cell) {
      this.stats.cellsRecycled += 1
      return cell
    }
    const td = document.createElement('td')
    td.dataset.colKey = colKey
    applyBoxWidth(td, colKey)
    cell = {
      td,
      colKey,
      lastStamp: '',
      lastMode: '',
      lastPickKeys: [],
      cellWrap: null,
      textSpan: null,
      boolHost: null,
      boolBox: null,
      boolCheck: null,
      tagsWrap: null,
    }
    slot.cellsByKey.set(colKey, cell)
    this.stats.cellsCreated += 1
    return cell
  }

  private syncRowColumns(slot: PooledRowSlot, frame: NativePoolFrame) {
    const sig = `${frame.pinCount}:${frame.padLeft > 0 ? 1 : 0}:${frame.padRight > 0 ? 1 : 0}\0${frame.visibleColKeys.join('\0')}`
    if (frame.padLeft > 0) applyPadWidth(slot.padLeftTd, frame.padLeft)
    if (frame.padRight > 0) applyPadWidth(slot.padRightTd, frame.padRight)
    if (slot.orderSig === sig) return
    slot.orderSig = sig

    const desired: HTMLTableCellElement[] = []
    const pinEnd = Math.min(frame.pinCount, frame.visibleColKeys.length)
    for (let i = 0; i < pinEnd; i += 1) {
      desired.push(this.getOrCreateCell(slot, frame.visibleColKeys[i]!).td)
    }
    if (frame.padLeft > 0) desired.push(slot.padLeftTd)
    for (let i = pinEnd; i < frame.visibleColKeys.length; i += 1) {
      desired.push(this.getOrCreateCell(slot, frame.visibleColKeys[i]!).td)
    }
    if (frame.padRight > 0) desired.push(slot.padRightTd)
    desired.push(slot.fillTd)

    const tr = slot.tr
    // Reorder/attach only when children differ
    let cursor = tr.firstElementChild
    for (let i = 0; i < desired.length; i += 1) {
      const target = desired[i]!
      if (cursor === target) {
        cursor = cursor.nextElementSibling
      } else {
        tr.insertBefore(target, cursor)
      }
    }
    while (cursor) {
      const next = cursor.nextElementSibling
      cursor.remove()
      cursor = next
    }
  }

  sync(frame: NativePoolFrame): PortalCellMount[] {
    const nextKeys = new Set<string>()
    for (const row of frame.rows) nextKeys.add(row.key)

    // 1. Park rows that left the viewport back into freeSlots (never destroy <tr>)
    for (const [key, slot] of this.activeByKey) {
      if (nextKeys.has(key)) continue
      this.activeByKey.delete(key)
      slot.activeKey = ''
      slot.tr.style.display = 'none'
      slot.tr.removeAttribute('data-record-id')
      slot.tr.removeAttribute('data-row-key')
      slot.tr.removeAttribute('data-index')
      slot.tr.removeAttribute('data-row-top')
      this.freeSlots.push(slot)
    }

    const portals: PortalCellMount[] = []

    // 2. Mount or update active rows
    for (const row of frame.rows) {
      let slot = this.activeByKey.get(row.key)
      let newlyActivated = false
      if (!slot) {
        newlyActivated = true
        if (this.freeSlots.length > 0) {
          slot = this.freeSlots.pop()!
          this.stats.rowsRecycled += 1
        } else {
          slot = this.createRowSlot()
        }
        slot.activeKey = row.key
        this.activeByKey.set(row.key, slot)
        slot.tr.style.display = ''
      }

      const tr = slot.tr
      if (tr.dataset.recordId !== row.recordId) tr.dataset.recordId = row.recordId
      if (tr.dataset.rowKey !== row.key) tr.dataset.rowKey = row.key
      const idxStr = String(row.index)
      if (tr.dataset.index !== idxStr) tr.dataset.index = idxStr
      const topStr = String(row.top)
      if (tr.dataset.rowTop !== topStr) tr.dataset.rowTop = topStr
      const transform = `translate3d(0, ${row.top}px, 0)`
      if (tr.style.transform !== transform) tr.style.transform = transform
      const nextCls = row.active ? 'is-active' : ''
      if (tr.className !== nextCls) tr.className = nextCls
      if (newlyActivated && row.delayMs > 0) {
        tr.style.setProperty('--fsdb-row-delay', `${row.delayMs}ms`)
      } else if (newlyActivated) {
        tr.style.removeProperty('--fsdb-row-delay')
      }
      slot.lastPickKeys = syncDataAttrs(tr, row.pickAttrs, slot.lastPickKeys)

      this.syncRowColumns(slot, frame)

      for (const cellInput of row.cells) {
        const cellSlot = this.getOrCreateCell(slot, cellInput.colKey)
        const { describe, stamp } = cellInput
        const td = cellSlot.td
        const pinCls = describe.pinLeft != null ? (describe.pinEdge ? 'is-pin-col is-pin-edge' : 'is-pin-col') : ''
        const tdCls = [pinCls, describe.cellClass ?? ''].filter(Boolean).join(' ')
        if (td.className !== tdCls) td.className = tdCls
        if (describe.pinLeft != null) {
          const pinPx = `${describe.pinLeft}px`
          if (td.style.getPropertyValue('--fsdb-pin-left') !== pinPx) {
            td.style.setProperty('--fsdb-pin-left', pinPx)
          }
        } else if (td.style.getPropertyValue('--fsdb-pin-left')) {
          td.style.removeProperty('--fsdb-pin-left')
        }
        cellSlot.lastPickKeys = syncDataAttrs(td, describe.pickAttrs, cellSlot.lastPickKeys)

        if (describe.spec.kind === 'portal') {
          if (cellSlot.lastMode !== 'portal') {
            clearNativeChildren(cellSlot)
            cellSlot.lastMode = 'portal'
          }
          cellSlot.lastStamp = stamp
          this.stats.portalCellsMounted += 1
          portals.push({
            id: `${row.key}\0${cellInput.colKey}`,
            rowKey: row.key,
            colKey: cellInput.colKey,
            td,
          })
        } else {
          if (cellSlot.lastStamp !== stamp || cellSlot.lastMode !== describe.spec.kind) {
            paintNativeSpec(cellSlot, describe.spec)
            cellSlot.lastStamp = stamp
            this.stats.nativeCellsPainted += 1
          }
        }
      }
    }

    return portals
  }

  destroy() {
    for (const slot of this.activeByKey.values()) slot.tr.remove()
    for (const slot of this.freeSlots) slot.tr.remove()
    this.activeByKey.clear()
    this.freeSlots = []
  }
}
