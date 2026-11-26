import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  builtinAllView,
  builtinAllViewId,
  builtinBlockKindViewId,
  builtinCatalogViewId,
  builtinCatalogViews,
  builtinMemberViews,
  isBuiltinBlockKindViewId,
  isBuiltinCatalogViewId,
  isReadOnlyViewId,
  mergeCatalogViews,
  mergePageBlockViews,
  mergeTableViews,
  catalogLockFilters,
  stubBuiltinAllView,
  stubBuiltinBlockKindView,
  isBuiltinAllViewForCollection,
  stubBuiltinCatalogView,
  catalogRowOpenTarget,
  collectionNoun,
  displayNameForView,
  builtinTagViewId,
  isBuiltinTagViewId,
  isNonPersonalView,
  stampRecordId,
  stampRowOpenTarget,
  stubDefaultTableView,
  viewDomainOf,
} from './catalog-views.ts'

test('overlay keeps stored seed edits on /data and strips builtin-all on K+1 collections', () => {
  const dataTable = { path: '/data', label: '数据', view: { title: '数据' } }
  const dataAllId = builtinAllViewId('/data')
  const renamed = mergeTableViews(dataTable, [
    { id: dataAllId, name: '我的数据', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
  ])
  assert.equal(renamed[0]?.name, '我的数据')
  const omitted = mergeTableViews(
    dataTable,
    [{ id: 'mine', name: '周报', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] }],
    [dataAllId],
  )
  assert.equal(omitted.some((view) => view.id === dataAllId), false)
  assert.equal(omitted.some((view) => view.id === 'mine'), true)

  // K+1 业务集合不再注入 builtin-all 聚合视图
  const pagesTable = { path: '/pages', label: '页面', view: { title: '页面' } }
  const pagesMerged = mergeTableViews(pagesTable, [
    { id: builtinAllViewId('/pages'), name: '旧聚合', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] },
    { id: 'ws-default', name: '空间页面', ownerTable: 'workspace', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] },
  ])
  assert.deepEqual(pagesMerged.map((v) => v.id), ['ws-default'])
})

test('member directory exposes builtin audience views', () => {
  const views = mergeTableViews({ path: '/workspace-members', label: '成员' }, [])
  assert.equal(views[0]?.name, '全部成员')
  assert.equal(views[0]?.groupBy, 'membershipKind')
  assert.deepEqual(views.slice(1).map((view) => view.name), ['空间成员', '外部成员', '临时访客'])
  assert.deepEqual(builtinMemberViews().map((view) => view.filters.membershipKind), ['member', 'external', 'guest'])
})

test('views collection only seeds 全部视图', () => {
  const tables = [
    { id: 'views', path: '/views', kind: 'collection' as const, label: '视图', view: { moduleId: 'views-db', route: '/db-views', title: '视图' } },
    { id: 'pages', path: '/pages', kind: 'collection' as const, label: '页面', view: { moduleId: 'page', route: '/pages', title: '页面' } },
    { id: 'tasks', path: '/tasks', kind: 'collection' as const, label: '任务', view: { moduleId: 'tasks', route: '/tasks', title: '任务' } },
  ]
  const listed = builtinCatalogViews(tables)
  assert.equal(listed.length, 3)
  assert.equal(listed[1]?.id, builtinCatalogViewId('/pages'))
  const merged = mergeCatalogViews(tables, [
    { id: builtinCatalogViewId('/pages'), name: '旧的', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] },
    { id: 'user-1', name: '周报', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] },
  ])
  assert.equal(merged[0]?.id, builtinAllViewId('/views'))
  assert.equal(merged[0]?.name, '全部视图')
  assert.equal(merged[0]?.groupBy, 'table')
  assert.deepEqual(merged.filter((view) => view.builtin).map((view) => view.id), [builtinAllViewId('/views')])
  assert.equal(merged.some((view) => view.id === 'user-1'), true)
  assert.equal(merged.some((view) => view.id === builtinCatalogViewId('/pages')), false)
})

test('stub builtin catalog view from route id', () => {
  const stub = stubBuiltinCatalogView('builtin:/drawings')
  assert.equal(stub?.builtin, true)
  assert.deepEqual(stub?.filters, { tablePath: '/drawings' })
  assert.equal(stubBuiltinCatalogView('user-1'), null)
  assert.equal(isBuiltinCatalogViewId('builtin-all:/agents'), false)
  assert.equal(stubBuiltinCatalogView('builtin-all:/agents'), null)
})

