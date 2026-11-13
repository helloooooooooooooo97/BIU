import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { stickyHeadOffset } from './sticky-toolbar.ts'

test('sticky head offset is whole pixels and ignores sub-pixel chatter', () => {
  assert.equal(stickyHeadOffset(120.4, 40.2, 800, 32), 80)
  assert.equal(stickyHeadOffset(120, 119.4, 800, 32), 1)
  assert.equal(stickyHeadOffset(120, 120.2, 800, 32), 0)
})

test('pinned head transform is not rewritten for a sub-pixel delta', () => {
  const src = readFileSync(resolve(import.meta.dirname, './sticky-toolbar.ts'), 'utf8')
  assert.match(src, /Math\.abs\(readPinY\(node\) - next\) < 1/)
  assert.match(src, /requestAnimationFrame/)
  assert.doesNotMatch(src, /querySelector\('\.fsdb-bulk-slot'\)/)
  assert.doesNotMatch(src, /--fsdb-bulk-shift/)
  assert.match(src, /writePin\(thead, y, pin\)/)
})
