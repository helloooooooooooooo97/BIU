import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { builtinAllView, builtinAllViewId, builtinCatalogViewId, catalogLockFilters, viewDomainOf } from '../catalog-views.ts'
import { VIEWS_COLLECTION_PATH } from './database-path.ts'
import {
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
  omitSavedViewIds,
  pullSavedViews,
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
  withViewDisplay,
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

test('index all views do not group by share', () => {
  const all = builtinAllView({ path: '/editor-blocks', label: '组件' })
  assert.equal(all.groupBy, 'blockKind')
  assert.equal(withViewDisplay('/editor-blocks', { ...all, groupBy: 'shareScope' }).groupBy, 'blockKind')
  assert.equal(withViewDisplay('/editor-blocks', { ...all, groupBy: '' }).groupBy, 'blockKind')
  assert.equal(builtinAllView({ path: '/tasks', label: '任务' }).groupBy, 'shareScope')
  assert.equal(builtinAllView({ path: '/workspace-members', label: '成员' }).groupBy, 'membershipKind')
  assert.equal(withViewDisplay('/workspace-members', { ...builtinAllView({ path: '/workspace-members' }), groupBy: 'shareScope' }).groupBy, 'membershipKind')
  assert.equal(builtinAllView({ path: '/views', label: '视图' }).groupBy, 'table')
  assert.equal(withViewDisplay('/views', { ...builtinAllView({ path: '/views' }), groupBy: 'shareScope' }).groupBy, 'table')
})

test('views collection still resolves catalog stubs from the route', () => {
  assert.equal(viewForPath(VIEWS_COLLECTION_PATH, 'builtin:/events')?.filters.tablePath, '/events')
  assert.equal(viewForPath(VIEWS_COLLECTION_PATH, builtinCatalogViewId('/events'))?.id, builtinCatalogViewId('/events'))
  assert.equal(viewForPath('/editor-blocks', 'builtin-block:terminal')?.filters.blockKind, 'terminal')
})

test('pickViewForRoute keeps builtin-block from the URL when the list is still only 全部', () => {
  const all = builtinAllView({ path: '/editor-blocks', label: '组件', view: { title: '组件' } })
  const picked = pickViewForRoute([all], '/editor-blocks', 'builtin-block:terminal')
  assert.equal(picked?.id, 'builtin-block:terminal')
  assert.equal(picked?.filters.blockKind, 'terminal')
})

test('/data and system collections default to builtin 全部xx view while K+1 collections do not', () => {
  assert.equal(defaultViewId('/data'), builtinAllViewId('/data'))
  assert.equal(defaultViewId(VIEWS_COLLECTION_PATH), builtinAllViewId(VIEWS_COLLECTION_PATH))
  assert.equal(viewForPath('/data')?.builtin, true)
  assert.deepEqual(viewForPath('/data')?.filters, {})
  assert.equal(defaultViewId('/agents'), '')
  assert.equal(viewForPath('/agents'), null)
})

test('omitted builtin all view is not restored from the route', () => {
  const path = '/pages'
  const allId = builtinAllViewId(path)
  const mem: Record<string, string> = {}
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => mem[key] ?? null,
      setItem: (key: string, value: string) => {
        mem[key] = value
      },
      removeItem: (key: string) => {
        delete mem[key]
      },
    },
  })
  rememberViews(path, [{ id: 'safe', name: '安全项目', mode: 'table' }] as never)
  omitSavedViewIds(path, [allId])
  assert.equal(viewForPath(path, allId)?.id, 'safe')
  assert.equal(defaultViewId(path, allId), 'safe')
  assert.equal(pickViewForRoute([{ id: 'safe', name: '安全项目', mode: 'table' }] as never, path, allId)?.id, 'safe')
  assert.equal(routeViewNeedsFetch(path, allId), false)
})

test('withViewDisplay does not overlay localStorage display prefs onto server views', () => {
  const mem: Record<string, string> = {}
  const storage = {
    getItem: (key: string) => mem[key] ?? null,
    setItem: (key: string, value: string) => {
      mem[key] = value
    },
    removeItem: (key: string) => {
      delete mem[key]
    },
  }
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: storage })
  const path = '/agents'
  const id = builtinAllViewId(path)
  // Even if legacy localStorage already has stale display JSON, withViewDisplay ignores it
  mem[`fsdb.viewDisplay:${path}:${id}`] = JSON.stringify({ name: '97', wrap: true, columns: ['title', 'project'], rank: 0 })
  const painted = withViewDisplay(path, builtinAllView({ path, label: '代理', view: { title: '代理' } }))
  assert.equal(painted.name, '全部代理')
  assert.equal(painted.wrap, false)
  assert.deepEqual(painted.columns, [])
  assert.equal(painted.builtin, true)
})

