import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { CLEAR_SHELL_TABLE_CELL, FOCUS_SHELL_TABLE, claimTableCellPick, consumePendingTablePane, firstTableTitleCell, moveTableCell, readTablePaneRest, rememberTablePaneRest, requestTablePaneFocus, tableActionArrowLeave, tableActionButtonStep, tableCellRange, tableCellRangeKey, tableCellRangeRowIds, tableClearKey, tableClearedValue, tableCreateKey, tableKeyDir, tableNavKeys, tablePaneFromEvent, tablePaneHotkey, tablePaneOther, tableSendChatHotkey, tableTitleOpenWhere, tableTreeArrowAction, tableTypeToEditChar } from './table-keys.ts'

test('first table cell is the title of the first row', () => {
  assert.deepEqual(firstTableTitleCell(['a', 'b'], ['status', 'title', 'actions'], 'title'), { id: 'a', key: 'title' })
  assert.deepEqual(firstTableTitleCell(['a'], ['status', 'actions'], 'title'), { id: 'a', key: 'status' })
  assert.equal(firstTableTitleCell([], ['title'], 'title'), null)
})

test('table nav keys include actions and skip pad columns', () => {
  assert.deepEqual(
    tableNavKeys([{ key: 'title' }, { key: 'actions' }, { key: 'status' }, { key: 'pad:1' }, { key: 'fsdb-col-fill' }]),
    ['title', 'actions', 'status'],
  )
})

test('table cell range is a closed rectangle like Excel', () => {
  const rows = ['a', 'b', 'c']
  const keys = ['title', 'status', 'owner']
  assert.deepEqual(
    tableCellRange(rows, keys, { id: 'a', key: 'title' }, { id: 'b', key: 'status' }),
    [
      { id: 'a', key: 'title' },
      { id: 'a', key: 'status' },
      { id: 'b', key: 'title' },
      { id: 'b', key: 'status' },
    ],
  )
  assert.deepEqual(tableCellRange(rows, keys, { id: 'c', key: 'owner' }, { id: 'c', key: 'owner' }), [
    { id: 'c', key: 'owner' },
  ])
  assert.equal(tableCellRangeKey('a', 'title'), 'a\0title')
  assert.deepEqual(
    tableCellRangeRowIds(
      tableCellRange(rows, keys, { id: 'a', key: 'title' }, { id: 'b', key: 'status' }),
    ),
    ['a', 'b'],
  )
})

test('table cell move stays on the grid and stops at edges', () => {
  const rows = ['a', 'b']
  const keys = ['title', 'status']
  const start = { id: 'a', key: 'title' }
  assert.deepEqual(moveTableCell(rows, keys, start, 'right'), { id: 'a', key: 'status' })
  assert.deepEqual(moveTableCell(rows, keys, start, 'left'), start)
  assert.deepEqual(moveTableCell(rows, keys, { id: 'a', key: 'status' }, 'down'), { id: 'b', key: 'status' })
  assert.deepEqual(moveTableCell(rows, keys, { id: 'b', key: 'status' }, 'down'), { id: 'b', key: 'status' })
  assert.deepEqual(moveTableCell(rows, keys, { id: 'b', key: 'status' }, 'home'), { id: 'b', key: 'title' })
})

test('Shift+Enter creates a record; ⌘Enter still opens the title', () => {
  const enter = { key: 'Enter', shift: true, meta: false, ctrl: false, alt: false }
  assert.equal(tableCreateKey(enter), true)
  assert.equal(tableCreateKey({ ...enter, shift: false }), false)
  assert.equal(tableCreateKey({ ...enter, meta: true }), false)
  assert.equal(tableCreateKey({ ...enter, ctrl: true }), false)
  assert.equal(tableCreateKey({ ...enter, alt: true }), false)
  assert.equal(tableCreateKey({ ...enter, key: ' ' }), false)
})

