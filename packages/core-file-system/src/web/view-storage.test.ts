import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { builtinAllView, builtinAllViewId, builtinCatalogViewId } from '../catalog-views.ts'
import { VIEWS_COLLECTION_PATH } from './database-path.ts'
import {
  defaultViewId,
  diffSavedViews,
  fetchSavedView,
  loadViews,
  loadRecords,
  mergeSavedViewsPatch,
  noteLocalSavedViewsWrite,
  persistViewDisplay,
  persistCollapsedGroups,
  loadCollapsedGroups,
  collapsedGroupsKey,
  pickViewForRoute,
  pullSavedViews,
  rememberViews,
  rememberRecords,
  applyListedCrumbMutation,
  routeViewNeedsFetch,
  savedViewFromRecord,
  toggleStarredRecord,
  isRecordStarred,
  viewDisplayKey,
  viewForPath,
  withViewDisplay,
} from './view-storage.ts'

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
  assert.equal(loadViews(path)[0]?.id, 'old')
  rememberViews(path, [])
  assert.deepEqual(loadViews(path), [])
})

test('index all views do not group by share', () => {
  const all = builtinAllView({ path: '/page-blocks', label: '组件' })
  assert.equal(all.groupBy, '')
  assert.equal(withViewDisplay('/page-blocks', { ...all, groupBy: 'shareScope' }).groupBy, '')
  assert.equal(builtinAllView({ path: '/tasks', label: '任务' }).groupBy, 'shareScope')
})

test('views collection still resolves catalog stubs from the route', () => {
  assert.equal(viewForPath(VIEWS_COLLECTION_PATH, 'builtin:/events')?.filters.tablePath, '/events')
  assert.equal(viewForPath(VIEWS_COLLECTION_PATH, builtinCatalogViewId('/events'))?.id, builtinCatalogViewId('/events'))
  assert.equal(viewForPath('/page-blocks', 'builtin-block:terminal')?.filters.blockKind, 'terminal')
})

test('pickViewForRoute keeps builtin-block from the URL when the list is still only 全部', () => {
  const all = builtinAllView({ path: '/page-blocks', label: '组件', view: { title: '组件' } })
  const picked = pickViewForRoute([all], '/page-blocks', 'builtin-block:terminal')
  assert.equal(picked?.id, 'builtin-block:terminal')
  assert.equal(picked?.filters.blockKind, 'terminal')
})

test('tables default to the builtin 全部xx view', () => {
  assert.equal(defaultViewId('/agents'), builtinAllViewId('/agents'))
  assert.equal(defaultViewId(VIEWS_COLLECTION_PATH), builtinAllViewId(VIEWS_COLLECTION_PATH))
  assert.equal(viewForPath('/agents')?.builtin, true)
  assert.deepEqual(viewForPath('/agents')?.filters, {})
  assert.equal(viewForPath('/pages', builtinAllViewId('/agents'))?.id, builtinAllViewId('/pages'))
})

test('builtin view wrap is stored as display prefs and restored', () => {
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
  persistViewDisplay(path, id, { wrap: true, truncate: false })
  assert.equal(mem[viewDisplayKey(path, id)]?.includes('"wrap":true'), true)
  const painted = withViewDisplay(path, builtinAllView({ path, label: '代理', view: { title: '代理' } }))
  assert.equal(painted.wrap, true)
  assert.equal(painted.truncate, false)
  assert.equal(painted.builtin, true)
  assert.equal(painted.name, '全部代理')
  assert.equal(viewForPath(path)?.wrap, true)
})

test('withViewDisplay keeps overlay rank over a stale record rank', () => {
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
  const path = '/agents'
  persistViewDisplay(path, 'mine', { rank: 0, wrap: true })
  const painted = withViewDisplay(path, {
    id: 'mine',
    name: '我的',
    mode: 'table',
    sortField: 'title',
    sortDir: 'asc',
    filters: {},
    columns: [],
    rank: 2,
  })
  assert.equal(painted.rank, 0)
  assert.equal(painted.wrap, true)
})

test('builtin view columns overlay survives withViewDisplay', () => {
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
  const path = '/agents'
  const id = builtinAllViewId(path)
  persistViewDisplay(path, id, { columns: ['title', 'project'] })
  assert.deepEqual(withViewDisplay(path, builtinAllView({ path, label: '代理', view: { title: '代理' } })).columns, [
    'title',
    'project',
  ])
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

test('savedViewFromRecord skips builtin rows and keeps filters', () => {
  assert.equal(savedViewFromRecord({ viewId: builtinAllViewId('/tasks'), title: '全部' }), null)
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

test('saved views pull shares one in-flight list and a short ttl', () => {
  const src = readFileSync(resolve(import.meta.dirname, './view-storage.ts'), 'utf8')
  assert.match(src, /const viewsPullByKey = new Map/)
  assert.match(src, /VIEWS_PULL_TTL_MS = 2500/)
  assert.match(src, /VIEWS_PULL_IDLE_MS = 2800/)
  assert.match(src, /VIEWS_PULL_LIMIT = 80/)
  assert.match(src, /filters: \{ tablePath \}/)
  assert.doesNotMatch(src, /columns: \[\.\.\.VIEWS_PULL/)
  assert.match(src, /if \(pending\) return pending/)
  assert.match(src, /opts\?: \{ idle\?: boolean \}/)
  assert.match(src, /export function noteLocalSavedViewsWrite/)
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  assert.match(browser, /noteLocalSavedViewsWrite\(path\)/)
  assert.match(browser, /function applyDeleteView/)
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
  const prev = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/api/db/list')) {
      await new Promise((resolve) => setTimeout(resolve, 40))
      return new Response(
        JSON.stringify({
          items: [
            { viewId: 'keep', title: '留下', tablePath: path },
            { viewId: 'gone', title: '删掉', tablePath: path },
          ],
          total: 2,
        }),
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
  persistViewDisplay(path, 'mine', { rank: 0 })
  persistViewDisplay(path, 'board', { rank: 1 })
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
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  assert.match(browser, /persistCollapsedGroups\(collectionPath/)
  assert.match(browser, /loadCollapsedGroups\(collectionPath/)
})

test('starred records toggle by collection path and id', () => {
  const next = toggleStarredRecord([], '/pages', 'home', { label: '首页' })
  assert.equal(isRecordStarred(next, '/pages', 'home'), true)
  assert.equal(next[0]?.label, '首页')
  assert.equal(isRecordStarred(next, '/tasks', 'home'), false)
  assert.equal(isRecordStarred(toggleStarredRecord(next, '/pages', 'home'), '/pages', 'home'), false)
})
