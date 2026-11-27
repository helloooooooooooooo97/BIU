import assert from 'node:assert/strict'
import { beforeEach, describe, it } from 'vitest'
import {
  dropListCacheRecords,
  forgetListCache,
  invalidateListCacheForFsdbChange,
  listCache,
  patchListCacheRecords,
  peekListCache,
  publishDeletedRowsToTrash,
  publishListedMutation,
  rememberListCache,
  upsertListCacheRecord,
} from './browser-list-cache.ts'
import { clearCrumbCache, peekRecord, rememberRecords } from './crumb-cache.ts'
import { DATA_COLLECTION_PATH, TRASH_COLLECTION_PATH } from './database-path.ts'
import {
  getPreviewTotal,
  invalidatePreviewTotals,
  invalidatePreviewTotalsForFsdbChange,
  rememberPreviewTotal,
} from './sidebar-preview.ts'

describe('browser-list-cache & crumb-cache consistency', () => {
  beforeEach(() => {
    listCache.clear()
    clearCrumbCache()
  })

  it('patchListCacheRecords remaps each view using its own groupBy without corrupting sibling views', () => {
    const row = { id: 't1', title: '任务 1', status: 'todo', priority: 'p1' }
    rememberListCache(
      '/tasks',
      {
        items: [row],
        total: 1,
        stat: null,
        groupBy: 'status',
        groupBuckets: [{ key: 'todo', label: 'todo', rows: [row], total: 1 }],
      },
      'view-status',
    )
    rememberListCache(
      '/tasks',
      {
        items: [row],
        total: 1,
        stat: null,
        groupBy: 'priority',
        groupBuckets: [{ key: 'p1', label: 'p1', rows: [row], total: 1 }],
      },
      'view-priority',
    )
    rememberListCache(
      DATA_COLLECTION_PATH,
      {
        items: [{ id: 'tasks::t1', title: '任务 1', tablePath: '/tasks', sourceId: 't1' }],
        total: 1,
        stat: null,
      },
      'all',
    )

    patchListCacheRecords(
      '/tasks',
      (item) => (item.id === 't1' ? { ...item, status: 'done' } : item),
      'status',
    )

    const statusSnap = peekListCache('/tasks', 'view-status')
    assert.deepEqual(
      statusSnap?.groupBuckets?.map((b) => b.key),
      ['done'],
    )

    const prioritySnap = peekListCache('/tasks', 'view-priority')
    assert.deepEqual(
      prioritySnap?.groupBuckets?.map((b) => b.key),
      ['p1'],
    )
    assert.equal(prioritySnap?.groupBuckets?.[0]?.rows[0]?.status, 'done')

    // Derived /data overview cache should be invalidated on source table mutation
    assert.equal(peekListCache(DATA_COLLECTION_PATH, 'all'), undefined)
  })

  it('upsertListCacheRecord does not fabricate a total=1 snapshot on cold cache (e.g. unvisited /trash)', () => {
    publishDeletedRowsToTrash('/tasks', [{ id: 't1', title: '已删任务', shareScope: '私人' }], '任务')
    assert.equal(peekListCache(TRASH_COLLECTION_PATH, 'all'), undefined)
  })

  it('upsertListCacheRecord updates target cached view and invalidates sibling views and /data overview', () => {
    const existing = { id: 't1', title: '旧任务' }
    rememberListCache('/tasks', { items: [existing], total: 1, stat: null, groupBy: '' }, 'v-active')
    rememberListCache('/tasks', { items: [existing], total: 1, stat: null, groupBy: '' }, 'v-sibling')
    rememberListCache(DATA_COLLECTION_PATH, { items: [existing], total: 1, stat: null }, 'all')

    upsertListCacheRecord('/tasks', { id: 't2', title: '新任务' }, '', 'v-active')

    const active = peekListCache('/tasks', 'v-active')
    assert.equal(active?.total, 2)
    assert.deepEqual(
      active?.items.map((r) => r.id),
      ['t2', 't1'],
    )
    assert.equal(peekListCache('/tasks', 'v-sibling'), undefined)
    assert.equal(peekListCache(DATA_COLLECTION_PATH, 'all'), undefined)
  })

  it('dropListCacheRecords and forgetListCache also invalidate /data overview cache', () => {
    const row = { id: 'p1', title: '页面 1' }
    rememberListCache('/pages', { items: [row], total: 1, stat: null }, 'all')
    rememberListCache(DATA_COLLECTION_PATH, { items: [row], total: 1, stat: null }, 'all')

    dropListCacheRecords('/pages', ['p1'])
    assert.equal(peekListCache('/pages', 'all')?.total, 0)
    assert.equal(peekListCache(DATA_COLLECTION_PATH, 'all'), undefined)

    rememberListCache('/pages', { items: [row], total: 1, stat: null }, 'all')
    rememberListCache(DATA_COLLECTION_PATH, { items: [row], total: 1, stat: null }, 'all')
    forgetListCache('/pages')
    assert.equal(peekListCache('/pages', 'all'), undefined)
    assert.equal(peekListCache(DATA_COLLECTION_PATH, 'all'), undefined)
  })

  it('invalidateListCacheForFsdbChange invalidates affected tables on records/tags WS updates', () => {
    const row = { id: 'r1', title: '记录 1' }
    rememberListCache('/pages', { items: [row], total: 1, stat: null }, 'all')
    rememberListCache('/tasks', { items: [row], total: 1, stat: null }, 'all')
    rememberListCache(DATA_COLLECTION_PATH, { items: [row], total: 1, stat: null }, 'all')

    invalidateListCacheForFsdbChange({ scope: 'records', path: '/pages/r1' })
    assert.equal(peekListCache('/pages', 'all'), undefined)
    assert.equal(peekListCache(DATA_COLLECTION_PATH, 'all'), undefined)
    assert.ok(peekListCache('/tasks', 'all'))

    invalidateListCacheForFsdbChange({ scope: 'tags' })
    assert.equal(peekListCache('/tasks', 'all'), undefined)

    rememberListCache('/tasks', { items: [row], total: 1, stat: null }, 'all')
    invalidateListCacheForFsdbChange({ scope: 'records' })
    assert.equal(peekListCache('/tasks', 'all'), undefined)
  })

  it('crumb-cache allows explicitly clearing emoji while partial patches without emoji keep previous emoji', () => {
    rememberRecords('/pages', [{ id: 'p1', label: '文档', emoji: '🔥' }], 'all')
    assert.equal(peekRecord('/pages', 'p1')?.emoji, '🔥')

    // Partial patch without emoji field preserves existing emoji
    publishListedMutation({ path: '/pages', op: 'patch', row: { id: 'p1', updatedAt: 123 } })
    assert.equal(peekRecord('/pages', 'p1')?.emoji, '🔥')

    // Explicit emoji clear resets cached emoji to empty string
    publishListedMutation({ path: '/pages', op: 'patch', row: { id: 'p1', emoji: '' } })
    assert.equal(peekRecord('/pages', 'p1')?.emoji, '')
  })

  it('invalidatePreviewTotalsForFsdbChange clears affected table and /data overview totals', () => {
    invalidatePreviewTotals()
    rememberPreviewTotal('/pages\0all\0title\0asc\0\0{}\0', 12)
    rememberPreviewTotal('/tasks\0all\0title\0asc\0\0{}\0', 7)
    rememberPreviewTotal(`${DATA_COLLECTION_PATH}\0all\0title\0asc\0\0{}\0`, 19)

    invalidatePreviewTotalsForFsdbChange({ scope: 'records', path: '/pages/p1' })
    assert.equal(getPreviewTotal('/pages\0all\0title\0asc\0\0{}\0'), undefined)
    assert.equal(getPreviewTotal(`${DATA_COLLECTION_PATH}\0all\0title\0asc\0\0{}\0`), undefined)
    assert.equal(getPreviewTotal('/tasks\0all\0title\0asc\0\0{}\0'), 7)

    invalidatePreviewTotalsForFsdbChange({ scope: 'tags' })
    assert.equal(getPreviewTotal('/tasks\0all\0title\0asc\0\0{}\0'), undefined)
  })
})
