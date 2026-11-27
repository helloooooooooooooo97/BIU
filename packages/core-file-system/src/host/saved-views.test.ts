import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SavedViewsStore, clientViewFromDbRow, viewsCollection } from './saved-views.ts'

test('viewsCollection seeds default plain view and lists/updates saved views with source table', async () => {
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
  const spec = viewsCollection(store, () => [
    { path: '/tasks', id: 'tasks', kind: 'collection', label: 'Task', view: { moduleId: 'tasks', route: '/tasks', title: 'Task' } },
  ])
  assert.equal(spec.path, '/views')
  assert.equal(spec.view?.title, '视图')
  assert.equal(spec.view?.inspector, false)
  const rows = await spec.list()
  const user = rows.find((row) => row.id === 'tasks::v1')
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
  const graphed = await spec.update!(String(user?.id), { mode: 'graph' })
  assert.equal(graphed.mode, 'graph')
})

test('viewsCollection creates and deletes user views on a registered table and enforces >= 1 view', async () => {
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

test('every empty registered table lazily seeds plain default view(s)', async () => {
  const store = new SavedViewsStore()
  const spec = viewsCollection(store, () => [
    { path: '/agents', id: 'sessions', kind: 'collection', label: '代理', view: { moduleId: 'sessions', route: '/agents', title: '代理', icon: 'sparkles' } },
    { path: '/events', id: 'events', kind: 'collection', label: '事件', view: { moduleId: 'events', route: '/events', title: '事件' } },
    { path: '/workspace-members', id: 'workspace-members', kind: 'collection', label: '成员', view: { moduleId: 'workspace-members', route: '/workspace-members', title: '成员' } },
  ])
  const rows = await spec.list()
  assert.equal(rows.find((row) => row.tablePath === '/agents')?.viewId, 'all')
  assert.equal(rows.find((row) => row.tablePath === '/events')?.viewId, 'all')
  assert.equal(rows.find((row) => row.tablePath === '/agents')?.tableIcon, 'sparkles')
  const memberViews = rows.filter((row) => row.tablePath === '/workspace-members')
  assert.deepEqual(store.viewsFor('/workspace-members').map((v) => v.id), ['member', 'external', 'guest'])
  assert.deepEqual(memberViews.map((r) => r.viewId).sort(), ['external', 'guest', 'member'])
  assert.equal(memberViews.every((r) => r.locked === true), true)
})

test('saved views persist created fields, revision, and updates across reopen', async () => {
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

test('clientViewFromDbRow keeps flat filters, sorts, locked, revision, and PersonValue createdBy', () => {
  const view = clientViewFromDbRow({
    viewId: 'mine',
    tablePath: '/pages',
    title: '我的',
    filters: '{"project":"biu"}',
    sorts: '[{"field":"title","dir":"desc"}]',
    sortField: 'title',
    sortDir: 'desc',
    locked: true,
    revision: 4,
    createdBy: { kind: 'user', accountId: 'acc_29e64d', name: '97' },
  })
  assert.equal(view?.id, 'mine')
  assert.equal(view?.tablePath, '/pages')
  assert.equal(view?.filters.project, 'biu')
  assert.equal(view?.filterTree && view.filterTree.children[0] && view.filterTree.children[0].kind === 'rule' && view.filterTree.children[0].value, 'biu')
  assert.equal(view?.sorts[0]?.field, 'title')
  assert.equal(view?.sorts[0]?.dir, 'desc')
  assert.equal(view?.locked, true)
  assert.equal(view?.revision, 4)
  assert.equal(view?.createdBy, 'acc_29e64d')
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
  assert.deepEqual(adaRows.map((row) => row.viewId), ['ada-view'])
  assert.equal(adaRows.find((row) => row.viewId === 'ada-view')?.title, 'Ada 改过')
  who = 'bob'
  const bobRows = await spec.list()
  assert.deepEqual(bobRows.map((row) => row.viewId), ['bob-view'])
  await assert.rejects(async () => spec.remove!({ ids: ['tags::ada-view'] }), /VIEW_OWNER_ONLY|unknown view/)
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

test('deleting a /views row removes the stored view and enforces LAST_VIEW_REQUIRED', async () => {
  const store = new SavedViewsStore()
  const spec = viewsCollection(store, () => [
    { path: '/tasks', id: 'tasks', kind: 'collection', label: 'Task', view: { moduleId: 'tasks', route: '/tasks', title: 'Task' } },
  ])
  await spec.create!([{ tablePath: '/tasks', viewId: 'keep', title: '保底视图' }])
  const [row] = await spec.create!([{ tablePath: '/tasks', viewId: 'gone', title: '会被删掉' }])
  assert.equal(store.viewsFor('/tasks').length, 2)
  assert.equal(store.remove(String(row?.id)), true)
  assert.deepEqual(store.viewsFor('/tasks').map((v) => v.id), ['keep'])
  assert.equal((await spec.list()).some((item) => item.id === row?.id), false)
  assert.throws(() => store.remove(String(row?.id)), /unknown view/)
  assert.throws(() => store.applyPatch('/tasks', { remove: ['keep'] }), /至少保留一个视图/)
})

test('field-level applyPatch merges disjoint fields cleanly with server monotonic revision', () => {
  const store = new SavedViewsStore().open(':memory:')
  store.applyPatch('/tasks', {
    upsert: [{ id: 'A', name: '初始视图', groupBy: 'status', sortDir: 'asc' }],
  })
  const r1 = store.viewsFor('/tasks')[0]!
  assert.equal(r1.revision, 1)

  // Patch 1 modifies only groupBy; Patch 2 modifies only sortDir
  store.applyPatch('/tasks', { upsert: [{ id: 'A', groupBy: 'priority' }] })
  store.applyPatch('/tasks', { upsert: [{ id: 'A', sortDir: 'desc' }] })
  const r3 = store.viewsFor('/tasks')[0]!
  assert.equal(r3.name, '初始视图')
  assert.equal(r3.groupBy, 'priority')
  assert.equal(r3.sortDir, 'desc')
  assert.equal(r3.revision, 3)
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
      },
      {
        id: 'B',
        name: '兄弟视图 B',
        wrap: true,
      },
    ],
  })

  first.applyPatch('/tasks', {
    upsert: [
      {
        id: 'A',
        freezeTitle: false,
        freezeUntil: null,
        groupBy: '',
        groupConfig: null,
        columnSummaries: {},
        columnViews: {},
        columnWidths: {},
        filterTree: null,
      },
    ],
  })

  const check = (store: SavedViewsStore) => {
    const a = store.viewsFor('/tasks').find((v) => v.id === 'A')
    const b = store.viewsFor('/tasks').find((v) => v.id === 'B')
    assert.ok(a)
    assert.equal(a.name, '视图 A')
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
      { id: 'v0', name: 'Workspace B Keep' },
      { id: 'v1', name: 'Workspace B View', filters: { tag: 'b' } },
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

test('unified PolicyViewGuard enforces visibility, edit/manage/delete ACL, and orthogonal locked freeze', () => {
  const store = new SavedViewsStore().open(':memory:')
  store.setWorkspaceResolver(() => 'ws-1')
  const removedCalls: string[] = []
  const createdCalls: string[] = []
  const privateIds = new Set<string>(['v-private'])
  const roles = new Map<string, 'owner' | 'manager' | 'editor' | 'viewer' | null>()

  store.setPolicyGuard({
    canSeeView: (_ws, _col, view, acc) => {
      if (view.createdBy === acc) return true
      if (privateIds.has(view.id)) return false
      return true
    },
    canModifyView: (_ws, _col, view, acc) => {
      const r = roles.get(`${view.id}:${acc}`)
      if (r) return r === 'owner' || r === 'manager' || r === 'editor'
      return view.createdBy === acc || acc === 'admin-1'
    },
    canManageView: (_ws, _col, view, acc) => {
      const r = roles.get(`${view.id}:${acc}`)
      if (r) return r === 'owner' || r === 'manager'
      return view.createdBy === acc || acc === 'admin-1'
    },
    canRemoveView: (_ws, _col, view, acc) => view.createdBy === acc || acc === 'admin-1',
    shareScopesFor: () => new Map([['pages::v-private', 'personal'], ['pages::v-team', 'workspace'], ['pages::v-all', 'workspace']]),
    viewRoleFor: (_ws, _col, view, acc) =>
      roles.get(`${view.id}:${acc}`) ??
      (view.createdBy === acc ? 'owner' : acc === 'admin-1' ? 'manager' : 'viewer'),
    onCreated: (_ws, col, view, acc, policy) => createdCalls.push(`${col}:${view.id}:${acc}:${policy?.accessMode ?? ''}`),
    onRemoved: (_ws, col, id) => removedCalls.push(`${col}:${id}`),
  })

  store.applyPatch(
    '/pages',
    {
      upsert: [
        { id: 'v-team', name: 'Team', filters: { status: 'open' }, columns: ['title', 'status'], pageSize: 20 },
        { id: 'v-private', name: 'Private', filters: {}, accessMode: 'private' },
      ],
    },
    'alice',
  )
  assert.ok(createdCalls.includes('/pages:v-private:alice:private'))
  assert.equal(store.viewsFor('/pages', 'bob').some((v) => v.id === 'v-private'), false)
  assert.equal(store.clientViewsFor('/pages', 'alice').find((v) => v.id === 'v-private')?.shareScope, 'personal')

  // Grant editor to bob on v-team
  roles.set('v-team:bob', 'editor')
  store.applyPatch('/pages', { upsert: [{ id: 'v-team', name: 'Team edited by Bob' }] }, 'bob')
  assert.equal(store.viewsFor('/pages', 'bob').find((v) => v.id === 'v-team')?.name, 'Team edited by Bob')

  // Editor cannot lock a view (requires manager)
  assert.throws(
    () => store.applyPatch('/pages', { upsert: [{ id: 'v-team', locked: true }] }, 'bob'),
    /VIEW_MANAGE_REQUIRED/,
  )

  // Owner locks v-team -> even owner and editor cannot modify config until unlocked
  store.applyPatch('/pages', { upsert: [{ id: 'v-team', locked: true }] }, 'alice')
  assert.throws(
    () => store.applyPatch('/pages', { upsert: [{ id: 'v-team', name: 'While Locked' }] }, 'alice'),
    /VIEW_LOCKED/,
  )
  assert.throws(
    () => store.applyPatch('/pages', { upsert: [{ id: 'v-team', groupBy: 'status' }] }, 'bob'),
    /VIEW_LOCKED/,
  )

  // Rank-only reorder still works while locked for editors/managers
  store.applyPatch('/pages', { upsert: [{ id: 'v-team', rank: 5 }] }, 'bob')
  assert.equal(store.viewsFor('/pages', 'bob').find((v) => v.id === 'v-team')?.rank, 5)

  // Manager unlocks -> edits resume
  store.applyPatch('/pages', { upsert: [{ id: 'v-team', locked: false }] }, 'admin-1')
  store.applyPatch('/pages', { upsert: [{ id: 'v-team', name: 'Unlocked Again' }] }, 'bob')
  assert.equal(store.viewsFor('/pages', 'bob').find((v) => v.id === 'v-team')?.name, 'Unlocked Again')

  // Cannot delete the ONLY remaining workspace view even as admin when a personal view exists
  assert.throws(
    () => store.applyPatch('/pages', { remove: ['v-team'] }, 'admin-1'),
    /至少保留一个空间视图/,
  )

  // Adding a second workspace view allows deleting v-team and triggers onRemoved
  store.applyPatch('/pages', { upsert: [{ id: 'v-all', name: 'All Pages', accessMode: 'members' }] }, 'admin-1')
  store.applyPatch('/pages', { remove: ['v-team'] }, 'admin-1')
  assert.deepEqual(removedCalls, ['/pages:v-team'])
})

test('/workspace-members locked views are admin-only and guarded when referenced by record grants', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'fsdb-views-member-lock-')), 'file-system.sqlite')
  const store = new SavedViewsStore().open(file)
  store.setWorkspaceResolver(() => 'ws-1')
  let refCount = 0
  let memberViewChanged = 0
  store.setPolicyGuard({
    isWorkspaceAdmin: (_ws, accountId) => accountId === 'admin-1',
    canModifyView: () => true,
    canManageView: () => true,
    canRemoveView: () => true,
    memberViewGrantCount: (_ws, viewId) => (viewId === 'mv-eng' ? refCount : 0),
    onMemberViewChanged: () => {
      memberViewChanged += 1
    },
  })

  // Seed keep view so removal doesn't hit LAST_VIEW_REQUIRED
  store.applyPatch('/workspace-members', { upsert: [{ id: 'member', name: '空间成员', locked: true }] }, 'admin-1')

  // Non-admin cannot create locked /workspace-members view
  assert.throws(
    () =>
      store.applyPatch(
        '/workspace-members',
        { upsert: [{ id: 'mv-eng', name: '研发部', locked: true }] },
        'alice',
      ),
    /MEMBER_LOCKED_VIEW_ADMIN_ONLY/,
  )

  // Admin creates locked member view
  store.applyPatch(
    '/workspace-members',
    { upsert: [{ id: 'mv-eng', name: '研发部', locked: true, filters: { role: 'member' } }] },
    'admin-1',
  )
  assert.equal(store.isLockedMemberView('ws-1', 'mv-eng'), true)
  assert.ok(memberViewChanged >= 1)

  // Referenced locked member view cannot be unlocked or deleted
  refCount = 3
  assert.throws(
    () => store.applyPatch('/workspace-members', { upsert: [{ id: 'mv-eng', locked: false }] }, 'admin-1'),
    /MEMBER_VIEW_REFERENCED/,
  )
  assert.throws(
    () => store.applyPatch('/workspace-members', { remove: ['mv-eng'] }, 'admin-1'),
    /MEMBER_VIEW_REFERENCED/,
  )

  // Once references are released, locked view still cannot be deleted directly until unlocked
  refCount = 0
  assert.throws(
    () => store.applyPatch('/workspace-members', { remove: ['mv-eng'] }, 'admin-1'),
    /VIEW_LOCKED/,
  )
  store.applyPatch('/workspace-members', { upsert: [{ id: 'mv-eng', locked: false }] }, 'admin-1')
  assert.equal(store.isLockedMemberView('ws-1', 'mv-eng'), false)
  // After unlocking, deletion succeeds
  store.applyPatch('/workspace-members', { remove: ['mv-eng'] }, 'admin-1')
  assert.equal(store.clientViewsFor('/workspace-members', 'admin-1', 'ws-1').some((v) => v.id === 'mv-eng'), false)
})

test('viewsCollection emits user PersonValue for createdBy and updatedBy, and actor overlay resolves member name', async () => {
  const { applyRecordPersonOverlay } = await import('./actor-overlay.ts')
  const dir = mkdtempSync(join(tmpdir(), 'biu-saved-views-person-'))
  const store = new SavedViewsStore().open(join(dir, 'biu.sqlite'))
  store.setWorkspaceResolver(() => 'ws-1')
  store.applyPatch('/pages', { upsert: [{ id: 'v-97', name: '97' }] }, 'acc_29e64d')

  const spec = viewsCollection(store, () => [{ id: 'pages', path: '/pages', kind: 'collection', label: '页面', view: null }], () => 'acc_29e64d')
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

test('batch create in the same millisecond produces unique IDs and clearWorkspace evicts memory cache', () => {
  const store = new SavedViewsStore().open(':memory:')
  store.setWorkspaceResolver(() => 'ws-1')
  const tables = [{ path: '/pages', id: 'pages', kind: 'collection' as const, label: '页面', view: null }]
  const spec = viewsCollection(store, () => tables, () => 'alice')
  const created = spec.create!([
    { tablePath: '/pages', title: '批量1' },
    { tablePath: '/pages', title: '批量2' },
    { tablePath: '/pages', title: '批量3' },
  ]) as Array<{ viewId?: string }>
  assert.equal(new Set(created.map((r) => r.viewId)).size, 3)

  store.clearWorkspace('ws-1')
  assert.equal(store.viewsFor('/pages', 'alice').length, 0)
})
