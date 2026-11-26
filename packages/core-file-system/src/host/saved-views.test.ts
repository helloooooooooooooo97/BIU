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
  const wsDefault = rows.find((row) => row.ownerTable === 'workspace' && row.viewId !== 'v1')
  const user = rows.find((row) => row.id === 'tasks::v1')
  assert.equal(wsDefault?.title, '空间Task')
  assert.equal(wsDefault?.tablePath, '/tasks')
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
  const renamed = await spec.update!(String(wsDefault?.id), { title: '改掉' })
  assert.equal(renamed.title, '改掉')
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
  const [firstNew] = await spec.create!([{ tablePath: '/tasks', title: '新视图', viewId: 'new-a' }])
  const [secondNew] = await spec.create!([{ tablePath: '/tasks', title: '新视图', viewId: 'new-b' }])
  assert.equal(firstNew?.title, '新视图')
  assert.equal(secondNew?.title, '新视图')
  const [row] = await spec.create!([{ tablePath: '/tasks', title: '看板', mode: 'graph', filters: '{"status":"doing"}', columnWidths: { title: 240 } }])
  assert.equal(row?.tablePath, '/tasks')
  assert.equal(row?.title, '看板')
  assert.equal(row?.mode, 'graph')
  assert.equal(row?.filters, '{"status":"doing"}')
  assert.deepEqual(row?.columnWidths, { title: 240 })
  assert.equal(typeof row?.viewId, 'string')
  assert.throws(() => spec.create!([{ tablePath: '/nope', title: 'x' }]), /unknown collection/)
  const [overview] = await spec.create!([{ tablePath: '/data', title: '总览筛选' }])
  assert.equal(overview?.tablePath, '/data')
  assert.equal(overview?.title, '总览筛选')
  assert.throws(() => spec.create!([{ title: '无表' }]), /tablePath required/)
  const ids = await spec.remove!({ ids: [String(row?.id)] })
  assert.deepEqual(ids, [String(row?.id)])
  const listed = await spec.list()
  assert.equal(listed.some((item) => item.id === row?.id), false)
})

test('every registered K+1 table gets a default workspace public view (no builtin-all aggregation view)', async () => {
  const store = new SavedViewsStore()
  const spec = viewsCollection(store, () => [
    { path: '/agents', id: 'sessions', kind: 'collection', label: '代理', view: { moduleId: 'sessions', route: '/agents', title: '代理', icon: 'sparkles' } },
    { path: '/events', id: 'events', kind: 'collection', label: '事件', view: { moduleId: 'events', route: '/events', title: '事件' } },
  ])
  const rows = await spec.list()
  assert.equal(rows.length, 2)
  assert.equal(rows.some((row) => row.ownerTable === 'all'), false)
  assert.equal(rows.find((row) => row.tablePath === '/agents' && row.ownerTable === 'workspace')?.protection, 'public')
  assert.equal(rows.find((row) => row.tablePath === '/events' && row.ownerTable === 'workspace')?.protection, 'public')
  assert.equal(rows.find((row) => row.tablePath === '/agents')?.tableIcon, 'sparkles')
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
  store.replace('/tags', [{ id: 'ada-view', name: 'Ada 的标签' }], 'ada')
  store.replace('/tags', [{ id: 'bob-view', name: 'Bob 的标签' }], 'bob')
  store.replace('/tags', [{ id: 'ada-view', name: 'Ada 改过' }], 'ada')
  let who = 'ada'
  const spec = viewsCollection(
    store,
    () => [{ path: '/tags', id: 'tags', kind: 'collection', label: '标签', view: { moduleId: 'tags', route: '/tags', title: '标签' } }],
    () => who,
  )
  const adaRows = await spec.list()
  assert.deepEqual(adaRows.map((row) => row.viewId).filter((id) => id !== builtinAllViewId('/tags')), ['ada-view'])
  assert.equal(adaRows.find((row) => row.viewId === 'ada-view')?.title, 'Ada 改过')
  who = 'bob'
  const bobRows = await spec.list()
  assert.deepEqual(bobRows.map((row) => row.viewId).filter((id) => id !== builtinAllViewId('/tags')), ['bob-view'])
  await assert.rejects(async () => spec.remove!({ ids: ['tags::ada-view'] }), /unknown view/)
})

