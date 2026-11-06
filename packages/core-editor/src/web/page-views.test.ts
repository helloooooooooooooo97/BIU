import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { applyPageAssetChanged, peekPageFile, readPageFile, rememberPageFile, resetPageFileState, writePageFile } from './page-views.ts'

afterEach(() => {
  resetPageFileState()
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

test('readPageFile uses memory and does not GET again after a 404', async () => {
  rememberPageFile('view-p1-a.jsx', 'export default function App(){return 1}')
  const calls = mockFetch(() => ({ status: 404 }))
  assert.equal(await readPageFile('view-p1-a.jsx'), 'export default function App(){return 1}')
  assert.equal(calls.length, 0)
  const missing = await readPageFile('view-p1-missing.jsx', 'fallback')
  assert.equal(missing, 'fallback')
  assert.equal(calls.length, 1)
  assert.equal(await readPageFile('view-p1-missing.jsx', 'fallback'), 'fallback')
  assert.equal(calls.length, 1)
})

test('writePageFile puts without a prior GET', async () => {
  const calls = mockFetch(() => ({ status: 200, etag: 'etag-1' }))
  await writePageFile('view-p1-a.jsx', 'export default function App(){return 2}')
  assert.equal(calls.map((item) => item.method).join(','), 'PUT')
  assert.equal(peekPageFile('view-p1-a.jsx'), 'export default function App(){return 2}')
  assert.equal(await readPageFile('view-p1-a.jsx'), 'export default function App(){return 2}')
  assert.equal(calls.length, 1)
})

test('asset-changed drops page file cache so the next read hits the server', async () => {
  rememberPageFile('view-p1-a.jsx', 'export default function App(){return 1}', 'old')
  assert.equal(applyPageAssetChanged({ name: 'view-p1-a.jsx', etag: 'old' }), false)
  assert.equal(peekPageFile('view-p1-a.jsx'), 'export default function App(){return 1}')
  assert.equal(applyPageAssetChanged({ name: 'view-p1-a.jsx', etag: 'new' }), true)
  assert.equal(peekPageFile('view-p1-a.jsx'), undefined)
  const calls = mockFetch(() => ({ status: 200, text: 'export default function App(){return 2}', etag: 'new' }))
  assert.equal(await readPageFile('view-p1-a.jsx'), 'export default function App(){return 2}')
  assert.equal(calls.length, 1)
})
