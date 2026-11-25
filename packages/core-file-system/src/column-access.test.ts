import assert from 'node:assert/strict'
import { test } from 'vitest'
import {
  assertQueryableColumns,
  assertWritableColumns,
  fullColumnPolicy,
  isContentReadable,
  isContentWritable,
  mergeColumnPolicies,
  projectRecordColumns,
  type ColumnPolicy,
} from './column-access.ts'

test('mergeColumnPolicies unions readable and writable columns across views', () => {
  const viewA: ColumnPolicy = {
    readable: new Set(['title', 'status']),
    writable: new Set(['status']),
  }
  const viewB: ColumnPolicy = {
    readable: new Set(['title', 'owner', '$content']),
    writable: new Set(['owner', '$content']),
  }
  const merged = mergeColumnPolicies([viewA, viewB])
  const projected = projectRecordColumns(
    { id: 'r1', title: 'Deal', status: 'open', owner: 'Alice', salary: 50000, secret: 'x', createdAt: 1 },
    merged,
  )
  assert.deepEqual(projected, { id: 'r1', title: 'Deal', status: 'open', owner: 'Alice', createdAt: 1 })
  assert.equal(isContentReadable(merged), true)
  assert.equal(isContentWritable(merged), true)
})

test('assertWritableColumns blocks hidden and read-only columns including tag fields', () => {
  const policy: ColumnPolicy = {
    readable: new Set(['title', 'status', 'tag::crm::stage']),
    writable: new Set(['status', 'tag::crm::stage']),
  }
  assert.doesNotThrow(() => assertWritableColumns({ status: 'done', 'tag::crm::stage': 'won' }, policy))
  assert.throws(() => assertWritableColumns({ title: 'Hacked' }, policy), /FIELD_FORBIDDEN \(title\)/)
  assert.throws(() => assertWritableColumns({ cost: 1 }, policy), /FIELD_FORBIDDEN \(cost\)/)
  assert.throws(() => assertWritableColumns({ 'tag::hr::level': 'L7' }, policy), /FIELD_FORBIDDEN/)
})

test('assertQueryableColumns blocks side-channel probing on unreadable fields', () => {
  const policy: ColumnPolicy = {
    readable: new Set(['title', 'status']),
    writable: new Set(),
  }
  assert.doesNotThrow(() =>
    assertQueryableColumns(
      {
        filters: { status: 'open', $scope: 'workspace' },
        sorts: [{ field: 'title', dir: 'asc' }],
        groupBy: 'status',
      },
      policy,
    ),
  )
  assert.throws(() => assertQueryableColumns({ filters: { salary: '50000' } }, policy), /FIELD_FORBIDDEN \(salary\)/)
  assert.throws(
    () =>
      assertQueryableColumns(
        {
          filterTree: {
            kind: 'group',
            combinator: 'and',
            children: [{ kind: 'rule', field: 'secret', op: 'eq', value: 'x' }],
          },
        },
        policy,
      ),
    /FIELD_FORBIDDEN \(secret\)/,
  )
  assert.throws(() => assertQueryableColumns({ sorts: [{ field: 'salary', dir: 'desc' }] }, policy), /FIELD_FORBIDDEN/)
  assert.throws(() => assertQueryableColumns({ groupBy: 'salary' }, policy), /FIELD_FORBIDDEN/)
})

test('fullColumnPolicy allows reading and writing all fields', () => {
  const policy = fullColumnPolicy()
  const row = projectRecordColumns({ id: '1', title: 'Bob', salary: 99999 }, policy)
  assert.deepEqual(row, { id: '1', title: 'Bob', salary: 99999 })
  assert.doesNotThrow(() => assertWritableColumns({ salary: 1 }, policy))
})
