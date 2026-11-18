import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { uniqueViewName } from '@biu/type-file-system/record-views'
import { getRecordViewCatalog, hydrateRecordViewCatalog, patchRecordViewCatalog } from '@biu/core-file-system/record-view-catalog'
import {
  applyRecordViewAssetChanged,
  peekRecordViewFile,
  putRecordViewFile,
  readRecordViewFile,
  rememberRecordViewFile,
  resetRecordViewFileState,
} from '@biu/core-file-system/record-sandboxes'

afterEach(() => {
  resetRecordViewFileState()
  Reflect.deleteProperty(globalThis, 'fetch')
})

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; text?: string; etag?: string }) {
  const calls: Array<{ url: string; method: string }> = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, method: String(init?.method ?? 'GET') })
    const result = handler(url, init)
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: new Headers(result.etag ? { etag: `"${result.etag}"` } : {}),
      text: async () => result.text ?? '',
      json: async () => ({ etag: result.etag }),
      clone() {
        return this
      },
    } as Response
  }) as typeof fetch
  return calls
}

test('deleting a content sandbox falls back on catalog contentViewId', () => {
  patchRecordViewCatalog('/pages', 'p-del', {
    views: [{ id: 'need', name: '新视图', kind: 'sandbox', file: 'a.jsx', dataFile: 'b.json' }],
    contentViewId: 'need',
  })
  patchRecordViewCatalog('/pages', 'p-del', {
    views: [],
    contentViewId: 'doc',
  })
  assert.equal(getRecordViewCatalog('/pages', 'p-del').contentViewId, 'doc')
})

test('hydrate does not wipe a live catalog with an empty seed', () => {
  patchRecordViewCatalog('/pages', 'p-keep', {
    views: [{ id: 'need', name: '新视图', kind: 'sandbox', file: 'a.jsx', dataFile: 'b.json' }],
  })
  hydrateRecordViewCatalog('/pages', 'p-keep', {})
  assert.equal(getRecordViewCatalog('/pages', 'p-keep').views[0]?.id, 'need')
  hydrateRecordViewCatalog('/pages', 'p-keep', { views: [] })
  assert.equal(getRecordViewCatalog('/pages', 'p-keep').views[0]?.id, 'need')
})

test('unique view names match table copy numbering', () => {
  assert.equal(uniqueViewName('官网 副本', []), '官网 副本')
  assert.equal(uniqueViewName('官网 副本', ['官网 副本']), '官网 副本 2')
  assert.equal(uniqueViewName('官网 副本', ['官网 副本', '官网 副本 2']), '官网 副本 3')
  const catalog = readFileSync(resolve(import.meta.dirname, '../../../core-file-system/src/web/view-catalog.ts'), 'utf8')
  assert.match(catalog, /createRecordSandboxView/)
  assert.match(catalog, /fieldKey: key/)
  assert.doesNotMatch(catalog, /Date\.now\(\)/)
})

test('readRecordViewFile uses memory and does not GET again after a 404', async () => {
  rememberRecordViewFile('/pages', 'p1', 'view-p1-a.jsx', 'export default function App(){return 1}')
  const calls = mockFetch(() => ({ status: 404 }))
  assert.equal(await readRecordViewFile('/pages', 'p1', 'view-p1-a.jsx', ''), 'export default function App(){return 1}')
  assert.equal(calls.length, 0)
  const missing = await readRecordViewFile('/pages', 'p1', 'view-p1-missing.jsx', 'fallback')
  assert.equal(missing, 'fallback')
  assert.equal(calls.length, 1)
})

test('writeRecordViewFile puts on /api/db/file', async () => {
  const calls = mockFetch(() => ({ status: 200, etag: 'etag-1' }))
  await putRecordViewFile('/pages', 'p1', 'view-p1-a.jsx', 'export default function App(){return 2}', 'text/plain; charset=utf-8')
  assert.equal(calls.map((item) => item.method).join(','), 'PUT')
  assert.match(calls[0]?.url ?? '', /\/api\/db\/file/)
  assert.doesNotMatch(calls[0]?.url ?? '', /\/api\/page\/file/)
  assert.equal(peekRecordViewFile('/pages', 'p1', 'view-p1-a.jsx'), 'export default function App(){return 2}')
})

test('asset-changed drops cached sandbox files', async () => {
  rememberRecordViewFile('/pages', 'p1', 'view-p1-a.jsx', 'export default function App(){return 1}', 'old')
  assert.equal(applyRecordViewAssetChanged({ name: 'view-p1-a.jsx', etag: 'old' }), false)
  assert.equal(peekRecordViewFile('/pages', 'p1', 'view-p1-a.jsx'), 'export default function App(){return 1}')
  assert.equal(applyRecordViewAssetChanged({ name: 'view-p1-a.jsx', etag: 'new' }), true)
  assert.equal(peekRecordViewFile('/pages', 'p1', 'view-p1-a.jsx'), undefined)
})