test('update and delete accept row ids (table::viewId) and keep the source table label', async () => {
  const store = new SavedViewsStore()
  const spec = viewsCollection(store, () => [
    { path: '/tasks', id: 'tasks', kind: 'collection', label: 'Task', view: { moduleId: 'tasks', route: '/tasks', title: 'Task' } },
  ])
  await spec.create!([{ tablePath: '/tasks', viewId: 'keep', title: '保留视图', mode: 'table' }])
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
      () => [{ path: '/tags', id: 'tags', kind: 'collection', label: '标签', view: { moduleId: 'tags', route: '/tags', title: '标签' } }],
      () => account,
    )
  spec('ada').create!([{ tablePath: '/tags', viewId: 'ada-view', title: 'Ada 的标签' }])
  assert.equal(store.viewsFor('/tags', 'bob').length, 0)
  assert.throws(() => store.write('tags::ada-view', { title: '抢改' }, 'bob'), /unknown view/)
  assert.throws(() => spec('bob').update!('tags::ada-view', { title: '抢改' }), /unknown view/)
  await assert.rejects(async () => spec('bob').remove!({ ids: ['tags::ada-view'] }), /unknown view/)
  assert.equal((await spec('ada').update!('tags::ada-view', { title: 'Ada 改' })).title, 'Ada 改')
  assert.equal(store.viewsFor('/tags', 'ada')[0]?.name, 'Ada 改')
})

test('deleting a /views row also removes the stored view so it cannot come back', async () => {
  const store = new SavedViewsStore()
  const spec = viewsCollection(store, () => [
    { path: '/tasks', id: 'tasks', kind: 'collection', label: 'Task', view: { moduleId: 'tasks', route: '/tasks', title: 'Task' } },
  ])
  await spec.create!([{ tablePath: '/tasks', viewId: 'keep', title: '保底视图' }])
  const [row] = await spec.create!([{ tablePath: '/tasks', viewId: 'gone', title: '会被删掉' }])
  assert.equal(store.viewsFor('/tasks').length, 2)
  // 宿主删 /views 行时按 `表::视图` 定位视图本体
  assert.equal(store.remove(String(row?.id)), true)
  assert.deepEqual(store.viewsFor('/tasks').map((v) => v.id), ['keep'])
  assert.equal((await spec.list()).some((item) => item.id === row?.id), false)
  // 再删一次要报未知，不能静默成功
  assert.throws(() => store.remove(String(row?.id)), /unknown view/)
})


test('an older snapshot loses to newer content when timestamps disagree', async () => {
  const store = new SavedViewsStore()
  store.replace('/tasks', [{ id: 'A', name: '新名字', updatedAt: 2000 }] as never)
  store.applyPatch('/tasks', { upsert: [{ id: 'A', name: '旧名字', updatedAt: 1000 }] })
  assert.equal(store.viewsFor('/tasks')[0]?.name, '新名字')
  store.applyPatch('/tasks', { upsert: [{ id: 'A', name: '更新的名字', updatedAt: 3000 }] })
  assert.equal(store.viewsFor('/tasks')[0]?.name, '更新的名字')
})

test('applyPatch clears optional view fields when sent as null or empty and persists incrementally across reopen', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'biu-views-clear-')), 'biu.sqlite')
  const first = new SavedViewsStore()
  first.open(file)
  first.applyPatch('/tasks', {
    upsert: [
      {
        id: 'A',
        name: '视图 A',
        freezeTitle: true,
        freezeUntil: 'status',
        groupBy: 'status',
        groupConfig: { sort: 'desc', hideEmpty: true },
        columnSummaries: { title: 'count' },
        columnViews: { 'tag::t1::s': { activeId: 'sv-1' } },
        columnWidths: { title: 240 },
        filterTree: {
          kind: 'group',
          id: 'root',
          combinator: 'and',
          children: [{ kind: 'rule', id: 'r1', field: 'status', op: 'eq', value: 'open' }],
        },
        updatedAt: 1000,
      },
      {
        id: 'B',
        name: '兄弟视图 B',
        wrap: true,
        updatedAt: 1000,
      },
    ],
  })

  // 显式清空 A 的各项可选属性，不应影响兄弟视图 B
  first.applyPatch('/tasks', {
    upsert: [
      {
        id: 'A',
        name: '视图 A',
        freezeTitle: false,
        freezeUntil: null as unknown as string,
        groupBy: '',
        groupConfig: null as unknown as Record<string, unknown>,
        columnSummaries: {},
        columnViews: {},
        columnWidths: {},
        filterTree: null as unknown as never,
        updatedAt: 2000,
      },
    ],
  })

  const check = (store: SavedViewsStore) => {
    const a = store.viewsFor('/tasks').find((v) => v.id === 'A')
    const b = store.viewsFor('/tasks').find((v) => v.id === 'B')
    assert.ok(a)
    assert.equal(a.freezeTitle, false)
    assert.equal(a.freezeUntil, undefined)
    assert.equal(a.groupConfig, undefined)
    assert.equal(a.columnSummaries, undefined)
    assert.equal(a.columnViews, undefined)
    assert.equal(a.columnWidths, undefined)
    assert.equal(a.filterTree, undefined)
    assert.equal(b?.wrap, true)
  }
  check(first)

  const reopened = new SavedViewsStore()
  reopened.open(file)
  check(reopened)
})

