import assert from 'node:assert/strict'
import { test } from 'vitest'
import { builtinAllViewId } from './catalog-views.ts'
import { recordMatchesSharedView, resolveSharedView, viewShareListFilter } from './share-view-match.ts'

test('a shared view hits the same records the share snapshot would list', () => {
  const open = { id: 'open', name: '进行中', filters: { status: 'open' } }
  const all = { id: builtinAllViewId('/docs'), name: '全部文档', filters: {}, builtin: true }
  const record = { id: 'p1', title: '进行中', status: 'open' }
  const other = { id: 'p2', title: '已完成', status: 'done' }
  assert.equal(recordMatchesSharedView(record, open, 'personal'), true)
  assert.equal(recordMatchesSharedView(other, open, 'personal'), false)
  assert.equal(recordMatchesSharedView(other, all, 'personal'), true)
  assert.equal(recordMatchesSharedView(record, { ...open, filters: { ...open.filters, $scope: 'workspace' } }, 'personal'), false)
  assert.equal(recordMatchesSharedView(record, { ...open, filters: { ...open.filters, $scope: 'workspace' } }, 'workspace'), true)
  assert.deepEqual(viewShareListFilter(open).status, 'open')
  assert.equal(resolveSharedView('open', [open])?.name, '进行中')
  assert.equal(resolveSharedView(all.id, [])?.id, all.id)
  assert.equal(resolveSharedView('missing', [open]), null)
})
