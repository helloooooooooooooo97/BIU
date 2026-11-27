import { test } from 'vitest'
import assert from 'node:assert/strict'
import { pageBlocksChrome } from './page-blocks-chrome.ts'

test('page-blocks chrome delegates view listing to unified saved views (no hardcoded builtin views)', () => {
  const chrome = pageBlocksChrome()
  assert.equal(chrome.listViews, undefined)
})