test('builtin all view ids belong to one collection', () => {
  assert.equal(isBuiltinAllViewForCollection('builtin-all:/agents', '/agents'), true)
  assert.equal(isBuiltinAllViewForCollection('builtin-all:/agents', '/pages'), false)
  assert.equal(isBuiltinAllViewForCollection('mine', '/agents'), false)
})

test('/data gets a 全部数据 seed view while K+1 collections only keep concrete table views', () => {
  const data = { id: 'data', path: '/data', kind: 'collection' as const, label: '数据', view: { title: '数据' } }
  const all = builtinAllView(data)
  assert.equal(all.id, builtinAllViewId('/data'))
  assert.equal(all.name, '全部数据')
  assert.deepEqual(all.filters, {})
  assert.equal(all.builtin, true)
  assert.equal(all.sortField, 'updatedAt')
  assert.equal(all.sortDir, 'desc')
  assert.equal(all.tree, false)
  const merged = mergeTableViews(data, [
    { id: builtinAllViewId('/data'), name: '自定义数据', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] },
    { id: 'mine', name: '置顶', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] },
  ])
  assert.equal(all.groupBy, 'shareScope')
  assert.deepEqual(merged.slice(0, 1).map((view) => view.name), ['自定义数据'])
  assert.equal(merged.filter((view) => view.id === builtinAllViewId('/data')).length, 1)
  assert.equal(merged.some((view) => view.id === 'mine'), true)
  assert.equal(stubBuiltinAllView('builtin-all:/pages')?.name, '全部pages')
})

test('builtin share titles use collection Chinese names instead of path ids', () => {
  const pages = { path: '/pages', label: '页面', view: { title: '页面' } }
  assert.equal(displayNameForView(builtinAllViewId('/pages'), pages), '全部页面')
  assert.equal(displayNameForView(builtinAllViewId('/agents'), { path: '/agents', label: '代理', view: { title: '代理' } }), '全部代理')
  assert.equal(displayNameForView(builtinAllViewId('/mcp'), { path: '/mcp', label: 'MCP', view: { title: 'MCP' } }), '全部MCP')
  assert.equal(displayNameForView(builtinAllViewId('/editor-blocks'), { path: '/editor-blocks', label: '组件', view: { title: '组件' } }), '全部组件')
  assert.equal(displayNameForView('mine', pages, '周报'), '周报')
})

test('catalog view rows open the source table view instead of a record pane', () => {
  assert.deepEqual(catalogRowOpenTarget({ tablePath: '/plugins', viewId: builtinAllViewId('/plugins') }), {
    collection: '/plugins',
    viewId: builtinAllViewId('/plugins'),
  })
  assert.equal(catalogRowOpenTarget({ tablePath: '', viewId: 'x' }), null)
  assert.equal(catalogRowOpenTarget({ tablePath: '/events' }), null)
})

test('tags collection uses the same view list as other tables', () => {
  assert.equal(isBuiltinTagViewId(builtinTagViewId('dp')), true)
  assert.equal(isBuiltinCatalogViewId(builtinTagViewId('dp')), false)
  const table = { path: '/tags', label: '标签', view: { title: '标签' } }
  const merged = mergeTableViews(table, [{ id: 'mine', name: '置顶', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] }])
  assert.equal(merged[0]?.name, '全部标签')
  assert.equal(merged.some((view) => view.name === '私人标签'), false)
  assert.equal(merged.some((view) => isBuiltinTagViewId(view.id)), false)
  assert.equal(merged.some((view) => view.id === 'mine'), true)
})

test('stamp rows open the source record, not a tag view', () => {
  assert.deepEqual(stampRowOpenTarget({ tablePath: '/pages', sourceId: 'home' }), {
    collection: '/pages',
    recordId: 'home',
  })
  assert.equal(stampRowOpenTarget({ tablePath: '', sourceId: 'home' }), null)
  assert.deepEqual(stampRowOpenTarget({ id: 'pages::p180' }), {
    collection: '/pages',
    recordId: 'p180',
  })
  assert.equal(stampRecordId('/agents', 's1'), 'agents::s1')
})

