import { test } from 'vitest'
import assert from 'node:assert/strict'
import { collectionListCachePath } from './list-cache-scope.ts'

test('tag definitions and different tag collection sheets never share a list cache', () => {
  const outer = collectionListCachePath('/tags', false, {})
  const a = collectionListCachePath('/tags', true, { tagId: 'a' })
  const b = collectionListCachePath('/tags', true, { tagId: 'b' })
  const cache = new Map([[outer, ['a', 'b']], [a, ['pages::one']], [b, ['pages::two']]])
  assert.equal(cache.size, 3)
  assert.deepEqual(cache.get(outer), ['a', 'b'])
  assert.deepEqual(cache.get(a), ['pages::one'])
  assert.equal(collectionListCachePath('/tags', true, { a: 1, b: 2 }), collectionListCachePath('/tags', true, { b: 2, a: 1 }))
})
