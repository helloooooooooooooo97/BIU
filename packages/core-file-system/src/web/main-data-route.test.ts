import { test } from 'vitest'
import assert from 'node:assert/strict'
import { DATA_MODULE_PATH } from './database-path.ts'
import { isMainDataRoute, pickMainDataRoute, MAIN_DATA_ROUTE_KEY } from './main-data-route.ts'

test('main data route is a nested /database path', () => {
  assert.equal(isMainDataRoute('/database'), false)
  assert.equal(isMainDataRoute(`${DATA_MODULE_PATH}/sessions`), true)
  assert.equal(isMainDataRoute('/chat'), false)
})

test('pickMainDataRoute keeps a still-registered collection', () => {
  const tables = [{ path: '/tasks' }, { path: '/pages' }]
  assert.equal(pickMainDataRoute('/database/tasks', tables), '/database/tasks')
  assert.equal(pickMainDataRoute('/database/sessions', tables), '')
  assert.equal(pickMainDataRoute('/database', tables), '')
})

test('storage key is fsdb.mainRoute', () => {
  assert.equal(MAIN_DATA_ROUTE_KEY, 'fsdb.mainRoute')
})
