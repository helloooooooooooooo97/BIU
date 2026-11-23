import { test } from 'vitest'
import assert from 'node:assert/strict'
import { computeBulkMenuBox } from './use-browser-bulk-ui.ts'

test('computeBulkMenuBox positions floating bulk menu 6px below trigger left edge', () => {
  assert.deepEqual(computeBulkMenuBox({ bottom: 120, left: 48 }), { top: 126, left: 48 })
  assert.deepEqual(computeBulkMenuBox({ bottom: 0, left: 0 }), { top: 6, left: 0 })
})
