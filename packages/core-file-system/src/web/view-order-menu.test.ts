import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { UserGroupIcon, UsersIcon } from '@heroicons/react/16/solid'
import { emptyFilterGroup } from '../query-logic.ts'
import { paintCollectionViews } from './collection-nav.ts'
import { rankListedViews, type SavedView } from './saved-view.ts'
import { createBrowserViewCrud } from './use-browser-view-crud.ts'
import { viewScopeMeta } from './view-order-menu.tsx'
import { applyUserViewOrder, getViewOrder, persistViewOrderForPath, rememberViews } from './view-storage.ts'

test('persistViewOrder stores per-user viewOrder in workspace prefs without mutating shared saved-views', async () => {
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

  const v1: SavedView = { id: 'v1', name: '全部页面', mode: 'table', locked: true, sortField: 'title', sortDir: 'asc', filters: {}, columns: ['title'], rank: 0 }
  const v2: SavedView = { id: 'v2', name: '二', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: ['title'], rank: 1 }
  const v3: SavedView = { id: 'v3', name: '三', mode: 'table', sortField: 'title', sortDir: 'asc', filters: {}, columns: ['title'], rank: 2 }

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
    const starredPatches: Array<Record<string, unknown>> = []
    let savedViewsWrites = 0
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/api/db/saved-views')) {
        savedViewsWrites += 1
        return new Response('{"ok":true}', { status: 200 })
      }
      if (url.includes('/api/account/starred') && init?.method === 'POST') {
        starredPatches.push(JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>)
        return new Response('{"ok":true}', { status: 200 })
      }
      return new Response('{}', { status: 200, headers: { 'content-type': 'application/json' } })
    }) as typeof fetch

    const ok = makeCrud()
    ok.crud.persistViewOrder(['v2', 'v1'])
    assert.deepEqual(ok.viewsRef.current.map((v) => v.id), ['v2', 'v1'])
    assert.deepEqual(getViewOrder(path), ['v2', 'v1'])
    // Sidebar / collection nav and applyUserViewOrder both follow per-user order and append new views at the end
    assert.deepEqual(paintCollectionViews(path, [], [v1, v2]).map((v) => v.id), ['v2', 'v1'])
    assert.deepEqual(applyUserViewOrder(path, [v1, v2, v3]).map((v) => v.id), ['v2', 'v1', 'v3'])

    await new Promise((r) => setTimeout(r, 25))
    assert.equal(savedViewsWrites, 0)
    assert.equal(starredPatches.length, 1)
    assert.deepEqual(starredPatches[0], { viewOrder: { [path]: ['v2', 'v1'] } })
  } finally {
    persistViewOrderForPath(path, [], { remote: false })
    globalThis.fetch = prevFetch
    if (!prevWin) delete (globalThis as Record<string, unknown>).window
  }
})

test('DragOverlay in popover menus portals to document.body and ViewOrderMenu overlay preserves row icons', () => {
  const orderMenu = readFileSync(resolve(import.meta.dirname, './view-order-menu.tsx'), 'utf8')
  const queryMenus = readFileSync(resolve(import.meta.dirname, './query-menus.tsx'), 'utf8')
  const columnMenu = readFileSync(resolve(import.meta.dirname, './column-order-menu.tsx'), 'utf8')
  for (const [name, src] of [
    ['view-order-menu.tsx', orderMenu],
    ['query-menus.tsx', queryMenus],
    ['column-order-menu.tsx', columnMenu],
  ] as const) {
    assert.match(src, /createPortal\([\s\S]*?<DragOverlay[\s\S]*?document\.body/, `${name} should portal DragOverlay to document.body`)
  }
  assert.match(orderMenu, /<DragOverlay[\s\S]*?onToggleLock=\{onToggleLock \? \(\) => undefined : undefined\}[\s\S]*?canRemove=\{canRemove && canDeleteSavedView\(active\) && canRemoveCollectionView\(views, active\)\}/)
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
