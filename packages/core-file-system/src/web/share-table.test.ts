import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REQUIRED_RECORD_FIELDS, type CollectionSchema } from '@biu/type-file-system'
import { shareTableColumns } from './share-table.tsx'

test('share list table reuses host cell chrome', () => {
  const table = readFileSync(resolve(import.meta.dirname, './share-table.tsx'), 'utf8')
  assert.match(table, /DefaultCell/)
  assert.match(table, /FieldGlyph/)
  assert.match(table, /SchemaChips/)
  assert.match(table, /PersonFace|DefaultCell/)
  assert.match(table, /fsdb-title-host/)
  assert.match(table, /className="fsdb-cell"/)
  assert.match(table, /tasks-th/)
  assert.match(table, /queryFields\?\.has\(col\.key\)/)
  assert.match(table, /groupRecords/)
  assert.match(table, /readTagFieldValue/)
  assert.doesNotMatch(table, /formatField\(schema\.fields/)
})

test('share table keeps custom tag columns from the shared view', () => {
  const schema: CollectionSchema = {
    labelField: 'title',
    contentField: 'notes',
    fields: {
      ...REQUIRED_RECORD_FIELDS,
      title: { type: 'string' },
      notes: { type: 'file' },
      tag: { type: 'tag' },
    },
  }
  const lane = 'tag::security::lane'
  const cols = shareTableColumns(
    schema,
    { columns: ['title', lane, 'tag'] },
    undefined,
    [{
      id: 'security',
      label: '安全项目',
      fields: [{ key: 'lane', label: '赛道', type: 'string', enum: ['AI红队'] }],
    }],
  )
  assert.deepEqual(cols.map((col) => col.key), ['title', lane, 'tag'])
  assert.equal(cols[1]?.field.label, '赛道')
})
