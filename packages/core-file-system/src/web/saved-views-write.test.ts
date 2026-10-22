import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pushSavedViewsPatch } from './view-storage.ts'

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
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const persistStart = browser.indexOf('async function persistViewsFor')
  const persistEnd = browser.indexOf('function persistViews(', persistStart)
  const persist = browser.slice(persistStart, persistEnd)
  assert.match(persist, /Number\.isFinite\(Number\(view\.rank\)\) \? \{ \.\.\.painted, rank: Math\.round\(Number\(view\.rank\)\) \}/)
  assert.match(persist, /await pushSavedViewsPatch/)
  assert.match(persist, /mergeSavedViewsPatch/)
  assert.match(persist, /upsert: forced/)
  assert.match(persist, /result === 'skipped' && intended/)
  assert.match(persist, /if \(result === 'skipped'\) return true/)
  assert.match(persist, /adoptPersistedViews/)
  assert.doesNotMatch(persist, /rememberViews\(/)
  assert.doesNotMatch(persist, /localStorage\.setItem/)
  assert.doesNotMatch(persist, /setViews\(/)
  const awaitAt = persist.indexOf('await pushSavedViewsPatch')
  const adoptAt = persist.lastIndexOf('adoptPersistedViews')
  assert.ok(awaitAt >= 0 && adoptAt > awaitAt)
  const adopt = browser.slice(browser.indexOf('function adoptPersistedViews'), persistStart)
  assert.match(adopt, /rememberViews\(path/)
  assert.match(adopt, /localStorage\.setItem\(viewsKey\(path\)/)
  assert.match(adopt, /setViews\(/)
})

test('reorder paints the new order then rolls back if persist fails', () => {
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const start = browser.indexOf('function persistViewOrder')
  const body = browser.slice(start, browser.indexOf('function persistViewsWith', start))
  assert.match(body, /const baseline = loadViews\(collectionPath\)/)
  assert.ok(body.indexOf('const baseline = loadViews(collectionPath)') < body.indexOf('rememberViews(collectionPath, next)'))
  assert.ok(body.indexOf('setViews(next)') < body.indexOf('void persistViewsFor(collectionPath, next, { baseline })'))
  assert.match(body, /noteLocalSavedViewsWrite\(collectionPath\)/)
  assert.match(body, /if \(ok \|\| viewsRef\.current !== next\) return/)
  assert.ok(body.indexOf('void persistViewsFor(collectionPath, next, { baseline })') < body.indexOf('setViews(current)'))
})

test('delete waits for persist ok before switching view', () => {
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const start = browser.indexOf('function applyDeleteView')
  const body = browser.slice(start, browser.indexOf('function setVisibleColumns', start))
  assert.match(
    body,
    /persistViewsWith\(collectionPath, remaining, \{ remove: \[removedId\] \}\)\.then\(\(ok\) => \{/,
  )
  assert.match(body, /if \(!ok\) return/)
  assert.ok(body.indexOf('if (!ok) return') < body.indexOf('selectView(next)'))
})

test('create and rename wait for persist ok before advancing UI', () => {
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const commit = browser.slice(browser.indexOf('async function commitView'), browser.indexOf('function uniqueViewName'))
  assert.match(commit, /persistViewsWith\(/)
  assert.match(commit, /upsert: \[next\]/)
  assert.match(commit, /if \(!ok\) return/)
  assert.ok(commit.indexOf('if (!ok) return') < commit.indexOf('selectView(next)'))
  const add = browser.slice(browser.indexOf('function addEmptyView'), browser.indexOf('function copyView'))
  assert.match(add, /upsert: \[view\]/)
  assert.match(add, /persistViewsFor\(target[\s\S]*\.then\(\(ok\) => \{/)
  assert.match(add, /if \(!ok\) return/)
  assert.ok(add.indexOf('if (!ok) return') < add.indexOf('selectView(view)'))
  assert.ok(add.indexOf('if (!ok) return') < add.indexOf('onOpenTable'))
  assert.match(add, /newSavedViewId\(\)/)
  const copy = browser.slice(browser.indexOf('function copyView'), browser.indexOf('function patchActiveView'))
  assert.match(copy, /newSavedViewId\(\)/)
  assert.doesNotMatch(copy, /Date\.now\(\)/)
  const rename = browser.slice(browser.indexOf('function applyRename'), browser.indexOf('function applyDeleteView'))
  assert.match(rename, /persistViews\([\s\S]*\.then\(\(ok\) => \{/)
  assert.match(rename, /if \(!ok\) return[\s\S]*setDlg\(null\)/)
})
