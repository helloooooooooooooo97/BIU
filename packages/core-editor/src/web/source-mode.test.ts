import { test } from 'vitest'
import assert from 'node:assert/strict'
import { isPageSourceMode, setPageSourceMode, togglePageSourceMode } from './source-mode.ts'

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
