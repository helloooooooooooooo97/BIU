import { test } from 'vitest'
import assert from 'node:assert/strict'
import { getPagePresentMode, isPageSourceMode, setPagePresentMode, setPageSourceMode, togglePageSourceMode } from './source-mode.ts'

test('source mode is off until toggled for that record', () => {
  setPageSourceMode('home', false)
  assert.equal(isPageSourceMode('home'), false)
  togglePageSourceMode('home')
  assert.equal(isPageSourceMode('home'), true)
  togglePageSourceMode('home')
  assert.equal(isPageSourceMode('home'), false)
  togglePageSourceMode('other')
  assert.equal(isPageSourceMode('home'), false)
  assert.equal(isPageSourceMode('other'), true)
})

test('present mode keeps outline separate from source', () => {
  setPagePresentMode('page-a', 'outline')
  assert.equal(getPagePresentMode('page-a'), 'outline')
  assert.equal(isPageSourceMode('page-a'), false)
  setPagePresentMode('page-a', 'table')
  assert.equal(getPagePresentMode('page-a'), 'table')
  assert.equal(isPageSourceMode('page-a'), false)
  setPagePresentMode('page-a', 'source')
  assert.equal(isPageSourceMode('page-a'), true)
})
