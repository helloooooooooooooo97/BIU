import { test } from 'vitest'
import assert from 'node:assert/strict'
import { emptyFilterGroup } from '../query-logic.ts'
import { rankListedViews, type SavedView } from './saved-view.ts'
import { createBrowserViewCrud } from './use-browser-view-crud.ts'
import { loadViews, pushSavedViewsPatch, rememberViews, viewDisplayKey } from './view-storage.ts'

function mockFetch(impl: typeof fetch) {
  const prev = globalThis.fetch
  globalThis.fetch = impl
  return () => {
    globalThis.fetch = prev
  }
}

function setupBrowserGlobals() {
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
  const prevWin = (globalThis as Record<string, unknown>).window
  if (!prevWin) {
    ;(globalThis as Record<string, unknown>).window = {
      dispatchEvent: () => true,
      requestAnimationFrame: (cb: () => void) => cb(),
    }
  }
  return {
    mem,
    restore: () => {
      if (!prevWin) delete (globalThis as Record<string, unknown>).window
    },
  }
}

function makeCrudHarness(path: string, initialViews: SavedView[], activeId = initialViews[0]?.id ?? null) {
  rememberViews(path, initialViews)
  const viewsRef = { current: initialViews }
  let latestViews = initialViews
  const activeViewIdRef = { current: activeId }
  const viewsWriteGenRef = { current: 0 }
  let saveError = false
  const selected: SavedView[] = []

  const crud = createBrowserViewCrud({
    sheet: false,
    collectionPath: path,
    title: '页面',
    routeScope: null,
    catalogLocks: {},
    schemaDefaultKeys: ['title'],
    views: latestViews,
    viewsRef,
    setViews: (next) => {
      latestViews = typeof next === 'function' ? next(latestViews) : next
    },
    activeViewId: activeId,
    activeView: initialViews.find((v) => v.id === activeId),
    activeViewIdRef,
    viewsWriteGenRef,
    setViewsSaveError: (v) => {
      saveError = typeof v === 'function' ? v(saveError) : v
    },
    setViewMenuOpen: () => {},
    pageRef: { current: null },
    mode: 'table',
    sortField: 'title',
    sortDir: 'asc',
    sorts: [],
    filterTree: emptyFilterGroup(),
    columnKeys: ['title'],
    columnWidths: {},
    groupBy: '',
    showTree: false,
    wrapCells: false,
    truncateCells: true,
    freezeTitle: false,
    query: '',
    listedViews: (_p, user) => user,
    paintListedViews: (p) => loadViews(p),
    rankListedViews,
    selectView: (view) => {
      selected.push(view)
      activeViewIdRef.current = view.id
    },
  })

  return {
    crud,
    viewsRef,
    getViews: () => latestViews,
    getSaveError: () => saveError,
    selected,
  }
}

test('empty saved-views patch skips fetch', async () => {
  let called = 0
  const restore = mockFetch(async () => {
    called += 1
    return new Response('ok', { status: 200 })
  })
  try {
    assert.equal(await pushSavedViewsPatch('/pages', {}), 'skipped')
    assert.equal(await pushSavedViewsPatch('/pages', { upsert: [], remove: [] }), 'skipped')
    assert.equal(called, 0)
  } finally {
    restore()
  }
})

test('saved-views patch 200 is ok', async () => {
  const restore = mockFetch(async () => new Response('ok', { status: 200 }))
  try {
    assert.equal(
      await pushSavedViewsPatch('/pages', {
        upsert: [{ id: 'v1', name: 'A', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: [] }],
      }),
      'ok',
    )
  } finally {
    restore()
  }
})

test('saved-views patch 500 is failed', async () => {
  const restore = mockFetch(async () => new Response('nope', { status: 500 }))
  try {
    assert.equal(await pushSavedViewsPatch('/pages', { remove: ['gone'] }), 'failed')
  } finally {
    restore()
  }
})

test('saved-views patch network error is failed', async () => {
  const restore = mockFetch(async () => {
    throw new Error('offline')
  })
  try {
    assert.equal(await pushSavedViewsPatch('/pages', { remove: ['gone'] }), 'failed')
  } finally {
    restore()
  }
})