test('savedViewFromRecord restores columns from a JSON string', () => {
  const view = savedViewFromRecord({
    viewId: 'v-cols',
    title: '列',
    columns: '["title","status","dueAt"]',
    wrap: true,
    pageSize: 50,
  })
  assert.deepEqual(view?.columns, ['title', 'status', 'dueAt'])
  assert.equal(view?.wrap, true)
  assert.equal(view?.pageSize, 50)
})

test('savedViewFromRecord keeps seed rows and filters', () => {
  assert.equal(savedViewFromRecord({ viewId: builtinAllViewId('/tasks'), title: '全部' })?.name, '全部')
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

test('stale /views titles do not overwrite a locally stamped rename', () => {
  const prev = {
    id: 'mine',
    name: '什么呢？？？',
    mode: 'table' as const,
    sortField: 'title',
    sortDir: 'asc' as const,
    filters: {},
    columns: [] as string[],
    updatedAt: 9,
  }
  const pulled = {
    ...prev,
    name: '新视图 2',
    updatedAt: 0,
  }
  const merged = mergeSavedViewLists([prev], [pulled])
  assert.equal(merged.find((view) => view.id === 'mine')?.name, '什么呢？？？')
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

test('saved views pull shares one in-flight list', () => {
  const src = readFileSync(resolve(import.meta.dirname, './view-storage.ts'), 'utf8')
  assert.match(src, /const viewsPullByKey = new Map/)
  assert.match(src, /VIEWS_PULL_LIMIT = 200/)
  assert.match(src, /filters: \{ tablePath \}/)
  assert.doesNotMatch(src, /columns: \[\.\.\.VIEWS_PULL/)
  assert.match(src, /if \(pending && !opts\?\.force\)/)
  assert.match(src, /opts\?: \{ idle\?: boolean; force\?: boolean \}/)
  assert.match(src, /export function noteLocalSavedViewsWrite/)
  const crud = readFileSync(resolve(import.meta.dirname, './use-browser-view-crud.ts'), 'utf8')
  assert.match(crud, /noteLocalSavedViewsWrite\(path\)/)
  assert.match(crud, /function deleteView/)
})

test('saved views pull keeps a newly remembered view missing from a stale list', async () => {
  const path = '/pages-keep-new-view'
  rememberViews(path, [
    { id: 'keep', name: '留下', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
    { id: 'fresh', name: '新视图', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
  ])
  const prev = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/db/list')) {
      return new Response(
        JSON.stringify({
          items: [{ viewId: 'keep', title: '留下', tablePath: path }],
          total: 1,
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
      ['keep', 'fresh'],
    )
  } finally {
    globalThis.fetch = prev
  }
})

test('local view delete is not restored by a stale /views pull', async () => {
  const path = '/pages-delete-view-stay'
  const mem: Record<string, string> = {}
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => mem[key] ?? null,
      setItem: (key: string, value: string) => {
        mem[key] = value
      },
      removeItem: (key: string) => {
        delete mem[key]
      },
    },
  })
  rememberViews(path, [
    { id: 'keep', name: '留下', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
    { id: 'gone', name: '删掉', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] },
  ])
  let includeGone = true
  const prev = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/db/list')) {
      await new Promise((resolve) => setTimeout(resolve, 40))
      const items = includeGone
        ? [
            { viewId: 'keep', title: '留下', tablePath: path },
            { viewId: 'gone', title: '删掉', tablePath: path },
          ]
        : [{ viewId: 'keep', title: '留下', tablePath: path }]
      return new Response(
        JSON.stringify({ items, total: items.length }),
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
  const mem: Record<string, string> = {}
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => mem[key] ?? null,
      setItem: (key: string, value: string) => {
        mem[key] = value
      },
      removeItem: (key: string) => {
        delete mem[key]
      },
    },
  })
  rememberViews(path, [
    { id: 'mine', name: '我的', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [], rank: 0 },
    { id: 'board', name: '看板', mode: 'board', sortField: 'title', sortDir: 'asc', filters: {}, columns: [], rank: 1 },
  ])
  const prev = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/db/list')) {
      return new Response(
        JSON.stringify({
          items: [
            { viewId: 'board', title: '看板', tablePath: path, mode: 'board' },
            { viewId: 'mine', title: '我的', tablePath: path },
          ],
          total: 2,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }
    return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  try {
    await pullSavedViews([path])
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
  assert.equal(routeViewNeedsFetch(path, builtinAllViewId(path)), false)
  assert.equal(routeViewNeedsFetch(path, 'builtin-block:terminal'), false)
  rememberViews(path, [{ id: '1792146752009', name: '压测百行', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [], wrap: true, pageSize: 100 }])
  assert.equal(routeViewNeedsFetch(path, '1792146752009'), false)
})

test('fetchSavedView reads the URL view and remembers wrap and pageSize', async () => {
  const path = '/pages-route-view-fetch'
  const mem: Record<string, string> = {}
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => mem[key] ?? null,
      setItem: (key: string, value: string) => {
        mem[key] = value
      },
      removeItem: (key: string) => {
        delete mem[key]
      },
    },
  })
  rememberViews(path, [])
  const urls: string[] = []
  const prev = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    urls.push(url)
    assert.match(url, /\/api\/db\/read\?/)
    assert.match(url, /pages-route-view-fetch/)
    return new Response(
      JSON.stringify({
        value: {
          viewId: '1792146752009',
          title: '压测百行',
          wrap: true,
          pageSize: 100,
          groupBy: '',
          tablePath: path,
        },
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

test('remembering the new order first makes a rank-only patch look empty', () => {
  const path = '/pages'
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
  rememberViews(path, [a, b])
  const baseline = loadViews(path)
  rememberViews(path, moved)
  assert.deepEqual(diffSavedViews(loadViews(path), moved).upsert, [])
  assert.deepEqual(diffSavedViews(baseline, moved).upsert?.map((view) => view.id).sort(), ['a', 'b'])
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
  persistCollapsedGroups('/plugins', 'builtin-all:/plugins', 'shareScope', { 共享: true, 私人: false })
  assert.equal(collapsedGroupsKey('/plugins', 'builtin-all:/plugins', 'shareScope'), 'fsdb.collapsedGroups:/plugins:builtin-all:/plugins:shareScope')
  assert.deepEqual(loadCollapsedGroups('/plugins', 'builtin-all:/plugins', 'shareScope'), { 共享: true })
  assert.deepEqual(loadCollapsedGroups('/plugins', 'builtin-all:/plugins', 'status'), {})
  persistCollapsedGroups('/plugins', 'builtin-all:/plugins', 'shareScope', {})
  assert.equal(store.has('fsdb.collapsedGroups:/plugins:builtin-all:/plugins:shareScope'), false)
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

test('newer server view wins over stale localStorage display overlay and syncs local cache', async () => {
  const path = '/pages-server-wins'
  const mem: Record<string, string> = {}
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => mem[key] ?? null,
      setItem: (key: string, value: string) => { mem[key] = value },
      removeItem: (key: string) => { delete mem[key] },
    },
  })
  // 服务端（如 Agent/其他窗口）更新了该视图，时间戳更新为 2000
  const serverView = {
    id: 'v1',
    name: '服务端新名',
    mode: 'table' as const,
    sortField: 'title',
    sortDir: 'asc' as const,
    filters: {},
    columns: ['title', 'status'],
    wrap: true,
    freezeUntil: undefined,
    updatedAt: 2000,
  }
  const painted = withViewDisplay(path, serverView)
  assert.equal(painted.wrap, true)
  assert.equal(painted.freezeUntil, undefined)
  assert.equal(painted.name, '服务端新名')

  // pullSavedViews 拉回后也会把旧 localStorage 同步更新掉
  const prevFetch = globalThis.fetch
  globalThis.fetch = (async () =>
    new Response(
      JSON.stringify({
        items: [{ viewId: 'v1', title: '服务端新名', tablePath: path, wrap: true, freezeUntil: '', updatedAt: 2000 }],
        total: 1,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )) as typeof fetch
  try {
    await pullSavedViews([path], { force: true })
    const loaded = loadViews(path).find((v) => v.id === 'v1')
    assert.equal(loaded?.wrap, true)
    assert.equal(loaded?.freezeUntil, undefined)
  } finally {
    globalThis.fetch = prevFetch
  }
})

test('stampSavedView is strictly monotonic and pushSavedViewsPatch serializes explicit nulls for cleared fields', async () => {
  const { stampSavedView, pushSavedViewsPatch } = await import('./view-storage.ts')
  const base = {
    id: 'v-mono',
    name: '单调视图',
    mode: 'table' as const,
    sortField: 'title',
    sortDir: 'asc' as const,
    filters: {},
    columns: ['title'],
  }
  const s1 = stampSavedView(base)
  const s2 = stampSavedView(s1)
  assert.ok((s2.updatedAt ?? 0) > (s1.updatedAt ?? 0))

  let sentBody = ''
  const prevFetch = globalThis.fetch
  globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit) => {
    sentBody = String(init?.body ?? '')
    return new Response('{"ok":true}', { status: 200 })
  }) as typeof fetch
  try {
    const res = await pushSavedViewsPatch('/pages', { upsert: [s2] })
    assert.equal(res, 'ok')
    const parsed = JSON.parse(sentBody) as { upsert: Array<Record<string, unknown>> }
    assert.equal(parsed.upsert[0]?.groupConfig, null)
    assert.equal(parsed.upsert[0]?.freezeUntil, null)
    assert.deepEqual(parsed.upsert[0]?.columnSummaries, {})
    assert.deepEqual(parsed.upsert[0]?.columnViews, {})
    assert.deepEqual(parsed.upsert[0]?.columnWidths, {})
  } finally {
    globalThis.fetch = prevFetch
  }
})

test('omittedViews and activeView storage keys are isolated per workspaceId', async () => {
  const {
    activeViewStorageKey,
    collapsedGroupsKey,
    loadOmittedViewIds,
    omitSavedViewIds,
    omittedViewsKey,
  } = await import('./view-storage.ts')
  const localMem: Record<string, string> = {}
  const sessionMem: Record<string, string> = {}
  const prevWin = (globalThis as { window?: unknown }).window
  const storageOf = (bag: Record<string, string>) => ({
    getItem: (key: string) => bag[key] ?? null,
    setItem: (key: string, value: string) => {
      bag[key] = value
    },
    removeItem: (key: string) => {
      delete bag[key]
    },
  })
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { localStorage: storageOf(localMem), sessionStorage: storageOf(sessionMem) },
  })
  try {
    // Omitting the builtin default view in ws_local must not leak into ws_cloud
    sessionMem['biu.workspaceId'] = 'ws_local'
    assert.equal(omittedViewsKey('/pages'), 'fsdb.omittedViews:ws_local:/pages')
    assert.equal(activeViewStorageKey('/pages'), 'fsdb.activeView:ws_local:/pages')
    assert.equal(collapsedGroupsKey('/pages', 'all', 'tag'), 'fsdb.collapsedGroups:ws_local:/pages:all:tag')
    omitSavedViewIds('/pages', ['__all__:/pages'])
    assert.deepEqual(loadOmittedViewIds('/pages'), ['__all__:/pages'])

    sessionMem['biu.workspaceId'] = 'ws_cloud'
    assert.equal(omittedViewsKey('/pages'), 'fsdb.omittedViews:ws_cloud:/pages')
    assert.deepEqual(loadOmittedViewIds('/pages'), [])
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

test('catalogLockFilters and viewsForScope enforce strict K+1 view-to-table binding', () => {
  const wsView = {
    id: 'v-ws',
    name: '空间看板',
    mode: 'table' as const,
    sortField: 'title',
    sortDir: 'asc' as const,
    filters: { status: 'open' },
    columns: [],
    ownerTable: 'workspace',
    scope: 'workspace' as const,
    protection: 'locked' as const,
  }
  const personalView = {
    id: 'v-personal',
    name: '我的草稿',
    mode: 'table' as const,
    sortField: 'title',
    sortDir: 'asc' as const,
    filters: { status: 'draft' },
    columns: [],
    ownerTable: 'account:u1',
    scope: 'personal' as const,
    protection: 'personal' as const,
  }
  const topAllView = {
    id: 'v-all',
    name: '跨表汇总',
    mode: 'table' as const,
    sortField: 'title',
    sortDir: 'asc' as const,
    filters: { status: 'open', $scope: 'workspace' },
    columns: [],
    ownerTable: 'all',
    scope: 'personal' as const,
    protection: 'personal' as const,
  }
  const listed = [wsView, personalView, topAllView]

  // Workspace and personal views always lock $scope even when filters omit $scope
  assert.deepEqual(catalogLockFilters('v-ws', listed), { status: 'open', $scope: 'workspace' })
  assert.deepEqual(catalogLockFilters('v-personal', listed), { status: 'draft', $scope: 'personal' })
  // Legacy personal view with scope='personal' and no ownerTable still locks $scope='personal'
  const legacyPersonal = {
    id: 'v-legacy-p',
    name: '历史个人视图',
    mode: 'table' as const,
    sortField: 'title',
    sortDir: 'asc' as const,
    filters: {},
    columns: [],
    scope: 'personal' as const,
  }
  assert.equal(viewDomainOf(legacyPersonal), 'personal')
  assert.deepEqual(catalogLockFilters('v-legacy-p', [legacyPersonal]), { $scope: 'personal' })
  // Renamed builtin-all view saved with builtin: false stays in 'all' domain (never leaks into workspace)
  const renamedAll = {
    id: builtinAllViewId('/pages'),
    name: '全部页面（重命名）',
    builtin: false,
    filters: {},
    scope: 'workspace' as const,
  }
  assert.equal(viewDomainOf(renamedAll), 'all')
  assert.deepEqual(catalogLockFilters(renamedAll.id, [renamedAll]), {})
  // Top-level cross-table view never locks $scope
  assert.deepEqual(catalogLockFilters('v-all', listed), { status: 'open' })

  // savedViewFromRecord preserves ownerTable='all' and forces personal protection
  const hydrated = savedViewFromRecord({
    viewId: 'v-all',
    title: '跨表汇总',
    ownerTable: 'all',
    scope: 'workspace',
    protection: 'public',
  })
  assert.equal(hydrated?.ownerTable, 'all')
  assert.equal(hydrated?.protection, 'personal')
  assert.equal(hydrated?.scope, 'personal')

  // Real view belonging to another user's personal table locks $scope='shared' + $ownerTable when viewer != owner
  const bobPublicView = {
    id: 'default:account:bob:/pages',
    name: '私人页面',
    ownerTable: 'account:bob',
    protection: 'public' as const,
    filters: {},
  }
  assert.deepEqual(catalogLockFilters(bobPublicView.id, [bobPublicView], 'alice'), {
    $scope: 'shared',
    $ownerTable: 'account:bob',
  })
  assert.deepEqual(catalogLockFilters(bobPublicView.id, [bobPublicView], 'bob'), {
    $scope: 'personal',
  })

  // pickViewForRoute on K+1 collection redirects legacy builtin-all / unknown routes to concrete workspace public view
  const wsReal: SavedView = {
    id: 'default:workspace:/pages',
    name: '空间页面',
    mode: 'table',
    ownerTable: 'workspace',
    protection: 'public',
    scope: 'workspace',
    sortField: 'updatedAt',
    sortDir: 'desc',
    filters: {},
    columns: ['title'],
  }
  const myReal: SavedView = {
    id: 'default:account:alice:/pages',
    name: '私人页面',
    mode: 'table',
    ownerTable: 'account:alice',
    protection: 'public',
    scope: 'workspace',
    sortField: 'updatedAt',
    sortDir: 'desc',
    filters: {},
    columns: ['title'],
  }
  assert.equal(pickViewForRoute([wsReal, myReal], '/pages', builtinAllViewId('/pages'))?.id, wsReal.id)
  assert.equal(pickViewForRoute([wsReal, myReal], '/pages', myReal.id)?.id, myReal.id)

  // Clicking a shared personal table (default:account:97:/agents) before its server view arrives must NOT bounce back to workspace table
  const foreignPicked = pickViewForRoute([wsReal, myReal], '/agents', 'default:account:97:/agents')
  assert.equal(foreignPicked?.id, 'default:account:97:/agents')
  assert.equal(foreignPicked?.ownerTable, 'account:97')
  assert.deepEqual(catalogLockFilters('default:account:97:/agents', [], 'wenxin'), {
    $scope: 'shared',
    $ownerTable: 'account:97',
  })
})
