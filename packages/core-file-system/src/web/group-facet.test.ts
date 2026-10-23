import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { REQUIRED_RECORD_FIELDS, type CollectionSchema } from '@biu/type-file-system'
import { facetFlatColumnKey, GROUP_STRATEGIES, groupField, groupableFields, groupListKeys, groupRecords, isGroupableKind } from './fields'

const schema: CollectionSchema = {
  labelField: 'title',
  fields: { ...REQUIRED_RECORD_FIELDS, title: { type: 'string' }, facet: { type: 'facet' } },
}

const packs = [
  {
    id: 'haohao',
    label: '好好哈',
    fields: [
      { key: 'mood', type: 'select' as const, enum: ['ok', 'meh'] },
      { key: 'count', type: 'number' as const, label: '数量' },
      { key: 'note', type: 'string' as const, label: '备注' },
      { key: 'when', type: 'datetime' as const, label: '时间' },
    ],
  },
]

test('groupListKeys uses facet packs without waiting for collection schema', () => {
  const key = facetFlatColumnKey('haohao', 'mood')
  const listed = groupListKeys(undefined, key, [], packs)
  assert.ok(listed.some((item) => item.key === 'ok'))
  assert.ok(listed.some((item) => item.key === 'meh'))
})

test('facet pack menus only list groupable kinds, including number intervals', () => {
  const keys = groupableFields(schema, packs).map((item) => item.key)
  assert.equal(keys.includes('facet'), true)
  assert.equal(keys.includes(facetFlatColumnKey('haohao', 'mood')), true)
  assert.equal(keys.includes(facetFlatColumnKey('haohao', 'count')), true)
  assert.equal(keys.includes(facetFlatColumnKey('haohao', 'when')), true)
  assert.equal(keys.includes(facetFlatColumnKey('haohao', 'note')), false)
  assert.equal(isGroupableKind('number'), true)
  assert.equal('number' in GROUP_STRATEGIES, true)
})

test('number facet fields group by interval, not distinct values', () => {
  const key = facetFlatColumnKey('haohao', 'count')
  assert.equal(groupField(schema, key, packs)?.key, key)
  const rows = [
    { id: '1', title: 'a', facet: { tags: ['haohao'], values: { haohao: { count: 3 } } } },
    { id: '2', title: 'b', facet: { tags: ['haohao'], values: { haohao: { count: 4 } } } },
    { id: '3', title: 'c', facet: { tags: ['haohao'], values: { haohao: { count: 40 } } } },
  ]
  const grouped = groupRecords(rows, schema, key, packs)
  assert.deepEqual(
    grouped.map((item) => [item.label, item.rows.map((row) => row.id)]),
    [
      ['1–9', ['1', '2']],
      ['10–99', ['3']],
    ],
  )
  assert.equal(groupListKeys(schema, key, ['3', '4', '40'], packs).some((item) => item.key === '3'), false)
})

test('groupRecords and groupListKeys dispatch only through GROUP_STRATEGIES', () => {
  const fields = readFileSync(resolve(import.meta.dirname, './fields.ts'), 'utf8')
  const groupRecordsFn = fields.slice(fields.indexOf('export function groupRecords'), fields.indexOf('export function groupRowBucketKeys'))
  const listKeysFn = fields.slice(fields.indexOf('export function groupListKeys'), fields.indexOf('export function groupListFilter'))
  const filterFn = fields.slice(fields.indexOf('export function groupListFilter'), fields.indexOf('export function mergeListFilters'))
  assert.match(groupRecordsFn, /strategyForField/)
  assert.match(listKeysFn, /strategyForField/)
  assert.match(filterFn, /strategyForField/)
  assert.doesNotMatch(groupRecordsFn, /kind === 'boolean'/)
  assert.doesNotMatch(listKeysFn, /kind === 'multi-select'/)
  assert.doesNotMatch(filterFn, /kind === 'datetime'/)
})
