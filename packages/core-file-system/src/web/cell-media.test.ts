import { afterEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { assetDownloadHref, recordResourcePath, uploadDbAsset } from './cell-media.tsx'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('asset download href keeps the original filename on db files', () => {
  assert.equal(
    assetDownloadHref('/api/db/file/ab.md', '规划.md'),
    '/api/db/file/ab.md?download=%E8%A7%84%E5%88%92.md',
  )
  assert.equal(assetDownloadHref('https://cdn.example/notes.pdf', '规划.md'), 'https://cdn.example/notes.pdf')
})

test('record resource path joins collection and record id', () => {
  assert.equal(recordResourcePath('/pages', 'p001'), '/pages/p001')
  assert.equal(recordResourcePath('/pages/p001', 'p001'), '/pages/p001')
  assert.equal(recordResourcePath('/pages/', 'p001'), '/pages/p001')
})

test('uploadDbAsset PUTs hash file with the record path', async () => {
  const calls: Array<{ url: string; headers: Record<string, string> }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
      return new Response(JSON.stringify({ name: 'ab.png', href: '/api/db/file/ab.png' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
  const written = await uploadDbAsset(new File([new Uint8Array([1, 2])], 'notes.pdf', { type: 'application/pdf' }), '/pages/p001')
  assert.equal(written.href, '/api/db/file/ab.png')
  assert.match(calls[0]?.url ?? '', /\/api\/db\/file\/hash\//)
  assert.match(calls[0]?.url ?? '', /path=%2Fpages%2Fp001/)
  assert.equal(calls[0]?.headers['x-biu-resource-path'], '/pages/p001')
})

test('uploadDbAsset refuses to upload without a record path', async () => {
  await assert.rejects(() => uploadDbAsset(new File(['x'], 'a.txt'), ''), /resource path required/)
})