test('saved views are isolated by workspace_id', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-saved-views-ws-'))
  const file = join(dir, 'biu.sqlite')
  let activeWs = 'ws-a'
  const store = new SavedViewsStore().open(file)
  store.setWorkspaceResolver(() => activeWs)

  store.applyPatch('/pages', { upsert: [{ id: 'v1', name: 'Workspace A View', filters: { tag: 'a' } }] })
  assert.equal(store.viewsFor('/pages').length, 1)

  activeWs = 'ws-b'
  assert.equal(store.viewsFor('/pages').length, 0)
  store.applyPatch('/pages', {
    upsert: [
      { id: 'v0', name: 'Workspace B Keep', ownerTable: 'workspace', protection: 'public' },
      { id: 'v1', name: 'Workspace B View', ownerTable: 'workspace', protection: 'public', filters: { tag: 'b' } },
    ],
  })
  store.applyPatch('/pages', { remove: ['v1'] })
  assert.deepEqual(store.viewsFor('/pages').map((v) => v.id), ['v0'])

  activeWs = 'ws-a'
  assert.equal(store.viewsFor('/pages')[0]?.name, 'Workspace A View')

  const reopened = new SavedViewsStore().open(file)
  reopened.setWorkspaceResolver(() => activeWs)
  assert.equal(reopened.viewsFor('/pages')[0]?.name, 'Workspace A View')
  activeWs = 'ws-b'
  assert.deepEqual(reopened.viewsFor('/pages').map((v) => v.id), ['v0'])
})

test('policyGuard canModifyView/canRemoveView enforces view write & delete permissions and triggers onRemoved', () => {
  const store = new SavedViewsStore().open(':memory:')
  store.setWorkspaceResolver(() => 'ws-1')
  const removedCalls: string[] = []
  store.setPolicyGuard({
    canModifyView: (_ws, _col, view, acc) => acc === 'admin-1' || view.createdBy === acc,
    canRemoveView: (_ws, _col, view, acc) => acc === 'admin-1' || view.createdBy === acc,
    onRemoved: (_ws, col, id) => removedCalls.push(`${col}:${id}`),
  })

  store.applyPatch(
    '/pages',
    {
      upsert: [
        { id: 'v-team', name: 'Team', scope: 'workspace', filters: { status: 'open' }, columns: ['title', 'status'], pageSize: 20 },
        { id: 'v-free', name: 'Free', scope: 'workspace', filters: {} },
      ],
    },
    'member-1',
  )

  // Non-owner regular member cannot modify or delete
  assert.throws(
    () =>
      store.applyPatch(
        '/pages',
        { upsert: [{ id: 'v-team', name: 'Hijacked', scope: 'workspace', filters: {} }] },
        'member-2',
      ),
    /VIEW_OWNER_ONLY/,
  )
  assert.throws(() => store.applyPatch('/pages', { remove: ['v-team'] }, 'member-2'), /VIEW_OWNER_ONLY/)

  // Admin can modify and delete, triggering cleanup hook
  store.applyPatch(
    '/pages',
    { upsert: [{ id: 'v-team', name: 'Team v2', scope: 'workspace', filters: { status: 'closed' }, columns: ['title'] }] },
    'admin-1',
  )
  store.applyPatch('/pages', { remove: ['v-team'] }, 'admin-1')
  assert.deepEqual(removedCalls, ['/pages:v-team'])
})

