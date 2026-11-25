import assert from 'node:assert/strict'
import { test } from 'vitest'
import { previewViewFilterImpact } from './view-impact.ts'

test('previewViewFilterImpact computes exact added, removed, and unchanged records before saving filter changes', () => {
  const records = [
    { id: 'r1', title: 'A', status: 'open', dept: 'eng' },
    { id: 'r2', title: 'B', status: 'open', dept: 'design' },
    { id: 'r3', title: 'C', status: 'closed', dept: 'eng' },
    { id: 'r4', title: 'D', status: 'closed', dept: 'hr' },
  ]
  const preview = previewViewFilterImpact({
    records,
    viewId: 'v-eng-open',
    beforeView: { id: 'v-eng-open', filters: { status: 'open', dept: 'eng' } },
    afterView: { id: 'v-eng-open', filters: { dept: 'eng' } },
  })
  assert.deepEqual(preview.addedRecordIds, ['r3'])
  assert.deepEqual(preview.removedRecordIds, [])
  assert.equal(preview.unchangedCount, 1)

  const narrowed = previewViewFilterImpact({
    records,
    viewId: 'v-open',
    beforeView: { id: 'v-open', filters: { status: 'open' } },
    afterView: { id: 'v-open', filters: { status: 'open', dept: 'design' } },
  })
  assert.deepEqual(narrowed.addedRecordIds, [])
  assert.deepEqual(narrowed.removedRecordIds, ['r1'])
  assert.equal(narrowed.unchangedCount, 1)

  const treePreview = previewViewFilterImpact({
    records,
    viewId: 'v-tree',
    beforeView: {
      id: 'v-tree',
      filters: {},
      filterTree: {
        kind: 'group',
        id: 'g1',
        combinator: 'and',
        children: [{ kind: 'rule', id: 'r1', field: 'dept', op: 'eq', value: 'eng' }],
      },
    },
    afterView: {
      id: 'v-tree',
      filters: {},
      filterTree: {
        kind: 'group',
        id: 'g2',
        combinator: 'or',
        children: [
          { kind: 'rule', id: 'r1', field: 'dept', op: 'eq', value: 'eng' },
          { kind: 'rule', id: 'r2', field: 'dept', op: 'eq', value: 'hr' },
        ],
      },
    },
  })
  assert.deepEqual(treePreview.addedRecordIds, ['r4'])
  assert.deepEqual(treePreview.removedRecordIds, [])
  assert.equal(treePreview.unchangedCount, 2)
})