test('seed view ids still use builtin-all prefixes', () => {
  assert.equal(isReadOnlyViewId(builtinAllViewId('/agents')), true)
  assert.equal(isReadOnlyViewId('user-traj'), false)
})

test('data collection noun is 数据, not the path segment', () => {
  assert.equal(collectionNoun({ path: '/data' }), '数据')
  assert.equal(collectionNoun({ path: '/data', label: 'data' }), '数据')
  assert.equal(stubBuiltinAllView(builtinAllViewId('/data'))?.name, '全部数据')
  assert.equal(
    displayNameForView(builtinAllViewId('/data'), { path: '/data', label: '数据', view: { title: '数据' } }),
    '全部数据',
  )
})

test('page blocks collection only seeds 全部组件', () => {
  const table = { path: '/editor-blocks', label: '组件', view: { title: '组件' } }
  const merged = mergePageBlockViews(table, [
    { id: builtinBlockKindViewId('html'), name: '旧的', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] },
    { id: 'mine', name: '置顶', mode: 'table', sortField: 'id', sortDir: 'asc', filters: {}, columns: [] },
  ])
  assert.equal(merged[0]?.id, builtinAllViewId('/editor-blocks'))
  assert.equal(merged[0]?.name, '全部组件')
  assert.deepEqual(merged.filter((view) => view.builtin).map((view) => view.id), [builtinAllViewId('/editor-blocks')])
  assert.equal(merged.some((view) => view.id === builtinBlockKindViewId('excalidraw')), false)
  assert.equal(merged.some((view) => view.id === builtinBlockKindViewId('html')), false)
  assert.equal(merged.some((view) => view.id === 'mine'), true)
  assert.equal(isReadOnlyViewId(builtinBlockKindViewId('html')), true)
  assert.equal(isBuiltinCatalogViewId(builtinBlockKindViewId('html')), false)
  assert.equal(isBuiltinBlockKindViewId(builtinBlockKindViewId('algorithm')), true)
  assert.equal(stubBuiltinBlockKindView('builtin-block:html')?.filters.blockKind, 'html')
  assert.equal(stubBuiltinBlockKindView('user-1'), null)
  assert.deepEqual(catalogLockFilters('builtin-block:terminal', []), { blockKind: 'terminal' })
  assert.deepEqual(
    catalogLockFilters('builtin-block:terminal', [{ id: 'builtin-block:terminal', builtin: true, filters: {} }]),
    {},
  )
  assert.deepEqual(catalogLockFilters('mine', [{ id: 'mine', builtin: false, filters: { blockKind: 'html' } }]), { blockKind: 'html' })
})

test('shared and personal default table views resolve domain, locks, and personal protection', () => {
  const sharedStub = stubDefaultTableView('default:shared:/pages', { path: '/pages', label: '页面' })
  assert.ok(sharedStub)
  assert.equal(sharedStub?.ownerTable, 'shared')
  assert.equal(sharedStub?.protection, 'personal')
  assert.equal(sharedStub?.name, '共享页面')
  assert.equal(viewDomainOf(sharedStub!), 'shared')
  assert.equal(isNonPersonalView(sharedStub!), false)
  assert.deepEqual(catalogLockFilters('default:shared:/pages', [sharedStub!], 'alice'), { $scope: 'shared' })

  const personalStub = stubDefaultTableView('default:account:alice:/pages', { path: '/pages', label: '页面' })
  assert.ok(personalStub)
  assert.equal(personalStub?.ownerTable, 'account:alice')
  assert.equal(personalStub?.protection, 'personal')
  assert.equal(personalStub?.name, '个人页面')
  assert.equal(viewDomainOf(personalStub!), 'personal')
  assert.equal(isNonPersonalView(personalStub!), false)
  assert.deepEqual(catalogLockFilters('default:account:alice:/pages', [personalStub!], 'alice'), { $scope: 'personal' })

  const wsStub = stubDefaultTableView('default:workspace:/pages', { path: '/pages', label: '页面' })
  assert.ok(wsStub)
  assert.equal(wsStub?.ownerTable, 'workspace')
  assert.equal(wsStub?.protection, 'public')
  assert.equal(viewDomainOf(wsStub!), 'workspace')
  assert.equal(isNonPersonalView(wsStub!), true)
  assert.deepEqual(catalogLockFilters('default:workspace:/pages', [wsStub!], 'alice'), { $scope: 'workspace' })
})
