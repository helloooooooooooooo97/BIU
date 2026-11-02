import { test } from 'vitest'
import assert from 'node:assert/strict'
import { registerFacetFieldKey } from './facet-catalog.ts'
import { facetPropertyCount, facetTagLabel } from './schema-field.tsx'

test('type pack fields cannot reuse file-system keys or labels', () => {
  assert.equal(registerFacetFieldKey('标签'), null)
  assert.equal(registerFacetFieldKey('facet'), null)
  assert.equal(registerFacetFieldKey('标题'), null)
  assert.equal(registerFacetFieldKey('title'), null)
  const ok = registerFacetFieldKey('复杂度')
  assert.match(String(ok), /^\d+$/)
  assert.equal(registerFacetFieldKey('复杂度', { keys: [ok!], labels: ['复杂度'] }), null)
})

test('facet tag label appends the live property count', () => {
  assert.equal(facetPropertyCount({ fields: [{}, { deleted: true }, {}] }), 2)
  assert.equal(facetTagLabel({ id: 'need', label: '需求', fields: [{}, {}, {}] }), '需求 3')
  assert.equal(facetTagLabel(undefined, '需求'), '需求 0')
})