test('three-state view scope (personal / workspace / shared) enforces visibility and creator/admin ownership', () => {
  const store = new SavedViewsStore().open(':memory:')
  store.setWorkspaceResolver(() => 'ws-1')
  store.setPolicyGuard({
    canModifyView: (_ws, _col, view, acc) =>
      view.createdBy === acc || (view.scope !== 'personal' && acc === 'admin-1'),
    canRemoveView: (_ws, _col, view, acc) =>
      view.createdBy === acc || (view.scope !== 'personal' && acc === 'admin-1'),
  })

  // Alice creates a personal view, a workspace view, and a shared view
  store.applyPatch(
    '/pages',
    {
      upsert: [
        { id: 'v-personal', name: 'Alice Private', scope: 'personal', filters: { status: 'draft' } },
        { id: 'v-workspace', name: 'Team Board', scope: 'workspace', filters: { status: 'open' } },
        { id: 'v-shared', name: 'Client Portal', scope: 'shared' as never, filters: { status: 'published' } },
      ],
    },
    'alice',
  )

  // Visibility: two-state pure-display views (legacy 'shared' normalizes to 'personal')
  assert.deepEqual(
    store.viewsFor('/pages', 'alice').map((v) => v.id),
    ['v-personal', 'v-workspace', 'v-shared'],
  )
  assert.deepEqual(
    store.viewsFor('/pages', 'bob').map((v) => v.id),
    ['v-workspace'],
  )
  assert.deepEqual(
    store.viewsFor('/pages', 'admin-1').map((v) => v.id),
    ['v-workspace'],
  )

  // Mutation ownership: Bob cannot modify or delete Alice's workspace/shared/personal views
  assert.throws(
    () => store.applyPatch('/pages', { upsert: [{ id: 'v-workspace', name: 'Hijacked' }] }, 'bob'),
    /VIEW_OWNER_ONLY/,
  )
  assert.throws(
    () => store.applyPatch('/pages', { remove: ['v-shared'] }, 'bob'),
    /VIEW_OWNER_ONLY/,
  )
  assert.throws(
    () => store.applyPatch('/pages', { upsert: [{ id: 'v-personal', name: 'Steal' }] }, 'admin-1'),
    /VIEW_OWNER_ONLY/,
  )

  // Admin CAN modify Alice's workspace view, and createdBy stays alice
  store.applyPatch('/pages', { upsert: [{ id: 'v-workspace', name: 'Team Board v2' }] }, 'admin-1')
  const updated = store.viewsFor('/pages', 'alice').find((v) => v.id === 'v-workspace')
  assert.equal(updated?.name, 'Team Board v2')
  assert.equal(updated?.createdBy, 'alice')

  // Alice CAN modify and delete her own personal view
  store.applyPatch('/pages', { upsert: [{ id: 'v-personal', name: 'Alice Private 2' }] }, 'alice')
  assert.equal(store.viewsFor('/pages', 'alice').find((v) => v.id === 'v-personal')?.name, 'Alice Private 2')
  store.applyPatch('/pages', { remove: ['v-personal'] }, 'alice')
  assert.equal(store.viewsFor('/pages', 'alice').some((v) => v.id === 'v-personal'), false)
})

test('explicitly shared personal views become visible via policyGuard.canSeeView', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-saved-views-shared-'))
  const file = join(dir, 'biu.sqlite')
  const store = new SavedViewsStore().open(file)
  store.setWorkspaceResolver(() => 'ws-1')
  const sharedToBob = new Set(['v-shared-personal'])
  store.setPolicyGuard({
    canSeeView: (_ws, _col, view, accountId) => {
      if (view.createdBy === accountId) return true
      if (sharedToBob.has(view.id) && accountId === 'bob') return true
      return view.scope !== 'personal'
    },
  })

  store.applyPatch(
    '/pages',
    {
      upsert: [
        { id: 'v-private', name: 'Private Only', scope: 'personal' },
        { id: 'v-shared-personal', name: 'Shared View 97', scope: 'personal' },
      ],
    },
    'alice',
  )

  assert.deepEqual(
    store.viewsFor('/pages', 'alice').map((v) => v.id),
    ['v-private', 'v-shared-personal'],
  )
  assert.deepEqual(
    store.viewsFor('/pages', 'bob').map((v) => v.id),
    ['v-shared-personal'],
  )
  assert.deepEqual(
    store.viewsFor('/pages', 'charlie').map((v) => v.id),
    [],
  )
})

