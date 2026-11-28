import {
  cloneElement,
  createContext,
  isValidElement,
  memo,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ComponentProps,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from 'react'
import { createPortal } from 'react-dom'
import type { VirtualItem } from '@tanstack/react-virtual'
import type { DbRecord } from '@biu/type-file-system'
import { colWidthStyle } from './saved-view.ts'
import { usePinnedTableHead } from './pinned-table-head.ts'
import { useTableColumnViewport } from './table-column-viewport.ts'
import { directionalRowDelayMs, useTableViewport, type ViewportScrollDirection } from './table-viewport.ts'
import {
  evictCellCache,
  isCellStampSame,
  makeCellStampEntry,
  reuseRowStamp,
  type CellStampEntry,
  type RowStampEntry,
} from './table-paint-cache.ts'
import {
  TABLE_ROW_PX,
  TABLE_VIEWPORT_OVERSCAN,
  tableColWidthVar,
  tableColumnWidth,
  type TableColumnSlice,
} from './table-window.ts'
import {
  NativeRowPool,
  type NativeCellDescribe,
  type NativePoolFrame,
  type NativePoolRowInput,
  type PortalCellMount,
} from './table-native-pool.ts'
import { subscribeTags, tagCatalogRevision } from './tag-catalog.ts'

const subscribeTagCatalog = (fn: () => void) => subscribeTags(undefined, fn)

export type TablePaintNode =
  | { kind: 'empty'; key: string }
  | { kind: 'group-head'; key: string; groupKey: string; label: string; count: number; folded?: boolean }
  | { kind: 'row'; key: string; keyPrefix: string; row: DbRecord; depth: number; hasKids: boolean; kidCount: number; rowNumber?: number; fold?: boolean; treeOn?: boolean }
  | { kind: 'group-pager'; key: string; groupKey: string; count: number; pageIndex: number; pageSize?: number }
  | { kind: 'summary'; key: string; rows: DbRecord[]; stamp: string; partial?: boolean }

export type TablePaintBag = {
  colSpan: number
  error: string
  renderNode: (node: TablePaintNode) => ReactNode
  /** 行壳。单元格由 renderCell 按列缓存，横滚只补新列。 */
  renderRow?: (node: TablePaintNode, cells: ReactNode) => ReactNode
  renderCell?: (node: TablePaintNode, colKey: string) => ReactNode
  /** AG Grid 风格原生 DOM 行池：描述单元格是否走原生直绘或 React Portal。 */
  describeNativeCell?: (node: Extract<TablePaintNode, { kind: 'row' }>, colKey: string) => NativeCellDescribe | null
  /** Portal 单元格内部 React 内容（直接挂载到原生行池复用的 <td> 内）。 */
  renderPortalCellContent?: (node: Extract<TablePaintNode, { kind: 'row' }>, colKey: string) => ReactNode
  /** 写入原生 <tr> 的附加 data-* 属性（如 recordPick）。 */
  recordPickAttrs?: (row: DbRecord) => Record<string, string>
  /** 原生可写布尔单元格点击切换回调。 */
  onNativeBoolToggle?: (rowId: string, colKey: string) => void
  /** 调试/压测钩子：暴露当前 NativeRowPool 实例以读取复用统计。 */
  onPoolReady?: (pool: NativeRowPool | null) => void
  /** 需要按整行 stamp 失效的复合列（如 actions、tag:*、自定义 chrome.cells） */
  compositeCells?: ReadonlySet<string>
  /** 每列属性沙箱视图版本戳，变化时仅重绘对应列单元格。 */
  columnViewStamp?: (colKey: string) => string
  revealRow?: (id: string, rowKey?: string) => void
  revealColumn?: (key: string) => void
  paintSelection?: () => void
}

export type TableChromeBag = {
  paintHeadTh: (col: { key: string }) => ReactNode
  onPointerDown: ComponentProps<'table'>['onPointerDown']
  onPointerMove: ComponentProps<'table'>['onPointerMove']
  onClick: (event: { target: EventTarget | null; currentTarget: EventTarget; clientX: number; clientY: number }) => void
  onKeyDown?: (event: ReactKeyboardEvent<HTMLTableElement>) => void
  onMouseOver: ComponentProps<'table'>['onMouseOver']
  onContextMenu?: ComponentProps<'table'>['onContextMenu']
}

export type TableCheckStore = {
  subscribe: (listener: () => void) => () => void
  getVersion: () => number
  hasPicked: () => boolean
  renderHead: () => ReactNode
  renderRow: (id: string) => ReactNode
}

const TABLE_PAINT_REF: RefObject<TablePaintBag> = {
  current: { colSpan: 1, error: '', renderNode: () => null },
}

export const TablePaintCtx = createContext<RefObject<TablePaintBag>>(TABLE_PAINT_REF)

const NOOP_SUBSCRIBE = () => () => {}
const ZERO_VERSION = () => 0

type CheckSlot = { kind: 'head' | 'gap' | 'row'; id?: string; top: number; h: number }

function rowTopInTable(table: HTMLTableElement, tr: HTMLTableRowElement) {
  if (tr.dataset.rowTop != null) {
    const y = Number(tr.dataset.rowTop)
    if (Number.isFinite(y)) return (table.tHead?.offsetHeight ?? 0) + y + table.clientTop
  }
  let top = tr.offsetTop
  let parent = tr.offsetParent
  while (parent instanceof HTMLElement && parent !== table && table.contains(parent)) {
    top += parent.offsetTop + parent.clientTop
    parent = parent.offsetParent
  }
  return top + table.clientTop
}

export function measureTableCheckSlots(table: HTMLTableElement): CheckSlot[] | null {
  if (!table.offsetHeight) return null
  const next: CheckSlot[] = []
  const head = table.tHead?.rows[0]
  if (head && head.offsetHeight > 0) next.push({ kind: 'head', top: 0, h: head.offsetHeight })
  const rows = table.tBodies[0]?.rows
  if (rows) {
    for (let i = 0; i < rows.length; i += 1) {
      const tr = rows[i]!
      if (
        tr.classList.contains('fsdb-table-pad') ||
        tr.classList.contains('fsdb-group-row') ||
        tr.classList.contains('fsdb-group-pager') ||
        tr.classList.contains('fsdb-summary-row')
      ) {
        continue
      }
      const id = tr.dataset.recordId
      if (!id) continue
      const h = tr.offsetHeight
      if (h <= 0) continue
      next.push({ kind: 'row', id, top: rowTopInTable(table, tr), h })
    }
  }
  return next
}

function sameCheckSlots(a: CheckSlot[] | null, b: CheckSlot[] | null) {
  if (a === b) return true
  if (!a || !b || a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    const x = a[i]!
    const y = b[i]!
    if (x.kind !== y.kind || x.id !== y.id || x.top !== y.top || x.h !== y.h) return false
  }
  return true
}

export const TableCheckRail = memo(function TableCheckRail({
  tableRef,
  stackRef,
  stageRef,
  hoverRef,
  items,
  nodes,
  margin,
  isScrolling = false,
  forceLive,
  paintCheckHover,
  renderHead,
  renderRow,
  checkStore,
}: {
  tableRef: RefObject<HTMLTableElement | null>
  stackRef: RefObject<HTMLDivElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  hoverRef: RefObject<string | 'head' | null>
  items: VirtualItem[]
  nodes: TablePaintNode[]
  margin: number
  isScrolling?: boolean
  forceLive: boolean
  paintCheckHover: (next: string | 'head' | null, force?: boolean) => void
  renderHead: () => ReactNode
  renderRow: (id: string) => ReactNode
  checkStore?: TableCheckStore
}) {
  const [live, setLive] = useState(false)
  const [headHeight, setHeadHeight] = useState(37)
  const [domSlots, setDomSlots] = useState<CheckSlot[] | null>(null)
  // Subscribe to pick store locally so checkbox toggles never force WindowedTable to re-render.
  useSyncExternalStore(
    checkStore ? checkStore.subscribe : NOOP_SUBSCRIBE,
    checkStore ? checkStore.getVersion : ZERO_VERSION,
    ZERO_VERSION,
  )
  const active = live || forceLive || Boolean(checkStore?.hasPicked())

  useEffect(() => {
    const stage = stageRef.current
    if (!stage || live) return
    const arm = () => setLive(true)
    stage.addEventListener('mouseenter', arm)
    return () => stage.removeEventListener('mouseenter', arm)
  }, [live, stageRef])

  const syncDomSlots = useCallback(() => {
    const table = tableRef.current
    if (!table || !active) {
      setDomSlots((prev) => (prev ? null : prev))
      return
    }
    const head = table.tHead?.offsetHeight ?? 0
    if (head > 0) setHeadHeight((prev) => (prev === head ? prev : head))
    const measured = measureTableCheckSlots(table)
    if (!measured) return
    setDomSlots((prev) => (sameCheckSlots(prev, measured) ? prev : measured))
  }, [active, tableRef])

  // Sync directly from actual tr.offsetTop / tr.offsetHeight after commit so grouped headers,
  // pagers, borders, and wrapped rows never drift from the left checkbox rail (zero getBoundingClientRect).
  // 滚动期间跳过每帧同步 DOM 测量，直接走 virtualSlots，避免强制回流 + 同帧二次渲染导致快滑闪烁；停滚后立即校准。
  useLayoutEffect(() => {
    if (isScrolling) return
    syncDomSlots()
  }, [isScrolling, syncDomSlots, items, nodes, margin])

  // Observe table size changes once without rebinding on scroll.
  useEffect(() => {
    if (!active) return
    const table = tableRef.current
    if (!table) return
    let raf = 0
    const schedule = () => {
      if (raf) return
      raf = requestAnimationFrame(() => {
        raf = 0
        syncDomSlots()
      })
    }
    const ro = new ResizeObserver(schedule)
    ro.observe(table)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [active, syncDomSlots, tableRef])

  // Fallback coordinates from TanStack virtual items when DOM layout height is unavailable (e.g. JSDOM).
  const virtualSlots = useMemo<CheckSlot[]>(() => {
    if (!active) return []
    const slots: CheckSlot[] = [{ kind: 'head', top: 0, h: headHeight }]
    for (const item of items) {
      const node = nodes[item.index]
      if (!node || node.kind !== 'row') continue
      const top = headHeight + (item.start - margin)
      const h = item.size
      slots.push({ kind: 'row', id: String(node.row.id), top, h })
    }
    return slots
  }, [active, headHeight, items, margin, nodes])

  const checkSlots = active ? (isScrolling ? virtualSlots : (domSlots ?? virtualSlots)) : []

  useLayoutEffect(() => {
    paintCheckHover(hoverRef.current, true)
  }, [checkSlots, hoverRef, paintCheckHover])

  const drawHead = checkStore ? checkStore.renderHead : renderHead
  const drawRow = checkStore ? checkStore.renderRow : renderRow

  return (
    <div className="fsdb-check-rail" data-testid="fsdb-check-rail">
      <div className="fsdb-check-stack" ref={stackRef}>
        {checkSlots.map((slot, index) => (
          <div
            key={slot.kind === 'row' ? `${slot.id}-${index}` : `${slot.kind}-${index}`}
            className={`fsdb-check-slot${slot.kind === 'head' ? ' is-head' : ''}`}
            data-check={slot.kind === 'head' ? 'head' : slot.id}
            style={slot.kind === 'head' ? { height: slot.h } : { top: slot.top, height: slot.h }}
            onMouseEnter={() => {
              if (slot.kind === 'head') paintCheckHover('head')
              else if (slot.id) paintCheckHover(slot.id)
            }}
          >
            {slot.kind === 'head' ? drawHead() : null}
            {slot.kind === 'row' && slot.id ? drawRow(slot.id) : null}
          </div>
        ))}
      </div>
    </div>
  )
})

type TableBodyProps = {
  nodes: TablePaintNode[]
  items: VirtualItem[]
  margin: number
  totalSize: number
  measureRow?: (row: HTMLTableRowElement | null) => void
  colSpan: number
  colKeys: string
  error: string
  pickMode: boolean
  activeRowId: string | null
  cellViewStamp?: string
  scrollDirection?: ViewportScrollDirection
}

function rowMetaStamp(node: Extract<TablePaintNode, { kind: 'row' }>, pickMode: boolean) {
  const row = node.row as Record<string, unknown>
  return `${pickMode ? 1 : 0}\0${node.depth}\0${node.hasKids ? 1 : 0}\0${node.kidCount}\0${node.fold ? 1 : 0}\0${node.treeOn ? 1 : 0}\0${String(row.emoji ?? '')}\0${String(row.icon ?? '')}\0${String(row.mascot ?? '')}\0${String(row.avatar ?? '')}\0${String(row.status ?? '')}`
}

export function rowPaintStamp(node: TablePaintNode, stamps: Map<string, RowStampEntry>) {
  if (node.kind === 'summary') {
    return `summary\0${node.key}\0${node.stamp}`
  }
  if (node.kind !== 'row') {
    const label = node.kind === 'group-head' ? node.label : ''
    const count = node.kind === 'group-head' || node.kind === 'group-pager' ? node.count : ''
    const page = node.kind === 'group-pager' ? `${node.pageIndex}:${node.pageSize ?? ''}` : ''
    const folded = node.kind === 'group-head' && node.folded ? 1 : 0
    return `${node.kind}\0${node.key}\0${label}\0${count}\0${page}\0${folded}`
  }
  const body = node.row && typeof node.row === 'object'
    ? reuseRowStamp(stamps, node.key, node.row as Record<string, unknown>).body
    : JSON.stringify(node.row)
  return `${node.key}\0${node.depth}\0${node.hasKids ? 1 : 0}\0${node.kidCount}\0${node.fold ? 1 : 0}\0${node.treeOn ? 1 : 0}\0${body}`
}

export function columnLayout(colKeys: string) {
  const split = colKeys.split('\0')
  const meta = split[0]?.split(':') ?? []
  if (meta.length !== 3) return null
  const pin = Number(meta[0])
  const padLeft = Number(meta[1])
  const padRight = Number(meta[2])
  if (![pin, padLeft, padRight].every(Number.isFinite)) return null
  return { pin, padLeft, padRight, keys: split.slice(1).filter(Boolean) }
}

export function windowedColumnsOf<T>(columns: T[], colWindow: TableColumnSlice) {
  const next = columns.slice(0, colWindow.pin)
  for (let i = colWindow.start; i < colWindow.end; i += 1) next.push(columns[i]!)
  return next
}

export function padColBox(px: number) {
  const v = `${Math.max(0, Math.round(px))}px`
  return { width: v, minWidth: v, maxWidth: v }
}

/** 1px rules at each column edge, so a fast scroll shows the grid instead of a blank slab. */
export function padColumnRules(widths: number[]) {
  let edge = 0
  const layers: string[] = []
  for (const width of widths) {
    edge += Math.max(0, Math.round(width))
    if (edge <= 0) continue
    layers.push(`linear-gradient(to right,transparent ${edge - 1}px,var(--fsdb-pad-line) ${edge - 1}px,var(--fsdb-pad-line) ${edge}px,transparent ${edge}px)`)
  }
  return layers.join(',')
}

const TableBody = memo(function TableBody({ nodes, items, margin, totalSize, measureRow, colSpan, colKeys, pickMode, activeRowId, cellViewStamp = '', scrollDirection = 'idle' }: TableBodyProps) {
  const paintRef = useContext(TablePaintCtx)
  const bag = paintRef.current
  const tagRev = useSyncExternalStore(subscribeTagCatalog, tagCatalogRevision, tagCatalogRevision)
  // 同一行数据保持同一份元素。列表刷新会换成新对象，但内容没变就不再画。
  // 单元格按字段值粒度缓存：改一个单元格只重画该格，横滚只创建新进入窗口的列。
  const rowCache = useRef(new Map<string, { node: TablePaintNode; stamp: string; colKeys: string; pickMode: boolean; activeRowId: string | null; tagRev: number; cellViewStamp: string; element: ReactNode }>())
  const cellCache = useRef(new Map<string, CellStampEntry<ReactNode>>())
  const stampCache = useRef(new Map<string, RowStampEntry>())
  const mountedRowKeys = useRef(new Set<string>())
  const paintedWindow = useRef('')
  const keptCols = useRef<[Set<string>, Set<string>]>([new Set(), new Set()])
  const layout = columnLayout(colKeys)
  const liveRows = new Set<string>()
  const enteringRows: string[] = []
  const hadMounted = mountedRowKeys.current.size > 0
  for (const item of items) {
    const node = nodes[item.index]
    const key = node?.key
    if (!key) continue
    liveRows.add(key)
    if (hadMounted && node.kind === 'row' && !mountedRowKeys.current.has(key)) {
      enteringRows.push(key)
    }
  }
  const enterDelay = new Map<string, number>()
  if (enteringRows.length > 1 && scrollDirection !== 'idle') {
    for (let i = 0; i < enteringRows.length; i += 1) {
      const ms = directionalRowDelayMs(i, enteringRows.length, scrollDirection)
      if (ms > 0) enterDelay.set(enteringRows[i]!, ms)
    }
  }
  mountedRowKeys.current = liveRows
  if (rowCache.current.size > liveRows.size + 8) {
    for (const key of rowCache.current.keys()) if (!liveRows.has(key)) rowCache.current.delete(key)
    for (const key of stampCache.current.keys()) if (!liveRows.has(key)) stampCache.current.delete(key)
  }
  if (layout && layout.keys.length) {
    const [older, prev] = keptCols.current
    const cols = new Set(older)
    for (const key of prev) cols.add(key)
    for (const key of layout.keys) cols.add(key)
    evictCellCache(cellCache.current, liveRows, cols)
    keptCols.current = [prev, new Set(layout.keys)]
  }
  const windowKey = `${colKeys}\0${[...liveRows].join('\0')}`
  useLayoutEffect(() => {
    if (paintedWindow.current === windowKey) return
    paintedWindow.current = windowKey
    paintRef.current.paintSelection?.()
  }, [paintRef, windowKey])
  const padRow = items.find((item) => item.size > 1)?.size ?? TABLE_ROW_PX
  const emptyOnly = nodes.length === 1 && nodes[0]?.kind === 'empty'
  const layoutNow = layout
  const compositeCells = bag.compositeCells
  const children: ReactNode[] = []
  for (let idx = 0; idx < items.length; idx += 1) {
    const item = items[idx]!
    const node = nodes[item.index]
    if (!node) continue
    const top = Math.max(0, Math.round(item.start - margin))
    const stamp = rowPaintStamp(node, stampCache.current)
    const hit = rowCache.current.get(node.key)
    let element: ReactNode
    if (hit && hit.stamp === stamp && hit.colKeys === colKeys && hit.pickMode === pickMode && hit.activeRowId === activeRowId && hit.tagRev === tagRev && hit.cellViewStamp === cellViewStamp) {
      element = hit.element
    } else if (node.kind === 'row' && bag.renderCell && bag.renderRow && layoutNow) {
      const cells: ReactNode[] = []
      const rowObj = (node.row && typeof node.row === 'object' ? node.row : {}) as Record<string, unknown>
      const meta = `${rowMetaStamp(node, pickMode)}\0pin:${layoutNow.pin}`
      const paint = (key: string) => {
        const id = `${node.key}\0${key}`
        const isTagCol = key === 'tag' || key === 'tags' || key.startsWith('tag:')
        const composite = key === 'actions' || isTagCol || Boolean(compositeCells?.has(key)) || !(key in rowObj)
        const viewStamp = bag.columnViewStamp?.(key) ?? ''
        const cellMeta = `${meta}${isTagCol ? `\0tag:${tagRev}` : ''}${viewStamp ? `\0view:${viewStamp}` : ''}`
        const cached = cellCache.current.get(id)
        if (isCellStampSame(cached, rowObj, key, cellMeta, stamp, composite)) return cached!.element
        const next = bag.renderCell!(node, key)
        cellCache.current.set(id, makeCellStampEntry(rowObj, key, cellMeta, stamp, composite, next))
        return next
      }
      for (let i = 0; i < layoutNow.pin && i < layoutNow.keys.length; i += 1) cells.push(paint(layoutNow.keys[i]!))
      if (layoutNow.padLeft > 0) cells.push(<td key="pad-left" className="fsdb-col-pad" aria-hidden style={padColBox(layoutNow.padLeft)} />)
      for (let i = layoutNow.pin; i < layoutNow.keys.length; i += 1) cells.push(paint(layoutNow.keys[i]!))
      if (layoutNow.padRight > 0) cells.push(<td key="pad-right" className="fsdb-col-pad" aria-hidden style={padColBox(layoutNow.padRight)} />)
      cells.push(<td key="fill" className="fsdb-col-fill" aria-hidden />)
      element = bag.renderRow(node, cells)
    } else {
      element = bag.renderNode(node)
    }
    rowCache.current.set(node.key, { node, stamp, colKeys, pickMode, activeRowId, tagRev, cellViewStamp, element })
    const delayMs = enterDelay.get(node.key) ?? 0
    children.push(isValidElement(element) ? cloneElement(element as ReactElement<ComponentProps<'tr'>>, {
      key: node.key,
      'data-index': item.index,
      ...(emptyOnly ? {} : { 'data-row-top': String(top) }),
      ...(measureRow ? { ref: measureRow } : {}),
      style: {
        ...(element.props as ComponentProps<'tr'>).style,
        ...(emptyOnly ? {} : { transform: `translate3d(0, ${top}px, 0)` }),
        ...(delayMs > 0 ? { ['--fsdb-row-delay' as string]: `${delayMs}ms` } : {}),
      },
    } as ComponentProps<'tr'>) : element)
  }
  return (
    <tbody
      className={`fsdb-grid-body${emptyOnly ? ' is-empty' : ''}`}
      style={emptyOnly ? undefined : { height: `${Math.max(0, Math.round(totalSize))}px`, ['--fsdb-pad-row' as string]: `${padRow}px` }}
    >
      {children}
    </tbody>
  )
})

function nativeSpecStamp(describe: NativeCellDescribe): string {
  const spec = describe.spec
  if (spec.kind === 'text') return `t\0${spec.text}`
  if (spec.kind === 'bool') return `b\0${spec.on ? 1 : 0}${spec.writable ? 1 : 0}`
  if (spec.kind === 'tags') {
    if (!spec.items.length) return 'g\0'
    let out = 'g'
    for (let i = 0; i < spec.items.length; i += 1) {
      const it = spec.items[i]!
      out += `\x01${it.id}\0${it.label}\0${it.tone}`
    }
    return out
  }
  return 'p'
}

function samePortalMounts(a: PortalCellMount[], b: PortalCellMount[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i]!.id !== b[i]!.id || a[i]!.host !== b[i]!.host) return false
  }
  return true
}

