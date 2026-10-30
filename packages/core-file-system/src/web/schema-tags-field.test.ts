import { test } from 'vitest'
import assert from 'node:assert/strict'
import { registerFacetFieldKey } from './facet-catalog.ts'

test('type pack fields cannot reuse file-system keys or labels', () => {
  assert.equal(registerFacetFieldKey('标签'), null)
  assert.equal(registerFacetFieldKey('facet'), null)
  assert.equal(registerFacetFieldKey('标题'), null)
  assert.equal(registerFacetFieldKey('title'), null)
  const ok = registerFacetFieldKey('复杂度')
  assert.match(String(ok), /^\d+$/)
  assert.equal(registerFacetFieldKey('复杂度', { keys: [ok!], labels: ['复杂度'] }), null)
})
