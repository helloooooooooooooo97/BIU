import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  catalogLockFilters,
  catalogRowOpenTarget,
  collectionNoun,
  defaultGroupByForCollection,
  defaultSeedViewsForCollection,
  displayNameForView,
  EPHEMERAL_VIEW_ID,
  ephemeralFallbackView,
  scopedCollectionName,
  stampRecordId,
  stampRowOpenTarget,
  viewDomainOf,
} from './catalog-views.ts'
import {
  DATA_COLLECTION_PATH,
  EDITOR_BLOCKS_COLLECTION_PATH,
  TAGS_COLLECTION_PATH,
  VIEWS_COLLECTION_PATH,
  WORKSPACE_MEMBERS_COLLECTION_PATH,
} from './paths.ts'

test('defaultSeedViewsForCollection produces plain workspace seed views for business tables, /data, and locked member views', () => {
  const pagesSeeds = defaultSeedViewsForCollection({ path: '/pages', label: '页面' })
  assert.equal(pagesSeeds.length, 1)
  assert.equal(pagesSeeds[0]?.view.id, 'all')
  assert.equal(pagesSeeds[0]?.view.name, '全部页面')
  assert.equal(pagesSeeds[0]?.view.locked, true)
  assert.equal(pagesSeeds[0]?.view.tree, true)
  assert.equal(pagesSeeds[0]?.view.rowNumbers, true)
  assert.equal(pagesSeeds[0]?.view.groupBy, 'shareScope')
  assert.equal(pagesSeeds[0]?.accessMode, 'members')
  assert.equal(pagesSeeds[0]?.memberDefaultRole, 'viewer')

  const taskSeeds = defaultSeedViewsForCollection({ path: '/tasks', label: '任务' })
  assert.equal(taskSeeds.length, 1)
  assert.equal(taskSeeds[0]?.view.name, '全部任务')
  assert.equal(taskSeeds[0]?.view.locked, false)
  assert.equal(taskSeeds[0]?.view.tree, false)
  assert.equal(taskSeeds[0]?.view.rowNumbers, false)
  assert.equal(taskSeeds[0]?.memberDefaultRole, 'editor')

  const memberSeeds = defaultSeedViewsForCollection({ path: WORKSPACE_MEMBERS_COLLECTION_PATH, label: '空间成员' })
  assert.deepEqual(
    memberSeeds.map((s) => ({
      id: s.view.id,
      name: s.view.name,
      locked: s.view.locked,
      kind: s.view.filters.membershipKind,
      role: s.memberDefaultRole,
    })),
    [
      { id: 'member', name: '空间成员', locked: true, kind: 'member', role: 'viewer' },
      { id: 'external', name: '外部成员', locked: true, kind: 'external', role: 'viewer' },
      { id: 'guest', name: '临时访客', locked: true, kind: 'guest', role: 'viewer' },
    ],
  )

  const dataSeeds = defaultSeedViewsForCollection({ path: DATA_COLLECTION_PATH, label: '数据' })
  assert.equal(dataSeeds.length, 1)
  assert.equal(dataSeeds[0]?.view.id, 'all')
  assert.equal(dataSeeds[0]?.view.name, '全部数据')
  assert.equal(dataSeeds[0]?.view.locked, false)

  assert.deepEqual(defaultSeedViewsForCollection({ path: VIEWS_COLLECTION_PATH, label: '视图' }), [])
})

test('ephemeralFallbackView returns an in-memory read-only fallback view for zero-visible-views scenarios', () => {
  const fallback = ephemeralFallbackView({ path: '/pages', label: '页面' })
  assert.equal(fallback.id, EPHEMERAL_VIEW_ID)
  assert.equal(fallback.ephemeral, true)
  assert.equal(fallback.viewRole, 'viewer')
  assert.equal(fallback.name, '全部页面')
})

test('defaultGroupByForCollection maps system and business collections accurately', () => {
  assert.equal(defaultGroupByForCollection('/pages'), 'shareScope')
  assert.equal(defaultGroupByForCollection(WORKSPACE_MEMBERS_COLLECTION_PATH), 'membershipKind')
  assert.equal(defaultGroupByForCollection(VIEWS_COLLECTION_PATH), 'table')
  assert.equal(defaultGroupByForCollection(EDITOR_BLOCKS_COLLECTION_PATH), 'blockKind')
  assert.equal(defaultGroupByForCollection(TAGS_COLLECTION_PATH), '')
})

test('viewDomainOf and catalogLockFilters preserve optional $scope and view filters', () => {
  assert.equal(viewDomainOf({ id: 'v1', filters: { $scope: 'workspace' } }), 'workspace')
  assert.equal(viewDomainOf({ id: 'v2', filters: { $scope: 'personal' } }), 'personal')
  assert.equal(viewDomainOf({ id: 'v3', filters: { $scope: 'shared' } }), 'shared')
  assert.equal(viewDomainOf({ id: 'v4', filters: {} }), 'all')

  const locks = catalogLockFilters('v1', [{ id: 'v1', filters: { $scope: 'workspace', status: 'open' } }])
  assert.deepEqual(locks, { $scope: 'workspace', status: 'open' })
  assert.deepEqual(catalogLockFilters('missing', []), {})
})

test('naming, stampRecordId, stampRowOpenTarget, and catalogRowOpenTarget helpers work consistently', () => {
  assert.equal(collectionNoun({ path: '/pages', label: '页面' }), '页面')
  assert.equal(collectionNoun({ path: DATA_COLLECTION_PATH, label: 'data' }), '数据')
  assert.equal(scopedCollectionName({ path: '/pages', label: '页面' }, 'personal'), '私人页面')
  assert.equal(displayNameForView('v1', { path: '/pages', label: '页面' }, '自定义'), '自定义')
  assert.equal(displayNameForView('v1', { path: '/pages', label: '页面' }), '页面')

  assert.equal(stampRecordId('/pages', 'p1'), 'pages::p1')
  assert.deepEqual(stampRowOpenTarget({ id: 'pages::p1' }), { collection: '/pages', recordId: 'p1' })
  assert.deepEqual(catalogRowOpenTarget({ tablePath: '/pages', viewId: 'v1' }), { collection: '/pages', viewId: 'v1' })
})