const NativeTableBody = memo(function NativeTableBody({
  nodes,
  items,
  margin,
  totalSize,
  colKeys,
  pickMode,
  activeRowId,
  cellViewStamp = '',
  scrollDirection = 'idle',
}: TableBodyProps) {
  const paintRef = useContext(TablePaintCtx)
  const bag = paintRef.current
  const tagRev = useSyncExternalStore(subscribeTagCatalog, tagCatalogRevision, tagCatalogRevision)

  const poolBodyRef = useRef<HTMLTableSectionElement | null>(null)
  const overlayBodyRef = useRef<HTMLTableSectionElement | null>(null)
  const poolRef = useRef<NativeRowPool | null>(null)
  const stampCache = useRef(new Map<string, RowStampEntry>())
  const portalCache = useRef(new Map<string, { stamp: string; element: ReactNode }>())
  const mountedRowKeys = useRef(new Set<string>())
  const paintedWindow = useRef('')
  const prevPortalsRef = useRef<PortalCellMount[]>([])
  const [portals, setPortals] = useState<PortalCellMount[]>([])

  const layout = columnLayout(colKeys)
  const liveRows = new Set<string>()
  const enteringRows: string[] = []
  const hadMounted = mountedRowKeys.current.size > 0
  const rowNodesByKey = new Map<string, Extract<TablePaintNode, { kind: 'row' }>>()
  const structuralRows: ReactNode[] = []

  for (const item of items) {
    const node = nodes[item.index]
    if (!node) continue
    liveRows.add(node.key)
    if (node.kind === 'row') {
      rowNodesByKey.set(node.key, node)
      if (hadMounted && !mountedRowKeys.current.has(node.key)) {
        enteringRows.push(node.key)
      }
    } else {
      const top = Math.max(0, Math.round(item.start - margin))
      const element = bag.renderNode(node)
      if (isValidElement(element)) {
        structuralRows.push(
          cloneElement(element as ReactElement<ComponentProps<'tr'>>, {
            key: node.key,
            'data-index': item.index,
            'data-row-top': String(top),
            style: {
              ...(element.props as ComponentProps<'tr'>).style,
              transform: `translate3d(0, ${top}px, 0)`,
            },
          } as ComponentProps<'tr'>),
        )
      }
    }
  }

  const enterDelay = new Map<string, number>()
  if (enteringRows.length > 1 && scrollDirection !== 'idle') {
    for (let i = 0; i < enteringRows.length; i += 1) {
      const ms = directionalRowDelayMs(i, enteringRows.length, scrollDirection)
      if (ms > 0) enterDelay.set(enteringRows[i]!, ms)
    }
  }
  mountedRowKeys.current = liveRows
  if (stampCache.current.size > liveRows.size + 16) {
    for (const key of stampCache.current.keys()) if (!liveRows.has(key)) stampCache.current.delete(key)
  }
  if (portalCache.current.size > liveRows.size * 4 + 32) {
    for (const cacheKey of portalCache.current.keys()) {
      const sep = cacheKey.indexOf('\0')
      const rowKey = sep >= 0 ? cacheKey.slice(0, sep) : cacheKey
      if (!liveRows.has(rowKey)) portalCache.current.delete(cacheKey)
    }
  }

  const frame: NativePoolFrame = {
    rows: [],
    pinCount: layout?.pin ?? 0,
    padLeft: layout?.padLeft ?? 0,
    padRight: layout?.padRight ?? 0,
    visibleColKeys: layout?.keys ?? [],
  }

  if (layout && bag.describeNativeCell) {
    for (let idx = 0; idx < items.length; idx += 1) {
      const item = items[idx]!
      const node = nodes[item.index]
      if (!node || node.kind !== 'row') continue
      const top = Math.max(0, Math.round(item.start - margin))
      const rowId = String(node.row.id)
      const cells: NativePoolRowInput['cells'] = []
      for (let c = 0; c < layout.keys.length; c += 1) {
        const colKey = layout.keys[c]!
        const described = bag.describeNativeCell(node, colKey)
        if (!described) continue
        cells.push({
          colKey,
          stamp: nativeSpecStamp(described),
          describe: described,
        })
      }
      frame.rows.push({
        key: node.key,
        index: item.index,
        top,
        recordId: rowId,
        active: activeRowId != null && rowId === activeRowId,
        delayMs: enterDelay.get(node.key) ?? 0,
        pickAttrs: bag.recordPickAttrs?.(node.row),
        cells,
      })
    }
  }

  const windowKey = `${colKeys}\0${[...liveRows].join('\0')}`

  useLayoutEffect(() => {
    const tbody = poolBodyRef.current
    if (!tbody) return
    const overlay = overlayBodyRef.current
    if (overlay) {
      const topPx = `${tbody.offsetTop}px`
      if (overlay.style.top !== topPx) overlay.style.top = topPx
    }
    let pool = poolRef.current
    if (!pool) {
      pool = new NativeRowPool(tbody)
      poolRef.current = pool
      paintRef.current.onPoolReady?.(pool)
    }
    const nextPortals = pool.sync(frame)
    if (!samePortalMounts(prevPortalsRef.current, nextPortals)) {
      prevPortalsRef.current = nextPortals
      setPortals(nextPortals)
    }
    if (paintedWindow.current !== windowKey) {
      paintedWindow.current = windowKey
      paintRef.current.paintSelection?.()
    }
    // 明确列出帧输入依赖，避免 setPortals(nextPortals) 触发的二次 render 重复执行 pool.sync 与 tbody.offsetTop 回流。
  }, [nodes, items, margin, colKeys, activeRowId, pickMode, cellViewStamp, tagRev, scrollDirection])

  useLayoutEffect(() => {
    return () => {
      poolRef.current?.destroy()
      poolRef.current = null
      prevPortalsRef.current = []
      paintRef.current.onPoolReady?.(null)
    }
  }, [paintRef])

  const padRow = items.find((item) => item.size > 1)?.size ?? TABLE_ROW_PX
  const totalPx = Math.max(0, Math.round(totalSize))
  const renderPortal = bag.renderPortalCellContent

  return (
    <>
      <tbody
        ref={poolBodyRef}
        className="fsdb-grid-body"
        style={{ height: `${totalPx}px`, ['--fsdb-pad-row' as string]: `${padRow}px` }}
        onClick={(event) => {
          const btn = (event.target as Element | null)?.closest('button.fsdb-boolbtn[data-native-bool="1"]')
          if (!btn) return
          const td = btn.closest<HTMLTableCellElement>('td[data-col-key]')
          const tr = btn.closest<HTMLTableRowElement>('tr[data-record-id]')
          const rowId = tr?.dataset.recordId
          const colKey = td?.dataset.colKey
          if (!rowId || !colKey) return
          event.stopPropagation()
          paintRef.current.onNativeBoolToggle?.(rowId, colKey)
        }}
      />
      <tbody
        ref={overlayBodyRef}
        className="fsdb-grid-overlay"
      >
        {structuralRows}
        {renderPortal
          ? portals.map((mount) => {
              const node = rowNodesByKey.get(mount.rowKey)
              if (!node) return null
              const rowStamp = rowPaintStamp(node, stampCache.current)
              const viewStamp = bag.columnViewStamp?.(mount.colKey) ?? ''
              const portalStamp = `${rowStamp}\0${rowMetaStamp(node, pickMode)}\0${activeRowId === String(node.row.id) ? 1 : 0}\0${tagRev}\0${cellViewStamp}\0${viewStamp}`
              const hit = portalCache.current.get(mount.id)
              let content: ReactNode
              if (hit && hit.stamp === portalStamp) {
                content = hit.element
              } else {
                content = renderPortal(node, mount.colKey)
                portalCache.current.set(mount.id, { stamp: portalStamp, element: content })
              }
              return createPortal(content, mount.host, mount.id)
            })
          : null}
      </tbody>
    </>
  )
})