test('clientViewFromDbRow extracts createdBy from hydrated PersonValue objects', () => {
  const view = clientViewFromDbRow({
    viewId: 'v-97',
    tablePath: '/pages',
    title: '97',
    createdBy: { kind: 'user', accountId: 'acc_29e64d', name: '97' },
  })
  assert.equal(view?.createdBy, 'acc_29e64d')
})

test('viewsCollection emits user PersonValue (not agent) for createdBy and updatedBy, and actor overlay resolves member name', async () => {
  const { applyRecordPersonOverlay } = await import('./actor-overlay.ts')
  const dir = mkdtempSync(join(tmpdir(), 'biu-saved-views-person-'))
  const store = new SavedViewsStore().open(join(dir, 'biu.sqlite'))
  store.setWorkspaceResolver(() => 'ws-1')
  store.applyPatch('/pages', { upsert: [{ id: 'v-97', name: '97', scope: 'personal' }] }, 'acc_29e64d')

  const spec = viewsCollection(store, () => [{ id: 'pages', path: '/pages', label: '页面' }], () => 'acc_29e64d')
  const rows = await spec.list()
  const row = rows.find((item) => item.viewId === 'v-97')
  assert.ok(row)
  assert.deepEqual(row.createdBy, { kind: 'user', accountId: 'acc_29e64d', name: 'acc_29e64d' })
  assert.deepEqual(row.updatedBy, { kind: 'user', accountId: 'acc_29e64d', name: 'acc_29e64d' })

  const hydrated = applyRecordPersonOverlay(
    {
      tags: { recordMeta: () => null } as never,
      collection: () => undefined,
      workspacePerson: (accountId) =>
        accountId === 'acc_29e64d' ? { accountId, workspaceId: 'ws-1', name: '97' } : null,
      sessionsService: () => undefined,
      accountService: () => undefined,
    },
    spec,
    row,
  )
  assert.deepEqual(hydrated.createdBy, { kind: 'user', accountId: 'acc_29e64d', name: '97' })
  assert.deepEqual(hydrated.updatedBy, [{ kind: 'user', accountId: 'acc_29e64d', name: '97' }])
})

test('/data builtin-all aggregation views are strictly per-user private and isolated across workspace members', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-saved-views-builtin-private-'))
  const file = join(dir, 'biu.sqlite')
  const store = new SavedViewsStore().open(file)
  store.setWorkspaceResolver(() => 'ws-1')
  store.setPolicyGuard({
    workspaceOwner: (ws) => (ws === 'ws-1' ? 'owner-wenxin' : null),
  })

  // Both workspace owner and regular member can independently customize their own builtin-all:/data
  store.applyPatch('/data', { upsert: [{ id: 'builtin-all:/data', name: '文馨的全部数据', builtin: true }] }, 'owner-wenxin')
  store.applyPatch('/data', { upsert: [{ id: 'builtin-all:/data', name: '97的全部数据', builtin: true }] }, 'admin-97')

  // Neither user sees the other's /data aggregation view
  const wenxinViews = store.viewsFor('/data', 'owner-wenxin').filter((v) => v.id === 'builtin-all:/data')
  const user97Views = store.viewsFor('/data', 'admin-97').filter((v) => v.id === 'builtin-all:/data')
  const bobViews = store.viewsFor('/data', 'bob').filter((v) => v.id === 'builtin-all:/data')
  assert.equal(wenxinViews.length, 1)
  assert.equal(wenxinViews[0]?.name, '文馨的全部数据')
  assert.equal(wenxinViews[0]?.ownerTable, 'all')
  assert.equal(wenxinViews[0]?.protection, 'personal')
  assert.equal(user97Views.length, 1)
  assert.equal(user97Views[0]?.name, '97的全部数据')
  assert.equal(user97Views[0]?.ownerTable, 'all')
  assert.equal(user97Views[0]?.protection, 'personal')
  assert.equal(bobViews.length, 0)

  // Persistence round-trip keeps both users' /data views separate
  const reloaded = new SavedViewsStore().open(file)
  reloaded.setWorkspaceResolver(() => 'ws-1')
  assert.equal(reloaded.viewsFor('/data', 'owner-wenxin').find((v) => v.id === 'builtin-all:/data')?.name, '文馨的全部数据')
  assert.equal(reloaded.viewsFor('/data', 'admin-97').find((v) => v.id === 'builtin-all:/data')?.name, '97的全部数据')
  assert.equal(reloaded.viewsFor('/data', 'bob').find((v) => v.id === 'builtin-all:/data'), undefined)

  // /views collection rows() also strictly isolates /data builtin-all per account
  const tables = [{ id: 'data', path: '/data', label: '数据', kind: 'collection' as const, view: { title: '数据' } }]
  const wenxinAllRow = reloaded.rows(tables as never, 'owner-wenxin').find((r) => r.viewId === 'builtin-all:/data')
  const user97AllRow = reloaded.rows(tables as never, 'admin-97').find((r) => r.viewId === 'builtin-all:/data')
  const bobAllRow = reloaded.rows(tables as never, 'bob').find((r) => r.viewId === 'builtin-all:/data')
  assert.equal(wenxinAllRow?.title, '文馨的全部数据')
  assert.equal(user97AllRow?.title, '97的全部数据')
  assert.equal(bobAllRow?.title, '全部数据')
})

