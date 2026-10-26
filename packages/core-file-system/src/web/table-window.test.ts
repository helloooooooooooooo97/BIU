import { test } from 'vitest'
import assert from 'node:assert/strict'
import { TABLE_ROW_PX, TABLE_WRAP_ROW_PX, TABLE_WINDOW_OVERSCAN, TABLE_WINDOW_VIEWPORT_FALLBACK, TABLE_COL_PX, TABLE_COL_PIN_PX, TABLE_COL_ACTIONS_PX, TABLE_COL_VIEWPORT_FALLBACK, GROUPED_FULL_FETCH_ALL_MAX, groupedFullFetchCount, medianPaintedRowPx, rememberedTableWrap, rememberTableWrap, resetRememberedTableWrap, settlePaintedRowPx, tableColumnSlice, tableColumnWidth, tableRowFallbackPx, tableWindowSlice, tableWindowUnchanged, tableWrapScroll } from './table-window.ts'

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
  const view = TABLE_ROW_PX * 10
  const slice = tableWindowSlice(20, TABLE_ROW_PX * 18, view)
  assert.equal(slice.end, 20)
  assert.equal(slice.padBottom, 0)
  assert.equal(slice.start, Math.max(0, 20 - (10 + TABLE_WINDOW_OVERSCAN * 2)))
})

test('scrollTop bounce at the bottom keeps the same window', () => {
  const view = TABLE_ROW_PX * 10
  const a = tableWindowSlice(50, TABLE_ROW_PX * 48, view)
  const b = tableWindowSlice(50, TABLE_ROW_PX * 40, view)
  assert.equal(a.end, 50)
  assert.equal(b.end, 50)
  assert.equal(a.start, b.start)
  assert.equal(a.padTop, b.padTop)
  assert.equal(a.padBottom, 0)
})

test('wrap mode still windows, with a taller row estimate', () => {
  const slice = tableWindowSlice(200, 0, TABLE_WRAP_ROW_PX * 10, TABLE_WRAP_ROW_PX)
  assert.equal(slice.start, 0)
  assert.equal(slice.end, 10 + TABLE_WINDOW_OVERSCAN * 2)
  assert.ok(slice.end < 200)
  assert.equal(slice.padBottom, (200 - slice.end) * TABLE_WRAP_ROW_PX)
  assert.ok(TABLE_WRAP_ROW_PX > TABLE_ROW_PX)
})

test('painted row median drives pad math instead of the CSS guess', () => {
  assert.equal(tableRowFallbackPx(), TABLE_ROW_PX)
  assert.equal(tableRowFallbackPx(true), TABLE_WRAP_ROW_PX)
  assert.equal(medianPaintedRowPx([], TABLE_ROW_PX), TABLE_ROW_PX)
  assert.equal(medianPaintedRowPx([40, 41, 40, 80, 40]), 40)
  const guessed = tableWindowSlice(200, 40 * 50, 400, TABLE_ROW_PX)
  const measured = tableWindowSlice(200, 40 * 50, 400, 40)
  assert.ok(measured.start !== guessed.start || measured.padTop !== guessed.padTop)
  assert.equal(measured.padTop, measured.start * 40)
})

test('settlePaintedRowPx ignores sub-pixel median chatter from a new window', () => {
  assert.equal(settlePaintedRowPx(40.4, 40), 40)
  assert.equal(settlePaintedRowPx(41.6, 40), 42)
  assert.equal(settlePaintedRowPx(40, 40), 40)
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
  assert.equal(groupedFullFetchCount(50, 3), 3)
  assert.equal(groupedFullFetchCount(100, 4, true), 4)
  assert.equal(groupedFullFetchCount(100, GROUPED_FULL_FETCH_ALL_MAX + 4, true), 1)
  assert.equal(groupedFullFetchCount(100, 1, true), 1)
})

test('tables paint every column without a horizontal window', () => {
  const wide = tableColumnSlice(13, 1, 0, 0, [TABLE_COL_PIN_PX, ...Array.from({ length: 12 }, () => TABLE_COL_PX)])
  assert.deepEqual(wide, { start: 1, end: 13, pin: 1, padLeft: 0, padRight: 0 })
  const seven = tableColumnSlice(7, 1, 400, 624, [TABLE_COL_PIN_PX, TABLE_COL_ACTIONS_PX, ...Array.from({ length: 5 }, () => TABLE_COL_PX)])
  assert.deepEqual(seven, { start: 1, end: 7, pin: 1, padLeft: 0, padRight: 0 })
  const scrolled = tableColumnSlice(10, 0, TABLE_COL_PX * 4, TABLE_COL_PX * 3, Array.from({ length: 10 }, () => TABLE_COL_PX))
  assert.deepEqual(scrolled, { start: 0, end: 10, pin: 0, padLeft: 0, padRight: 0 })
})

test('unsaved columns use fixed defaults; saved widths stay as-is', () => {
  assert.equal(tableColumnWidth('title', undefined, true), TABLE_COL_PIN_PX)
  assert.equal(tableColumnWidth('actions', undefined), TABLE_COL_ACTIONS_PX)
  assert.equal(tableColumnWidth('updatedBy', undefined), TABLE_COL_PX)
  assert.equal(tableColumnWidth('status', undefined), TABLE_COL_PX)
  assert.equal(tableColumnWidth('createdBy', 180), 180)
  const before = ['title', 'actions', 'status', 'updatedBy'].map((key, index) =>
    tableColumnWidth(key, undefined, index === 0),
  )
  const afterNeed = tableColumnWidth('status', 280)
  const after = ['title', 'actions', 'status', 'updatedBy'].map((key, index) =>
    tableColumnWidth(key, key === 'status' ? afterNeed : undefined, index === 0),
  )
  assert.equal(after[0], before[0])
  assert.equal(after[1], before[1])
  assert.equal(after[3], before[3])
  assert.equal(after[2], 280)
})

test('remembered wrap size replaces the 624 fallback after the first measure', () => {
  resetRememberedTableWrap()
  assert.deepEqual(rememberedTableWrap(), { width: TABLE_COL_VIEWPORT_FALLBACK, height: TABLE_WINDOW_VIEWPORT_FALLBACK })
  const next = tableWrapScroll({ clientWidth: 1280, clientHeight: 720, scrollTop: 40, scrollLeft: 16 }, 0)
  assert.deepEqual(next, { top: 0, height: 720, left: 16, width: 1280 })
  assert.deepEqual(rememberedTableWrap(), { width: 1280, height: 720 })
  const reuse = tableWrapScroll({ clientWidth: 0, clientHeight: 0, scrollTop: 0, scrollLeft: 0 })
  assert.equal(reuse.width, 1280)
  assert.equal(reuse.height, 720)
  rememberTableWrap(1440, 800)
  assert.deepEqual(rememberedTableWrap(), { width: 1440, height: 800 })
  resetRememberedTableWrap()
  assert.deepEqual(rememberedTableWrap(), { width: TABLE_COL_VIEWPORT_FALLBACK, height: TABLE_WINDOW_VIEWPORT_FALLBACK })
})

test('wide plugin tables still paint every column before the wrap is measured', () => {
  resetRememberedTableWrap()
  const widths = [TABLE_COL_PIN_PX, ...Array.from({ length: 16 }, () => TABLE_COL_PX)]
  const unmeasured = tableColumnSlice(17, 1, 0, rememberedTableWrap().width, widths)
  assert.deepEqual(unmeasured, { start: 1, end: 17, pin: 1, padLeft: 0, padRight: 0 })
  resetRememberedTableWrap()
})
