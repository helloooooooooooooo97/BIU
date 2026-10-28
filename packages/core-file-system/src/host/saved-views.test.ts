import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { builtinAllViewId } from '../catalog-views.ts'
import { SavedViewsStore, clientViewFromDbRow, viewsCollection } from './saved-views.ts'

test('viewsCollection lists saved views with source table', async () => {
  const store = new SavedViewsStore()
  store.replace('/tasks', [
    {
      id: 'v1',
      name: '默认视图',
      mode: 'table',
      sortField: 'dueAt',
      sortDir: 'asc',
      filters: { status: 'doing' },
      columns: ['title', 'status'],
      query: 'foo',
    },
  ])
  const spec = viewsCollection(store, () => [{ path: '/tasks', id: 'tasks', kind: 'collection', label: 'Task', view: { moduleId: 'tasks', route: '/tasks', title: 'Task' } }])
  assert.equal(spec.path, '/views')
  assert.equal(spec.view?.title, '视图')
  assert.equal(spec.view?.inspector, false)
  const rows = await spec.list()
  const all = rows.find((row) => row.viewId === builtinAllViewId('/tasks'))
  const user = rows.find((row) => row.id === 'tasks::v1')
  assert.equal(all?.title, '全部Task')
  assert.equal(all?.tablePath, '/tasks')
  assert.equal(user?.title, '默认视图')
  assert.equal(user?.table, 'Task')
  assert.equal(user?.sortField, 'dueAt')
  assert.equal(user?.filters, '{"status":"doing"}')
  const written = await spec.update!(String(user?.id), { title: 'Doing' })
  assert.equal(written.title, 'Doing')
  const filtered = await spec.update!(String(user?.id), { filters: '{"project":"biu"}' })
  assert.equal(filtered.filters, '{"project":"biu"}')
  const tree = JSON.parse(String(filtered.filterTree || '{}')) as { children?: Array<{ field?: string; value?: string }> }
  assert.equal(tree.children?.[0]?.field, 'project')
  assert.equal(tree.children?.[0]?.value, 'biu')
  const sorted = await spec.update!(String(user?.id), { sorts: '[{"field":"title","dir":"desc"}]' })
  assert.equal(sorted.sortField, 'title')
  assert.equal(sorted.sortDir, 'desc')
  assert.equal(String(sorted.sorts).includes('"field":"title"'), true)
  assert.throws(() => spec.update!(String(all?.id), { title: '改掉' }), /read-only/)
  const graphed = await spec.update!(String(user?.id), { mode: 'graph' })
  assert.equal(graphed.mode, 'graph')
})

test('viewsCollection creates and deletes user views on a registered table', async () => {
  const store = new SavedViewsStore()
  const spec = viewsCollection(store, () => [
    { path: '/tasks', id: 'tasks', kind: 'collection', label: 'Task', view: { moduleId: 'tasks', route: '/tasks', title: 'Task' } },
  ])
  assert.equal(spec.records?.create, true)
  assert.equal(spec.records?.delete, true)
  const [row] = await spec.create!([{ tablePath: '/tasks', title: '看板', mode: 'graph', filters: '{"status":"doing"}', columnWidths: { title: 240 } }])
  assert.equal(row?.tablePath, '/tasks')
  assert.equal(row?.title, '看板')
  assert.equal(row?.mode, 'graph')
  assert.equal(row?.filters, '{"status":"doing"}')
  assert.deepEqual(row?.columnWidths, { title: 240 })
  assert.equal(typeof row?.viewId, 'string')
  assert.throws(() => spec.create!([{ tablePath: '/nope', title: 'x' }]), /unknown collection/)
  assert.throws(() => spec.create!([{ title: '无表' }]), /tablePath required/)
  const ids = await spec.remove!({ ids: [String(row?.id)] })
  assert.deepEqual(ids, [String(row?.id)])
  const listed = await spec.list()
  assert.equal(listed.some((item) => item.id === row?.id), false)
})

test('every registered table gets a builtin all-view even before the client syncs', async () => {
  const store = new SavedViewsStore()
  const spec = viewsCollection(store, () => [
    { path: '/agents', id: 'sessions', kind: 'collection', label: '代理', view: { title: '代理' } },
    { path: '/events', id: 'events', kind: 'collection', label: '事件', view: { title: '事件' } },
  ])
  const rows = await spec.list()
  assert.equal(rows.length, 2)
  assert.equal(rows.find((row) => row.tablePath === '/agents')?.title, '全部代理')
  assert.equal(rows.find((row) => row.tablePath === '/events')?.title, '全部事件')
})

