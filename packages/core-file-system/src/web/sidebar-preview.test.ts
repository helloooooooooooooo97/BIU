import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  getPreviewTotal,
  nextPreviewLimit,
  normalizeRecordEmoji,
  orderViewTotalJobs,
  shouldFetchViewTotal,
  previewCacheKey,
  previewColumns,
  recordPreviewLabel,
  crumbRecordLabel,
  rememberPreviewTotal,
  SIDEBAR_PREVIEW_PAGE,
  viewTotalKey,
} from './sidebar-preview.ts'

test('record emoji keeps a short grapheme and clears empty', () => {
  assert.equal(normalizeRecordEmoji(' 🔥 '), '🔥')
  assert.equal(normalizeRecordEmoji(''), '')
  assert.equal(normalizeRecordEmoji('⭐🚀💥'), '⭐🚀')
})

test('record preview prefers label field then title', () => {
  assert.equal(recordPreviewLabel({ id: '1', title: '封面' }, 'title'), '封面')
  assert.equal(recordPreviewLabel({ id: '1', name: '插件' }), '插件')
  assert.equal(recordPreviewLabel({ id: 'abc' }), 'abc')
})

test('crumb record label skips id field so titles show in inspector', () => {
  assert.equal(crumbRecordLabel({ id: 'evt-194', title: '打开一条事件' }, 'id'), '打开一条事件')
  assert.equal(crumbRecordLabel({ id: 'evt-194', name: '周报' }, 'id'), '周报')
})

test('preview cache includes view query and filters', () => {
  const a = previewCacheKey('/tasks', { id: 'v1', sortField: 'id', sortDir: 'asc', filters: {}, query: '' })
  const b = previewCacheKey('/tasks', { id: 'v1', sortField: 'id', sortDir: 'asc', filters: { status: 'open' }, query: '' })
  assert.notEqual(a, b)
})

test('preview total key is cached per view', () => {
  const view = { id: 'v1', sortField: 'id', sortDir: 'asc' as const, filters: {}, query: '' }
  rememberPreviewTotal(viewTotalKey('/tasks', view), 12)
  assert.equal(getPreviewTotal(viewTotalKey('/tasks', view)), 12)
})

test('sidebar preview asks for the view group field so 全部 does not collapse into 未填', () => {
  assert.deepEqual(previewColumns({ groupBy: 'shareScope' }), ['title', 'emoji', 'mascot', 'parentId', 'shareScope'])
  assert.deepEqual(previewColumns({ groupBy: '' }), ['title', 'emoji', 'mascot', 'parentId'])
})

test('preview pages stay small and stop at max', () => {
  assert.equal(nextPreviewLimit(0, 500), SIDEBAR_PREVIEW_PAGE)
  assert.equal(nextPreviewLimit(20, 25), 5)
  assert.equal(nextPreviewLimit(100, 500), 0)
  assert.equal(nextPreviewLimit(25, 25), 0)
})

test('block/tag stub views only fetch a total when they are the open view', () => {
  const block = { id: 'builtin-block:terminal' }
  const tag = { id: 'builtin-tag:work' }
  const all = { id: 'builtin-all:/page-blocks' }
  const user = { id: 'mine' }
  assert.equal(
    shouldFetchViewTotal({ path: '/page-blocks', view: block, collectionPath: '/page-blocks', activeViewId: all.id }),
    false,
  )
  assert.equal(
    shouldFetchViewTotal({ path: '/page-blocks', view: block, collectionPath: '/page-blocks', activeViewId: block.id }),
    true,
  )
  assert.equal(shouldFetchViewTotal({ path: '/page-blocks', view: all, collectionPath: '/page-blocks', activeViewId: all.id }), true)
  assert.equal(shouldFetchViewTotal({ path: '/page-blocks', view: user, collectionPath: '/page-blocks', activeViewId: all.id }), true)
  assert.equal(shouldFetchViewTotal({ path: '/facets', view: tag, collectionPath: '/tasks', activeViewId: tag.id }), false)
})

test('view total jobs put the open collection first and keep the rest stable', () => {
  const jobs = [{ path: '/pages' }, { path: '/tasks' }, { path: '/pages' }, { path: '/skills' }]
  assert.deepEqual(
    orderViewTotalJobs(jobs, '/tasks').map((job) => job.path),
    ['/tasks', '/pages', '/pages', '/skills'],
  )
})
