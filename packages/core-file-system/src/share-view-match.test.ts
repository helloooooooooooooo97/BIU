import assert from 'node:assert/strict'
import { test } from 'vitest'
import { matchListFilterRecord } from './query-logic.ts'
import { viewShareListFilter } from './share-view-match.ts'

test('viewShareListFilter converts flat filters and strips internal scope keys', () => {
  const filters = viewShareListFilter({
    filters: { status: 'open', $scope: 'workspace', $ids: ['p1'] },
  })
  assert.equal(matchListFilterRecord({ id: 'p1', status: 'open' }, filters), true)
  assert.equal(matchListFilterRecord({ id: 'p2', status: 'done' }, filters), false)
})

test('viewShareListFilter evaluates tag filterTree both as object and JSON string', () => {
  const filterTree = {
    kind: 'group' as const,
    id: 'g',
    combinator: 'and' as const,
    children: [{ kind: 'rule' as const, id: 'r', field: 'tag', op: 'eq' as const, value: 'sec' }],
  }
  const hit = { id: 'p1', title: 'Robust Intelligence', tag: { tags: ['sec'] } }
  const miss = { id: 'p2', title: 'Other', tag: { tags: ['other'] } }
  assert.equal(matchListFilterRecord(hit, viewShareListFilter({ filterTree })), true)
  assert.equal(matchListFilterRecord(miss, viewShareListFilter({ filterTree })), false)
  assert.equal(matchListFilterRecord(hit, viewShareListFilter({ filterTree: JSON.stringify(filterTree) })), true)
})
