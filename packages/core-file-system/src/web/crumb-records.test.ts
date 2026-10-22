import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pullCrumbRecords, recordChoicesFromRows, CRUMB_RECORD_LIMIT } from './crumb-records.ts'
import { loadRecords, rememberRecords } from './view-storage.ts'
import type { Crumb } from './sidebar-nav.ts'

function mockFetch(impl: typeof fetch) {
  const prev = globalThis.fetch
  globalThis.fetch = impl
  return () => {
    globalThis.fetch = prev
  }
}

const recordCrumb = {
  kind: 'record',
  id: 'cur',
  label: '当前',
  icon: 'pages',
  target: { kind: 'record', collection: '/pages', recordId: 'cur', viewId: 'all' },
  choices: [],
} satisfies Crumb

test('pullCrumbRecords fetches a fresh limited page and remembers empty-query hits', async () => {
  const path = '/pages-crumb-refresh'
  rememberRecords(path, [{ id: 'old', label: '旧的' }], 'v1')
  const restore = mockFetch(async (input) => {
    const url = String(input)
    assert.match(url, /\/api\/db\/list\?/)
    assert.match(url, /limit=40/)
    assert.match(url, /fresh|path=/)
    return new Response(
      JSON.stringify({
        items: [
          { id: 'new', title: '刚写的' },
          { id: 'later', title: '后面的' },
        ],
        total: 80,
        schema: { labelField: 'title', fields: {} },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  try {
    const rows = await pullCrumbRecords({ collection: path, viewId: 'v1' })
    assert.deepEqual(
      rows.map((row) => row.id),
      ['new', 'later'],
    )
    assert.equal(loadRecords(path, 'v1')[0]?.id, 'new')
    assert.equal(loadRecords(path, 'v1').some((row) => row.id === 'old'), false)
  } finally {
    restore()
  }
})

test('pullCrumbRecords search does not overwrite remembered records', async () => {
  const path = '/pages-crumb-search'
  rememberRecords(path, [{ id: 'keep', label: '留下' }], 'v1')
  const restore = mockFetch(async () => {
    return new Response(
      JSON.stringify({
        items: [{ id: 'hit', title: '搜到了' }],
        total: 1,
        schema: { labelField: 'title', fields: {} },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    )
  })
  try {
    const rows = await pullCrumbRecords({ collection: path, viewId: 'v1', query: '搜到' })
    assert.equal(rows[0]?.id, 'hit')
    assert.equal(loadRecords(path, 'v1')[0]?.id, 'keep')
  } finally {
    restore()
  }
})

test('recordChoicesFromRows keeps the current crumb when missing from the page', () => {
  const choices = recordChoicesFromRows(recordCrumb, [{ id: 'other', label: '另一条' }])
  assert.equal(choices[0]?.id, 'cur')
  assert.equal(choices[1]?.id, 'other')
  assert.equal(choices[1]?.target.kind, 'record')
})

test('crumb menu opens by refetching records and views, with a loading placeholder', () => {
  const trail = readFileSync(resolve(import.meta.dirname, './crumb-trail.tsx'), 'utf8')
  const inspector = readFileSync(resolve(import.meta.dirname, './inspector-database.tsx'), 'utf8')
  assert.match(trail, /pullCrumbRecords/)
  assert.match(trail, /pullSavedViews/)
  assert.match(trail, /加载中…/)
  assert.match(trail, /delayCrumbQuery/)
  assert.doesNotMatch(trail, /setTimeout/)
  assert.equal(CRUMB_RECORD_LIMIT, 40)
  assert.match(inspector, /subscribeCrumbs/)
  assert.match(inspector, /loadRecords\(collection, activeViewId\)/)
})
