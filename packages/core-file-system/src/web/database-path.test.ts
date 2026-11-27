import { test } from 'vitest'
import assert from 'node:assert/strict'
import { parseAppPath } from '@biu/web-session-view'
import { DATA_MODULE, databaseAllViewPath, databaseRecordPath, databaseViewPath, isIndexCollection, isOverviewCreatableCollection, isRecordTreeCollection, isSystemCollection, sortDataCollections, viewsCatalogSource } from './database-path.ts'

const plugins = [DATA_MODULE]

test('view and record helpers match the database URL scheme', () => {
  assert.equal(databaseViewPath('/pages', 'default'), '/database/pages/view/default')
  assert.equal(databaseViewPath('/agents'), '/database/agents')
  assert.equal(databaseRecordPath('/pages', 'rec-1'), '/database/pages/record/rec-1')
  assert.equal(databaseRecordPath('/pages', 'rec-1', 'board'), '/database/pages/view/board/record/rec-1')
  assert.equal(parseAppPath(databaseViewPath('/pages', 'default'), plugins).kind, 'collection-view')
  assert.equal(parseAppPath(databaseViewPath('/agents'), plugins).kind, 'collection-view')
  assert.equal(parseAppPath(databaseRecordPath('/pages', 'rec-1'), plugins).kind, 'record')
  const nested = parseAppPath(databaseRecordPath('/pages', 'rec-1', 'board'), plugins)
  assert.equal(nested.kind, 'record')
  if (nested.kind === 'record') assert.equal(nested.viewId, 'board')
})

test('default all-view helpers keep the database URL scheme', () => {
  assert.equal(databaseAllViewPath('/agents'), '/database/agents/view/all')
  assert.equal(databaseAllViewPath('/tasks'), '/database/tasks/view/all')
  assert.equal(databaseAllViewPath('/pages'), '/database/pages/view/all')
  assert.equal(databaseAllViewPath('/plugins'), '/database/plugins/view/all')
  assert.equal(databaseAllViewPath('/data'), '/database/data/view/all')
  const parsed = parseAppPath(databaseAllViewPath('/agents'), plugins)
  assert.equal(parsed.kind, 'collection-view')
  if (parsed.kind === 'collection-view') {
    assert.equal(parsed.collection, '/agents')
    assert.equal(parsed.viewId, 'all')
  }
})

test('table path without view still parses as a collection-view URL', () => {
  const parsed = parseAppPath(databaseViewPath('/tasks'), plugins)
  assert.equal(parsed.kind, 'collection-view')
  if (parsed.kind === 'collection-view') {
    assert.equal(parsed.collection, '/tasks')
    assert.equal(parsed.viewId, undefined)
  }
})

test('only pages and tasks nest records in the data sidebar', () => {
  assert.equal(isRecordTreeCollection('/pages'), true)
  assert.equal(isRecordTreeCollection('/pages/'), true)
  assert.equal(isRecordTreeCollection('/tasks'), true)
  assert.equal(isRecordTreeCollection('/agents'), false)
  assert.equal(isRecordTreeCollection('/editor-blocks'), false)
  assert.equal(isRecordTreeCollection('/plugins'), false)
})

test('views catalog source is a query filter', () => {
  assert.equal(viewsCatalogSource('?source=%2Fevents'), '/events')
  assert.equal(viewsCatalogSource(''), '')
})

test('members and views are system collections; blocks and tags are index data', () => {
  assert.equal(isSystemCollection('/workspace-members'), true)
  assert.equal(isSystemCollection('/views'), true)
  assert.equal(isSystemCollection('/tags'), false)
  assert.equal(isIndexCollection('/tags'), true)
  assert.equal(isIndexCollection('/editor-blocks'), true)
  assert.equal(isIndexCollection('/pages'), false)
  assert.equal(isSystemCollection('/events'), false)
  assert.equal(isSystemCollection('/notices'), true)
  assert.equal(isSystemCollection('/trash'), true)
  assert.equal(isSystemCollection('/agents'), false)
  const { user, index, system } = sortDataCollections([
    { path: '/workspace-members' },
    { path: '/plugins' },
    { path: '/views' },
    { path: '/notices' },
    { path: '/trash' },
    { path: '/tags' },
    { path: '/agents' },
    { path: '/pages' },
    { path: '/editor-blocks' },
    { path: '/tasks' },
    { path: '/mcp' },
    { path: '/skills' },
    { path: '/data' },
  ])
  assert.deepEqual(
    user.map((item) => item.path),
    ['/agents', '/pages', '/tags', '/plugins'],
  )
  assert.deepEqual(
    index.map((item) => item.path),
    ['/tasks', '/mcp', '/skills', '/editor-blocks', '/views'],
  )
  assert.deepEqual(
    system.map((item) => item.path),
    ['/workspace-members', '/notices', '/trash'],
  )
})

test('data overview create menu excludes plugins, comments, system and index collections', () => {
  assert.equal(isOverviewCreatableCollection('/plugins'), false)
  assert.equal(isOverviewCreatableCollection('/comments'), false)
  assert.equal(isOverviewCreatableCollection('/data'), false)
  assert.equal(isOverviewCreatableCollection('/tags'), false)
  assert.equal(isOverviewCreatableCollection('/trash'), false)
  assert.equal(isOverviewCreatableCollection('/pages'), true)
  assert.equal(isOverviewCreatableCollection('/agents'), true)
  assert.equal(isOverviewCreatableCollection('/tasks'), true)
  assert.equal(isOverviewCreatableCollection('/mcp'), true)
  assert.equal(isOverviewCreatableCollection('/skills'), true)
  assert.equal(isOverviewCreatableCollection({ path: '/custom-readonly', caps: { create: false, overviewCreate: false } }), false)
  assert.equal(isOverviewCreatableCollection({ path: '/custom-hidden', caps: { create: true }, view: { sidebar: false } }), false)
  assert.equal(isOverviewCreatableCollection({ path: '/custom-creatable', caps: { create: true, overviewCreate: true } }), true)
})
