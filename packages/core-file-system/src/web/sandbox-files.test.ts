import { afterEach, test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { createSandboxDocsApi, createSandboxFilesApi, sandboxAssetName } from './sandbox-files.ts'

afterEach(() => {
  vi.unstubAllGlobals()
})

test('sandboxAssetName reads hashed db file hrefs', () => {
  assert.equal(sandboxAssetName('/api/db/file/ab.md'), 'ab.md')
  assert.equal(sandboxAssetName('/api/db/file/ab.md?download=x'), 'ab.md')
  assert.equal(sandboxAssetName('ab.md'), 'ab.md')
})

test('sandbox files read and write go through db file APIs', async () => {
  const calls: Array<{ url: string; method?: string }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, method: init?.method })
      if (String(init?.method ?? 'GET').toUpperCase() === 'PUT') {
        return new Response(JSON.stringify({ name: 'hash.md', href: '/api/db/file/hash.md' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response('hello md', { status: 200, headers: { 'content-type': 'text/plain' } })
    }),
  )
  const files = createSandboxFilesApi(() => '/pages/p1')
  assert.equal(await files.read('/api/db/file/hash.md'), 'hello md')
  const written = await files.upload(new File(['# hi'], '规划.md', { type: 'text/markdown' }))
  assert.equal(written.name, '规划.md')
  assert.equal(written.href, '/api/db/file/hash.md')
  assert.match(calls.find((item) => item.method === 'PUT')?.url ?? '', /\/api\/db\/file\/hash\//)
  assert.equal(files.list({ name: '规划.md', href: '/api/db/file/hash.md' })[0]?.name, '规划.md')
  assert.equal('write' in files, false)
})

test('sandbox docs write overwrites a named file', async () => {
  const calls: Array<{ url: string; method?: string }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo, init?: RequestInit) => {
      const url = String(input)
      calls.push({ url, method: init?.method })
      if (String(init?.method ?? 'GET').toUpperCase() === 'PUT') {
        return new Response(JSON.stringify({ name: 'doc-p1-稿.md', href: '/api/db/file/doc-p1-稿.md' }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      return new Response('old', { status: 200, headers: { 'content-type': 'text/plain', etag: '"abc"' } })
    }),
  )
  const docs = createSandboxDocsApi(() => '/pages/p1')
  assert.equal(await docs.read('/api/db/file/doc-p1-稿.md'), 'old')
  await docs.write('/api/db/file/doc-p1-稿.md', '# next')
  const put = calls.find((item) => item.method === 'PUT')
  assert.match(put?.url ?? '', /\/api\/db\/file\/doc-p1/)
  assert.doesNotMatch(put?.url ?? '', /\/api\/db\/file\/hash\//)
  const uploaded = await docs.upload(new File(['# hi'], '规划.md', { type: 'text/markdown' }), { fieldKey: '文档', recordId: 'p1' })
  assert.equal(uploaded.name, '规划.md')
  assert.match(uploaded.href, /\/api\/db\/file\//)
})
