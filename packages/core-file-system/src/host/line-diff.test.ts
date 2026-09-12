import { test } from 'vitest'
import assert from 'node:assert/strict'
import { diffLineStats, diffCharStats } from './line-diff.ts'

test('diffLineStats counts inserted and deleted lines', () => {
  const stats = diffLineStats('a\nb\nc', 'a\nB\nc\nd')
  assert.equal(stats.removed, 1)
  assert.equal(stats.added, 2)
  assert.equal(stats.jump_line, 2)
})

test('diffCharStats counts inserted and deleted characters', () => {
  const stats = diffCharStats('hello', 'helXXlo')
  assert.equal(stats.added, 2)
  assert.equal(stats.removed, 0)
  const swapped = diffCharStats('abc', 'aXc')
  assert.equal(swapped.added, 1)
  assert.equal(swapped.removed, 1)
})

test('diffLineStats is zero when text is unchanged', () => {
  assert.deepEqual(diffLineStats('same\n', 'same\n'), { added: 0, removed: 0, jump_line: 1 })
})
