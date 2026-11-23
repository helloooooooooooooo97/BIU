import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { assetNamesFromBlock } from '@biu/type-file-system'

test('core-file-system registers a database page block that persists views in an attachment JSON file', () => {
  const indexSrc = readFileSync(resolve(import.meta.dirname, './index.tsx'), 'utf8')
  assert.match(indexSrc, /kind: 'database'/)
  assert.match(indexSrc, /label: '数据库'/)
  assert.match(indexSrc, /assets: \['file'\]/)
  assert.match(indexSrc, /LazyDatabaseBlockView/)

  const blockSrc = readFileSync(resolve(import.meta.dirname, './database-block.tsx'), 'utf8')
  assert.match(blockSrc, /externalViews=\{externalViews\}/)
  assert.match(blockSrc, /saveJsonAsset/)
  assert.match(blockSrc, /loadJsonAsset/)

  const browserSrc = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  assert.match(browserSrc, /hasExternalViews/)

  const cssSrc = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(cssSrc, /\.fsdb-page-db-block \.fsdb-page \.fsdb-main > \.tasks-toolbar\{[^}]*padding-left:0/)

  const assets = assetNamesFromBlock('database', 'core-file-system-ui', {
    collection: '/data',
    file: 'assets/database-ab12cd34.json',
  })
  assert.equal(assets.has('database-ab12cd34.json'), true)
})
