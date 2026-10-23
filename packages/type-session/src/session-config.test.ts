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

test('normalizeSessionConfig keeps skipLlmImages', () => {
  assert.equal(normalizeSessionConfig({ skipLlmImages: true })?.skipLlmImages, true)
  assert.equal(normalizeSessionConfig({ skipLlmImages: false })?.skipLlmImages, undefined)
  const cleared = mergeSessionConfig({ skipLlmImages: true, pinned: true }, { skipLlmImages: false })
  assert.equal(cleared?.skipLlmImages, undefined)
  assert.equal(cleared?.pinned, true)
})

test('normalizeSessionConfig keeps omitImageSeqs and empty patch clears them', () => {
  assert.deepEqual(normalizeSessionConfig({ omitImageSeqs: [3, 3, -1, 1.5, 0] })?.omitImageSeqs, [3, 0])
  const merged = mergeSessionConfig({ omitImageSeqs: [1], pinned: true }, { omitImageSeqs: [2, 1] })
  assert.deepEqual(merged?.omitImageSeqs, [2, 1])
  const cleared = mergeSessionConfig({ omitImageSeqs: [1], pinned: true }, { omitImageSeqs: [] })
  assert.equal(cleared?.omitImageSeqs, undefined)
  assert.equal(cleared?.pinned, true)
})

test('mergeSessionConfig still accepts tags patches as 标签 ids', () => {
  const next = mergeSessionConfig({ pinned: true }, { tags: ['lab'] } as never)
  assert.equal(next && 'tags' in next, false)
  assert.deepEqual(next?.facet, { tags: ['lab'], values: {} })
})
