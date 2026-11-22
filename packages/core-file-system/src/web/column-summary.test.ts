import { test } from 'vitest'
import assert from 'node:assert/strict'
import { computeColumnSummary, normalizeColumnSummaries, summaryOpsForKind } from './column-summary.ts'
import { tagFlatColumnKey } from './fields.ts'

test('summaryOpsForKind exposes type-specific operations', () => {
  assert.equal(summaryOpsForKind('number').some((item) => item.op === 'sum'), true)
  assert.equal(summaryOpsForKind('boolean').some((item) => item.op === 'percent-checked'), true)
  assert.equal(summaryOpsForKind('datetime').some((item) => item.op === 'earliest'), true)
  assert.equal(summaryOpsForKind('string').some((item) => item.op === 'sum'), false)
})

test('normalizeColumnSummaries strips none and unknown ops', () => {
  assert.deepEqual(
    normalizeColumnSummaries({ title: 'count', plus: 'sum', bad: 'bogus', off: 'none' }),
    { title: 'count', plus: 'sum' },
  )
  assert.equal(normalizeColumnSummaries({ off: 'none' }), undefined)
})

test('computeColumnSummary calculates numeric, boolean, date, and tag flat columns', () => {
  const plusKey = tagFlatColumnKey('tag-10', '+')
  const doneKey = tagFlatColumnKey('tag-10', '完成')
  const rows = [
    { id: '1', title: 'A', ts: 1700000000000, tag: { tags: ['tag-10'], values: { 'tag-10': { '+': 100, 完成: true } } } },
    { id: '2', title: 'B', ts: 1700100000000, tag: { tags: ['tag-10'], values: { 'tag-10': { '+': 250, 完成: false } } } },
    { id: '3', title: '', ts: 1700200000000, tag: { tags: ['tag-10'], values: { 'tag-10': { '+': 50, 完成: true } } } },
  ]
  assert.deepEqual(computeColumnSummary(rows, plusKey, { type: 'number' }, 'sum'), { op: 'sum', label: '求和', value: '400' })
  assert.deepEqual(computeColumnSummary(rows, plusKey, { type: 'number' }, 'median'), { op: 'median', label: '中位', value: '100' })
  assert.deepEqual(computeColumnSummary(rows, plusKey, { type: 'number' }, 'max'), { op: 'max', label: '最大', value: '250' })
  assert.deepEqual(computeColumnSummary(rows, doneKey, { type: 'boolean' }, 'checked'), { op: 'checked', label: '已勾选', value: '2' })
  assert.deepEqual(computeColumnSummary(rows, doneKey, { type: 'boolean' }, 'percent-checked'), { op: 'percent-checked', label: '完成率', value: '66.7%' })
  assert.deepEqual(computeColumnSummary(rows, 'title', { type: 'string' }, 'filled'), { op: 'filled', label: '非空', value: '2' })
  assert.deepEqual(computeColumnSummary(rows, 'title', { type: 'string' }, 'empty'), { op: 'empty', label: '为空', value: '1' })
  assert.equal(computeColumnSummary(rows, 'ts', { type: 'datetime' }, 'earliest')?.value, '2023/11/15')
  assert.equal(computeColumnSummary(rows, 'title', { type: 'string' }, 'none'), null)
})
