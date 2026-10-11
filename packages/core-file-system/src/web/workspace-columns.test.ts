import assert from 'node:assert/strict'
import test from 'node:test'
import { workspaceColumnsForLocation } from './workspace-columns.ts'

const columns = [
  { key: 'title' },
  { key: 'shareScope' },
  { key: 'shareRole' },
  { key: 'updatedAt' },
]

test('local workspaces omit sharing and permission columns', () => {
  assert.deepEqual(
    workspaceColumnsForLocation(columns, true).map((column) => column.key),
    ['title', 'updatedAt'],
  )
})

test('cloud workspaces keep sharing and permission columns', () => {
  assert.equal(workspaceColumnsForLocation(columns, false), columns)
})
