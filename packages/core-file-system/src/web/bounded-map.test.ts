import { test } from 'vitest'
import assert from 'node:assert/strict'
import { BoundedMap } from './bounded-map.ts'

test('BoundedMap evicts least-recently-used entry when capacity is exceeded', () => {
  const cache = new BoundedMap<string, number>(3)
  cache.set('a', 1)
  cache.set('b', 2)
  cache.set('c', 3)
  // Touch 'a' so 'b' becomes LRU
  assert.equal(cache.get('a'), 1)
  cache.set('d', 4)
  assert.equal(cache.size, 3)
  assert.equal(cache.has('b'), false)
  assert.deepEqual([...cache.keys()], ['c', 'a', 'd'])
  // Updating an existing key does not evict
  cache.set('c', 30)
  assert.equal(cache.size, 3)
  assert.equal(cache.get('c'), 30)
})
