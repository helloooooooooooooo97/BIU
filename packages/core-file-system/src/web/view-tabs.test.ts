import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  availableViewTabSpace,
  countFittingViewTabs,
  leftClusterSiblingWidth,
  splitVisibleViews,
  viewTabsOverlapRight,
} from './view-tabs.ts'

test('fits every tab when the strip is wide enough', () => {
  assert.equal(countFittingViewTabs([80, 80, 80], 400, 2), 3)
})

test('collapses to the selected tab when the strip would overflow', () => {
  assert.equal(countFittingViewTabs([80, 80, 80, 80], 220, 2), 1)
})

test('keeps at least one tab even when space is tight', () => {
  assert.equal(countFittingViewTabs([120, 120], 80, 2), 1)
})

test('viewTabsOverlapRight is true when the left cluster crosses the right controls', () => {
  assert.equal(viewTabsOverlapRight({ right: 200 }, { left: 180 }), true)
  assert.equal(viewTabsOverlapRight({ right: 160 }, { left: 180 }), false)
})

test('availableViewTabSpace uses wrap left to right controls, not the wrap current width', () => {
  assert.equal(availableViewTabSpace(376, 675, 0), 291)
  assert.equal(availableViewTabSpace(320, 391, 0), 63)
  assert.equal(availableViewTabSpace(376, 675, 60), 231)
  assert.equal(availableViewTabSpace(400, 390, 0), 0)
})

test('leftClusterSiblingWidth skips the view wrap', () => {
  const left = { children: [{ offsetWidth: 90 }, { offsetWidth: 48 }, { offsetWidth: 12 }] }
  const wrap = left.children[0]
  assert.equal(leftClusterSiblingWidth(left as unknown as Element, wrap as unknown as Element), 48 + 12 + 12)
})

test('active view tab opens the view menu; the more button is gone', () => {
  const src = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  assert.match(src, /if \(view\.id === activeViewId\) toggleMenu\('view'\)/)
  assert.doesNotMatch(src, /data-testid="fsdb-view-more"/)
  assert.doesNotMatch(src, /tasks-viewdd-more/)
})

test('pins the active view into the last visible slot when it would overflow', () => {
  const views = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(splitVisibleViews(views, 2, 'c'), {
    shown: [{ id: 'a' }, { id: 'c' }],
    hidden: [{ id: 'b' }],
  })
})

test('keeps only the selected view when the strip collapses to one tab', () => {
  const views = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  assert.deepEqual(splitVisibleViews(views, 1, 'c'), {
    shown: [{ id: 'c' }],
    hidden: [{ id: 'a' }, { id: 'b' }],
  })
})

test('ViewTabFit collapses on overlap and the selected-row bar sticks to the header', () => {
  const src = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(src, /viewTabsOverlapRight/)
  assert.match(src, /availableViewTabSpace/)
  assert.match(src, /leftClusterSiblingWidth/)
  assert.match(src, /host\.getBoundingClientRect\(\)\.left/)
  assert.match(src, /data-testid="fsdb-view-tab"/)
  assert.match(src, /tasks-viewtabs\$\{views\.length && viewTabFit < views\.length \? ' is-collapsed' : ''\}/)
  assert.match(css, /\.tasks-viewtabs\.is-collapsed\{[^}]*overflow:visible/)
  assert.match(css, /\.tasks-viewtabs\.is-collapsed\{[^}]*z-index:8/)
  assert.match(css, /\.tasks-viewdd-wrap:has\(\.is-collapsed\)\{[^}]*min-width:min-content/)
  assert.match(css, /\.fsdb-page \.tasks-toolbar\{[^}]*z-index:50/)
  assert.match(css, /\.tasks-viewdd-wrap:has\(\.tasks-viewdd-menu\)\{[^}]*z-index:80/)
  assert.match(css, /\.fsdb-page \.tasks-toolbar-right:has\(\.fsdb-query-menu\)/)
  assert.match(css, /\.fsdb-page \.tasks-toolbar-right:has\(\.fsdb-query-menu\),\.fsdb-page \.tasks-toolbar-right:has\(\.tasks-sort-menu\),\.fsdb-page \.tasks-toolbar-right:has\(\.tasks-filter-menu\)\{[^}]*z-index:80/)
  assert.match(css, /\.fsdb-page \.tasks-toolbar:has\(\.fsdb-query-menu\) \.tasks-toolbar-left/)
  assert.match(css, /\.fsdb-page \.tasks-toolbar:has\(\.fsdb-query-menu\),\.fsdb-page \.tasks-toolbar:has\(\.tasks-sort-menu\),\.fsdb-page \.tasks-toolbar:has\(\.tasks-filter-menu\)\{[^}]*z-index:90/)
  assert.match(css, /\.fsdb-page \.fsdb-query-menu,\.fsdb-page \.tasks-sort-menu,\.fsdb-page \.tasks-filter-menu\{[^}]*z-index:120/)
  assert.match(css, /\.fsdb-page:has\(\.fsdb-query-menu\)/)
  assert.match(css, /\.fsdb-page \.tasks-filter-btn-wrap:has\(\.fsdb-query-menu\)/)
  assert.match(css, /\.fsdb-page \.tasks-table-wrap\{[^}]*z-index:0/)
  assert.match(src, /className="fsdb-bulk-slot"/)
  assert.match(css, /\.fsdb-bulk-slot\{[^}]*position:sticky/)
  assert.match(css, /\.fsdb-bulk-slot\{[^}]*left:0/)
  assert.match(css, /\.fsdb-bulk-slot\{[^}]*width:0/)
})