test('saved views persist created fields and updates across reopen', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'fsdb-views-')), 'file-system.sqlite')
  const tables = [
    { path: '/tasks', id: 'tasks', kind: 'collection' as const, label: 'Task', view: { moduleId: 'tasks', route: '/tasks', title: 'Task' } },
  ]
  const first = new SavedViewsStore()
  first.open(file)
  const spec = viewsCollection(first, () => tables)
  const [row] = await spec.create!([{ tablePath: '/tasks', title: '看板', mode: 'graph', sortField: 'dueAt' }])
  await spec.update!(String(row?.id), { query: 'foo', groupBy: 'status' })
  first.replace('/tasks', [
    {
      id: String(row?.viewId),
      name: '看板',
      mode: 'graph',
      sortField: 'dueAt',
      sortDir: 'asc',
      query: 'foo',
      groupBy: 'status',
      filters: { status: 'doing' },
      columns: ['title', 'status'],
    },
  ])
  const second = new SavedViewsStore()
  second.open(file)
  const listed = await viewsCollection(second, () => tables).list()
  const hit = listed.find((item) => item.id === row?.id)
  assert.equal(hit?.title, '看板')
  assert.equal(hit?.mode, 'graph')
  assert.equal(hit?.query, 'foo')
  assert.equal(hit?.groupBy, 'status')
  assert.equal(hit?.sortField, 'dueAt')
  assert.equal(hit?.filters, '{"status":"doing"}')
})

test('clientViewFromDbRow keeps flat filters and sorts for the live table', () => {
  const view = clientViewFromDbRow({
    viewId: 'mine',
    tablePath: '/pages',
    title: '我的',
    filters: '{"project":"biu"}',
    sorts: '[{"field":"title","dir":"desc"}]',
    sortField: 'title',
    sortDir: 'desc',
  })
  assert.equal(view?.id, 'mine')
  assert.equal(view?.tablePath, '/pages')
  assert.equal(view?.filters.project, 'biu')
  assert.equal(view?.filterTree && view.filterTree.children[0] && view.filterTree.children[0].kind === 'rule' && view.filterTree.children[0].value, 'biu')
  assert.equal(view?.sorts[0]?.field, 'title')
  assert.equal(view?.sorts[0]?.dir, 'desc')
})

test('index collection views stay with the account that saved them', async () => {
  const store = new SavedViewsStore()
  store.open(':memory:')
  store.replaceOwned('/facets', [{ id: 'ada-view', name: 'Ada 的标签' }], 'ada')
  store.replaceOwned('/facets', [{ id: 'bob-view', name: 'Bob 的标签' }], 'bob')
  store.replaceOwned('/facets', [{ id: 'ada-view', name: 'Ada 改过' }], 'ada')
  let who = 'ada'
  const spec = viewsCollection(
    store,
    () => [{ path: '/facets', id: 'facets', kind: 'collection', label: '标签', view: { moduleId: 'facets', route: '/facets', title: '标签' } }],
    () => who,
  )
  const adaRows = await spec.list()
  assert.deepEqual(adaRows.map((row) => row.viewId).filter((id) => id !== builtinAllViewId('/facets')), ['ada-view'])
  assert.equal(adaRows.find((row) => row.viewId === 'ada-view')?.title, 'Ada 改过')
  who = 'bob'
  const bobRows = await spec.list()
  assert.deepEqual(bobRows.map((row) => row.viewId).filter((id) => id !== builtinAllViewId('/facets')), ['bob-view'])
  await assert.rejects(() => spec.remove!({ ids: ['facets::ada-view'] }), /unknown view/)
})

test('update and delete accept row ids (table::viewId) and keep the source table label', async () => {
  const store = new SavedViewsStore()
  const spec = viewsCollection(store, () => [
    { path: '/tasks', id: 'tasks', kind: 'collection', label: 'Task', view: { moduleId: 'tasks', route: '/tasks', title: 'Task' } },
  ])
  const [row] = await spec.create!([{ tablePath: '/tasks', title: '看板', mode: 'table' }])
  const rowId = String(row?.id)
  const written = await spec.update!(rowId, { title: '看板 v2' })
  assert.equal(written.id, rowId)
  assert.equal(written.tablePath, '/tasks')
  assert.equal(written.title, '看板 v2')
  assert.equal(written.table, 'Task')
  assert.equal((await spec.list()).find((item) => item.id === rowId)?.title, '看板 v2')
  assert.deepEqual(await spec.remove!({ ids: [rowId] }), [rowId])
  assert.equal((await spec.list()).some((item) => item.id === rowId), false)
})

test('update of another account view on an index collection stays unknown', async () => {
  const store = new SavedViewsStore()
  const spec = (account: string) =>
    viewsCollection(
      store,
      () => [{ path: '/facets', id: 'facets', kind: 'collection', label: '标签', view: { moduleId: 'facets', route: '/facets', title: '标签' } }],
      () => account,
    )
  spec('ada').create!([{ tablePath: '/facets', viewId: 'ada-view', title: 'Ada 的标签' }])
  assert.equal(store.viewsFor('/facets', 'bob').length, 0)
  assert.throws(() => store.write('facets::ada-view', { title: '抢改' }, 'bob'), /unknown view/)
  assert.throws(() => spec('bob').update!('facets::ada-view', { title: '抢改' }), /unknown view/)
  await assert.rejects(() => spec('bob').remove!({ ids: ['facets::ada-view'] }), /unknown view/)
  assert.equal(spec('ada').update!('facets::ada-view', { title: 'Ada 改' }).title, 'Ada 改')
  assert.equal(store.viewsFor('/facets', 'ada')[0]?.name, 'Ada 改')
})

