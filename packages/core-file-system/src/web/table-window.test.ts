import { test } from 'vitest'
import assert from 'node:assert/strict'
import { TABLE_ROW_PX, TABLE_WRAP_ROW_PX, TABLE_WINDOW_OVERSCAN, TABLE_WINDOW_VIEWPORT_FALLBACK, TABLE_COL_PX, TABLE_COL_PIN_PX, TABLE_COL_OVERSCAN, TABLE_COL_VIEWPORT_FALLBACK, groupedFullFetchCount, tableColumnEstimate, tableColumnFit, tableColumnSlice, tableWindowSlice, tableWindowUnchanged } from './table-window.ts'

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

test('wrap mode still windows, with a taller row estimate', () => {
  const slice = tableWindowSlice(200, 0, TABLE_WRAP_ROW_PX * 10, TABLE_WRAP_ROW_PX)
  assert.equal(slice.start, 0)
  assert.equal(slice.end, 10 + TABLE_WINDOW_OVERSCAN * 2)
  assert.ok(slice.end < 200)
  assert.equal(slice.padBottom, (200 - slice.end) * TABLE_WRAP_ROW_PX)
  assert.ok(TABLE_WRAP_ROW_PX > TABLE_ROW_PX)
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

test('unmeasured first screen stays well under a 100-row page', () => {
  const slice = tableWindowSlice(100, 0, 0)
  assert.ok(slice.end <= 24)
  assert.ok(slice.padBottom > 0)
})

test('viewport measure is skipped when it would paint the same window', () => {
  const prev = { top: 0, height: TABLE_WINDOW_VIEWPORT_FALLBACK }
  const next = { top: 0, height: 600 }
  assert.equal(tableWindowUnchanged(20, prev, next), true)
  assert.equal(tableWindowUnchanged(200, prev, next), false)
  assert.equal(tableWindowUnchanged(20, prev, prev), true)
})

test('grouped first paint fetches every group when a page still fits the window', () => {
  assert.equal(groupedFullFetchCount(20, 4), 4)
  assert.equal(groupedFullFetchCount(12, 3, true), 3)
})

test('grouped wrap pages larger than the window only fully fetch the first group', () => {
  assert.equal(groupedFullFetchCount(100, 4, true), 1)
  assert.equal(groupedFullFetchCount(100, 1, true), 1)
})

test('unmeasured first screen does not paint every table column', () => {
  const widths = [TABLE_COL_PIN_PX, ...Array.from({ length: 12 }, () => TABLE_COL_PX)]
  const slice = tableColumnSlice(13, 1, 0, 0, widths)
  assert.equal(slice.pin, 1)
  assert.equal(slice.start, 1)
  assert.ok(slice.end < 13)
  assert.ok(slice.pin + (slice.end - slice.start) < 13)
  assert.ok(slice.padRight > 0)
  assert.equal(slice.padLeft, 0)
})

test('narrow column sets still paint every column', () => {
  const slice = tableColumnSlice(4, 1, 0, TABLE_COL_VIEWPORT_FALLBACK, [140, 72, 72, 72])
  assert.equal(slice.start, 1)
  assert.equal(slice.end, 4)
  assert.equal(slice.padLeft, 0)
  assert.equal(slice.padRight, 0)
})

test('typical 7-col first screen fills a 624px wrap without a pad', () => {
  const widths = [TABLE_COL_PIN_PX, ...Array.from({ length: 6 }, () => TABLE_COL_PX)]
  const slice = tableColumnSlice(7, 1, 0, 624, widths)
  assert.equal(slice.pin, 1)
  assert.equal(slice.start, 1)
  assert.equal(slice.end, 7)
  assert.equal(slice.padLeft, 0)
  assert.equal(slice.padRight, 0)
})

test('unmeasured person and date columns stay wide enough for the first screen', () => {
  assert.equal(tableColumnEstimate('title', undefined, true), TABLE_COL_PIN_PX)
  assert.equal(tableColumnEstimate('createdBy', undefined), 120)
  assert.equal(tableColumnEstimate('updatedAt', undefined), 130)
  assert.equal(tableColumnEstimate('shareScope', undefined), 64)
  assert.equal(tableColumnEstimate('status', undefined), TABLE_COL_PX)
  assert.equal(tableColumnEstimate('createdBy', 180), 180)
  const widths = [
    tableColumnEstimate('title', undefined, true),
    tableColumnEstimate('actions', undefined),
    tableColumnEstimate('status', undefined),
    tableColumnEstimate('priority', undefined),
    tableColumnEstimate('difficulty', undefined),
    tableColumnEstimate('usage', undefined),
    tableColumnEstimate('createdBy', undefined),
  ]
  const slice = tableColumnSlice(7, 1, 0, 624, widths)
  assert.equal(slice.end, 7)
  assert.equal(slice.padRight, 0)
})

test('narrow tables that barely overflow the wrap scale onto the first screen', () => {
  const fitted = tableColumnFit([140, 72, 72, 72, 72, 130, 72, 64], 624)
  const sum = fitted.reduce((a, b) => a + b, 0)
  assert.ok(Math.abs(sum - 624) <= 8)
  assert.ok(fitted[0]! >= 56)
  assert.ok(fitted[fitted.length - 1]! >= 56)
})

test('wide tables keep estimates so the column window can pad', () => {
  const widths = [TABLE_COL_PIN_PX, ...Array.from({ length: 12 }, () => TABLE_COL_PX)]
  const fitted = tableColumnFit(widths, 624)
  assert.equal(fitted, widths)
})

test('column window shifts with horizontal scroll and pads both sides', () => {
  const widths = Array.from({ length: 10 }, () => TABLE_COL_PX)
  const slice = tableColumnSlice(10, 0, TABLE_COL_PX * 4, TABLE_COL_PX * 3, widths)
  assert.ok(slice.start >= 4 - TABLE_COL_OVERSCAN)
  assert.ok(slice.end <= 4 + 3 + TABLE_COL_OVERSCAN + 1)
  assert.ok(slice.padLeft > 0)
  assert.ok(slice.padRight > 0)
})