test('title cell ⌘Enter opens here, ⌘⇧Enter opens in the inspector', () => {
  const title = { labelKey: 'title', cellKey: 'title', key: 'Enter', meta: true }
  assert.equal(tableTitleOpenWhere({ ...title, shift: false }), 'page')
  assert.equal(tableTitleOpenWhere({ ...title, shift: true }), 'inspector')
  assert.equal(tableTitleOpenWhere({ ...title, shift: false, ctrl: true, meta: false }), 'page')
  assert.equal(tableTitleOpenWhere({ ...title, shift: false, meta: false }), null)
  assert.equal(tableTitleOpenWhere({ ...title, shift: false, cellKey: 'status' }), null)
})

test('title cell Shift+arrows expand and collapse tree parents', () => {
  const base = { shift: true, treeOn: true, labelKey: 'title', cellKey: 'title', hasKids: true, collapsed: true }
  assert.equal(tableTreeArrowAction('right', base), 'expand')
  assert.equal(tableTreeArrowAction('left', base), null)
  assert.equal(tableTreeArrowAction('right', { ...base, shift: false }), null)
  assert.equal(tableTreeArrowAction('right', { ...base, collapsed: false }), null)
  assert.equal(tableTreeArrowAction('left', { ...base, collapsed: false }), 'collapse')
  assert.equal(tableTreeArrowAction('right', { ...base, hasKids: false }), null)
  assert.equal(tableTreeArrowAction('right', { ...base, cellKey: 'actions' }), null)
  assert.equal(tableTreeArrowAction('down', base), null)
})

test('action cell arrows stay on buttons until Esc', () => {
  assert.equal(tableActionButtonStep(2, 0, 'right'), 1)
  assert.equal(tableActionButtonStep(2, 1, 'right'), 1)
  assert.equal(tableActionButtonStep(2, 0, 'left'), 0)
  assert.equal(tableActionButtonStep(2, 1, 'left'), 0)
  assert.equal(tableActionArrowLeave(2, 0, 'left'), true)
  assert.equal(tableActionArrowLeave(2, 0, 'right'), false)
  assert.equal(tableActionArrowLeave(2, 1, 'right'), true)
})

test('delete and backspace clear the selected cell', () => {
  assert.equal(tableClearKey('Delete'), true)
  assert.equal(tableClearKey('Backspace'), true)
  assert.equal(tableClearKey('Enter'), false)
  assert.equal(tableClearedValue('string'), '')
  assert.equal(tableClearedValue('number'), null)
  assert.deepEqual(tableClearedValue('multi-select'), [])
  assert.equal(tableClearedValue('boolean'), false)
  assert.equal(tableClearedValue('action'), undefined)
})

test('letters and digits type into text and number cells', () => {
  assert.equal(tableTypeToEditChar('a', 'string'), 'a')
  assert.equal(tableTypeToEditChar('中', 'text'), '中')
  assert.equal(tableTypeToEditChar('7', 'number'), '7')
  assert.equal(tableTypeToEditChar('.', 'number'), '.')
  assert.equal(tableTypeToEditChar('a', 'number'), null)
  assert.equal(tableTypeToEditChar('Enter', 'string'), null)
  assert.equal(tableTypeToEditChar('a', 'select'), null)
})

test('table keys map like Linear', () => {
  assert.equal(tableKeyDir('ArrowDown'), 'down')
  assert.equal(tableKeyDir('Tab'), 'right')
  assert.equal(tableKeyDir('Tab', true), 'left')
  assert.equal(tableKeyDir('Enter'), null)
})

test('⌘L on a table cell is the same chat hotkey as the document', () => {
  const chord = { key: 'l', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }
  assert.equal(tableSendChatHotkey(chord), true)
  assert.equal(tableSendChatHotkey({ ...chord, ctrlKey: true, metaKey: false }), true)
  assert.equal(tableSendChatHotkey({ ...chord, key: 'L' }), true)
  assert.equal(tableSendChatHotkey({ ...chord, shiftKey: true }), false)
  assert.equal(tableSendChatHotkey({ ...chord, altKey: true }), false)
  assert.equal(tableSendChatHotkey({ ...chord, key: 'k' }), false)
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  assert.match(browser, /tableSendChatHotkey\(event\)/)
  assert.match(browser, /sendSelectedCellToChat/)
  assert.match(browser, /sendTableSelectionToChat/)
  assert.match(browser, /sendPickedRowsToChat/)
  assert.match(browser, /fieldPickId\(row\.id, cursor\.key\)/)
  assert.match(browser, /field: cursor\.key/)
  assert.match(browser, /inCell && selected/)
})

