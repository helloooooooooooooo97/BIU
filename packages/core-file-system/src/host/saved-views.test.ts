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
  const builtinAll = rows.find((row) => row.viewId === builtinAllViewId('/tasks'))
  const user = rows.find((row) => row.id === 'tasks::v1')
  assert.equal(builtinAll?.title, '全部Task')
  assert.equal(builtinAll?.tablePath, '/tasks')
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
  const renamed = await spec.update!(String(builtinAll?.id), { title: '改掉' })
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

test('every registered table gets a builtin-all view in single-table mode', async () => {
  const store = new SavedViewsStore()
  const spec = viewsCollection(store, () => [
    { path: '/agents', id: 'sessions', kind: 'collection', label: '代理', view: { moduleId: 'sessions', route: '/agents', title: '代理', icon: 'sparkles' } },
    { path: '/events', id: 'events', kind: 'collection', label: '事件', view: { moduleId: 'events', route: '/events', title: '事件' } },
  ])
  const rows = await spec.list()
  assert.equal(rows.length, 2)
  assert.equal(rows.find((row) => row.tablePath === '/agents')?.viewId, builtinAllViewId('/agents'))
  assert.equal(rows.find((row) => row.tablePath === '/events')?.viewId, builtinAllViewId('/events'))
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
      { id: 'v0', name: 'Workspace B Keep', protection: 'public' },
      { id: 'v1', name: 'Workspace B View', protection: 'public', filters: { tag: 'b' } },
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
  assert.equal(wenxinViews[0]?.protection, 'personal')
  assert.equal(user97Views.length, 1)
  assert.equal(user97Views[0]?.name, '97的全部数据')
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

test('/data views isolate non-admin views as personal while admin can publish public /data views', async () => {
  const file = join(mkdtempSync(join(tmpdir(), 'biu-saved-views-purge-')), 'file-system.sqlite')
  const store = new SavedViewsStore().open(file)
  store.setWorkspaceResolver(() => 'ws-1')
  store.setPolicyGuard({
    isWorkspaceAdmin: (_ws, accountId) => accountId === 'admin-1',
  })

  // Non-admin /data custom views are forced to protection='personal', scope='personal'
  store.applyPatch(
    '/data',
    {
      upsert: [
        {
          id: 'v-data-agg',
          name: '我的数据聚合视图',
          scope: 'workspace',
          protection: 'public',
          filters: { status: 'open' },
        },
      ],
    },
    'alice',
  )

  const aliceData = store.viewsFor('/data', 'alice').find((v) => v.id === 'v-data-agg')
  assert.equal(aliceData?.protection, 'personal')
  assert.equal(aliceData?.scope, 'personal')
  assert.equal(store.viewsFor('/data', 'bob').some((v) => v.id === 'v-data-agg'), false)
  assert.equal(store.viewsFor('/data', 'admin-1').some((v) => v.id === 'v-data-agg'), false)

  // Workspace admin can publish a /data custom view as public so all workspace members see it
  store.applyPatch(
    '/data',
    {
      upsert: [
        {
          id: 'v-data-public',
          name: '空间公开数据视图',
          scope: 'workspace',
          protection: 'public',
          filters: {},
        },
      ],
    },
    'admin-1',
  )
  const adminPublic = store.viewsFor('/data', 'admin-1').find((v) => v.id === 'v-data-public')
  assert.equal(adminPublic?.protection, 'public')
  assert.equal(adminPublic?.scope, 'workspace')
  assert.equal(store.viewsFor('/data', 'alice').some((v) => v.id === 'v-data-public'), true)
  assert.equal(store.viewsFor('/data', 'bob').some((v) => v.id === 'v-data-public'), true)

  const reopened = new SavedViewsStore().open(file)
  reopened.setWorkspaceResolver(() => 'ws-1')
  assert.equal(reopened.viewsFor('/data', 'alice').some((v) => v.id === 'v-data-agg'), true)
})

test('single-table views support 3 protection states and /workspace-members locked view guardrails', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'fsdb-views-single-table-')), 'file-system.sqlite')
  const store = new SavedViewsStore().open(file)
  store.setWorkspaceResolver(() => 'ws-1')
  let refCount = 0
  let memberViewChanged = 0
  store.setPolicyGuard({
    isWorkspaceAdmin: (_ws, accountId) => accountId === 'admin-1',
    memberViewGrantCount: (_ws, viewId) => (viewId === 'mv-eng' ? refCount : 0),
    onMemberViewChanged: () => {
      memberViewChanged += 1
    },
  })

  // 1. Single-table views support public / locked / personal without ownerTable partitioning
  store.applyPatch(
    '/pages',
    {
      upsert: [
        { id: 'v-my-personal', name: '我的个人视图', scope: 'personal', protection: 'personal', filters: { $scope: 'personal' } },
        { id: 'v-my-locked', name: '我的锁定视图', scope: 'workspace', protection: 'locked' },
        { id: 'v-public', name: '公共视图', scope: 'workspace', protection: 'public' },
      ],
    },
    'alice',
  )

  const aliceViews = store.viewsFor('/pages', 'alice')
  assert.equal(aliceViews.find((v) => v.id === 'v-my-personal')?.protection, 'personal')
  assert.equal(aliceViews.find((v) => v.id === 'v-my-locked')?.protection, 'locked')
  assert.equal(aliceViews.find((v) => v.id === 'v-public')?.protection, 'public')
  assert.equal(store.viewsFor('/pages', 'bob').some((v) => v.id === 'v-my-personal'), false)
  assert.equal(store.viewsFor('/pages', 'bob').some((v) => v.id === 'v-public'), true)

  // 2. /workspace-members locked views are admin-only and guarded when referenced by record grants
  assert.throws(
    () =>
      store.applyPatch(
        '/workspace-members',
        { upsert: [{ id: 'mv-eng', name: '研发部', protection: 'locked', scope: 'workspace' }] },
        'alice',
      ),
    /MEMBER_LOCKED_VIEW_ADMIN_ONLY/,
  )
  store.applyPatch(
    '/workspace-members',
    { upsert: [{ id: 'mv-eng', name: '研发部', protection: 'locked', scope: 'workspace', filters: { role: 'member' } }] },
    'admin-1',
  )
  assert.equal(store.isLockedMemberView('ws-1', 'mv-eng'), true)
  assert.ok(memberViewChanged >= 1)

  refCount = 3
  assert.throws(
    () =>
      store.applyPatch(
        '/workspace-members',
        { upsert: [{ id: 'mv-eng', name: '研发部', protection: 'public', scope: 'workspace' }] },
        'admin-1',
      ),
    /MEMBER_VIEW_REFERENCED/,
  )
  assert.throws(
    () => store.applyPatch('/workspace-members', { remove: ['mv-eng'] }, 'admin-1'),
    /MEMBER_VIEW_REFERENCED/,
  )

  // Once references are released (frozen/revoked), admin can unlock or delete cleanly
  refCount = 0
  store.applyPatch(
    '/workspace-members',
    { upsert: [{ id: 'mv-eng', name: '研发部', protection: 'public', scope: 'workspace' }] },
    'admin-1',
  )
  assert.equal(store.isLockedMemberView('ws-1', 'mv-eng'), false)
})

