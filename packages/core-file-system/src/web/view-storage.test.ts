import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { builtinAllView, builtinAllViewId, builtinCatalogViewId } from '../catalog-views.ts'
import { VIEWS_COLLECTION_PATH } from './database-path.ts'
import {
  defaultViewId,
  fetchSavedView,
  loadViews,
  loadRecords,
  persistViewDisplay,
  pickViewForRoute,
  rememberViews,
  rememberRecords,
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
  assert.equal(defaultViewId('/sessions'), builtinAllViewId('/sessions'))
  assert.equal(defaultViewId(VIEWS_COLLECTION_PATH), builtinAllViewId(VIEWS_COLLECTION_PATH))
  assert.equal(viewForPath('/sessions')?.builtin, true)
  assert.deepEqual(viewForPath('/sessions')?.filters, {})
  assert.equal(viewForPath('/pages', builtinAllViewId('/sessions'))?.id, builtinAllViewId('/pages'))
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
  const path = '/sessions'
  const id = builtinAllViewId(path)
  persistViewDisplay(path, id, { wrap: true, truncate: false })
  assert.equal(mem[viewDisplayKey(path, id)]?.includes('"wrap":true'), true)
  const painted = withViewDisplay(path, builtinAllView({ path, label: '会话', view: { title: '会话' } }))
  assert.equal(painted.wrap, true)
  assert.equal(painted.truncate, false)
  assert.equal(painted.builtin, true)
  assert.equal(painted.name, '全部会话')
  assert.equal(viewForPath(path)?.wrap, true)
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
  const path = '/sessions'
  const id = builtinAllViewId(path)
  persistViewDisplay(path, id, { columns: ['title', 'project'] })
  assert.deepEqual(withViewDisplay(path, builtinAllView({ path, label: '会话', view: { title: '会话' } })).columns, [
    'title',
    'project',
  ])
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
  assert.match(src, /if \(pending\) return pending/)
  assert.match(src, /opts\?: \{ idle\?: boolean \}/)
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

test('starred records toggle by collection path and id', () => {
  const next = toggleStarredRecord([], '/pages', 'home', { label: '首页' })
  assert.equal(isRecordStarred(next, '/pages', 'home'), true)
  assert.equal(next[0]?.label, '首页')
  assert.equal(isRecordStarred(next, '/tasks', 'home'), false)
  assert.equal(isRecordStarred(toggleStarredRecord(next, '/pages', 'home'), '/pages', 'home'), false)
})