test('⌘\\ toggles the main and inspector panes', () => {
  const slash = { key: '\\', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }
  assert.equal(tablePaneHotkey(slash), true)
  assert.equal(tablePaneHotkey({ ...slash, code: 'Backslash', key: '¥' }), true)
  assert.equal(tablePaneHotkey({ ...slash, shiftKey: true }), false)
  assert.equal(tablePaneHotkey({ ...slash, metaKey: false }), false)
  assert.equal(tablePaneHotkey({ ...slash, key: 'l' }), false)
  assert.equal(tablePaneOther('main'), 'inspector')
  assert.equal(tablePaneOther('inspector'), 'main')
  assert.equal(FOCUS_SHELL_TABLE, 'biu:focus-shell-table')
  assert.equal(tablePaneFromEvent(new CustomEvent(FOCUS_SHELL_TABLE, { detail: { pane: 'inspector' } })), 'inspector')
  requestTablePaneFocus('inspector')
  assert.equal(consumePendingTablePane('main'), false)
  assert.equal(consumePendingTablePane('inspector'), true)
  assert.equal(consumePendingTablePane('inspector'), false)
})

test('pane rest cache restores the same cell after switching back', () => {
  rememberTablePaneRest('main', { kind: 'cell', path: '/tasks', viewId: 'all', id: 'a', key: 'title' })
  rememberTablePaneRest('inspector', { kind: 'title', path: '/pages', viewId: 'v', detailId: 'p1', start: 3, end: 3 })
  assert.deepEqual(readTablePaneRest('main', { path: '/tasks', viewId: 'all' }), {
    kind: 'cell',
    path: '/tasks',
    viewId: 'all',
    id: 'a',
    key: 'title',
  })
  assert.equal(readTablePaneRest('main', { path: '/pages', viewId: 'all' }), null)
  assert.equal(readTablePaneRest('main', { path: '/tasks', viewId: 'all', detailId: 'x' }), null)
  assert.deepEqual(readTablePaneRest('inspector', { path: '/pages', viewId: 'v', detailId: 'p1' })?.kind, 'title')
  rememberTablePaneRest('main', null)
  rememberTablePaneRest('inspector', null)
})

test('claiming a table cell pick tells the other pane to clear', () => {
  const seen: string[] = []
  const onClear = (event: Event) => {
    seen.push(tablePaneFromEvent(event) ?? '')
  }
  window.addEventListener(CLEAR_SHELL_TABLE_CELL, onClear)
  claimTableCellPick('inspector')
  window.removeEventListener(CLEAR_SHELL_TABLE_CELL, onClear)
  assert.deepEqual(seen, ['inspector'])
  assert.equal(CLEAR_SHELL_TABLE_CELL, 'biu:clear-shell-table-cell')
})

test('grouped ranges and keyboard movement use the displayed occurrence, not the first matching record', () => {
  const ids = ['107', '190', '003', '004', '008', '009', '101', '102', '107']
  const rows = ['React:107', 'React:190', 'Python:003', 'Python:004', 'Python:008', 'Python:009', 'Python:101', 'Python:102', 'Python:107']
  const anchor = { id: '003', key: 'title', rowKey: 'Python:003' }
  const focus = { id: '107', key: 'title', rowKey: 'Python:107' }
  assert.deepEqual(tableCellRange(ids, ['title'], anchor, focus, rows).map((cell) => cell.id), ['003', '004', '008', '009', '101', '102', '107'])
  assert.deepEqual(moveTableCell(ids, ['title'], focus, 'up', rows), { id: '102', key: 'title', rowKey: 'Python:102' })
  assert.deepEqual(tableCellRangeRowIds(tableCellRange(ids, ['title'], { id: '107', key: 'title', rowKey: 'React:107' }, focus, rows)), ['107', '190', '003', '004', '008', '009', '101', '102'])
})
