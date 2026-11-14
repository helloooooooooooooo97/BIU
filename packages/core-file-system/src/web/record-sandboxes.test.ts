import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, test } from 'vitest'
import {
  applyRecordViewAssetChanged,
  peekRecordViewFile,
  rememberRecordViewFile,
} from './record-sandboxes.ts'

afterEach(() => {
  applyRecordViewAssetChanged({ name: 'prop-view-note-a.jsx', etag: 'other' })
})

test('sandbox files always use /api/db/file', () => {
  const src = readFileSync(resolve(import.meta.dirname, './record-sandboxes.ts'), 'utf8')
  assert.match(src, /\/api\/db\/file/)
  assert.doesNotMatch(src, /\/api\/page\/file/)
  assert.doesNotMatch(src, /\/api\/tag\/file/)
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
