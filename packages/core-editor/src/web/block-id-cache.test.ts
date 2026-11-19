import assert from 'node:assert/strict'
import { test } from 'vitest'
import { cachedBlockChunks } from './block-id.ts'

test('reserializing a page only walks the block that changed', () => {
  const blocks = Array.from({ length: 40 }, (_, index) => ({ id: index }))
  const changed = { id: 3, text: 'next' }
  const cache = new WeakMap<object, string>()
  let serializes = 0
  const serialize = (node: { id: number }) => {
    serializes += 1
    return `block ${node.id}`
  }
  cachedBlockChunks(blocks, cache, serialize)
  const legacySerializes = serializes
  serializes = 0
  const next = blocks.map((node, index) => (index === 3 ? changed : node))
  const again = cachedBlockChunks(next, cache, serialize)
  assert.equal(again.fresh, 1)
  assert.equal(again.markdown.split('\n\n').length, 40)
  assert.deepEqual({ legacySerializes, currentSerializes: serializes }, { legacySerializes: 40, currentSerializes: 1 })
})
