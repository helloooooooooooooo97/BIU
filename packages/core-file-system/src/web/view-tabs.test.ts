import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { countFittingViewTabs, splitVisibleViews, viewTabsOverlapRight } from './view-tabs.ts'

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
  assert.match(src, /className="fsdb-bulk-slot"/)
  assert.match(css, /\.fsdb-bulk-slot\{[^}]*position:sticky/)
})
