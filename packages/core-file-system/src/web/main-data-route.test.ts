import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { DATA_MODULE_PATH } from './database-path.ts'
import { isMainDataRoute, overlayDataRoute, pickMainDataRoute, MAIN_DATA_ROUTE_KEY } from './main-data-route.ts'

test('main data route is a nested /database path', () => {
  assert.equal(isMainDataRoute('/database'), false)
  assert.equal(isMainDataRoute(`${DATA_MODULE_PATH}/agents`), true)
  assert.equal(isMainDataRoute('/chat'), false)
})

test('pickMainDataRoute keeps a still-registered collection', () => {
  const tables = [{ path: '/tasks' }, { path: '/pages' }]
  assert.equal(pickMainDataRoute('/database/tasks', tables), '/database/tasks')
  assert.equal(pickMainDataRoute('/database/agents', tables), '')
  assert.equal(pickMainDataRoute('/database', tables), '')
})

test('storage key is fsdb.mainRoute', () => {
  assert.equal(MAIN_DATA_ROUTE_KEY, 'fsdb.mainRoute')
})

test('overlayDataRoute falls back to pages when nothing stored', () => {
  const prev = localStorage.getItem(MAIN_DATA_ROUTE_KEY)
  localStorage.removeItem(MAIN_DATA_ROUTE_KEY)
  assert.equal(overlayDataRoute(), `${DATA_MODULE_PATH}/pages`)
  localStorage.setItem(MAIN_DATA_ROUTE_KEY, `${DATA_MODULE_PATH}/tasks`)
  assert.equal(overlayDataRoute(), `${DATA_MODULE_PATH}/tasks`)
  if (prev == null) localStorage.removeItem(MAIN_DATA_ROUTE_KEY)
  else localStorage.setItem(MAIN_DATA_ROUTE_KEY, prev)
})
