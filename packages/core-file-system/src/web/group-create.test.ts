import { test } from 'vitest'
import assert from 'node:assert/strict'
import { REQUIRED_RECORD_FIELDS, type CollectionSchema } from '@biu/type-file-system'
import { seedGroupRecord } from './group-create.ts'
import { groupRowBucketKeys } from './fields.ts'

const schema: CollectionSchema = { labelField: 'title', fields: {
  ...REQUIRED_RECORD_FIELDS, tag: { type: 'tag', writable: true },
  status: { type: 'select', writable: true }, count: { type: 'number', writable: true },
  when: { type: 'datetime', writable: true }, locked: { type: 'select', computed: true },
} }
const packs = [{ id: 'security', label: '安全项目', fields: [
  { key: 'lane', label: '赛道', type: 'multi-select' as const },
] }]

test('creating inside a custom tag group attaches its tag and preserves other attributes', () => {
  const key = 'tag::security::lane'
  const base = { title: '新建', tag: { tags: ['other', 'security'], values: { security: { note: 'keep', lane: ['old'] } } } }
  const seeded = seedGroupRecord(base, key, 'AI红队', schema, packs)!
  assert.deepEqual(seeded.tag, { tags: ['other', 'security'], values: { security: { note: 'keep', lane: ['AI红队'] } } })
  assert.deepEqual(groupRowBucketKeys({ id: 'new', ...seeded }, key, schema, packs), ['AI红队'])
  assert.deepEqual(base.tag.values.security.lane, ['old'])
  assert.deepEqual((seedGroupRecord({}, key, 'AI红队', schema, packs)!.tag as { tags: string[] }).tags, ['security'])
  const empty = seedGroupRecord(base, key, '', schema, packs)!
  assert.deepEqual(groupRowBucketKeys({ id: 'new', ...empty }, key, schema, packs), [''])
})

test('group seeds override conflicting view defaults and support numeric and date groups', () => {
  assert.equal(seedGroupRecord({ status: 'old' }, 'status', 'new', schema)?.status, 'new')
  const count = seedGroupRecord({}, 'count', 'n:10:100', schema)!
  assert.deepEqual(groupRowBucketKeys({ id: 'new', ...count }, 'count', schema), ['n:10:100'])
  const date = seedGroupRecord({}, 'when::month', 'm:2026-11', schema)!
  assert.deepEqual(groupRowBucketKeys({ id: 'new', ...date }, 'when::month', schema), ['m:2026-11'])
  assert.equal(seedGroupRecord({}, 'locked', 'value', schema), null)
})
