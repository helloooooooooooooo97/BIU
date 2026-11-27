import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { UserGroupIcon, UsersIcon } from '@heroicons/react/16/solid'
import { emptyFilterGroup } from '../query-logic.ts'
import { rankListedViews, type SavedView } from './saved-view.ts'
import { createBrowserViewCrud } from './use-browser-view-crud.ts'
import { viewScopeMeta } from './view-order-menu.tsx'
import { loadViews, rememberViews } from './view-storage.ts'

test('persistViewOrder paints new rank order immediately, sends diff upsert, and rolls back on failure', async () => {
  const path = '/pages-behavior-reorder'
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

  const v1: SavedView = { id: 'v1', name: '一', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: ['title'], rank: 0 }
  const v2: SavedView = { id: 'v2', name: '二', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: ['title'], rank: 1 }

  const makeCrud = () => {
    rememberViews(path, [v1, v2])
    const viewsRef = { current: [v1, v2] }
    let latest = [v1, v2]
    const crud = createBrowserViewCrud({
      sheet: false,
      collectionPath: path,
      title: '页面',
      routeScope: null,
      catalogLocks: {},
      schemaDefaultKeys: ['title'],
      views: latest,
      viewsRef,
      setViews: (next) => { latest = typeof next === 'function' ? next(latest) : next },
      activeViewId: 'v1',
      activeView: v1,
      activeViewIdRef: { current: 'v1' },
      viewsWriteGenRef: { current: 0 },
      setViewsSaveError: () => {},
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
    return { crud, viewsRef }
  }

  const prevFetch = globalThis.fetch
  try {
    // 1. Persisting new order sends upsert with updated ranks (not skipped)
    const upserts: Array<Array<{ id: string; rank?: number }>> = []
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/api/db/saved-views')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { upsert?: Array<{ id: string; rank?: number }> }
        upserts.push(body.upsert ?? [])
        return new Response('{"ok":true}', { status: 200 })
      }
      return new Response(
        JSON.stringify({
          items: [
            { viewId: 'v2', title: '二', tablePath: path, rank: 0 },
            { viewId: 'v1', title: '一', tablePath: path, rank: 1 },
          ],
          total: 2,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }) as typeof fetch

    const ok = makeCrud()
    ok.crud.persistViewOrder(['v2', 'v1'])
    assert.deepEqual(ok.viewsRef.current.map((v) => v.id), ['v2', 'v1'])
    await new Promise((r) => setTimeout(r, 25))
    assert.equal(upserts.length, 1)
    assert.deepEqual(
      upserts[0]?.map((v) => [v.id, v.rank]).sort(),
      [['v1', 1], ['v2', 0]],
    )

    // 2. Failure rolls back to original order
    globalThis.fetch = (async () => new Response('err', { status: 500 })) as typeof fetch
    const fail = makeCrud()
    fail.crud.persistViewOrder(['v2', 'v1'])
    assert.deepEqual(fail.viewsRef.current.map((v) => v.id), ['v2', 'v1'])
    await new Promise((r) => setTimeout(r, 25))
    assert.deepEqual(fail.viewsRef.current.map((v) => v.id), ['v1', 'v2'])
    assert.deepEqual(loadViews(path).map((v) => v.id), ['v1', 'v2'])
  } finally {
    globalThis.fetch = prevFetch
    if (!prevWin) delete (globalThis as Record<string, unknown>).window
  }
})

test('view switcher button and dropdown resolve and render unified shareScope + locked badges', () => {
  const personal = viewScopeMeta({ shareScope: 'personal', locked: false })
  const shared = viewScopeMeta({ shareScope: 'shared', locked: false })
  const workspace = viewScopeMeta({ shareScope: 'workspace', locked: true })
  assert.equal(personal.scope, 'personal')
  assert.equal(shared.scope, 'shared')
  assert.equal(workspace.scope, 'workspace')
  assert.equal(shared.ScopeIcon, UsersIcon)
  assert.equal(workspace.ScopeIcon, UserGroupIcon)
  assert.match(workspace.title, /已锁定配置/)
  assert.match(
    viewScopeMeta({ shareScope: 'workspace', locked: true }, { isMembersCollection: true }).title,
    /动态成员组/,
  )

  const toolbar = readFileSync(resolve(import.meta.dirname, './browser-toolbar.tsx'), 'utf8')
  const orderMenu = readFileSync(resolve(import.meta.dirname, './view-order-menu.tsx'), 'utf8')
  assert.match(toolbar, /data-testid="fsdb-view-tab"[\s\S]*?<ViewStatusBadge/)
  assert.doesNotMatch(toolbar, /data-testid="fsdb-view-lock-btn"/)
  assert.match(orderMenu, /data-testid="fsdb-view-tab-status"/)
  assert.match(orderMenu, /data-testid=\{`view-lock-btn-\$\{view\.id\}`\}/)
  assert.match(orderMenu, /data-testid=\{`view-scope-btn-\$\{view\.id\}`\}/)
})
