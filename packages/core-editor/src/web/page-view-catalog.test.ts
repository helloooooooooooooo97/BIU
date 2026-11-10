import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('page view catalog falls back to record JSON when the live store is empty', () => {
  const src = readFileSync(resolve(import.meta.dirname, './page-view-catalog.ts'), 'utf8')
  assert.match(src, /live\.length \? live : parsePageViews\(record\.views\)/)
  assert.match(src, /parsePagePropViews\(record\.propViews\)/)
  assert.match(src, /mergeListedLayouts\(parsePageLayouts\(record\.layouts\)\)/)
})
