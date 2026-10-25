import { test } from 'vitest'
import assert from 'node:assert/strict'
import { cn } from './cn.ts'

test('cn merges tailwind class conflicts', () => {
  assert.equal(cn('px-2', 'px-4'), 'px-4')
  assert.match(cn('biu-btn', false && 'hidden', 'mt-1'), /biu-btn/)
})
