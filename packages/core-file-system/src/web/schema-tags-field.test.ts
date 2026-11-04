import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { registerTagFieldKey } from './tag-catalog.ts'
import { tagPropertyCount, tagChipLabel } from './schema-field.tsx'

test('type pack fields cannot reuse file-system keys or labels', () => {
  assert.equal(registerTagFieldKey('标签'), null)
  assert.equal(registerTagFieldKey('tag'), null)
  assert.equal(registerTagFieldKey('标题'), null)
  assert.equal(registerTagFieldKey('title'), null)
  const ok = registerTagFieldKey('复杂度')
  assert.match(String(ok), /^\d+$/)
  assert.equal(registerTagFieldKey('复杂度', { keys: [ok!], labels: ['复杂度'] }), null)
})

test('facet chips jump to the tag record like parent and depend chips', () => {
  const catalog = readFileSync(resolve(import.meta.dirname, './tag-catalog.ts'), 'utf8')
  const schemaUi = readFileSync(resolve(import.meta.dirname, './schema-field.tsx'), 'utf8')
  const cells = readFileSync(resolve(import.meta.dirname, './fsdb-cells.tsx'), 'utf8')
  const pop = readFileSync(resolve(import.meta.dirname, './field-value-pop.tsx'), 'utf8')
  assert.match(catalog, /showRecordInInspector\('\/tags', resolved\)/)
  assert.match(schemaUi, /jumpTag\(id, onOpen\)/)
  assert.match(schemaUi, /<FieldValuePop/)
  assert.doesNotMatch(schemaUi, /<CellMulti/)
  assert.doesNotMatch(schemaUi, /onChipClick=\{\(id\) => jumpTag\(id\)\}/)
  assert.match(cells, /jumpTag\(id, onOpenLink\)/)
  assert.match(pop, /\.biu-tag-wrap/)
})

test('detail facet cell opens FieldValuePop unless the click is on a tag', () => {
  const schemaUi = readFileSync(resolve(import.meta.dirname, './schema-field.tsx'), 'utf8')
  const pop = readFileSync(resolve(import.meta.dirname, './field-value-pop.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(schemaUi, /const tagPop =/)
  assert.match(schemaUi, /\{tagPop\}/)
  assert.match(pop, /if \(\(event\.target as HTMLElement\)\.closest\(POP_HOST_IGNORE\)\) return/)
  assert.match(css, /\.fsdb-page \.fsdb-detail-aside \.tasks-table\.is-wrap \.fsdb-pop-host:has\(\.biu-tags\)[\s\S]*?width:100%/)
})

test('facet pack property chips use the field glyph instead of the tag icon', () => {
  const schemaUi = readFileSync(resolve(import.meta.dirname, './schema-field.tsx'), 'utf8')
  assert.match(schemaUi, /icon=\{icon \?\? tagChipIcon\(id\)\}/)
  assert.match(schemaUi, /icon=\{<FieldGlyph kind=\{field\.type\} \/>\}/)
  assert.match(schemaUi, /data-testid="fsdb-tag-fields"/)
})

test('facet tag label appends the live property count', () => {
  assert.equal(tagPropertyCount({ fields: [{}, { deleted: true }, {}] }), 2)
  assert.equal(tagChipLabel({ id: 'need', label: '需求', fields: [{}, {}, {}] }), '需求 3')
  assert.equal(tagChipLabel(undefined, '需求'), '需求 0')
})
