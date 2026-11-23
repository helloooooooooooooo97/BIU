import { test } from 'vitest'
import assert from 'node:assert/strict'
import { extractViewDisplayState } from './use-browser-view-display.ts'
import type { SavedView } from './saved-view.ts'

test('extractViewDisplayState normalizes all display fields consistently including freezeTitle/freezeUntil and tree', () => {
  const minimal: SavedView = {
    id: 'v1',
    name: '默认',
    mode: 'table',
    sortField: 'title',
    sortDir: 'asc',
    filters: {},
    columns: ['title'],
  }
  const snap = extractViewDisplayState(minimal)
  assert.equal(snap.mode, 'table')
  assert.equal(snap.showTree, false)
  assert.equal(snap.wrapCells, false)
  assert.equal(snap.truncateCells, true)
  assert.equal(snap.freezeTitle, false)
  assert.equal(snap.freezeUntil, '')
  assert.deepEqual(snap.columnSummaries, {})
  assert.deepEqual(snap.columnViews, {})
  assert.deepEqual(snap.columnWidths, {})
  assert.equal(snap.groupConfig, undefined)

  const rich: SavedView = {
    ...minimal,
    tree: true,
    wrap: true,
    truncate: false,
    freezeTitle: true,
    freezeUntil: 'status',
    groupBy: 'status',
    groupConfig: { sort: 'desc', hideEmpty: false },
    columnSummaries: { title: 'count' },
    columnViews: { 'tag::t1::s': { activeId: 'sv-1' } },
    columnWidths: { title: 260 },
    query: 'hello',
    pageSize: 50,
  }
  const richSnap = extractViewDisplayState(rich)
  assert.equal(richSnap.showTree, true)
  assert.equal(richSnap.wrapCells, true)
  assert.equal(richSnap.truncateCells, false)
  assert.equal(richSnap.freezeTitle, true)
  assert.equal(richSnap.freezeUntil, 'status')
  assert.deepEqual(richSnap.groupConfig, { sort: 'desc', hideEmpty: false })
  assert.deepEqual(richSnap.columnSummaries, { title: 'count' })
  assert.deepEqual(richSnap.columnViews, { 'tag::t1::s': { activeId: 'sv-1' } })
  assert.deepEqual(richSnap.columnWidths, { title: 260 })
  assert.equal(richSnap.query, 'hello')
  assert.equal(richSnap.pageSize, 50)

  // Overrides take precedence (used by pendingView commit)
  const overridden = extractViewDisplayState(rich, { groupBy: 'priority', wrapCells: false, pageSize: 100 })
  assert.equal(overridden.groupBy, 'priority')
  assert.equal(overridden.wrapCells, false)
  assert.equal(overridden.pageSize, 100)
})
