import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { catalogLockFilters, defaultGroupByForCollection, defaultSeedViewsForCollection, viewDomainOf } from '../catalog-views.ts'
import { VIEWS_COLLECTION_PATH } from './database-path.ts'
import {
  defaultSeedViewId,
  defaultViewId,
  diffSavedViews,
  fetchSavedView,
  loadViews,
  loadRecords,
  mergeSavedViewsPatch,
  noteLocalSavedViewsWrite,
  persistCollapsedGroups,
  loadCollapsedGroups,
  collapsedGroupsKey,
  pickViewForRoute,
  pullSavedViews,
  pushSavedViewsMutation,
  mergeSavedViewLists,
  rememberViews,
  rememberRecords,
  applyListedCrumbMutation,
  routeViewNeedsFetch,
  savedViewFromRecord,
  toggleStarredRecord,
  toggleStarredView,
  isRecordStarred,
  viewForPath,
} from './view-storage.ts'

test('starring a view keeps its display name', () => {
  const next = toggleStarredView([], '/pages', 'v1', '安全项目')
  assert.deepEqual(next, [{ path: '/pages', viewId: 'v1', name: '安全项目' }])
})

test('authoritative empty saved views hide stale local workspace data', () => {
  const path = '/workspace-empty-views'
  const stale = [{ id: 'old', name: '旧工作区视图', mode: 'table' }]
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => key === `fsdb.views:${path}` ? JSON.stringify(stale) : null,
      setItem: () => undefined,
      removeItem: () => undefined,
    },
  })
  assert.deepEqual(loadViews(path), [])
  rememberViews(path, stale as never)
  assert.equal(loadViews(path)[0]?.id, 'old')
  rememberViews(path, [])
  assert.deepEqual(loadViews(path), [])
})

test('defaultGroupByForCollection and seed views assign expected default groupBy per collection', () => {
  assert.equal(defaultGroupByForCollection('/editor-blocks'), 'blockKind')
  assert.equal(defaultGroupByForCollection('/tasks'), 'shareScope')
  assert.equal(defaultGroupByForCollection('/workspace-members'), 'membershipKind')
  assert.equal(defaultGroupByForCollection('/views'), 'table')
  const seed = defaultSeedViewsForCollection({ path: '/pages', label: '页面' })
  assert.equal(seed[0]?.view.id, 'all')
  assert.equal(seed[0]?.view.groupBy, 'shareScope')
})

test('defaultSeedViewId and defaultViewId default to plain seed view id', () => {
  assert.equal(defaultSeedViewId('/data'), 'all')
  assert.equal(defaultSeedViewId('/pages'), 'all')
  assert.equal(defaultSeedViewId('/workspace-members'), 'member')
  assert.equal(defaultViewId('/data'), 'all')
  assert.equal(defaultViewId(VIEWS_COLLECTION_PATH), 'all')
  assert.equal(defaultViewId('/agents'), 'all')
  rememberViews('/agents', [{ id: 'custom-first', name: '自定义', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] }])
  assert.equal(defaultViewId('/agents'), 'custom-first')
  assert.equal(viewForPath('/agents')?.id, 'custom-first')
})

test('savedViewFromRecord restores columns, locked, revision, and shareScope', () => {
  const view = savedViewFromRecord({
    viewId: 'v-cols',
    title: '列',
    columns: '["title","status","dueAt"]',
    wrap: true,
    pageSize: 50,
    locked: true,
    revision: 7,
    shareScope: '共享',
    hasExternal: true,
  })
  assert.deepEqual(view?.columns, ['title', 'status', 'dueAt'])
  assert.equal(view?.wrap, true)
  assert.equal(view?.pageSize, 50)
  assert.equal(view?.locked, true)
  assert.equal(view?.revision, 7)
  assert.equal(view?.shareScope, 'shared')
  assert.equal(view?.hasExternal, true)
})

