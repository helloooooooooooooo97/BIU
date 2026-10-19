import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mergeSessionConfig, normalizeSessionConfig } from './index.ts'

test('normalizeSessionConfig folds legacy tags into facet and drops tags', () => {
  const next = normalizeSessionConfig({
    title: 'A',
    tags: ['host-ui', 'bug', 'host-ui'],
    facet: { tags: ['host-ui'], values: { 'host-ui': { n: 1 } } },
  })
  assert.equal(next && 'tags' in next, false)
  assert.deepEqual(next?.facet, { tags: ['host-ui', 'bug'], values: { 'host-ui': { n: 1 } } })
})

test('mergeSessionConfig still accepts tags patches as 标签 ids', () => {
  const next = mergeSessionConfig({ pinned: true }, { tags: ['lab'] } as never)
  assert.equal(next && 'tags' in next, false)
  assert.deepEqual(next?.facet, { tags: ['lab'], values: {} })
})