export type WindowedTableProps = {
  columns: { key: string }[]
  columnWidths: Record<string, number>
  columnPinCount: number
  wrapCells: boolean
  truncateCells: boolean
  resizingCol: string | null
  nodes: TablePaintNode[]
  error: string
  pickMode: boolean
  resetKey: string
  forceLiveChecks: boolean
  checkLayoutExtra: string
  paintRef: RefObject<TablePaintBag>
  chromeRef: RefObject<TableChromeBag>
  colWindowRef: RefObject<TableColumnSlice>
  tableRef: RefObject<HTMLTableElement | null>
  wrapRef: RefObject<HTMLDivElement | null>
  stageRef: RefObject<HTMLDivElement | null>
  checkStackRef: RefObject<HTMLDivElement | null>
  checkHoverRef: RefObject<string | 'head' | null>
  paintCheckHover: (next: string | 'head' | null, force?: boolean) => void
  renderCheckHead: () => ReactNode
  renderCheckRow: (id: string) => ReactNode
  checkStore?: TableCheckStore
  onVisibleRange?: (start: number, end: number) => void
  activeRowId: string | null
  cellViewStamp?: string
  frozen?: boolean
  retainedRowId?: string | null
  retainedRowKey?: string | null
  retainedColumnKey?: string | null
  preserveMountedRows?: boolean
}

