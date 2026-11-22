import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('page and tag do not register a special view catalog host', () => {
  const index = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  const bar = readFileSync(resolve(import.meta.dirname, './record-detail-bar.tsx'), 'utf8')
  const editor = readFileSync(resolve(import.meta.dirname, './record-editor.tsx'), 'utf8')
  assert.doesNotMatch(index, /bindPageViewCatalogHost/)
  assert.doesNotMatch(index, /registerViewCatalogHost/)
  assert.doesNotMatch(bar, /pageRecord/)
  assert.doesNotMatch(bar, /tagRecord/)
  assert.doesNotMatch(bar, /loadTagViews/)
  assert.doesNotMatch(bar, /loadPageViews/)
  assert.doesNotMatch(editor, /TagRecordSandbox/)
  assert.doesNotMatch(editor, /useTagViews/)
  assert.doesNotMatch(editor, /usePageViews/)
  assert.doesNotMatch(editor, /getPagePresentMode/)
  assert.doesNotMatch(bar, /getPagePresentMode/)
  assert.doesNotMatch(bar, /getActivePageLayout/)
  assert.doesNotMatch(index, /PageProperties/)
  assert.doesNotMatch(index, /PagePropHostView/)
})
