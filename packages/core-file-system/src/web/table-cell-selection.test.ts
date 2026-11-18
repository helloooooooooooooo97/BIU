import { afterEach, expect, test } from 'vitest'
import { LiveTableCellSelection, tableCursorFromCell, type TableSelectionModel, type TableSelectionState } from './table-cell-selection.ts'
import { tableCellRangeKey } from './table-keys.ts'

function renderRows(ids: string[]) {
  document.body.innerHTML = `<table><tbody>${ids.map((id) => `<tr data-record-id="${id}"><td data-col-key="title"></td><td data-col-key="value"></td></tr>`).join('')}</tbody></table>`
  return document.querySelector('table')!
}
function selected(table: HTMLTableElement) {
  return Array.from(table.querySelectorAll('td.is-cell-on,td.is-cell-range')).map((cell) => `${cell.closest('tr')!.dataset.recordId}:${(cell as HTMLElement).dataset.colKey}`)
}
function setup(ids: string[]) {
  let model: TableSelectionModel = { rowIds: ids, keys: ['title', 'value'], writable: new Set(['title']) }
  const state: TableSelectionState = { focus: { current: null }, range: { current: null }, members: { current: new Set() } }
  const selection = new LiveTableCellSelection(() => model, state)
  return { selection, state, update: (rowIds: string[]) => { model = { ...model, rowIds } } }
}
afterEach(() => { document.body.innerHTML = '' })

test('a gesture created before interleaved rows load selects the current contiguous rectangle', () => {
  const initial = ['r0', 'r2', 'r4', 'r6']
  const { selection, update } = setup(initial)
  let table = renderRows(initial)
  // This function is retained by the pointer listener across data updates.
  const drag = (id: string) => selection.apply({ id: 'r0', key: 'title' }, { id, key: 'value' }, table)
  drag('r4')
  const loaded = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5', 'r6']
  update(loaded)
  table = renderRows(loaded)
  drag('r6')
  expect(selected(table)).toEqual(loaded.flatMap((id) => [`${id}:title`, `${id}:value`]))
})

test('rows loaded while the pointer is stationary are immediately included by reconciliation', () => {
  const { selection, state, update } = setup(['r0', 'r2', 'r4'])
  let table = renderRows(['r0', 'r2', 'r4'])
  selection.apply({ id: 'r0', key: 'title' }, { id: 'r4', key: 'value' }, table)
  const loaded = ['r0', 'r1', 'r2', 'r3', 'r4']
  update(loaded)
  table = renderRows(loaded)
  selection.reconcile(table)
  expect(state.members.current.size).toBe(10)
  expect(selected(table)).toHaveLength(10)
  expect(state.members.current.has(tableCellRangeKey('r3', 'title'))).toBe(true)
})

test('virtual remounts restore selection and clear stale alternating classes', () => {
  const { selection } = setup(Array.from({ length: 10 }, (_, i) => `r${i}`))
  let table = renderRows(['r0', 'r1', 'r2'])
  selection.apply({ id: 'r0', key: 'title' }, { id: 'r7', key: 'value' }, table)
  table = renderRows(['r4', 'r5', 'r6', 'r7', 'r8'])
  table.querySelector('tr[data-record-id="r8"] td')!.classList.add('is-cell-range')
  selection.paint(table)
  expect(selected(table)).toEqual(['r4', 'r5', 'r6', 'r7'].flatMap((id) => [`${id}:title`, `${id}:value`]))
  expect(table.querySelector('tr[data-record-id="r7"] td[data-col-key="value"]')!.classList.contains('is-cell-ro')).toBe(true)
})

test('shrinking or reversing a range clears cells outside the current bounds', () => {
  const ids = ['r0', 'r1', 'r2', 'r3', 'r4']
  const { selection } = setup(ids)
  const table = renderRows(ids)
  selection.apply({ id: 'r4', key: 'value' }, { id: 'r0', key: 'title' }, table)
  selection.apply({ id: 'r4', key: 'value' }, { id: 'r3', key: 'title' }, table)
  expect(selected(table)).toEqual(['r3:title', 'r3:value', 'r4:title', 'r4:value'])
})

test('range bounds identify occurrences while matching records in other groups remain highlighted', () => {
  const ids = ['a', 'b', 'c', 'a', 'b', 'c']
  const rowKeys = ['React:a', 'React:b', 'React:c', 'Python:a', 'Python:b', 'Python:c']
  const model = { rowIds: ids, rowKeys, keys: ['title', 'value'], writable: new Set(['title']) }
  const state: TableSelectionState = { focus: { current: null }, range: { current: null }, members: { current: new Set() } }
  const selection = new LiveTableCellSelection(() => model, state)
  const table = renderRows(ids)
  Array.from(table.rows).forEach((row, index) => { row.dataset.rowKey = rowKeys[index] })
  selection.apply({ id: 'a', key: 'title', rowKey: 'Python:a' }, { id: 'c', key: 'value', rowKey: 'Python:c' }, table)
  const counts = Array.from(table.rows).map((row) => row.querySelectorAll('.is-cell-on,.is-cell-range').length)
  expect(counts).toEqual([2, 2, 2, 2, 2, 2])
  expect(table.querySelectorAll('.is-cell-on')).toHaveLength(1)
})


test('dragging Python 003 through 107 includes every intervening row when 107 also appears earlier', () => {
  const previous = ['107', '190', '191', '196', '197']
  const python = ['003', '004', '008', '009', '101', '102', '107', '108', '113']
  const ids = [...previous, ...python]
  const rowKeys = [...previous.map((id) => `React:${id}`), ...python.map((id) => `Python:${id}`)]
  const model = { rowIds: ids, rowKeys, keys: ['title', 'value'], writable: new Set(['title']) }
  const state: TableSelectionState = { focus: { current: null }, range: { current: null }, members: { current: new Set() } }
  const selection = new LiveTableCellSelection(() => model, state)
  const table = renderRows(ids)
  Array.from(table.rows).forEach((row, index) => { row.dataset.rowKey = rowKeys[index] })
  const anchor = tableCursorFromCell(table.querySelector<HTMLElement>('tr[data-row-key="Python:003"] td[data-col-key="title"]')!)!
  const focus = tableCursorFromCell(table.querySelector<HTMLElement>('tr[data-row-key="Python:107"] td[data-col-key="title"]')!)!
  selection.apply(anchor, focus, table)
  const counts = Array.from(table.rows).map((row) => row.querySelectorAll('.is-cell-on,.is-cell-range').length)
  expect(counts).toEqual([1, 0, 0, 0, 0, 1, 1, 1, 1, 1, 1, 1, 0, 0])
  expect([...state.members.current]).toEqual(python.slice(0, 7).map((id) => tableCellRangeKey(id, 'title')))
  expect(table.querySelectorAll('.is-cell-on')).toHaveLength(1)
  expect(table.querySelector('.is-cell-on')?.closest('tr')?.dataset.rowKey).toBe('Python:107')
})
