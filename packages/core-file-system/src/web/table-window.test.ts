import { test } from 'vitest'
import assert from 'node:assert/strict'
import { TABLE_ROW_PX, TABLE_WINDOW_OVERSCAN, TABLE_WINDOW_VIEWPORT_FALLBACK, tableWindowSlice } from './table-window.ts'

test('table window keeps overscan around the viewport', () => {
  const slice = tableWindowSlice(200, 0, TABLE_ROW_PX * 10)
  assert.equal(slice.start, 0)
  assert.equal(slice.end, 10 + TABLE_WINDOW_OVERSCAN * 2)
  assert.equal(slice.padTop, 0)
  assert.equal(slice.padBottom, (200 - slice.end) * TABLE_ROW_PX)
})

test('table window shifts with scroll and pads both sides', () => {
  const slice = tableWindowSlice(200, TABLE_ROW_PX * 50, TABLE_ROW_PX * 10)
  assert.equal(slice.start, 50 - TABLE_WINDOW_OVERSCAN)
  assert.equal(slice.end, 50 + 10 + TABLE_WINDOW_OVERSCAN)
  assert.equal(slice.padTop, slice.start * TABLE_ROW_PX)
  assert.equal(slice.padBottom, (200 - slice.end) * TABLE_ROW_PX)
})

test('table window clamps at the end', () => {
  const slice = tableWindowSlice(20, TABLE_ROW_PX * 18, TABLE_ROW_PX * 10)
  assert.equal(slice.end, 20)
  assert.equal(slice.padBottom, 0)
  assert.ok(slice.start >= 0)
})

test('empty table has no pad', () => {
  assert.deepEqual(tableWindowSlice(0, 0, 400), { start: 0, end: 0, padTop: 0, padBottom: 0 })
})

test('unmeasured viewport still paints a first screen', () => {
  const slice = tableWindowSlice(200, 0, 0)
  assert.equal(slice.start, 0)
  assert.ok(slice.end >= Math.ceil(TABLE_WINDOW_VIEWPORT_FALLBACK / TABLE_ROW_PX))
  assert.ok(slice.end < 200)
})
