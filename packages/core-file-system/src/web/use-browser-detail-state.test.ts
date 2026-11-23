import { test } from 'vitest'
import assert from 'node:assert/strict'
import { browserDetailReducer, createInitialDetailState } from './use-browser-detail-state.ts'

test('browserDetailReducer handles atomic PATCH, SET updaters, and no-op reference preservation', () => {
  const s0 = createInitialDetailState<{ total: number }>(null)
  assert.equal(s0.openDetailId, null)
  assert.equal(s0.detailBodyStatus, 'loading')

  // No-op SET keeps identical state reference
  const s1 = browserDetailReducer(s0, { type: 'SET', key: 'acting', value: false })
  assert.equal(s1, s0)

  // Atomic PATCH opens detail and hydrates body in one transition
  const s2 = browserDetailReducer(s0, {
    type: 'PATCH',
    patch: {
      openDetailId: 'rec-1',
      detailBody: '# hello',
      detailBodyStatus: 'ready',
      detailBodyError: '',
    },
  })
  assert.equal(s2.openDetailId, 'rec-1')
  assert.equal(s2.detailBody, '# hello')
  assert.equal(s2.detailBodyStatus, 'ready')

  // Functional draft update works
  const s3 = browserDetailReducer(s2, {
    type: 'SET',
    key: 'draft',
    value: (prev) => ({ ...(prev as Record<string, string>), title: 'New' }),
  })
  assert.deepEqual(s3.draft, { title: 'New' })
})
