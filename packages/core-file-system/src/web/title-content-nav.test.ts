import { test } from 'vitest'
import assert from 'node:assert/strict'
import { shouldLeaveContentForTitle, shouldLeaveTitleForContent } from './title-content-nav.ts'

test('title Enter and last-line ArrowDown leave for content', () => {
  assert.equal(shouldLeaveTitleForContent('Enter', false, 'hello', 5), true)
  assert.equal(shouldLeaveTitleForContent('Enter', true, 'hello', 5), false)
  assert.equal(shouldLeaveTitleForContent('ArrowDown', false, 'hello', 5), true)
  assert.equal(shouldLeaveTitleForContent('ArrowDown', false, 'a\nb', 1), false)
  assert.equal(shouldLeaveTitleForContent('ArrowDown', false, 'a\nb', 3), true)
  assert.equal(shouldLeaveTitleForContent('ArrowUp', false, 'hello', 0), false)
})

test('content Enter at start leaves for title', () => {
  const none = { shiftKey: false }
  assert.equal(shouldLeaveContentForTitle('Enter', none, 0, true, 0), true)
  assert.equal(shouldLeaveContentForTitle('ArrowUp', none, 0, true, 0), true)
  assert.equal(shouldLeaveContentForTitle('Enter', { shiftKey: true }, 0, true, 0), false)
})
