import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  clearScopedStorage,
  getTrackedScopedStorageKeys,
  readStorageJson,
  readStorageString,
  removeStorageKey,
  writeStorageJson,
  writeStorageString,
} from './client-storage.ts'

test('client-storage reads/writes strings and JSON safely and clears workspace-scoped keys', () => {
  clearScopedStorage()
  removeStorageKey('biu.test.global')
  removeStorageKey('biu.test.scoped')
  removeStorageKey('biu.test.sess', 'session')

  assert.equal(writeStorageString('biu.test.global', 'keep'), true)
  assert.equal(writeStorageJson('biu.test.scoped', { a: 1 }, { scope: 'workspace' }), true)
  assert.equal(writeStorageString('biu.test.sess', 'tmp', { area: 'session', scope: 'workspace' }), true)

  assert.equal(readStorageString('biu.test.global'), 'keep')
  assert.deepEqual(readStorageJson('biu.test.scoped', { a: 0 }), { a: 1 })
  assert.equal(readStorageString('biu.test.sess', 'session'), 'tmp')
  assert.deepEqual(getTrackedScopedStorageKeys().sort(), ['biu.test.scoped', 'biu.test.sess'])

  const cleared = clearScopedStorage()
  assert.deepEqual(cleared.sort(), ['biu.test.scoped', 'biu.test.sess'])
  assert.equal(readStorageString('biu.test.global'), 'keep')
  assert.equal(readStorageString('biu.test.scoped'), null)
  assert.equal(readStorageString('biu.test.sess', 'session'), null)

  removeStorageKey('biu.test.global')
})

test('client-storage namespaces workspace-scoped keys by active biu.workspaceId', () => {
  clearScopedStorage()
  writeStorageString('biu.workspaceId', 'ws_alpha', { area: 'session' })
  assert.equal(writeStorageJson('fsdb.tags', ['a'], { scope: 'workspace' }), true)
  assert.deepEqual(readStorageJson('fsdb.tags', [], { scope: 'workspace' }), ['a'])

  // Switching workspace isolates reads and writes without leaking ws_alpha data
  writeStorageString('biu.workspaceId', 'ws_beta', { area: 'session' })
  assert.deepEqual(readStorageJson('fsdb.tags', [], { scope: 'workspace' }), [])
  assert.equal(writeStorageJson('fsdb.tags', ['b'], { scope: 'workspace' }), true)
  assert.deepEqual(readStorageJson('fsdb.tags', [], { scope: 'workspace' }), ['b'])

  // Switching back preserves ws_alpha's isolated state
  writeStorageString('biu.workspaceId', 'ws_alpha', { area: 'session' })
  assert.deepEqual(readStorageJson('fsdb.tags', [], { scope: 'workspace' }), ['a'])

  clearScopedStorage()
  removeStorageKey('biu.workspaceId', 'session')
})
