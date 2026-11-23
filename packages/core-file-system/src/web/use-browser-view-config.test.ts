import { test } from 'vitest'
import assert from 'node:assert/strict'
import { browserViewConfigReducer, createInitialViewConfig } from './use-browser-view-config.ts'

test('browserViewConfigReducer applies atomic PATCH and skips no-op updates', () => {
  const s0 = createInitialViewConfig(undefined, ['title'])
  assert.equal(s0.mode, 'table')
  assert.equal(s0.showTree, false)

  // No-op SET returns identical reference
  const s1 = browserViewConfigReducer(s0, { type: 'SET', key: 'mode', value: 'table' })
  assert.equal(s1, s0)

  // Atomic PATCH updates multiple fields in one transition
  const s2 = browserViewConfigReducer(s0, {
    type: 'PATCH',
    patch: { mode: 'board', showTree: true, groupBy: 'status', wrapCells: true },
  })
  assert.equal(s2.mode, 'board')
  assert.equal(s2.showTree, true)
  assert.equal(s2.groupBy, 'status')
  assert.equal(s2.wrapCells, true)

  // No-op PATCH returns identical reference
  const s3 = browserViewConfigReducer(s2, {
    type: 'PATCH',
    patch: { mode: 'board', showTree: true },
  })
  assert.equal(s3, s2)

  // Functional updater works on SET
  const s4 = browserViewConfigReducer(s2, {
    type: 'SET',
    key: 'columnKeys',
    value: (prev) => [...(prev as string[]), 'status'],
  })
  assert.deepEqual(s4.columnKeys, ['title', 'status'])
})
