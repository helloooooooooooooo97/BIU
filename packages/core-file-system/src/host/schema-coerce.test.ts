import assert from 'node:assert/strict'
import { test } from 'vitest'
import { emptySchemaValue, type CollectionSchemaPack } from '@biu/type-file-system'
import { AgentDbCompact } from './agent-payload.ts'
import { coerceTagPatch } from './schema-coerce.ts'

const commitPack: CollectionSchemaPack = {
  id: 'tag-10',
  label: '代码提交',
  fields: [
    { key: '类型', label: '类型', type: 'select', writable: true },
    { key: '状态', label: '状态', type: 'select', writable: true },
    { key: '完成', label: '完成', type: 'boolean', writable: true },
    { key: '+', label: '+', type: 'number', writable: true },
    { key: '-', label: '-', type: 'number', writable: true },
    { key: 'pr', label: 'PR', type: 'url', writable: true },
  ],
}

const resolvePack = (idOrLabel: string) =>
  idOrLabel === 'tag-10' || idOrLabel === '代码提交' ? commitPack : null

test('coerceTagPatch preserves symbol keys (+/-) for both grouped and flat single-tag payloads', () => {
  const grouped = coerceTagPatch(
    {
      tags: ['tag-10'],
      values: {
        'tag-10': { 类型: '重构', 完成: true, '+': 120, '-': 18, pr: 'https://github.com/a/b/commit/1234' },
      },
    },
    emptySchemaValue(),
    resolvePack,
  )
  assert.deepEqual(grouped, {
    tags: ['tag-10'],
    values: {
      'tag-10': { 类型: '重构', 完成: true, '+': 120, '-': 18, pr: 'https://github.com/a/b/commit/1234' },
    },
  })

  const flat = coerceTagPatch(
    {
      tags: ['tag-10'],
      values: { 类型: '缺陷修复', '+': 10, '-': 2 },
    },
    emptySchemaValue(),
    resolvePack,
  )
  assert.deepEqual(flat, {
    tags: ['tag-10'],
    values: {
      'tag-10': { 类型: '缺陷修复', '+': 10, '-': 2 },
    },
  })
})

test('coerceTagPatch fails fast on unknown tag fields instead of silently dropping them', () => {
  assert.throws(
    () =>
      coerceTagPatch(
        {
          tags: ['tag-10'],
          values: { 'tag-10': { 不存在的字段: 'abc' } },
        },
        emptySchemaValue(),
        resolvePack,
      ),
    /标签「代码提交」不存在属性「不存在的字段」/,
  )
})

test('coerceTagPatch fails fast when values reference an unattached tag or empty tag list', () => {
  assert.throws(
    () =>
      coerceTagPatch(
        {
          tags: ['tag-10'],
          values: { 'tag-99': { foo: 'bar' } },
        },
        emptySchemaValue(),
        (id) => (id === 'tag-10' ? commitPack : id === 'tag-99' ? { id: 'tag-99', label: '其他', fields: [] } : null),
      ),
    /不在当前标签列表/,
  )

  assert.throws(
    () =>
      coerceTagPatch(
        {
          tags: [],
          values: { 类型: '重构' },
        },
        emptySchemaValue(),
        resolvePack,
      ),
    /未指定任何标签/,
  )
})

test('AgentDbCompact.write echoes persisted tag values so callers can verify writes immediately', () => {
  const compact = new AgentDbCompact()
  const updated = compact.write({
    kind: 'record',
    path: '/pages/p1',
    value: {
      id: 'p1',
      tag: { tags: ['tag-10'], values: { 'tag-10': { 类型: '重构', '+': 10 } } },
    },
  })
  assert.deepEqual(updated, {
    ok: true,
    path: '/pages/p1',
    tag: { tags: ['tag-10'], values: { 'tag-10': { 类型: '重构', '+': 10 } } },
  })

  const created = compact.write({
    kind: 'created',
    path: '/pages',
    items: [
      {
        value: {
          id: 'p2',
          tag: { tags: ['tag-10'], values: { 'tag-10': { 类型: '功能优化' } } },
        },
      },
    ],
  })
  assert.deepEqual(created, {
    ok: true,
    path: '/pages',
    ids: ['p2'],
    tag: { tags: ['tag-10'], values: { 'tag-10': { 类型: '功能优化' } } },
  })
})
