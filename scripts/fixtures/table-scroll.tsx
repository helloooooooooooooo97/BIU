import { createRoot } from 'react-dom/client'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { WindowedTable } from '../../packages/core-file-system/src/web/browser.tsx'
import { ensureFsdbStyle } from '../../packages/core-file-system/src/web/fsdb-style.ts'
import { LiveTableCellSelection, tableCursorFromCell } from '../../packages/core-file-system/src/web/table-cell-selection.ts'
import { useStickyToolbar } from '../../packages/core-file-system/src/web/sticky-toolbar.ts'

ensureFsdbStyle()
const columns = Array.from({ length: 20 }, (_, i) => ({ key: i === 0 ? 'title' : i === 1 ? 'actions' : `field${i}` }))
const columnWidths = Object.fromEntries(columns.map((col, i) => [col.key, i === 0 ? 240 : i === 1 ? 72 : 120]))
function Fixture() {
  const wrapRef = useRef<HTMLDivElement>(null), tableRef = useRef<HTMLTableElement>(null)
  const stageRef = useRef<HTMLDivElement>(null), stackRef = useRef<HTMLDivElement>(null)
  const hoverRef = useRef<string | 'head' | null>(null), toolbarRef = useRef<HTMLElement>(null)
  const colWindowRef = useRef<any>({}), paintRef = useRef<any>({ colSpan: 21, error: '' }), chromeRef = useRef<any>({})
  const [widths, setWidths] = useState(columnWidths)
  const [duplicates, setDuplicates] = useState(false)
  const [sparse, setSparse] = useState(false)
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})
  const [wrap, setWrap] = useState(false), [retained, setRetained] = useState<string | null>(null)
  useStickyToolbar(toolbarRef)
  const nodes = useMemo(() => duplicates ? [
    { key: 'React', ids: ['107', '190', '191', '196', '197'] },
    { key: 'Python', ids: ['003', '004', '008', '009', '101', '102', '107', '108', '113'] },
  ].flatMap(({ key, ids }) => [
    { key: `head:${key}`, kind: 'group-head', groupKey: key, label: key, count: ids.length },
    ...ids.map((id) => ({ key: `${key}:${id}`, kind: 'row', row: { id, index: Number(id) }, depth: 0, hasKids: false, kidCount: 0 })),
    { key: `pager:${key}`, kind: 'group-pager', groupKey: key, count: ids.length, pageIndex: 0 },
  ]) : Array.from({ length: 5 }, (_, group) => {
    const key = `group${group}`
    return [
      { key: `head:${key}`, kind: 'group-head', groupKey: key, label: `分组 ${group}`, count: 20 },
      ...(!collapsed[key] ? Array.from({ length: 20 }, (_, i) => ({ key: `row:${group * 20 + i}`, kind: 'row', row: { id: `r${group * 20 + i}`, index: group * 20 + i }, depth: 0, hasKids: false, kidCount: 0 })).filter((node) => !sparse || node.row.index % 2 === 0) : []),
      ...(!collapsed[key] ? [{ key: `pager:${key}`, kind: 'group-pager', groupKey: key, count: 20, pageIndex: 0 }] : []),
    ]
  }).flat(), [collapsed, sparse, duplicates])
  const model = useMemo(() => ({ rowIds: nodes.flatMap((node: any) => node.kind === 'row' ? [node.row.id] : []), rowKeys: nodes.flatMap((node: any) => node.kind === 'row' ? [node.key] : []), keys: columns.map((col) => col.key), writable: new Set(['title']) }), [nodes])
  const modelRef = useRef(model); modelRef.current = model
  const selectionState = useRef<any>({ focus: { current: null }, range: { current: null }, members: { current: new Set() } })
  const selection = useRef<LiveTableCellSelection | null>(null)
  if (!selection.current) selection.current = new LiveTableCellSelection(() => modelRef.current, selectionState.current)
  useLayoutEffect(() => { selection.current!.reconcile(tableRef.current) }, [model])
  paintRef.current.paintSelection = () => selection.current!.paint(tableRef.current)
  paintRef.current.renderNode = (node: any) => {
    if (node.kind === 'group-head') return <tr key={node.key} className="fsdb-group-row" data-group={node.groupKey}><td colSpan={paintRef.current.colSpan}><header className="tasks-queue-ghead"><button onClick={() => setCollapsed((prev) => ({ ...prev, [node.groupKey]: !prev[node.groupKey] }))}>{node.label}</button><button style={{ marginLeft: 'auto' }}>+</button></header></td></tr>
    if (node.kind === 'group-pager') return <tr key={node.key} className="fsdb-group-pager"><td colSpan={paintRef.current.colSpan}><div className="fsdb-pager">20 条记录 <button>下一页</button></div></td></tr>
    const slice = colWindowRef.current
    const cell = (col: { key: string }) => {
      const i = columns.findIndex((item) => item.key === col.key)
      return <td key={col.key} data-col-key={col.key} className={i < 2 ? 'is-pin-col' : undefined} style={{ height: node.row.index % 7 === 0 ? 64 : 32 }}><span className="fsdb-cell">{i === 0 ? `记录 ${node.row.index}` : i === 1 ? <button onClick={() => { (window as any).__actionClicks++ }}>动作</button> : `字段 ${i} 内容内容内容内容内容内容`}</span></td>
    }
    return <tr key={node.key} data-record-id={node.row.id} data-row-key={node.key}>
      {columns.slice(0, slice.pin).map(cell)}
      {slice.padLeft > 0 ? <td className="fsdb-col-pad" aria-hidden style={{ width: slice.padLeft, minWidth: slice.padLeft, maxWidth: slice.padLeft }} /> : null}
      {columns.slice(slice.start, slice.end).map(cell)}
      {slice.padRight > 0 ? <td className="fsdb-col-pad" aria-hidden style={{ width: slice.padRight, minWidth: slice.padRight, maxWidth: slice.padRight }} /> : null}
      <td className="fsdb-col-fill" />
    </tr>
  }
  chromeRef.current.paintHeadTh = (col: { key: string }) => <th key={col.key} data-col-key={col.key} className={col.key === 'title' || col.key === 'actions' ? 'is-pin-col' : undefined}><span className="tasks-th"><button onClick={() => { (window as any).__headerClicks++ }}>{col.key}</button></span></th>
  useEffect(() => {
    Object.assign(window, { __ready: true, __headerClicks: 0, __actionClicks: 0, __toggleWrap: () => setWrap((prev) => !prev), __resize: (key: string, width: number) => setWidths((prev) => ({ ...prev, [key]: width })), __duplicates: setDuplicates, __dragDisplay: (from: string, to: string) => {
      const table = tableRef.current!
      const start = tableCursorFromCell(table.querySelector<HTMLElement>(`tr[data-row-key="${from}"] td[data-col-key="title"]`)!)!
      const end = tableCursorFromCell(table.querySelector<HTMLElement>(`tr[data-row-key="${to}"] td[data-col-key="title"]`)!)!
      selection.current!.apply(start, end, table)
    }, __sparse: setSparse, __select: (from: string, to: string) => selection.current!.apply({ id: from, key: 'title' }, { id: to, key: 'field5' }, tableRef.current), __selectedMembers: () => selectionState.current.members.current.size, __retain: setRetained, __reveal: (id: string) => paintRef.current.revealRow?.(id), __revealColumn: (key: string) => paintRef.current.revealColumn?.(key) })
  }, [])
  return <div className="fsdb-page"><div className="fsdb-right"><div className="fsdb-right-body"><div className="app-pane-in"><main className="fsdb-main">
    <div className="fsdb-page-banner" style={{ height: 140, flex: 'none' }}>全部页面</div>
    <header className="tasks-toolbar" ref={toolbarRef}><span>操作栏</span></header>
    <div className="fsdb-workspace"><div className="fsdb-stage"><div className="tasks-table-wrap" ref={wrapRef}>
      <WindowedTable columns={columns} columnWidths={widths} columnPinCount={2} wrapCells={wrap} truncateCells={false} resizingCol={null}
        nodes={nodes as any} error="" pickMode={false} resetKey="fixture" forceLiveChecks checkLayoutExtra={String(wrap)}
        paintRef={paintRef} chromeRef={chromeRef} colWindowRef={colWindowRef} tableRef={tableRef} wrapRef={wrapRef} stageRef={stageRef}
        checkStackRef={stackRef} checkHoverRef={hoverRef} paintCheckHover={() => {}} renderCheckHead={() => <button>全选</button>}
        renderCheckRow={(id) => <button aria-label={`选择 ${id}`}>□</button>} activeRowId={null} retainedRowId={retained} />
    </div></div></div>
  </main></div></div></div></div>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