test('savedViewFromRecord keeps seed rows and filters', () => {
  assert.equal(savedViewFromRecord({ viewId: 'all', title: '全部' })?.name, '全部')
  const view = savedViewFromRecord({
    viewId: 'v1',
    title: '看板',
    mode: 'board',
    sortField: 'dueAt',
    filters: '{"status":"doing"}',
    columns: ['title'],
  })
  assert.equal(view?.id, 'v1')
  assert.equal(view?.mode, 'table')
  assert.equal(view?.filters.status, 'doing')
  const withSorts = savedViewFromRecord({
    viewId: 'v3',
    title: '排序',
    sorts: '[{"field":"project","dir":"desc"}]',
    filters: '{"project":"biu"}',
  })
  assert.equal(withSorts?.sortField, 'project')
  assert.equal(withSorts?.sortDir, 'desc')
  assert.equal(withSorts?.filterTree?.children[0] && withSorts.filterTree.children[0].kind === 'rule' && withSorts.filterTree.children[0].value, 'biu')
  const withWidths = savedViewFromRecord({
    viewId: 'v2',
    title: '宽列',
    mode: 'table',
    columnWidths: { title: 240 },
  })
  assert.equal(withWidths?.columnWidths?.title, 240)
})

test('rememberRecords keeps titles when another inspector page overwrites the same collection', () => {
  rememberRecords('/pages', [{ id: 'home', label: '首页' }], 'mine')
  rememberRecords('/pages', [{ id: 'draft', label: 'draft' }, { id: 'home', label: 'home' }], 'mine')
  const listed = loadRecords('/pages', 'mine')
  assert.equal(listed.find((row) => row.id === 'home')?.label, '首页')
  assert.equal(listed.find((row) => row.id === 'draft')?.label, 'draft')
})

test('listed crumb mutations update the open view immediately', () => {
  rememberRecords('/pages', [{ id: 'home', label: '首页' }], 'all')
  applyListedCrumbMutation('/pages', { op: 'create', row: { id: 'p-new', label: '新页' }, viewId: 'all' })
  assert.deepEqual(
    loadRecords('/pages', 'all').map((row) => row.id),
    ['p-new', 'home'],
  )
  applyListedCrumbMutation('/pages', { op: 'patch', row: { id: 'p-new', label: '改名' } })
  assert.equal(loadRecords('/pages', 'all').find((row) => row.id === 'p-new')?.label, '改名')
  applyListedCrumbMutation('/pages', { op: 'remove', ids: ['p-new'] })
  assert.deepEqual(
    loadRecords('/pages', 'all').map((row) => row.id),
    ['home'],
  )
})

test('rememberRecords scopes crumb rows to the current view', () => {
  rememberRecords('/pages', [{ id: 'home', label: '首页' }, { id: 'notes', label: '笔记' }], 'all')
  rememberRecords('/tasks', [{ id: 't1', label: '任务甲' }], 'board')
  rememberRecords('/pages', [{ id: 'home', label: '首页' }], 'mine')
  assert.deepEqual(
    loadRecords('/pages', 'mine').map((row) => row.id),
    ['home'],
  )
  assert.deepEqual(
    loadRecords('/pages', 'all').map((row) => row.id),
    ['home', 'notes'],
  )
  assert.equal(loadRecords('/pages', 'mine').some((row) => row.id === 't1'), false)
  assert.equal(loadRecords('/pages', 'all').some((row) => row.id === 't1'), false)
})

test('higher server revision wins during mergeSavedViewLists and sibling views are preserved', () => {
  const prev = {
    id: 'mine',
    name: '新版标题',
    mode: 'table' as const,
    sortField: 'title',
    sortDir: 'asc' as const,
    filters: {},
    columns: [] as string[],
    revision: 5,
  }
  const stalePulled = {
    ...prev,
    name: '旧版标题',
    revision: 3,
  }
  const newerPulled = {
    ...prev,
    name: '更新版标题',
    revision: 6,
  }
  assert.equal(mergeSavedViewLists([prev], [stalePulled]).find((view) => view.id === 'mine')?.name, '新版标题')
  assert.equal(mergeSavedViewLists([prev], [newerPulled]).find((view) => view.id === 'mine')?.name, '更新版标题')
})

