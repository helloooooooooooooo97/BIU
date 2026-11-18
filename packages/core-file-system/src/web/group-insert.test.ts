import { test } from 'vitest'
import assert from 'node:assert/strict'
import { REQUIRED_RECORD_FIELDS, type CollectionSchema } from '@biu/type-file-system'
import { placeCreatedRow } from './group-insert.ts'
import type { GroupBucket } from './fields.ts'

const schema: CollectionSchema = { labelField: 'title', fields: {
  ...REQUIRED_RECORD_FIELDS, status: { type: 'select' }, lane: { type: 'multi-select' },
} }

test('empty grouped lists show the first record and consecutive creates in new groups', () => {
  let groups: GroupBucket[] = []
  for (const row of [
    { id: '1', status: 'todo' }, { id: '2', status: 'doing' }, { id: '3', status: 'todo' },
  ]) groups = placeCreatedRow(groups, row, 'status', schema)
  assert.deepEqual(groups.map(group => [group.key, group.total, group.rows.map(row => row.id)]), [
    ['doing', 1, ['2']], ['todo', 2, ['3', '1']],
  ])
  assert.strictEqual(placeCreatedRow(groups, { id: '3', status: 'todo' }, 'status', schema), groups)
})

test('multi-value creates appear once in every group, including newly discovered groups', () => {
  const row = { id: '1', lane: ['a', 'b'] }
  const groups = placeCreatedRow([], row, 'lane', schema)
  assert.deepEqual(groups.map(group => [group.key, group.total]), [['b', 1], ['a', 1]])
  assert.strictEqual(placeCreatedRow(groups, row, 'lane', schema), groups)
  const partial = placeCreatedRow(groups.filter(group => group.key === 'a'), row, 'lane', schema)
  assert.deepEqual(partial.map(group => [group.key, group.total]), [['b', 1], ['a', 1]])
})

test('custom attributes and unset values can create their first bucket without sample rows', () => {
  const packs = [{ id: 'project', fields: [{ key: 'lane', type: 'multi-select' as const }] }]
  const key = 'tag::project::lane'
  const groups = placeCreatedRow([], { id: '1', [key]: ['new'] }, key, schema, packs)
  assert.equal(groups[0].key, 'new')
  const unset = placeCreatedRow([], { id: '2' }, 'status', schema)
  assert.equal(unset[0].key, '')
  assert.equal(unset[0].rows[0].id, '2')
})

test('child insertion stays with its parent and repeated events do not duplicate it', () => {
  const groups = [{ key: 'todo', label: 'todo', rows: [{ id: 'parent', status: 'todo' }], total: 1 }]
  const row = { id: 'child', status: 'doing' }
  const next = placeCreatedRow(groups, row, 'status', schema, [], 'parent')
  assert.equal(next.length, 1)
  assert.equal(next[0].total, 2)
  assert.strictEqual(placeCreatedRow(next, row, 'status', schema, [], 'parent'), next)
  assert.deepEqual(placeCreatedRow([], row, '', schema), [])
})

test('new share groups retain their established ordering', () => {
  let groups: GroupBucket[] = []
  for (const [id, shareScope] of [['1', '共享'], ['2', '私人'], ['3', '空间']]) {
    groups = placeCreatedRow(groups, { id, shareScope }, 'shareScope', schema)
  }
  assert.deepEqual(groups.map(group => group.key), ['私人', '空间', '共享'])
})
