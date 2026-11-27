import { test } from 'vitest'
import assert from 'node:assert/strict'
import { EPHEMERAL_VIEW_ID } from '../catalog-views.ts'
import { emptyFilterGroup } from '../query-logic.ts'
import { rankListedViews, type SavedView } from './saved-view.ts'
import { createBrowserViewCrud } from './use-browser-view-crud.ts'
import { loadViews, pushSavedViewsPatch, rememberViews } from './view-storage.ts'

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
  let saveError = ''
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
    assert.ok(failHarness.getSaveError().length > 0)
  } finally {
    restoreFail()
  }

  const okHarness = makeCrudHarness(path, [base])
  const posted: Array<{ upsert?: Array<SavedView & { accessMode?: string }> }> = []
  const restoreOk = mockFetch(async (input, init) => {
    const url = String(input)
    if (url.includes('/api/db/saved-views') && init?.method === 'POST') {
      posted.push(JSON.parse(String(init?.body ?? '{}')))
      return new Response('{"ok":true}', { status: 200 })
    }
    const created = posted[0]?.upsert?.[0]
    return new Response(
      JSON.stringify({
        views: [
          base,
          ...(created ? [{ ...created, rank: 1, revision: 1 }] : []),
        ],
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  try {
    okHarness.crud.addEmptyView()
    await new Promise((r) => setTimeout(r, 25))
    assert.equal(posted.length, 1)
    assert.equal(posted[0]?.upsert?.[0]?.accessMode, 'private')
    assert.equal(posted[0]?.upsert?.[0]?.shareScope, 'personal')
    assert.equal(okHarness.selected.length, 1)
    assert.equal(okHarness.selected[0]?.name, '新视图')
    assert.equal(okHarness.getSaveError(), '')
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

test('commitViewName persists renamed seed all view and ignores ephemeral views', async () => {
  const env = setupBrowserGlobals()
  const path = '/pages-behavior-seed-rename'
  const allView: SavedView = {
    id: 'all',
    name: '全部页面',
    mode: 'table',
    sortField: 'updatedAt',
    sortDir: 'desc',
    filters: {},
    columns: ['title'],
    rank: 0,
  }
  const ephemeralView: SavedView = {
    id: EPHEMERAL_VIEW_ID,
    name: '临时视图',
    mode: 'table',
    sortField: 'updatedAt',
    sortDir: 'desc',
    filters: {},
    columns: ['title'],
    ephemeral: true,
    rank: 1,
  }
  const harness = makeCrudHarness(path, [allView, ephemeralView], 'all')
  const posted: Array<{ path?: string; upsert?: Array<Record<string, unknown>> }> = []
  const restore = mockFetch(async (input, init) => {
    const url = String(input)
    if (url.includes('/api/db/saved-views') && init?.method === 'POST') {
      posted.push(JSON.parse(String(init?.body ?? '{}')))
      return new Response('{"ok":true}', { status: 200 })
    }
    return new Response(JSON.stringify({ views: [] }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })
  })
  try {
    harness.crud.commitViewName('all', '核心页面')
    await new Promise((r) => setTimeout(r, 25))
    assert.equal(posted.length, 1)
    assert.equal(posted[0]?.path, path)
    assert.equal(posted[0]?.upsert?.[0]?.id, 'all')
    assert.equal(posted[0]?.upsert?.[0]?.name, '核心页面')

    // 临时视图不写服务端
    harness.crud.commitViewName(EPHEMERAL_VIEW_ID, '临时改名')
    await new Promise((r) => setTimeout(r, 25))
    assert.equal(posted.length, 1)
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
    if (url.includes('/api/db/saved-views') && init?.method === 'POST') {
      const body = JSON.parse(String(init?.body ?? '{}')) as { remove?: string[] }
      removes.push(body.remove ?? [])
      return new Response('{"ok":true}', { status: 200 })
    }
    return new Response(
      JSON.stringify({ views: [{ ...v2, rank: 0 }] }),
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

test('rapid consecutive patchActiveView calls accumulate immediately and serialize field-level POSTs in FIFO order', async () => {
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
    if (url.includes('/api/db/saved-views') && init?.method === 'POST') {
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
        views: [{ ...initial, groupBy: 'status', sortDir: 'desc', revision: 2 }],
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
    assert.equal('sortDir' in posts[0]!, false)

    releaseFirst()
    await new Promise((r) => setTimeout(r, 30))

    assert.equal(maxConcurrentPosts, 1)
    assert.equal(posts.length, 2)
    assert.equal(posts[1]?.sortDir, 'desc')
    assert.equal('groupBy' in posts[1]!, false)
    assert.equal(harness.getSaveError(), '')
  } finally {
    restore()
    env.restore()
  }
})

test('failed patchActiveView rolls back viewsRef, memoryViews, and sets error message', async () => {
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
    assert.ok(harness.getSaveError().length > 0)
    assert.equal(harness.viewsRef.current[0]?.groupBy, '')
    assert.equal(loadViews(path)[0]?.groupBy, '')
  } finally {
    restore()
    env.restore()
  }
})

test('concurrent op failure rolls back ONLY the failed op without clobbering concurrent successful op', async () => {
  const env = setupBrowserGlobals()
  const path = '/pages-concurrent-op-isolation'
  const initial: SavedView = {
    id: 'v1',
    name: '默认',
    mode: 'table',
    sortField: 'title',
    sortDir: 'asc',
    filters: {},
    columns: ['title'],
    wrap: false,
    groupBy: '',
    updatedAt: 100,
  }
  const harness = makeCrudHarness(path, [initial], 'v1')
  let callIndex = 0
  const restore = mockFetch(async (_input, init) => {
    callIndex += 1
    const body = JSON.parse(String(init?.body ?? '{}')) as { upsert?: SavedView[] }
    if (callIndex === 1) {
      // First write succeeds and returns authoritative server view
      const saved = { ...initial, ...body.upsert![0]!, revision: 2, updatedAt: 200 }
      return new Response(JSON.stringify({ ok: true, views: [saved] }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }
    // Second write fails with 500
    return new Response('err', { status: 500 })
  })
  try {
    harness.crud.patchActiveView({ wrap: true })
    harness.crud.patchActiveView({ groupBy: 'status' })
    await new Promise((r) => setTimeout(r, 40))
    // First op (wrap: true) MUST survive; only second op (groupBy: 'status') rolled back!
    assert.equal(harness.viewsRef.current[0]?.wrap, true)
    assert.equal(harness.viewsRef.current[0]?.groupBy, '')
    assert.equal(loadViews(path)[0]?.wrap, true)
    assert.equal(loadViews(path)[0]?.groupBy, '')
  } finally {
    restore()
    env.restore()
  }
})

test('mergeBlockViewsOnConflict keeps fresher views per ID and preserves collaborator-added views', async () => {
  const { mergeBlockViewsOnConflict } = await import('./database-block.tsx')
  const remote = {
    activeViewId: 'v1',
    views: [
      { id: 'v1', name: '协作者更新', mode: 'table' as const, sortField: 'title', sortDir: 'asc' as const, filters: {}, columns: [], updatedAt: 300 },
      { id: 'v-collab', name: '协作者新建', mode: 'table' as const, sortField: 'title', sortDir: 'asc' as const, filters: {}, columns: [], updatedAt: 250 },
    ],
  }
  const local = {
    activeViewId: 'v-local',
    views: [
      { id: 'v1', name: '本地旧改', mode: 'table' as const, sortField: 'title', sortDir: 'asc' as const, filters: {}, columns: [], updatedAt: 100 },
      { id: 'v-local', name: '本地新建', mode: 'table' as const, sortField: 'title', sortDir: 'asc' as const, filters: {}, columns: [], updatedAt: 400 },
    ],
  }
  const merged = mergeBlockViewsOnConflict(remote, local)
  assert.equal(merged.views.find((v) => v.id === 'v1')?.name, '协作者更新')
  assert.equal(merged.views.find((v) => v.id === 'v-collab')?.name, '协作者新建')
  assert.equal(merged.views.find((v) => v.id === 'v-local')?.name, '本地新建')
  assert.equal(merged.activeViewId, 'v-local')
})
