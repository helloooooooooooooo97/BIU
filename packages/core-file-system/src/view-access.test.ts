import assert from 'node:assert/strict'
import { test } from 'vitest'
import { recordMatchesAccessRule } from './view-access.ts'

test('recordMatchesAccessRule evaluates empty/null filterTree as matching all records', () => {
  assert.equal(recordMatchesAccessRule({ id: 'p1', status: 'open' }, null), true)
  assert.equal(recordMatchesAccessRule({ id: 'p1', status: 'open' }, undefined), true)
})

test('recordMatchesAccessRule evaluates complex filterTree (OR / contains / neq)', () => {
  const filterTree = {
    kind: 'group' as const,
    id: 'g-root',
    combinator: 'or' as const,
    children: [
      { kind: 'rule' as const, id: 'r1', field: 'priority', op: 'eq' as const, value: 'p0' },
      {
        kind: 'group' as const,
        id: 'g-sub',
        combinator: 'and' as const,
        children: [
          { kind: 'rule' as const, id: 'r2', field: 'title', op: 'contains' as const, value: 'Design' },
          { kind: 'rule' as const, id: 'r3', field: 'priority', op: 'neq' as const, value: 'secret' },
        ],
      },
    ],
  }
  assert.equal(recordMatchesAccessRule({ id: '1', priority: 'p0', title: 'Fix' }, filterTree), true)
  assert.equal(recordMatchesAccessRule({ id: '2', priority: 'p2', title: 'Design Doc' }, filterTree), true)
  assert.equal(recordMatchesAccessRule({ id: '3', priority: 'p2', title: 'Secret HR' }, filterTree), false)
})
