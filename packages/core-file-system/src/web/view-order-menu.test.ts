import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('view dropdown reuses the sort-menu grip and persists rank via patch', () => {
  const menu = readFileSync(resolve(import.meta.dirname, './view-order-menu.tsx'), 'utf8')
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const saved = readFileSync(resolve(import.meta.dirname, './saved-view.ts'), 'utf8')
  const storage = readFileSync(resolve(import.meta.dirname, './view-storage.ts'), 'utf8')
  assert.match(menu, /DndGrip/)
  assert.match(menu, /fsdb-query-grip/)
  assert.match(menu, /activationConstraint: \{ distance: 4 \}/)
  assert.match(menu, /restrictToVerticalAxis/)
  assert.match(menu, /moveList/)
  assert.match(browser, /persistViewOrder/)
  assert.match(browser, /persistViewDisplay\(collectionPath, view\.id, \{ rank: view\.rank \}\)/)
  assert.match(browser, /viewsRef\.current = next/)
  assert.match(browser, /setViews\(next\)/)
  assert.match(browser, /rememberViews\(collectionPath, next\)/)
  assert.match(browser, /void persistViews\(next\)/)
  const orderStart = browser.indexOf('function persistViewOrder')
  const order = browser.slice(orderStart, browser.indexOf('function persistViewsWith', orderStart))
  assert.ok(order.indexOf('setViews(next)') < order.indexOf('void persistViews(next)'))
  assert.match(browser, /pushSavedViewsPatch/)
  assert.match(saved, /rank\?: number/)
  assert.match(saved, /export function sortViewsByRank/)
  assert.match(saved, /export function rankListedViews/)
  assert.match(browser, /rankListedViews/)
  assert.match(storage, /'rank'/)
})