test('/data views are strictly personal and account-bound, while legacy K+1 aggregation views are physically purged on open', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'biu-saved-views-purge-')), 'file-system.sqlite')
  const store = new SavedViewsStore().open(file)
  store.setWorkspaceResolver(() => 'ws-1')
  store.setPolicyGuard({})

  // /data custom views are forced to ownerTable='all', protection='personal', scope='personal'
  store.applyPatch(
    '/data',
    {
      upsert: [
        {
          id: 'v-data-agg',
          name: '我的数据聚合视图',
          ownerTable: 'workspace',
          scope: 'workspace',
          protection: 'public',
          filters: { status: 'open' },
        },
      ],
    },
    'alice',
  )

  const aliceData = store.viewsFor('/data', 'alice').find((v) => v.id === 'v-data-agg')
  assert.equal(aliceData?.ownerTable, 'all')
  assert.equal(aliceData?.protection, 'personal')
  assert.equal(aliceData?.scope, 'personal')
  assert.equal(store.viewsFor('/data', 'bob').some((v) => v.id === 'v-data-agg'), false)
  assert.equal(store.viewsFor('/data', 'admin-1').some((v) => v.id === 'v-data-agg'), false)

  // Attempting to write aggregation views onto a K+1 collection (/pages) is ignored
  store.applyPatch(
    '/pages',
    {
      upsert: [
        { id: 'v-illegal-agg', name: '非法聚合', ownerTable: 'all', scope: 'personal', protection: 'personal' },
        { id: 'builtin-all:/pages', name: '旧全部页面', ownerTable: 'all', scope: 'personal', protection: 'personal' },
      ],
    },
    'alice',
  )
  assert.equal(store.viewsFor('/pages', 'alice').length, 0)

  // Seed legacy K+1 aggregation rows directly into SQLite and verify reopen physically deletes them
  const { openAndMigrateBiu } = await import('@biu/host-plugin-loader/data-dir')
  const rawDb = openAndMigrateBiu(file, { foreignKeys: false })
  rawDb.prepare(
    `INSERT INTO saved_views (workspace_id, collection, view_id, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run('ws-1', '/pages', 'builtin-all:/pages::user:alice', JSON.stringify({ id: 'builtin-all:/pages', name: '旧全部页面', ownerTable: 'all', createdBy: 'alice' }), Date.now())
  rawDb.prepare(
    `INSERT INTO saved_views (workspace_id, collection, view_id, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)`,
  ).run('ws-1', '/pages', 'legacy-shared-agg', JSON.stringify({ id: 'legacy-shared-agg', name: '旧共享聚合', ownerTable: 'all', filters: { $scope: 'shared' }, createdBy: 'alice' }), Date.now())
  rawDb.close()

  const reopened = new SavedViewsStore().open(file)
  reopened.setWorkspaceResolver(() => 'ws-1')
  // /data aggregation view survives reopen
  assert.equal(reopened.viewsFor('/data', 'alice').some((v) => v.id === 'v-data-agg'), true)
  // legacy /pages aggregation views are physically deleted from SQLite
  assert.equal(reopened.viewsFor('/pages', 'alice').length, 0)
  const verifyDb = openAndMigrateBiu(file, { foreignKeys: false })
  const remainingLegacy = verifyDb
    .prepare(`SELECT COUNT(*) AS cnt FROM saved_views WHERE collection = '/pages'`)
    .get() as { cnt: number }
  verifyDb.close()
  assert.equal(remainingLegacy.cnt, 0)
})

test('personal-table views support 3 protection states for owner, force personal for non-owners, and enforce at-least-1 public view per concrete table', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'fsdb-views-kplus1-')), 'file-system.sqlite')
  const store = new SavedViewsStore().open(file)
  store.setWorkspaceResolver(() => 'ws-1')
  store.setPolicyGuard({})

  // 1. 首次列出 /views 自动为空间表与当前用户个人表各生成 1 个普通公共视图（无 builtin 特殊态）
  const tables = [
    { path: '/pages', id: 'pages', kind: 'collection' as const, label: '页面', view: { moduleId: 'pages', route: '/pages', title: '页面' } },
  ]
  const aliceRows = store.rows(tables, 'alice')
  const wsDefault = aliceRows.find((r) => r.ownerTable === 'workspace')
  const myDefault = aliceRows.find((r) => r.ownerTable === 'account:alice')
  assert.ok(wsDefault, '空间表应自动生成默认公共视图')
  assert.equal(wsDefault?.protection, 'public')
  assert.ok(myDefault, '个人表应自动生成默认公共视图')
  assert.equal(myDefault?.protection, 'public')

  // 2. 保底约束：不能删除具体表的最后一个公共/锁定视图，也不能将其切为个人视图
  assert.throws(
    () => store.applyPatch('/pages', { remove: [String(myDefault!.viewId)] }, 'alice'),
    /至少保留一个公共视图/,
  )
  assert.throws(
    () =>
      store.applyPatch(
        '/pages',
        {
          upsert: [
            {
              id: String(myDefault!.viewId),
              name: String(myDefault!.title),
              ownerTable: 'account:alice',
              protection: 'personal',
              scope: 'personal',
            },
          ],
        },
        'alice',
      ),
    /至少保留一个公共视图/,
  )

  // 3. 个人表支持三态（public / locked / personal），非表主人在他人个人表下新建强制 personal
  store.applyPatch(
    '/pages',
    {
      upsert: [
        {
          id: 'v-my-personal',
          name: '我的个人视图',
          scope: 'personal',
          protection: 'personal',
          filters: { $scope: 'personal' },
        },
        {
          id: 'v-my-locked',
          name: '我的锁定视图',
          ownerTable: 'account:alice',
          scope: 'workspace',
          protection: 'locked',
        },
        {
          id: 'v-in-bob-table',
          name: '在Bob表里建的私有视图',
          ownerTable: 'account:bob',
          scope: 'workspace',
          protection: 'public',
        },
      ],
    },
    'alice',
  )

  const aliceViews = store.viewsFor('/pages', 'alice')
  const mine = aliceViews.find((v) => v.id === 'v-my-personal')
  assert.equal(mine?.ownerTable, 'account:alice')
  assert.equal(mine?.scope, 'personal')
  assert.equal(mine?.protection, 'personal')

  const locked = aliceViews.find((v) => v.id === 'v-my-locked')
  assert.equal(locked?.ownerTable, 'account:alice')
  assert.equal(locked?.protection, 'locked')

  // 非表主人 alice 在 bob 个人表下新建视图，强制为 personal，且 bob 看不到 alice 的私有视图
  const inBob = aliceViews.find((v) => v.id === 'v-in-bob-table')
  assert.equal(inBob?.ownerTable, 'account:bob')
  assert.equal(inBob?.protection, 'personal')
  assert.equal(inBob?.scope, 'personal')
  assert.equal(store.viewsFor('/pages', 'bob').some((v) => v.id === 'v-in-bob-table'), false)
  assert.equal(store.viewsFor('/pages', 'bob').some((v) => v.id === 'v-my-personal'), false)
  assert.equal(store.viewsFor('/pages', 'admin-1').some((v) => v.id === 'v-my-personal'), false)
})
