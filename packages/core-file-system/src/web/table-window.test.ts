import { test } from 'vitest'
import assert from 'node:assert/strict'
import { TABLE_ROW_PX, TABLE_WRAP_ROW_PX, TABLE_WINDOW_OVERSCAN, TABLE_WINDOW_VIEWPORT_FALLBACK, TABLE_COL_PX, TABLE_COL_PIN_PX, TABLE_COL_ACTIONS_PX, TABLE_COL_VIEWPORT_FALLBACK, GROUPED_FULL_FETCH_ALL_MAX, groupedFullFetchCount, medianPaintedRowPx, rememberedTableWrap, rememberTableWrap, resetRememberedTableWrap, settlePaintedRowPx, tableColumnUnchanged, tableColumnSlice, tableColumnWidth, tablePinColClass, tablePinCount, tableRowFallbackPx, tableWindowSlice, tableWindowUnchanged, tableWrapScroll } from './table-window.ts'

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

test('grouped wrap pages still fully fetch every group', () => {
  assert.equal(groupedFullFetchCount(50, 3), 3)
  assert.equal(groupedFullFetchCount(100, 4, true), 4)
  assert.equal(groupedFullFetchCount(100, GROUPED_FULL_FETCH_ALL_MAX + 4, true), GROUPED_FULL_FETCH_ALL_MAX + 4)
  assert.equal(groupedFullFetchCount(100, 1, true), 1)
})

test('column window retains frozen columns and pads the omitted columns', () => {
  const widths = [TABLE_COL_PIN_PX, TABLE_COL_ACTIONS_PX, ...Array(18).fill(TABLE_COL_PX)]
  const first = tableColumnSlice(20, 2, 0, 800, widths)
  assert.equal(first.pin, 2)
  assert.equal(first.start, 2)
  assert.ok(first.end < 20)
  assert.equal(first.padLeft, 0)
  const shifted = tableColumnSlice(20, 2, 900, 800, widths)
  assert.ok(shifted.start > first.start)
  assert.ok(shifted.padLeft > 0)
  const painted = widths.slice(0, shifted.pin).concat(widths.slice(shifted.start, shifted.end)).reduce((a, b) => a + b, 0)
  assert.equal(painted + shifted.padLeft + shifted.padRight, widths.reduce((a, b) => a + b, 0))
  assert.deepEqual(tableColumnSlice(10, 0, 480, 360, Array(10).fill(120)), { start: 3, end: 8, pin: 0, padLeft: 360, padRight: 240 })
})

test('column window uses variable widths and handles empty, fully frozen and end positions', () => {
  const widths = [240, 72, 56, 720, 100, 220, 80]
  for (const left of [0, 100, 500, 1000, 100000]) {
    const slice = tableColumnSlice(widths.length, 2, left, 500, widths)
    assert.ok(slice.start >= 2 && slice.end <= widths.length && slice.start <= slice.end)
    assert.equal(slice.padLeft, widths.slice(2, slice.start).reduce((a, b) => a + b, 0))
    assert.equal(slice.padRight, widths.slice(slice.end).reduce((a, b) => a + b, 0))
  }
  assert.deepEqual(tableColumnSlice(0, 2, 0, 500, []), { start: 0, end: 0, pin: 0, padLeft: 0, padRight: 0 })
  assert.deepEqual(tableColumnSlice(2, 2, 0, 100, [240, 72]), { start: 2, end: 2, pin: 2, padLeft: 0, padRight: 0 })
  assert.equal(tableColumnUnchanged(20, 2, { left: 0, width: 800 }, { left: 1, width: 800 }, [240, 72, ...Array(18).fill(120)]), true)
})

test('unsaved columns use fixed defaults; saved widths stay as-is', () => {
  assert.equal(tableColumnWidth('title', undefined, true), TABLE_COL_PIN_PX)
  assert.equal(tableColumnWidth('actions', undefined, true), TABLE_COL_ACTIONS_PX)
  assert.equal(tablePinCount(['title', 'actions', 'status'], 'title'), 2)
  assert.equal(tablePinCount(['title', 'status'], 'title'), 1)
  assert.equal(tablePinColClass('actions', 'title'), 'is-pin-col')
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

test('unmeasured wide tables start with a bounded horizontal window', () => {
  resetRememberedTableWrap()
  const widths = [TABLE_COL_PIN_PX, ...Array.from({ length: 16 }, () => TABLE_COL_PX)]
  const unmeasured = tableColumnSlice(17, 1, 0, rememberedTableWrap().width, widths)
  assert.equal(unmeasured.start, 1)
  assert.ok(unmeasured.end < 17)
  assert.ok(unmeasured.padRight > 0)
  resetRememberedTableWrap()
})
