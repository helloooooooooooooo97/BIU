import { test } from 'vitest'
import assert from 'node:assert/strict'
import { moveTableCell, tableActionArrowLeave, tableActionButtonStep, tableClearKey, tableClearedValue, tableKeyDir, tableNavKeys, tableTreeArrowAction, tableTypeToEditChar } from './table-keys.ts'

test('table nav keys include actions and skip pad columns', () => {
  assert.deepEqual(
    tableNavKeys([{ key: 'title' }, { key: 'actions' }, { key: 'status' }, { key: 'pad:1' }, { key: 'fsdb-col-fill' }]),
    ['title', 'actions', 'status'],
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
