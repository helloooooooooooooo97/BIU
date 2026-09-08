import { test } from 'vitest'
import assert from 'node:assert/strict'
import { isDocStartSelection, shouldLeaveContentForTitle } from './title-content-nav.ts'

test('isDocStartSelection requires an empty caret at doc start', () => {
  assert.equal(isDocStartSelection(1, true, 1), true)
  assert.equal(isDocStartSelection(1, false, 1), false)
  assert.equal(isDocStartSelection(2, true, 1), false)
})

test('content Enter and ArrowUp at start leave for the title', () => {
  const none = { shiftKey: false, altKey: false, metaKey: false, ctrlKey: false }
  assert.equal(shouldLeaveContentForTitle('Enter', none, 1, true, 1), true)
  assert.equal(shouldLeaveContentForTitle('ArrowUp', none, 1, true, 1), true)
  assert.equal(shouldLeaveContentForTitle('Enter', { ...none, shiftKey: true }, 1, true, 1), false)
  assert.equal(shouldLeaveContentForTitle('Enter', none, 2, true, 1), false)
  assert.equal(shouldLeaveContentForTitle('Backspace', none, 1, true, 1), false)
})
