import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
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

test('facet chips jump to the tag record like parent and depend chips', () => {
  const catalog = readFileSync(resolve(import.meta.dirname, './facet-catalog.ts'), 'utf8')
  const schemaUi = readFileSync(resolve(import.meta.dirname, './schema-field.tsx'), 'utf8')
  const cells = readFileSync(resolve(import.meta.dirname, './fsdb-cells.tsx'), 'utf8')
  const pop = readFileSync(resolve(import.meta.dirname, './field-value-pop.tsx'), 'utf8')
  assert.match(catalog, /showRecordInInspector\('\/facets', resolved\)/)
  assert.match(schemaUi, /jumpFacet\(id, onOpen\)/)
  assert.match(schemaUi, /<FieldValuePop/)
  assert.doesNotMatch(schemaUi, /<CellMulti/)
  assert.doesNotMatch(schemaUi, /onChipClick=\{\(id\) => jumpFacet\(id\)\}/)
  assert.match(cells, /jumpFacet\(id, onOpenLink\)/)
  assert.match(pop, /\.biu-tag-wrap/)
})

test('detail facet cell opens FieldValuePop unless the click is on a tag', () => {
  const schemaUi = readFileSync(resolve(import.meta.dirname, './schema-field.tsx'), 'utf8')
  const pop = readFileSync(resolve(import.meta.dirname, './field-value-pop.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(schemaUi, /const facetPop =/)
  assert.match(schemaUi, /\{facetPop\}/)
  assert.match(pop, /if \(\(event\.target as HTMLElement\)\.closest\(POP_HOST_IGNORE\)\) return/)
  assert.match(css, /\.fsdb-page \.fsdb-detail-aside \.tasks-table\.is-wrap \.fsdb-pop-host:has\(\.biu-tags\)[\s\S]*?width:100%/)
})

test('facet tag label appends the live property count', () => {
  assert.equal(facetPropertyCount({ fields: [{}, { deleted: true }, {}] }), 2)
  assert.equal(facetTagLabel({ id: 'need', label: '需求', fields: [{}, {}, {}] }), '需求 3')
  assert.equal(facetTagLabel(undefined, '需求'), '需求 0')
})
