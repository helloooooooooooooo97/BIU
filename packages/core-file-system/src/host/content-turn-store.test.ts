import { test } from 'vitest'
import assert from 'node:assert/strict'
import { ContentTurnStore } from './content-turn-store.ts'

test('content turn store keeps first before and latest after', () => {
  const store = new ContentTurnStore().open(':memory:')
  store.record({ sessionId: 's1', turn: 1, path: '/pages/p1', title: '首页', before: 'old\n', after: 'old\nmid\n' })
  store.record({ sessionId: 's1', turn: 1, path: '/pages/p1', title: '首页', before: 'old\nmid\n', after: 'old\nmid\nend\n' })
  const row = store.getFile('s1', 1, '/pages/p1')
  assert.equal(row?.before, 'old\n')
  assert.equal(row?.after, 'old\nmid\nend\n')
  const sum = store.summaries('s1', 1)
  assert.equal(sum.length, 1)
  assert.equal(sum[0]?.added, 2)
  assert.equal(sum[0]?.removed, 0)
})

test('content turn store summaries keep reverted rows', () => {
  const store = new ContentTurnStore().open(':memory:')
  store.record({ sessionId: 's1', turn: 1, path: '/pages/p1', title: '首页', before: 'a\n', after: 'b\n' })
  store.markReverted('s1', 1, '/pages/p1')
  const sum = store.summaries('s1', 1)
  assert.equal(sum[0]?.reverted, true)
  assert.equal(sum[0]?.added, 1)
})