test('addEmptyView optimistically inserts, selects after 200 OK, and rolls back on 500', async () => {
  const env = setupBrowserGlobals()
  const path = '/pages-behavior-add'
  const base: SavedView = {
    id: 'v-base',
    name: '全部',
    mode: 'table',
    sortField: 'title',
    sortDir: 'asc',
    filters: {},
    columns: ['title'],
    rank: 0,
  }

  const failHarness = makeCrudHarness(path, [base])
  const restoreFail = mockFetch(async () => new Response('err', { status: 500 }))
  try {
    failHarness.crud.addEmptyView()
    assert.equal(failHarness.viewsRef.current.length, 2)
    await new Promise((r) => setTimeout(r, 25))
    assert.equal(failHarness.viewsRef.current.length, 1)
    assert.equal(loadViews(path).length, 1)
    assert.equal(failHarness.selected.length, 0)
    assert.equal(failHarness.getSaveError(), true)
  } finally {
    restoreFail()
  }

  const okHarness = makeCrudHarness(path, [base])
  const posted: Array<{ upsert?: SavedView[] }> = []
  const restoreOk = mockFetch(async (input, init) => {
    const url = String(input)
    if (url.includes('/api/db/saved-views')) {
      posted.push(JSON.parse(String(init?.body ?? '{}')))
      return new Response('{"ok":true}', { status: 200 })
    }
    const created = posted[0]?.upsert?.[0]
    return new Response(
      JSON.stringify({
        items: [
          { viewId: base.id, title: base.name, tablePath: path, rank: 0 },
          ...(created ? [{ viewId: created.id, title: created.name, tablePath: path, rank: 1 }] : []),
        ],
        total: 2,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  try {
    okHarness.crud.addEmptyView()
    await new Promise((r) => setTimeout(r, 25))
    assert.equal(posted.length, 1)
    assert.equal(okHarness.selected.length, 1)
    assert.equal(okHarness.selected[0]?.name, '新视图')
    assert.equal(okHarness.getSaveError(), false)
  } finally {
    restoreOk()
    env.restore()
  }
})

test('commitViewName renames optimistically and rolls back if persist fails', async () => {
  const env = setupBrowserGlobals()
  const path = '/pages-behavior-rename'
  const base: SavedView = {
    id: 'v1',
    name: '旧名称',
    mode: 'table',
    sortField: 'title',
    sortDir: 'asc',
    filters: {},
    columns: ['title'],
  }
  const harness = makeCrudHarness(path, [base])
  const restore = mockFetch(async () => new Response('err', { status: 500 }))
  try {
    harness.crud.commitViewName('v1', '新名称')
    assert.equal(harness.viewsRef.current[0]?.name, '新名称')
    await new Promise((r) => setTimeout(r, 25))
    assert.equal(harness.viewsRef.current[0]?.name, '旧名称')
    assert.equal(loadViews(path)[0]?.name, '旧名称')
  } finally {
    restore()
    env.restore()
  }
})

test('deleteView waits for persist OK before switching active view and stays put on failure', async () => {
  const env = setupBrowserGlobals()
  const path = '/pages-behavior-delete'
  const v1: SavedView = { id: 'v1', name: '视图 1', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: ['title'], rank: 0 }
  const v2: SavedView = { id: 'v2', name: '视图 2', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: ['title'], rank: 1 }

  const failHarness = makeCrudHarness(path, [v1, v2], 'v1')
  const restoreFail = mockFetch(async () => new Response('err', { status: 500 }))
  try {
    failHarness.crud.deleteView(v1)
    await new Promise((r) => setTimeout(r, 25))
    assert.equal(failHarness.selected.length, 0)
  } finally {
    restoreFail()
  }

  const okHarness = makeCrudHarness(path, [v1, v2], 'v1')
  const removes: string[][] = []
  const restoreOk = mockFetch(async (input, init) => {
    const url = String(input)
    if (url.includes('/api/db/saved-views')) {
      const body = JSON.parse(String(init?.body ?? '{}')) as { remove?: string[] }
      removes.push(body.remove ?? [])
      return new Response('{"ok":true}', { status: 200 })
    }
    return new Response(
      JSON.stringify({ items: [{ viewId: 'v2', title: '视图 2', tablePath: path, rank: 0 }], total: 1 }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  try {
    okHarness.crud.deleteView(v1)
    await new Promise((r) => setTimeout(r, 25))
    assert.deepEqual(removes, [['v1']])
    assert.equal(okHarness.selected.length, 1)
    assert.equal(okHarness.selected[0]?.id, 'v2')
  } finally {
    restoreOk()
    env.restore()
  }
})

test('rapid consecutive patchActiveView calls accumulate immediately and serialize POSTs in FIFO order', async () => {
  const env = setupBrowserGlobals()
  const path = '/pages-serial-patch'
  const initial: SavedView = {
    id: 'v1',
    name: '默认',
    mode: 'table',
    sortField: 'title',
    sortDir: 'asc',
    filters: {},
    columns: ['title'],
    wrap: false,
    freezeTitle: false,
  }
  const harness = makeCrudHarness(path, [initial], 'v1')

  const posts: Array<Record<string, unknown>> = []
  let inFlightPosts = 0
  let maxConcurrentPosts = 0
  let releaseFirst!: () => void
  const firstGate = new Promise<void>((r) => {
    releaseFirst = r
  })

  const restore = mockFetch(async (input, init) => {
    const url = String(input)
    if (url.includes('/api/db/saved-views')) {
      inFlightPosts += 1
      maxConcurrentPosts = Math.max(maxConcurrentPosts, inFlightPosts)
      const body = JSON.parse(String(init?.body ?? '{}')) as { upsert?: Array<Record<string, unknown>> }
      posts.push(body.upsert?.[0] ?? {})
      if (posts.length === 1) await firstGate
      inFlightPosts -= 1
      return new Response('{"ok":true}', { status: 200 })
    }
    return new Response(
      JSON.stringify({
        items: [{ viewId: 'v1', title: '默认', tablePath: path, groupBy: 'status', sortDir: 'desc', updatedAt: posts.at(-1)?.updatedAt }],
        total: 1,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })

  try {
    harness.crud.patchActiveView({ groupBy: 'status' })
    harness.crud.patchActiveView({ sortDir: 'desc' })

    assert.equal(harness.viewsRef.current[0]?.groupBy, 'status')
    assert.equal(harness.viewsRef.current[0]?.sortDir, 'desc')

    await new Promise((r) => setTimeout(r, 0))
    assert.equal(posts.length, 1)
    assert.equal(posts[0]?.groupBy, 'status')

    releaseFirst()
    await new Promise((r) => setTimeout(r, 30))

    assert.equal(maxConcurrentPosts, 1)
    assert.equal(posts.length, 2)
    assert.equal(posts[1]?.groupBy, 'status')
    assert.equal(posts[1]?.sortDir, 'desc')
    assert.ok(Number(posts[1]?.updatedAt) > Number(posts[0]?.updatedAt))
    assert.equal(harness.getSaveError(), false)
  } finally {
    restore()
    env.restore()
  }
})

test('failed patchActiveView rolls back viewsRef, memoryViews, and localStorage display', async () => {
  const env = setupBrowserGlobals()
  const path = '/pages-patch-rollback'
  const initial: SavedView = {
    id: 'v1',
    name: '默认',
    mode: 'table',
    sortField: 'title',
    sortDir: 'asc',
    filters: {},
    columns: ['title'],
    groupBy: '',
  }
  const harness = makeCrudHarness(path, [initial], 'v1')
  const restore = mockFetch(async () => new Response('boom', { status: 500 }))
  try {
    harness.crud.patchActiveView({ groupBy: 'status' })
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(harness.getSaveError(), true)
    assert.equal(harness.viewsRef.current[0]?.groupBy, '')
    assert.equal(loadViews(path)[0]?.groupBy, '')
    assert.equal(env.mem[viewDisplayKey(path, 'v1')], undefined)
  } finally {
    restore()
    env.restore()
  }
})

test('local-only personal display prefs persist locally without firing server POST', async () => {
  const env = setupBrowserGlobals()
  const path = '/pages-local-prefs'
  const initial: SavedView = {
    id: 'v1',
    name: '默认',
    mode: 'table',
    sortField: 'title',
    sortDir: 'asc',
    filters: {},
    columns: ['title'],
    wrap: false,
    columnWidths: {},
  }
  const harness = makeCrudHarness(path, [initial], 'v1')
  let fetchCalls = 0
  const restore = mockFetch(async () => {
    fetchCalls += 1
    return new Response('{"ok":true}', { status: 200 })
  })
  try {
    harness.crud.patchActiveView({ columnWidths: { title: 320 }, wrap: true, pageSize: 50 })
    await new Promise((r) => setTimeout(r, 20))
    assert.equal(fetchCalls, 0)
    assert.equal(harness.viewsRef.current[0]?.wrap, true)
    assert.equal(harness.viewsRef.current[0]?.columnWidths?.title, 320)
    assert.equal(harness.viewsRef.current[0]?.pageSize, 50)
    assert.ok(env.mem[viewDisplayKey(path, 'v1')]?.includes('"title":320'))
  } finally {
    restore()
    env.restore()
  }
})
