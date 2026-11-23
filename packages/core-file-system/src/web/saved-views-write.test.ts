import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pushSavedViewsPatch, loadViews, rememberViews, viewDisplayKey } from './view-storage.ts'
import { createBrowserViewCrud } from './use-browser-view-crud.ts'
import { rankListedViews, type SavedView } from './saved-view.ts'
import { emptyFilterGroup } from '../query-logic.ts'

function mockFetch(impl: typeof fetch) {
  const prev = globalThis.fetch
  globalThis.fetch = impl
  return () => {
    globalThis.fetch = prev
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

test('persistViewsFor adopts cache only after pushSavedViewsPatch', () => {
  const crud = readFileSync(resolve(import.meta.dirname, './use-browser-view-crud.ts'), 'utf8')
  const persistStart = crud.indexOf('async function persistViewsFor')
  const persistEnd = crud.indexOf('function persistViews(', persistStart)
  const persist = crud.slice(persistStart, persistEnd)
  assert.match(persist, /Number\.isFinite\(Number\(view\.rank\)\) \? \{ \.\.\.painted, rank: Math\.round\(Number\(view\.rank\)\) \}/)
  assert.match(persist, /await pushSavedViewsPatch/)
  assert.match(persist, /mergeSavedViewsPatch/)
  assert.match(persist, /upsert: diffSavedViews\(previous, stored\)\.upsert, remove: \[\]/)
  assert.match(persist, /upsert: forced/)
  assert.match(persist, /await pullSavedViews\(\[path\], \{ force: true \}\)/)
  assert.match(persist, /mergeSavedViewLists\(loadViews\(path\), adopted/)
  assert.match(persist, /adoptPersistedViews\(path, adopted, extra\?\.remove\)/)
  assert.match(persist, /result === 'skipped' && intended/)
  assert.match(persist, /if \(result === 'skipped'\) return true/)
  assert.match(persist, /adoptPersistedViews/)
  assert.match(persist, /for \(const view of incoming\) persistViewDisplay\(path, view\.id, view\)/)
  const overlayAt = persist.indexOf('persistViewDisplay(path, view.id, view)')
  const paintAt = persist.indexOf('withViewDisplay(path, view)')
  assert.ok(overlayAt >= 0 && paintAt > overlayAt)
  assert.doesNotMatch(persist, /localStorage\.setItem/)
  assert.match(persist, /rememberViews\(path, listedNow\)/)
  assert.match(persist, /setViews\(listedNow\)/)
  const awaitAt = persist.indexOf('await pushSavedViewsPatch')
  const pullAt = persist.indexOf("await pullSavedViews([path], { force: true })")
  assert.ok(awaitAt >= 0 && pullAt > awaitAt)
  const adopt = crud.slice(crud.indexOf('function adoptPersistedViews'), persistStart)
  assert.match(adopt, /mergeSavedViewLists\(loadViews\(path\), listed, removed\)/)
  assert.match(adopt, /rememberViews\(path/)
  assert.doesNotMatch(adopt, /localStorage\.setItem\(viewsKey/)
  assert.match(adopt, /setViews\(/)
})

test('reorder paints the new order then rolls back if persist fails', () => {
  const crud = readFileSync(resolve(import.meta.dirname, './use-browser-view-crud.ts'), 'utf8')
  const start = crud.indexOf('function persistViewOrder')
  const body = crud.slice(start, crud.indexOf('function persistViewsWith', start))
  assert.match(body, /const baseline = loadViews\(collectionPath\)/)
  assert.ok(body.indexOf('const baseline = loadViews(collectionPath)') < body.indexOf('rememberViews(collectionPath, next)'))
  assert.ok(body.indexOf('setViews(next)') < body.indexOf('void persistViewsFor(collectionPath, next, { baseline })'))
  assert.match(body, /noteLocalSavedViewsWrite\(collectionPath\)/)
  assert.match(body, /if \(ok \|\| viewsRef\.current !== next\) return/)
  assert.ok(body.indexOf('void persistViewsFor(collectionPath, next, { baseline })') < body.indexOf('setViews(current)'))
})

test('delete waits for persist ok before switching view', () => {
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const crud = readFileSync(resolve(import.meta.dirname, './use-browser-view-crud.ts'), 'utf8')
  const start = crud.indexOf('function deleteView')
  const body = crud.slice(start)
  assert.match(
    body,
    /persistViewsWith\(path, remaining, \{ remove: \[removedId\] \}\)\.then\(\(ok\) => \{/,
  )
  assert.match(body, /if \(!ok\) return/)
  assert.ok(body.indexOf('if (!ok) return') < body.indexOf('selectView(next)'))
  assert.doesNotMatch(browser, /title="删除视图"/)
})

test('create and rename wait for persist ok before advancing UI', () => {
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const crud = readFileSync(resolve(import.meta.dirname, './use-browser-view-crud.ts'), 'utf8')
  const commit = crud.slice(crud.indexOf('async function commitView'), crud.indexOf('function uniqueViewName'))
  assert.match(commit, /persistViewsWith\(/)
  assert.match(commit, /upsert: \[next\]/)
  assert.match(commit, /if \(!ok\) return/)
  assert.ok(commit.indexOf('if (!ok) return') < commit.indexOf('selectView(next)'))
  const add = crud.slice(crud.indexOf('function addEmptyView'), crud.indexOf('function copyView'))
  assert.match(crud, /if \(base === '新视图'\) return base/)
  assert.match(add, /upsert: \[view\]/)
  assert.match(add, /rememberViews\(target, nextStored\)/)
  assert.match(add, /baseline: stored/)
  assert.match(add, /persistViewsFor\(target[\s\S]*\.then\(\(ok\) => \{/)
  assert.match(add, /if \(!ok\) \{/)
  assert.ok(add.indexOf('if (!ok)') < add.indexOf('selectView(view)'))
  assert.ok(add.indexOf('if (!ok)') < add.indexOf('onOpenTable'))
  assert.match(add, /newSavedViewId\(\)/)
  const copy = crud.slice(crud.indexOf('function copyView'), crud.indexOf('function patchActiveView'))
  assert.match(copy, /newSavedViewId\(\)/)
  assert.doesNotMatch(copy, /Date\.now\(\)/)
  const rename = crud.slice(crud.indexOf('function commitViewName'), crud.indexOf('function renameView'))
  assert.match(rename, /setViews\(listed\)/)
  assert.match(rename, /persistViewsWith\(collectionPath, listed, \{ upsert: \[updated\], baseline: current \}\)/)
  assert.match(rename, /rememberViews\(collectionPath, listed\)/)
  assert.doesNotMatch(browser, /title="重命名视图"/)
})

test('rapid consecutive patchActiveView calls accumulate immediately and serialize POSTs in FIFO order', async () => {
  const path = '/pages-serial-patch'
  const mem: Record<string, string> = {}
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => mem[key] ?? null,
      setItem: (key: string, value: string) => { mem[key] = value },
      removeItem: (key: string) => { delete mem[key] },
    },
  })
  const prevWin = (globalThis as Record<string, unknown>).window
  if (!prevWin) {
    ;(globalThis as Record<string, unknown>).window = { dispatchEvent: () => true }
  }
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
  rememberViews(path, [initial])
  const viewsRef = { current: [initial] }
  let latestViews = [initial]
  const activeViewIdRef = { current: 'v1' as string | null }
  const viewsWriteGenRef = { current: 0 }
  let saveError = false

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
    activeViewId: 'v1',
    activeView: initial,
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
    paintListedViews: () => viewsRef.current,
    rankListedViews,
    selectView: () => {},
  })

  const posts: Array<Record<string, unknown>> = []
  let inFlightPosts = 0
  let maxConcurrentPosts = 0
  let releaseFirst!: () => void
  const firstGate = new Promise<void>((r) => { releaseFirst = r })

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
        items: [{ viewId: 'v1', title: '默认', tablePath: path, wrap: true, freezeTitle: true, updatedAt: posts.at(-1)?.updatedAt }],
        total: 1,
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })

  try {
    // 连续触发两次属性修改（第一次 POST 尚未返回）
    crud.patchActiveView({ wrap: true })
    crud.patchActiveView({ freezeTitle: true })

    // viewsRef 立即同时包含两次修改
    assert.equal(viewsRef.current[0]?.wrap, true)
    assert.equal(viewsRef.current[0]?.freezeTitle, true)

    // 此时只有第一个 POST 发出，第二个在串行队列中等待
    await new Promise((r) => setTimeout(r, 0))
    assert.equal(posts.length, 1)
    assert.equal(posts[0]?.wrap, true)

    releaseFirst()
    // 等队列全部排空
    await new Promise((r) => setTimeout(r, 30))

    assert.equal(maxConcurrentPosts, 1)
    assert.equal(posts.length, 2)
    assert.equal(posts[1]?.wrap, true)
    assert.equal(posts[1]?.freezeTitle, true)
    assert.ok(Number(posts[1]?.updatedAt) > Number(posts[0]?.updatedAt))
    assert.equal(saveError, false)
  } finally {
    restore()
    if (!prevWin) delete (globalThis as Record<string, unknown>).window
  }
})

test('failed patchActiveView rolls back viewsRef, memoryViews, and localStorage display', async () => {
  const path = '/pages-patch-rollback'
  const mem: Record<string, string> = {}
  Object.defineProperty(globalThis, 'localStorage', {
    configurable: true,
    value: {
      getItem: (key: string) => mem[key] ?? null,
      setItem: (key: string, value: string) => { mem[key] = value },
      removeItem: (key: string) => { delete mem[key] },
    },
  })
  const initial: SavedView = {
    id: 'v1',
    name: '默认',
    mode: 'table',
    sortField: 'title',
    sortDir: 'asc',
    filters: {},
    columns: ['title'],
    wrap: false,
  }
  rememberViews(path, [initial])
  const viewsRef = { current: [initial] }
  let latestViews = [initial]
  let saveError = false

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
    activeViewId: 'v1',
    activeView: initial,
    activeViewIdRef: { current: 'v1' },
    viewsWriteGenRef: { current: 0 },
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
    paintListedViews: () => viewsRef.current,
    rankListedViews,
    selectView: () => {},
  })

  const restore = mockFetch(async () => new Response('boom', { status: 500 }))
  try {
    crud.patchActiveView({ wrap: true })
    await new Promise((r) => setTimeout(r, 30))
    assert.equal(saveError, true)
    assert.equal(viewsRef.current[0]?.wrap, false)
    assert.equal(loadViews(path)[0]?.wrap, false)
    assert.equal(mem[viewDisplayKey(path, 'v1')], undefined)
  } finally {
    restore()
  }
})