test('incomplete persist snapshots keep sibling views', () => {
  const keep = { id: 'keep', name: '留下', mode: 'table' as const, sortField: 'title', sortDir: 'asc' as const, filters: {}, columns: [] }
  const extra = { id: 'extra', name: '侧栏新视图', mode: 'table' as const, sortField: 'title', sortDir: 'asc' as const, filters: {}, columns: [] }
  const painted = { ...keep, name: '留下改过' }
  const merged = mergeSavedViewLists([keep, extra], [painted])
  assert.equal(merged.some((view) => view.id === 'extra'), true)
  assert.equal(merged.find((view) => view.id === 'keep')?.name, '留下改过')
  assert.equal(mergeSavedViewLists([keep, extra], [painted], ['extra']).some((view) => view.id === 'extra'), false)
})

test('saved views pull uses unified GET /api/db/saved-views and shares one in-flight request', () => {
  const src = readFileSync(resolve(import.meta.dirname, './view-storage.ts'), 'utf8')
  assert.match(src, /const viewsPullByKey = new Map/)
  assert.match(src, /\/api\/db\/saved-views\?/)
  assert.match(src, /if \(pending && !opts\?\.force\)/)
  assert.match(src, /opts\?: \{ idle\?: boolean; force\?: boolean \}/)
  assert.match(src, /export function noteLocalSavedViewsWrite/)
  const crud = readFileSync(resolve(import.meta.dirname, './use-browser-view-crud.ts'), 'utf8')
  assert.match(crud, /beginPendingViewOp\(path/)
  assert.match(crud, /commitPendingViewOp\(path/)
  assert.match(crud, /rollbackPendingViewOp\(path/)
  assert.match(crud, /function deleteView/)
})

test('authoritative pull removes server-deleted views while preserving pending local creations', async () => {
  const { beginPendingViewOp, commitPendingViewOp, rollbackPendingViewOp } = await import('./view-storage.ts')
  const path = '/pages-keep-new-view'
  rememberViews(path, [
    { id: 'keep', name: '留下', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
    { id: 'deleted-elsewhere', name: '别处已删', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
  ])
  const pendingOpId = beginPendingViewOp(path, {
    upsert: [{ id: 'fresh-pending', name: '在途新建', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] }],
  })
  const prev = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/db/saved-views')) {
      return new Response(
        JSON.stringify({
          views: [{ id: 'keep', name: '留下', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [], revision: 1 }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  try {
    await pullSavedViews([path], { force: true })
    assert.deepEqual(
      loadViews(path).map((view) => view.id),
      ['keep', 'fresh-pending'],
    )
    rollbackPendingViewOp(path, pendingOpId)
    assert.deepEqual(
      loadViews(path).map((view) => view.id),
      ['keep'],
    )
    const op2 = beginPendingViewOp(path, {
      upsert: [{ id: 'committed', name: '已提交', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] }],
    })
    commitPendingViewOp(path, op2, [
      { id: 'keep', name: '留下', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
      { id: 'committed', name: '服务端权威名', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
    ])
    assert.equal(loadViews(path).find((v) => v.id === 'committed')?.name, '服务端权威名')
  } finally {
    globalThis.fetch = prev
  }
})

test('in-flight pullSavedViews discards stale response when workspace switches mid-flight', async () => {
  const { resetWorkspaceClientCaches } = await import('./workspace-client-store.ts')
  const path = '/pages-ws-race'
  let releaseFetch!: () => void
  const gate = new Promise<void>((r) => {
    releaseFetch = r
  })
  const prevFetch = globalThis.fetch
  globalThis.fetch = (async () => {
    await gate
    return new Response(
      JSON.stringify({
        views: [{ id: 'ws-a-view', name: '空间A视图', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] }],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
  try {
    const pulling = pullSavedViews([path], { force: true })
    resetWorkspaceClientCaches()
    releaseFetch()
    const changed = await pulling
    assert.equal(changed, false)
    assert.deepEqual(loadViews(path), [])
  } finally {
    globalThis.fetch = prevFetch
  }
})

test('local view delete is not restored by a stale saved-views pull', async () => {
  const path = '/pages-delete-view-stay'
  rememberViews(path, [
    { id: 'keep', name: '留下', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
    { id: 'gone', name: '删掉', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
  ])
  let includeGone = true
  const prev = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/db/saved-views')) {
      await new Promise((resolve) => setTimeout(resolve, 40))
      const views = includeGone
        ? [
            { id: 'keep', name: '留下', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
            { id: 'gone', name: '删掉', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
          ]
        : [{ id: 'keep', name: '留下', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] }]
      return new Response(
        JSON.stringify({ views }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  try {
    const pulling = pullSavedViews([path])
    rememberViews(path, [
      { id: 'keep', name: '留下', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
    ])
    noteLocalSavedViewsWrite(path)
    includeGone = false
    await pulling
    assert.deepEqual(
      loadViews(path).map((view) => view.id),
      ['keep'],
    )
    await pullSavedViews([path])
    assert.deepEqual(
      loadViews(path).map((view) => view.id),
      ['keep'],
    )
  } finally {
    globalThis.fetch = prev
  }
})

test('pullSavedViews keeps previous rank when the list comes back shuffled', async () => {
  const path = '/pages-view-rank-stable'
  rememberViews(path, [
    { id: 'mine', name: '我的', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [], rank: 0 },
    { id: 'board', name: '看板', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [], rank: 1 },
  ])
  const prev = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/db/saved-views')) {
      return new Response(
        JSON.stringify({
          views: [
            { id: 'board', name: '看板', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
            { id: 'mine', name: '我的', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
          ],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  try {
    await pullSavedViews([path], { force: true })
    assert.deepEqual(
      loadViews(path).map((view) => view.id),
      ['mine', 'board'],
    )
  } finally {
    globalThis.fetch = prev
  }
})

test('route saved views need a fetch until they are remembered', () => {
  const path = '/pages-route-view-need'
  rememberViews(path, [])
  assert.equal(routeViewNeedsFetch(path, '1792146752009'), true)
  assert.equal(routeViewNeedsFetch(path, 'all'), true)
  rememberViews(path, [{ id: '1792146752009', name: '压测百行', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [], wrap: true, pageSize: 100 }])
  assert.equal(routeViewNeedsFetch(path, '1792146752009'), false)
})

test('fetchSavedView reads via GET /api/db/saved-views and remembers wrap and pageSize', async () => {
  const path = '/pages-route-view-fetch'
  rememberViews(path, [])
  const urls: string[] = []
  const prev = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    urls.push(url)
    assert.match(url, /\/api\/db\/saved-views\?/)
    assert.match(url, /pages-route-view-fetch/)
    return new Response(
      JSON.stringify({
        views: [
          {
            id: '1792146752009',
            name: '压测百行',
            mode: 'table',
            sortField: 'title',
            sortDir: 'asc',
            filters: {},
            columns: [],
            wrap: true,
            pageSize: 100,
            groupBy: '',
            revision: 2,
          },
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  }) as typeof fetch
  try {
    const view = await fetchSavedView(path, '1792146752009')
    assert.equal(view?.id, '1792146752009')
    assert.equal(view?.wrap, true)
    assert.equal(view?.pageSize, 100)
    assert.equal(loadViews(path)[0]?.id, '1792146752009')
    assert.equal(routeViewNeedsFetch(path, '1792146752009'), false)
    assert.equal(urls.length, 1)
    assert.equal(urls[0]?.includes('/api/db/list'), false)
    const again = await fetchSavedView(path, '1792146752009')
    assert.equal(again?.id, '1792146752009')
    assert.equal(urls.length, 1)
  } finally {
    globalThis.fetch = prev
  }
})

test('diffSavedViews upserts rank changes without removing other views', () => {
  const a = {
    id: 'a',
    name: 'A',
    mode: 'table' as const,
    sortField: 'title',
    sortDir: 'asc' as const,
    filters: {},
    columns: [] as string[],
    rank: 0,
  }
  const b = { ...a, id: 'b', name: 'B', rank: 1 }
  const moved = [{ ...b, rank: 0 }, { ...a, rank: 1 }]
  const diff = diffSavedViews([a, b], moved)
  assert.deepEqual(diff.upsert?.map((view) => view.id).sort(), ['a', 'b'])
  assert.deepEqual(diff.remove, [])
})

test('diffSavedViews upserts ids that were never in baseline', () => {
  const blank = {
    id: 'old',
    name: '旧',
    mode: 'table' as const,
    sortField: 'title',
    sortDir: 'asc' as const,
    filters: {},
    columns: [] as string[],
  }
  const copy = { ...blank, id: 'copy', name: '旧 副本' }
  const diff = diffSavedViews([blank], [blank, copy])
  assert.deepEqual(diff.upsert?.map((view) => view.id), ['copy'])
  assert.deepEqual(diff.remove, [])
})

test('mergeSavedViewsPatch keeps explicit upsert when diff is empty', () => {
  const view = {
    id: 'copy',
    name: '看板 副本',
    mode: 'table' as const,
    sortField: 'title',
    sortDir: 'asc' as const,
    filters: {},
    columns: [] as string[],
  }
  const merged = mergeSavedViewsPatch({ upsert: [], remove: [] }, { upsert: [view] })
  assert.deepEqual(merged.upsert?.map((item) => item.id), ['copy'])
  assert.deepEqual(merged.remove, [])
  const dropped = mergeSavedViewsPatch({ upsert: [view] }, { remove: ['copy'] })
  assert.deepEqual(dropped.upsert, [])
  assert.deepEqual(dropped.remove, ['copy'])
})

test('group fold state is stored per collection, view, and groupBy', () => {
  const store = new Map<string, string>()
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => { store.set(key, value) },
      removeItem: (key: string) => { store.delete(key) },
    },
  })
  persistCollapsedGroups('/plugins', 'all', 'shareScope', { 共享: true, 私人: false })
  assert.equal(collapsedGroupsKey('/plugins', 'all', 'shareScope'), 'fsdb.collapsedGroups:/plugins:all:shareScope')
  assert.deepEqual(loadCollapsedGroups('/plugins', 'all', 'shareScope'), { 共享: true })
  assert.deepEqual(loadCollapsedGroups('/plugins', 'all', 'status'), {})
  persistCollapsedGroups('/plugins', 'all', 'shareScope', {})
  assert.equal(store.has('fsdb.collapsedGroups:/plugins:all:shareScope'), false)
  const paint = readFileSync(resolve(import.meta.dirname, './browser-table-paint.tsx'), 'utf8')
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  assert.match(paint, /persistCollapsedGroups\(collectionPath/)
  assert.match(browser, /loadCollapsedGroups\(collectionPath/)
})

test('starred records toggle by collection path and id', () => {
  const next = toggleStarredRecord([], '/pages', 'home', { label: '首页' })
  assert.equal(isRecordStarred(next, '/pages', 'home'), true)
  assert.equal(next[0]?.label, '首页')
  assert.equal(isRecordStarred(next, '/tasks', 'home'), false)
  assert.equal(isRecordStarred(toggleStarredRecord(next, '/pages', 'home'), '/pages', 'home'), false)
})

test('removeStarredViews drops deleted views from starredViews without touching other tables', async () => {
  const mod = await import('./view-storage.ts')
  const prev = mod.getStarredViews()
  const mem: Record<string, string> = {}
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => mem[key] ?? null,
      setItem: (key: string, value: string) => { mem[key] = value },
      removeItem: (key: string) => { delete mem[key] },
    },
  })
  let notified = 0
  const off = mod.subscribeStarredViews(() => { notified += 1 })
  try {
    mod.persistStarredViews([
      { path: '/pages', viewId: 'v-keep', name: '保留视图' },
      { path: '/pages', viewId: 'v-del-1', name: '待删视图1' },
      { path: '/pages', viewId: 'v-del-2', name: '待删视图2' },
      { path: '/tasks', viewId: 'v-del-1', name: '别表同名视图' },
    ])
    notified = 0
    assert.equal(mod.removeStarredViews('/pages', ['v-del-1', 'v-del-2']), true)
    assert.equal(notified, 1)
    assert.deepEqual(mod.getStarredViews(), [
      { path: '/pages', viewId: 'v-keep', name: '保留视图' },
      { path: '/tasks', viewId: 'v-del-1', name: '别表同名视图' },
    ])
    assert.equal(mod.removeStarredViews('/pages', ['v-missing']), false)
    assert.equal(notified, 1)
  } finally {
    off()
    mod.persistStarredViews(prev)
  }
})

test('pushSavedViewsMutation sends only field-level keys and returns server error message on 403', async () => {
  let sentBody = ''
  const prevFetch = globalThis.fetch
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sentBody = String(init?.body ?? '')
    return new Response(JSON.stringify({ ok: true, views: [] }), { status: 200 })
  }) as typeof fetch
  try {
    const res = await pushSavedViewsMutation('/pages', {
      upsert: [{ id: 'v-patch', groupBy: 'status', freezeUntil: null }],
    })
    assert.equal(res.status, 'ok')
    const parsed = JSON.parse(sentBody) as { upsert: Array<Record<string, unknown>> }
    assert.deepEqual(parsed.upsert[0], { id: 'v-patch', groupBy: 'status', freezeUntil: null })

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: '视图已锁定，请先解锁后再修改配置', code: 'VIEW_LOCKED' }), {
        status: 403,
        headers: { 'content-type': 'application/json' },
      })) as typeof fetch
    const denied = await pushSavedViewsMutation('/pages', { upsert: [{ id: 'v-patch', name: '改名' }] })
    assert.equal(denied.status, 'failed')
    assert.equal(denied.error, '视图已锁定，请先解锁后再修改配置')
  } finally {
    globalThis.fetch = prevFetch
  }
})

test('activeView and collapsedGroups storage keys are isolated per workspaceId', async () => {
  const { activeViewStorageKey, collapsedGroupsKey } = await import('./view-storage.ts')
  const localMem: Record<string, string> = {}
  const sessionMem: Record<string, string> = {}
  const prevWin = (globalThis as { window?: unknown }).window
  const storageOf = (bag: Record<string, string>) => ({
    getItem: (key: string) => bag[key] ?? null,
    setItem: (key: string, value: string) => { bag[key] = value },
    removeItem: (key: string) => { delete bag[key] },
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storageOf(localMem), sessionStorage: storageOf(sessionMem) },
  })
  try {
    sessionMem['biu.workspaceId'] = 'ws_local'
    assert.equal(activeViewStorageKey('/pages'), 'fsdb.activeView:ws_local:/pages')
    assert.equal(collapsedGroupsKey('/pages', 'all', 'tag'), 'fsdb.collapsedGroups:ws_local:/pages:all:tag')

    sessionMem['biu.workspaceId'] = 'ws_cloud'
    assert.equal(activeViewStorageKey('/pages'), 'fsdb.activeView:ws_cloud:/pages')
    assert.equal(collapsedGroupsKey('/pages', 'all', 'tag'), 'fsdb.collapsedGroups:ws_cloud:/pages:all:tag')
  } finally {
    Object.defineProperty(globalThis, 'window', { configurable: true, value: prevWin })
  }
})

test('savedViewFromRecord extracts createdBy from overlaid PersonValue objects as well as strings', () => {
  const fromPerson = savedViewFromRecord({
    viewId: 'v1',
    title: '文馨的视图',
    createdBy: { kind: 'user', accountId: 'acc_wenxin', name: '文馨' },
  })
  assert.equal(fromPerson?.createdBy, 'acc_wenxin')

  const fromString = savedViewFromRecord({
    viewId: 'v2',
    title: '97的视图',
    createdBy: 'acc_97',
  })
  assert.equal(fromString?.createdBy, 'acc_97')
})

test('catalogLockFilters, viewDomainOf, and pickViewForRoute work cleanly with plain views', () => {
  const wsView = {
    id: 'v-ws',
    name: '空间看板',
    mode: 'table' as const,
    sortField: 'title',
    sortDir: 'asc' as const,
    filters: { status: 'open', $scope: 'workspace' },
    columns: [],
    locked: true,
  }
  const personalView = {
    id: 'v-personal',
    name: '我的草稿',
    mode: 'table' as const,
    sortField: 'title',
    sortDir: 'asc' as const,
    filters: { status: 'draft', $scope: 'personal' },
    columns: [],
    shareScope: 'personal' as const,
  }
  const unfilteredView = {
    id: 'all',
    name: '全部汇总',
    mode: 'table' as const,
    sortField: 'title',
    sortDir: 'asc' as const,
    filters: { status: 'open' },
    columns: [],
    shareScope: 'workspace' as const,
  }
  const listed = [wsView, personalView, unfilteredView]

  assert.deepEqual(catalogLockFilters('v-ws', listed), { status: 'open', $scope: 'workspace' })
  assert.deepEqual(catalogLockFilters('v-personal', listed), { status: 'draft', $scope: 'personal' })
  assert.deepEqual(catalogLockFilters('all', listed), { status: 'open' })
  assert.equal(viewDomainOf(wsView), 'workspace')
  assert.equal(viewDomainOf(personalView), 'personal')
  assert.equal(viewDomainOf(unfilteredView), 'all')

  assert.equal(pickViewForRoute([wsView, personalView], '/pages', 'v-personal')?.id, 'v-personal')
  assert.equal(pickViewForRoute([wsView, personalView], '/pages', 'missing')?.id, 'v-ws')
})

test('local column widths persist across table switches for locked or read-only views', async () => {
  const store = new Map<string, string>()
  const prevStorage = globalThis.localStorage
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => { store.set(k, String(v)) },
      removeItem: (k: string) => { store.delete(k) },
    },
  })
  try {
    const mod = await import('./view-storage.ts')
    mod.rememberViews('/plugins', [
      {
        id: 'all',
        name: '全部插件',
        mode: 'table',
        sortField: 'title',
        sortDir: 'asc',
        filters: {},
        columns: ['title', 'actions'],
        locked: true,
        columnWidths: { title: 220 },
      },
    ])
    mod.persistLocalColumnWidths('/plugins', 'all', { title: 360, actions: 180 })
    const reloaded = mod.loadViews('/plugins')
    assert.deepEqual(reloaded[0]?.columnWidths, { title: 360, actions: 180 })

    // Editable views ignore stale local overrides and use server-persisted widths
    mod.rememberViews('/plugins', [
      {
        id: 'all',
        name: '全部插件',
        mode: 'table',
        sortField: 'title',
        sortDir: 'asc',
        filters: {},
        columns: ['title', 'actions'],
        locked: false,
        columnWidths: { title: 280 },
      },
    ])
    assert.deepEqual(mod.loadViews('/plugins')[0]?.columnWidths, { title: 280 })
  } finally {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: prevStorage })
  }
})
