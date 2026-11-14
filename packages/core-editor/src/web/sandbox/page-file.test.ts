import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import {
  isFreshSandboxAsset,
  loadTextAsset,
  markFreshSandboxAssets,
  pageFileUrl,
  resetSandboxAssetState,
  saveTextAsset,
  seedTextAsset,
} from './page-file.ts'

afterEach(() => {
  resetSandboxAssetState()
  Reflect.deleteProperty(globalThis, 'fetch')
})

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; text?: string; etag?: string; json?: unknown }) {
  const calls: Array<{ url: string; method: string; path: string; match: string }> = []
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    const headers = new Headers(init?.headers)
    calls.push({
      url,
      method: String(init?.method ?? 'GET'),
      path: headers.get('x-biu-resource-path') ?? '',
      match: headers.get('if-match') ?? '',
    })
    const result = handler(url, init)
    return {
      ok: result.status >= 200 && result.status < 300,
      status: result.status,
      headers: new Headers(result.etag ? { etag: `"${result.etag}"` } : {}),
      text: async () => result.text ?? '',
      json: async () => result.json ?? { etag: result.etag },
      clone() {
        return this
      },
    } as Response
  }) as typeof fetch
  return calls
}

test('page file url stamps the open page path', () => {
  assert.equal(pageFileUrl('sandbox-ab.jsx', { path: '/pages/p1' }), '/api/page/file/sandbox-ab.jsx?path=%2Fpages%2Fp1')
})

test('fresh sandbox source is created with a PUT, not a GET', async () => {
  markFreshSandboxAssets('assets/sandbox-ab.jsx')
  const calls = mockFetch((url, init) => {
    assert.match(url, /sandbox-ab\.jsx/)
    assert.equal(init?.method, 'PUT')
    return { status: 200, etag: 'etag-1' }
  })
  const loaded = await loadTextAsset('assets/sandbox-ab.jsx', 'export default function App(){return null}', {
    path: '/pages/p1',
  })
  assert.equal(loaded.text.startsWith('export default'), true)
  assert.equal(loaded.etag, 'etag-1')
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.method, 'PUT')
  assert.equal(calls[0]?.path, '/pages/p1')
  assert.equal(isFreshSandboxAsset('sandbox-ab.jsx'), false)
})

test('missing data file is not created just to read it', async () => {
  const calls = mockFetch(() => ({ status: 404 }))
  const loaded = await loadTextAsset('assets/sandbox-data-ab.json', 'null', {
    createOnMiss: false,
    path: '/pages/p1',
  })
  assert.equal(loaded.text, 'null')
  assert.equal(loaded.etag, '')
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.method, 'GET')
})

test('cache-bust 404 does not try to create the file again', async () => {
  const calls = mockFetch(() => ({ status: 404 }))
  const loaded = await loadTextAsset('assets/sandbox-ab.jsx', 'fallback', { bust: true, path: '/pages/p1' })
  assert.equal(loaded.text, 'fallback')
  assert.equal(calls.length, 1)
  assert.equal(calls[0]?.method, 'GET')
})

test('seed recovers a 409 without a second create', async () => {
  const calls = mockFetch((url, init) => {
    if (init?.method === 'PUT') return { status: 409, etag: 'etag-2', json: { etag: 'etag-2' } }
    return { status: 200, text: 'export default function App(){return 2}', etag: 'etag-2' }
  })
  const loaded = await seedTextAsset('sandbox-ab.jsx', 'export default function App(){return 1}', { path: '/pages/p1' })
  assert.equal(loaded.text, 'export default function App(){return 2}')
  assert.equal(loaded.etag, 'etag-2')
  assert.equal(calls.map((item) => item.method).join(','), 'PUT,GET')
})

test('a missing data file is not fetched again', async () => {
  const calls = mockFetch(() => ({ status: 404 }))
  const first = await loadTextAsset('assets/sandbox-data-ab.json', 'null', {
    createOnMiss: false,
    path: '/pages/p1',
  })
  const second = await loadTextAsset('assets/sandbox-data-ab.json', 'null', {
    createOnMiss: false,
    path: '/pages/p1',
  })
  assert.equal(first.text, 'null')
  assert.equal(second.text, 'null')
  assert.equal(calls.length, 1)
})

test('save retries 409 with the server etag', async () => {
  let puts = 0
  mockFetch((_url, init) => {
    if (init?.method === 'PUT') {
      puts += 1
      if (puts === 1) return { status: 409, etag: 'etag-3', json: { etag: 'etag-3' } }
      return { status: 200, etag: 'etag-4' }
    }
    return { status: 200, etag: 'etag-3' }
  })
  const etag = await saveTextAsset('sandbox-ab.jsx', 'next', '', { path: '/pages/p1' })
  assert.equal(etag, 'etag-4')
  assert.equal(puts, 2)
})
