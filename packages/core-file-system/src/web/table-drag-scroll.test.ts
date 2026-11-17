import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  TABLE_DRAG_SCROLL_EDGE,
  tableDragScrollBand,
  tableDragScrollDelta,
  tableVertScroller,
} from './table-drag-scroll.ts'

test('delta is zero in the middle and grows toward the visible edges', () => {
  const band = { top: 100, bottom: 500 }
  assert.equal(tableDragScrollDelta(300, band), 0)
  assert.ok(tableDragScrollDelta(100 + TABLE_DRAG_SCROLL_EDGE, band) < 0)
  assert.ok(tableDragScrollDelta(band.top, band) < tableDragScrollDelta(band.top + 20, band))
  assert.ok(tableDragScrollDelta(band.bottom, band) > 0)
  assert.ok(tableDragScrollDelta(band.bottom, band) > tableDragScrollDelta(band.bottom - 20, band))
  assert.ok(tableDragScrollDelta(band.bottom + 40, band) > 0)
})

test('sticky head and chat overlay shrink the live band', () => {
  const band = tableDragScrollBand({ top: 0, bottom: 800 }, 80, 720)
  assert.equal(band.top, 80)
  assert.equal(band.bottom, 720)
  assert.equal(tableDragScrollDelta(400, band), 0)
  assert.ok(tableDragScrollDelta(80, band) < 0)
  assert.ok(tableDragScrollDelta(720, band) > 0)
})

test('tableVertScroller prefers the page body scroller', () => {
  const body = document.createElement('div')
  body.className = 'fsdb-right-body'
  const wrap = document.createElement('div')
  wrap.className = 'tasks-table-wrap'
  body.append(wrap)
  document.body.append(body)
  assert.equal(tableVertScroller(wrap), body)
  body.remove()
})

test('table pointer down starts edge autoscroll while dragging', () => {
  const src = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  assert.match(src, /tableVertScroller/)
  assert.match(src, /bindTableDragScroll/)
  assert.match(src, /chat-overlay-panel/)
  assert.match(src, /CELL_POP_DRAG_PX/)
  assert.match(src, /selectText: false/)
  assert.match(src, /applyCellRange/)
  assert.match(src, /tableCellFromPoint/)
  assert.match(src, /paintCellRangeClasses/)
  assert.match(src, /CELL_RANGE_IGNORE/)
  assert.match(src, /is-cell-drag/)
  assert.match(src, /onTableContextMenu/)
  assert.match(src, /tableCellRangeRowIds/)
  assert.match(src, /setPickedIds\(ids\)/)
})
