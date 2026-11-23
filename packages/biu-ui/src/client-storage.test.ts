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