test('builtin workspace views can be modified by workspace admins as well as workspace owner, but not normal members', () => {
  const store = new SavedViewsStore().open(':memory:')
  store.setWorkspaceResolver(() => 'ws-1')
  store.setPolicyGuard({
    workspaceOwner: () => 'owner-1',
    isWorkspaceAdmin: (_ws, accountId) => accountId === 'owner-1' || accountId === 'admin-1',
    canSeeView: () => true,
    canModifyView: () => true,
    canRemoveView: () => true,
  })
  store.applyPatch(
    '/pages',
    { upsert: [{ id: 'v-builtin', name: '内置空间视图', builtin: true, scope: 'workspace' }] },
    'owner-1',
  )

  // Normal member is blocked
  assert.throws(
    () => store.applyPatch('/pages', { upsert: [{ id: 'v-builtin', name: '被普通成员改名' }] }, 'member-1'),
    /BUILTIN_VIEW_OWNER_ONLY/,
  )
  // Workspace admin succeeds
  store.applyPatch('/pages', { upsert: [{ id: 'v-builtin', name: '管理员重命名' }] }, 'admin-1')
  assert.equal(store.viewsFor('/pages', 'admin-1').find((v) => v.id === 'v-builtin')?.name, '管理员重命名')
})

test('/data admin public/locked views survive asRecord(), write(), and SQLite reopen without resetting to personal', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'biu-data-public-reopen-')), 'file-system.sqlite')
  const store = new SavedViewsStore().open(file)
  store.setWorkspaceResolver(() => 'ws-1')
  store.setPolicyGuard({
    isWorkspaceAdmin: (_ws, accountId) => accountId === 'admin-1',
  })

  store.applyPatch(
    '/data',
    {
      upsert: [
        { id: 'v-data-pub', name: '公开总览', protection: 'public', scope: 'workspace' },
        { id: 'v-data-lock', name: '锁定总览', protection: 'locked', scope: 'workspace' },
      ],
    },
    'admin-1',
  )

  const tables = [{ path: '/data', id: 'data', kind: 'collection' as const, label: '数据', view: { moduleId: 'data', route: '/data', title: '数据' } }]
  const rowsBefore = store.rows(tables, 'admin-1')
  assert.equal(rowsBefore.find((r) => r.viewId === 'v-data-pub')?.protection, 'public')
  assert.equal(rowsBefore.find((r) => r.viewId === 'v-data-pub')?.scope, 'workspace')
  assert.equal(rowsBefore.find((r) => r.viewId === 'v-data-lock')?.protection, 'locked')
  assert.equal(rowsBefore.find((r) => r.viewId === 'builtin-all:/data')?.protection, 'personal')

  // write() preserves public/locked for admin
  const updated = store.write('data::v-data-pub', { title: '公开总览 v2', protection: 'locked' }, 'admin-1', tables)
  assert.equal(updated.protection, 'locked')
  assert.equal(updated.scope, 'workspace')

  // Reopen from SQLite (hydrate) preserves public/locked
  const reopened = new SavedViewsStore().open(file)
  reopened.setWorkspaceResolver(() => 'ws-1')
  const rowsAfter = reopened.rows(tables, 'alice')
  assert.equal(rowsAfter.find((r) => r.viewId === 'v-data-pub')?.protection, 'locked')
  assert.equal(rowsAfter.find((r) => r.viewId === 'v-data-lock')?.protection, 'locked')
})