export const WindowedTable = memo(function WindowedTable({
  columns,
  columnWidths,
  columnPinCount,
  wrapCells,
  truncateCells,
  resizingCol,
  nodes,
  error,
  pickMode,
  resetKey,
  forceLiveChecks,
  paintRef,
  chromeRef,
  colWindowRef,
  tableRef,
  wrapRef,
  stageRef,
  checkStackRef,
  checkHoverRef,
  paintCheckHover,
  renderCheckHead,
  renderCheckRow,
  checkStore,
  onVisibleRange,
  activeRowId,
  cellViewStamp,
  frozen: _frozen = false,
  retainedRowId,
  retainedRowKey,
  retainedColumnKey,
  preserveMountedRows,
}: WindowedTableProps) {
  const pinnedHead = usePinnedTableHead(tableRef, wrapRef)
  const dockedViewportRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    if (dockedViewportRef.current && wrapRef.current) dockedViewportRef.current.scrollLeft = wrapRef.current.scrollLeft
  }, [pinnedHead, wrapRef])
  const { virtualizer, items, margin, isScrolling, scrollDirection, revealRow } = useTableViewport({
    nodes,
    wrapCells,
    resetKey,
    layoutKey: JSON.stringify([columns.map((col) => col.key), wrapCells, truncateCells]),
    measureKey: wrapCells && !resizingCol ? JSON.stringify(columnWidths) : '',
    tableRef,
    wrapRef,
    retainedRowId,
    retainedRowKey,
    preserveMountedRows,
  })
  paintRef.current.revealRow = revealRow
  const columnPx = useMemo(
    () => columns.map((col, index) => tableColumnWidth(col.key, columnWidths[col.key], index < columnPinCount)),
    [columnPinCount, columnWidths, columns],
  )
  const columnKeys = useMemo(() => columns.map((col) => col.key), [columns])
  const { slice: colWindow, revealColumn } = useTableColumnViewport({
    keys: columnKeys, widths: columnPx, pinCount: columnPinCount, resetKey, wrapCells,
    tableRef, wrapRef, retainedKey: retainedColumnKey, resizingKey: resizingCol, preserveMounted: preserveMountedRows,
  })
  paintRef.current.revealColumn = revealColumn
  colWindowRef.current = colWindow
  const windowedColumns = useMemo(() => windowedColumnsOf(columns, colWindow), [colWindow, columns])
  const tableColSpan = Math.max(
    windowedColumns.length + (colWindow.padLeft > 0 ? 1 : 0) + (colWindow.padRight > 0 ? 1 : 0) + 1,
    1,
  )
  const paintedTablePx = useMemo(() => {
    let sum = Math.max(0, colWindow.padLeft) + Math.max(0, colWindow.padRight)
    for (let i = 0; i < colWindow.pin; i += 1) sum += columnPx[i] || 0
    for (let i = colWindow.start; i < colWindow.end; i += 1) sum += columnPx[i] || 0
    return Math.max(sum, 1)
  }, [colWindow.end, colWindow.padLeft, colWindow.padRight, colWindow.pin, colWindow.start, columnPx])
  const padCols = useMemo(() => {
    const widths: number[] = []
    for (let i = 0; i < colWindow.pin; i += 1) widths.push(columnPx[i] || 0)
    if (colWindow.padLeft > 0) widths.push(colWindow.padLeft)
    for (let i = colWindow.start; i < colWindow.end; i += 1) widths.push(columnPx[i] || 0)
    if (colWindow.padRight > 0) widths.push(colWindow.padRight)
    return padColumnRules(widths)
  }, [colWindow.end, colWindow.padLeft, colWindow.padRight, colWindow.pin, colWindow.start, columnPx])
  paintRef.current.colSpan = tableColSpan
  const rangeStart = virtualizer.range?.startIndex ?? 0
  const rangeEnd = virtualizer.range ? Math.min(nodes.length, virtualizer.range.endIndex + TABLE_VIEWPORT_OVERSCAN + 1) : 0
  useEffect(() => { onVisibleRange?.(rangeStart, rangeEnd) }, [onVisibleRange, rangeStart, rangeEnd])
  const measureRow = useCallback((node: HTMLTableRowElement | null) => virtualizer.measureElement(node), [virtualizer])
  const chrome = chromeRef.current
  const paintedColStyle = (index: number) => colWidthStyle(columnPx[index]) ?? padColBox(columnPx[index] || 72)
  const colWidthVars = useMemo(() => {
    const vars: Record<string, string> = {}
    for (let i = 0; i < columns.length; i += 1) {
      vars[tableColWidthVar(columns[i]!.key)] = `${columnPx[i] || 72}px`
    }
    return vars
  }, [columnPx, columns])

  const [checkRailHost, setCheckRailHost] = useState<HTMLElement | null>(null)
  useLayoutEffect(() => {
    setCheckRailHost(stageRef.current?.closest<HTMLElement>('.tasks-table-shell') ?? null)
  }, [stageRef])
  const checkRailNode = (
    <TableCheckRail
      tableRef={tableRef}
      stackRef={checkStackRef}
      stageRef={stageRef}
      hoverRef={checkHoverRef}
      items={items}
      nodes={nodes}
      margin={margin}
      isScrolling={isScrolling}
      forceLive={forceLiveChecks}
      paintCheckHover={paintCheckHover}
      renderHead={renderCheckHead}
      renderRow={renderCheckRow}
      checkStore={checkStore}
    />
  )

  return (
    <div className="tasks-table-stage" ref={stageRef} onMouseLeave={checkRailHost ? undefined : () => paintCheckHover(null)}>
      {pinnedHead ? createPortal(
        <div className="fsdb-pinned-head-shell" style={{ width: pinnedHead.width }}>
          <div className="fsdb-pinned-head-check">{checkStore ? checkStore.renderHead() : renderCheckHead()}</div>
          <div className="fsdb-pinned-head-viewport" ref={dockedViewportRef} style={{ width: pinnedHead.width }}
            onScroll={(event) => { if (wrapRef.current) wrapRef.current.scrollLeft = event.currentTarget.scrollLeft }}
            onWheel={(event) => { if (event.deltaX && wrapRef.current) wrapRef.current.scrollLeft += event.deltaX }}>
            <div className="fsdb-pinned-head-stage" style={{ width: `${pinnedHead.tableWidth}px` }}>
              <table
                className="tasks-table is-cols-fixed is-grid fsdb-pinned-head-table"
                style={{ ...colWidthVars, width: pinnedHead.tableWidth, ['--fsdb-pin-title' as string]: `${columnPx[0] || 240}px` }}
              >
                <colgroup>
                  {columns.slice(0, colWindow.pin).map((col, index) => <col key={col.key} data-col-key={col.key} style={paintedColStyle(index)} />)}
                  {colWindow.padLeft > 0 ? <col key="pad-left" style={padColBox(colWindow.padLeft)} /> : null}
                  {columns.slice(colWindow.start, colWindow.end).map((col, index) => <col key={col.key} data-col-key={col.key} style={paintedColStyle(colWindow.start + index)} />)}
                  {colWindow.padRight > 0 ? <col key="pad-right" style={padColBox(colWindow.padRight)} /> : null}
                  <col key="fill" className="fsdb-col-fill" />
                </colgroup>
                <thead><tr>
                  {columns.slice(0, colWindow.pin).map((col) => chrome.paintHeadTh(col))}
                  {colWindow.padLeft > 0 ? <th key="pad-left" className="fsdb-col-pad" aria-hidden style={padColBox(colWindow.padLeft)} /> : null}
                  {columns.slice(colWindow.start, colWindow.end).map((col) => chrome.paintHeadTh(col))}
                  {colWindow.padRight > 0 ? <th key="pad-right" className="fsdb-col-pad" aria-hidden style={padColBox(colWindow.padRight)} /> : null}
                  <th key="fill" className="fsdb-col-fill" aria-hidden />
                </tr></thead>
              </table>
            </div>
          </div>
        </div>, pinnedHead.host,
      ) : null}
      {checkRailHost ? createPortal(checkRailNode, checkRailHost) : checkRailNode}
      <table
        ref={tableRef}
        tabIndex={0}
        className={`tasks-table${wrapCells ? ' is-wrap' : ''} is-cols-fixed is-grid${truncateCells ? ' is-truncate' : ''}${resizingCol ? ' is-col-resize' : ''}`}
        style={{
          ...colWidthVars,
          minWidth: `${paintedTablePx}px`,
          outline: 'none',
          ['--fsdb-table-px' as string]: `${paintedTablePx}px`,
          ['--fsdb-pin-title' as string]: `${columnPx[0] || 240}px`,
          ...(padCols ? { ['--fsdb-pad-cols' as string]: padCols } : {}),
        }}
        onPointerDown={(event) => chromeRef.current.onPointerDown?.(event)}
        onPointerMove={(event) => chromeRef.current.onPointerMove?.(event)}
        onClick={(event) => chromeRef.current.onClick?.(event)}
        onKeyDown={(event) => chromeRef.current.onKeyDown?.(event)}
        onMouseOver={chrome.onMouseOver}
        onContextMenu={(event) => chromeRef.current.onContextMenu?.(event)}
      >
        <colgroup>
          {columns.slice(0, colWindow.pin).map((col, index) => (
            <col key={col.key} data-col-key={col.key} style={paintedColStyle(index)} />
          ))}
          {colWindow.padLeft > 0 ? <col key="pad-left" style={padColBox(colWindow.padLeft)} /> : null}
          {columns.slice(colWindow.start, colWindow.end).map((col, index) => (
            <col key={col.key} data-col-key={col.key} style={paintedColStyle(colWindow.start + index)} />
          ))}
          {colWindow.padRight > 0 ? <col key="pad-right" style={padColBox(colWindow.padRight)} /> : null}
          <col key="fill" className="fsdb-col-fill" />
        </colgroup>
        <thead>
          <tr>
            {columns.slice(0, colWindow.pin).map((col) => chrome.paintHeadTh(col))}
            {colWindow.padLeft > 0 ? <th key="pad-left" className="fsdb-col-pad" aria-hidden style={padColBox(colWindow.padLeft)} /> : null}
            {columns.slice(colWindow.start, colWindow.end).map((col) => chrome.paintHeadTh(col))}
            {colWindow.padRight > 0 ? <th key="pad-right" className="fsdb-col-pad" aria-hidden style={padColBox(colWindow.padRight)} /> : null}
            <th key="fill" className="fsdb-col-fill" aria-hidden />
          </tr>
        </thead>
        <TablePaintCtx.Provider value={paintRef}>
          {paintRef.current.describeNativeCell &&
          paintRef.current.renderPortalCellContent &&
          !wrapCells &&
          !(nodes.length === 1 && nodes[0]?.kind === 'empty') ? (
            <NativeTableBody
              nodes={nodes}
              items={items}
              margin={margin}
              totalSize={virtualizer.getTotalSize()}
              colSpan={tableColSpan}
              colKeys={`${colWindow.pin}:${colWindow.padLeft}:${colWindow.padRight}\0${windowedColumns.map((col) => col.key).join('\0')}`}
              error={error}
              pickMode={pickMode}
              activeRowId={activeRowId}
              cellViewStamp={cellViewStamp}
              scrollDirection={scrollDirection}
            />
          ) : (
            <TableBody
              nodes={nodes}
              items={items}
              margin={margin}
              totalSize={virtualizer.getTotalSize()}
              measureRow={wrapCells ? measureRow : undefined}
              colSpan={tableColSpan}
              colKeys={`${colWindow.pin}:${colWindow.padLeft}:${colWindow.padRight}\0${windowedColumns.map((col) => col.key).join('\0')}`}
              error={error}
              pickMode={pickMode}
              activeRowId={activeRowId}
              cellViewStamp={cellViewStamp}
              scrollDirection={scrollDirection}
            />
          )}
        </TablePaintCtx.Provider>
      </table>
    </div>
  )
})
