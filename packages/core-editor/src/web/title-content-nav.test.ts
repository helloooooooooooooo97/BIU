import { test } from 'vitest'
import assert from 'node:assert/strict'
import { shouldLeaveContentForTitle } from './title-content-nav.ts'

const none = { shiftKey: false }

test('empty caret at doc start leaves for title on Enter and ArrowUp', () => {
  assert.equal(shouldLeaveContentForTitle('Enter', none, 1, true, 1), true)
  assert.equal(shouldLeaveContentForTitle('ArrowUp', none, 1, true, 1), true)
  assert.equal(shouldLeaveContentForTitle('Enter', { shiftKey: true }, 1, true, 1), false)
  assert.equal(shouldLeaveContentForTitle('Enter', none, 2, true, 1), false)
  assert.equal(shouldLeaveContentForTitle('Enter', none, 1, false, 1), false)
  assert.equal(shouldLeaveContentForTitle('ArrowDown', none, 1, true, 1), false)
})
