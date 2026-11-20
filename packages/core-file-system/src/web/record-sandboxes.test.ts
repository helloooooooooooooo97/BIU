import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, test, vi } from 'vitest'
import {
  applyRecordViewAssetChanged,
  peekRecordViewFile,
  putRecordViewFile,
  RecordViewFileConflictError,
  rememberRecordViewFile,
  resetRecordViewFileState,
} from './record-sandboxes.ts'

afterEach(() => {
  applyRecordViewAssetChanged({ name: 'prop-view-note-a.jsx', etag: 'other' })
})

test('sandbox files use the shared db file route', () => {
  const src = readFileSync(resolve(import.meta.dirname, './record-sandboxes.ts'), 'utf8')
  assert.match(src, /\/api\/db\/file/)
  assert.doesNotMatch(src, /\/api\/tag\/file/)
  assert.doesNotMatch(src, /\/api\/page\/file/)
  assert.doesNotMatch(src, /TAGS_COLLECTION_PATH/)
  assert.doesNotMatch(src, /PAGES_COLLECTION_PATH/)
})

test('agent asset-changed drops cached property sandbox jsx', () => {
  rememberRecordViewFile('/notes', 'n1', 'prop-view-note-a.jsx', 'old', 'etag-1')
  assert.equal(peekRecordViewFile('/notes', 'n1', 'prop-view-note-a.jsx'), 'old')
  assert.equal(
    applyRecordViewAssetChanged({ name: 'prop-view-note-a.jsx', etag: 'etag-2' }),
    true,
  )
  assert.equal(peekRecordViewFile('/notes', 'n1', 'prop-view-note-a.jsx'), undefined)
})

test('same etag from local put does not drop the cache', () => {
  rememberRecordViewFile('/notes', 'n1', 'prop-view-note-a.jsx', 'local', 'etag-1')
  assert.equal(
    applyRecordViewAssetChanged({ name: 'prop-view-note-a.jsx', etag: 'etag-1' }),
    false,
  )
  assert.equal(peekRecordViewFile('/notes', 'n1', 'prop-view-note-a.jsx'), 'local')
})

test('file cache evicts oldest entries beyond LRU limit', () => {
  resetRecordViewFileState()
  for (let i = 0; i < 205; i += 1) {
    rememberRecordViewFile('/notes', `n${i}`, `view-${i}.jsx`, `code-${i}`)
  }
  assert.equal(peekRecordViewFile('/notes', 'n0', 'view-0.jsx'), undefined)
  assert.equal(peekRecordViewFile('/notes', 'n204', 'view-204.jsx'), 'code-204')
  resetRecordViewFileState()
})

test('putRecordViewFile throws RecordViewFileConflictError when onConflict is throw', async () => {
  resetRecordViewFileState()
  rememberRecordViewFile('/notes', 'n1', 'data.json', '{"a":1}', 'etag-old')
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response('conflict', { status: 409, headers: { etag: '"etag-new"' } })),
  )
  await assert.rejects(
    () => putRecordViewFile('/notes', 'n1', 'data.json', '{"a":2}', 'application/json', { onConflict: 'throw' }),
    (err: unknown) => err instanceof RecordViewFileConflictError && err.status === 409 && err.etag === 'etag-new',
  )
  vi.unstubAllGlobals()
  resetRecordViewFileState()
})