test('clientViewFromDbRow preserves updatedAt, applyPatch accepts clock-skew edits with matching baseUpdatedAt, and batch create avoids id collisions', () => {
  const rowView = clientViewFromDbRow({
    viewId: 'v-sync',
    tablePath: '/pages',
    title: '同步视图',
    updatedAt: 987654321,
  })
  assert.equal(rowView?.updatedAt, 987654321)

  const store = new SavedViewsStore().open(':memory:')
  store.setWorkspaceResolver(() => 'ws-1')
  store.applyPatch('/pages', { upsert: [{ id: 'v1', name: '初始', updatedAt: 5000 }] }, 'alice')

  // Client with slow wall clock (updatedAt: 1000 < storedAt: 5000) succeeds when baseUpdatedAt matches 5000
  const res = store.applyPatch(
    '/pages',
    { upsert: [{ id: 'v1', name: '慢时钟改名', updatedAt: 1000, baseUpdatedAt: 5000 }] },
    'alice',
  )
  assert.equal(res.skipped.length, 0)
  const after = res.views.find((v) => v.id === 'v1')
  assert.equal(after?.name, '慢时钟改名')
  assert.ok((after?.updatedAt ?? 0) > 5000)

  // replace() preserves foreign users' personal views
  store.applyPatch('/pages', { upsert: [{ id: 'bob-priv', name: 'Bob私密', protection: 'personal', scope: 'personal' }] }, 'bob')
  store.replace('/pages', [{ id: 'v1', name: 'Alice更新' }], 'alice')
  assert.equal(store.viewsFor('/pages', 'bob').some((v) => v.id === 'bob-priv'), true)

  // Batch create in the same millisecond produces unique IDs
  const tables = [{ path: '/pages', id: 'pages', kind: 'collection' as const, label: '页面' }]
  const spec = viewsCollection(store, () => tables, () => 'alice')
  const created = spec.create!([
    { tablePath: '/pages', title: '批量1' },
    { tablePath: '/pages', title: '批量2' },
    { tablePath: '/pages', title: '批量3' },
  ]) as Array<{ viewId?: string }>
  assert.equal(new Set(created.map((r) => r.viewId)).size, 3)

  // clearWorkspace evicts memory cache for that workspace only
  store.clearWorkspace('ws-1')
  assert.equal(store.viewsFor('/pages', 'alice', 'ws-1').length, 0)
})
