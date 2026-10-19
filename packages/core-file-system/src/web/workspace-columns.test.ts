import assert from 'node:assert/strict'
import { test } from 'vitest'
import { workspaceColumnsForLocation } from './workspace-columns.ts'

const columns = [
  { key: 'title' },
  { key: 'shareScope' },
  { key: 'shareRole' },
  { key: 'updatedAt' },
]

test('local workspaces keep sharing and permission columns', () => {
  assert.equal(workspaceColumnsForLocation(columns, true), columns)
})

test('cloud workspaces keep sharing and permission columns', () => {
  assert.equal(workspaceColumnsForLocation(columns, false), columns)
})