test('deleting a /views row also removes the stored view so it cannot come back', async () => {
  const store = new SavedViewsStore()
  const spec = viewsCollection(store, () => [
    { path: '/tasks', id: 'tasks', kind: 'collection', label: 'Task', view: { moduleId: 'tasks', route: '/tasks', title: 'Task' } },
  ])
  const [row] = await spec.create!([{ tablePath: '/tasks', viewId: 'gone', title: '会被删掉' }])
  assert.equal(store.viewsFor('/tasks').length, 1)
  // 宿主删 /views 行时按 `表::视图` 定位视图本体
  assert.equal(store.remove(String(row?.id)), true)
  assert.deepEqual(store.viewsFor('/tasks'), [])
  assert.equal((await spec.list()).some((item) => item.id === row?.id), false)
  // 再删一次要报未知，不能静默成功
  assert.throws(() => store.remove(String(row?.id)), /unknown view/)
})


test('a stale window pushing its snapshot cannot resurrect A or drop newly created B', async () => {
  const store = new SavedViewsStore()
  const spec = viewsCollection(store, () => [
    { path: '/tasks', id: 'tasks', kind: 'collection', label: 'Task', view: { moduleId: 'tasks', route: '/tasks', title: 'Task' } },
  ])
  // 两个窗口各自持有一份快照：都从「A 存在」开始
  const windowA = ['/tasks', [{ id: 'A', name: '视图 A' }]] as const
  store.replace(windowA[0], windowA[1] as never)
  // 窗口 1：新建 B，删掉 A（差异写）
  store.applyPatch('/tasks', { upsert: [{ id: 'B', name: '视图 B' }], remove: ['A'] })
  assert.deepEqual(store.viewsFor('/tasks').map((view) => view.id), ['B'])
  // 窗口 2 还拿着旧快照（含 A）去保存自己的显示状态：只推 A 一条，不应把 A 复活、也不应丢 B
  store.applyPatch('/tasks', { upsert: [{ id: 'A', name: '视图 A' }] })
  assert.deepEqual(store.viewsFor('/tasks').map((view) => view.id), ['B'])
  // 窗口 2 显式删 A（它以为还在）也伤不到 B
  store.applyPatch('/tasks', { remove: ['A'] })
  assert.deepEqual(store.viewsFor('/tasks').map((view) => view.id), ['B'])
  // 窗口 2 的新增仍然能落地
  store.applyPatch('/tasks', { upsert: [{ id: 'C', name: '视图 C' }] })
  assert.deepEqual(store.viewsFor('/tasks').map((view) => view.id), ['B', 'C'])
})

test('an older snapshot loses to newer content when timestamps disagree', async () => {
  const store = new SavedViewsStore()
  store.replace('/tasks', [{ id: 'A', name: '新名字', updatedAt: 2000 }] as never)
  store.applyPatch('/tasks', { upsert: [{ id: 'A', name: '旧名字', updatedAt: 1000 }] })
  assert.equal(store.viewsFor('/tasks')[0]?.name, '新名字')
  store.applyPatch('/tasks', { upsert: [{ id: 'A', name: '更新的名字', updatedAt: 3000 }] })
  assert.equal(store.viewsFor('/tasks')[0]?.name, '更新的名字')
})

test('tombstones survive a reopen and can be cleared by recreating the view', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'biu-views-')), 'biu.sqlite')
  const first = new SavedViewsStore()
  first.open(file)
  first.applyPatch('/tasks', { upsert: [{ id: 'A', name: '视图 A' }] })
  first.applyPatch('/tasks', { remove: ['A'] })
  assert.equal(first.isTombstoned('/tasks', 'A'), true)
  const second = new SavedViewsStore()
  second.open(file)
  assert.equal(second.isTombstoned('/tasks', 'A'), true)
  // 老窗口再推 A 不复活
  second.applyPatch('/tasks', { upsert: [{ id: 'A', name: '视图 A' }] })
  assert.deepEqual(second.viewsFor('/tasks'), [])
  // 真新建（同 id）会撤掉墓碑
  second.applyPatch('/tasks', { upsert: [{ id: 'C', name: '视图 C' }] })
  assert.deepEqual(second.viewsFor('/tasks').map((view) => view.id), ['C'])
  assert.equal(second.isTombstoned('/tasks', 'C'), false)
})
