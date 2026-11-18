import { test } from 'vitest'
import assert from 'node:assert/strict'
import { isPageBuiltinMode, isPageCustomView, pageOutlineFolded, togglePageOutlineFold } from './source-mode.ts'
import { getRecordViewCatalog, patchRecordViewCatalog } from '@biu/core-file-system/record-view-catalog'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('builtin content ids are shared, sandbox ids are not', () => {
  assert.equal(isPageBuiltinMode('doc'), true)
  assert.equal(isPageBuiltinMode('hidden'), true)
  assert.equal(isPageCustomView('site1'), true)
  assert.equal(isPageCustomView('table'), false)
  assert.equal(isPageCustomView('hidden'), false)
})

test('content view lives on the record catalog for any collection', () => {
  patchRecordViewCatalog('/tags', 'need', { contentViewId: 'outline' })
  assert.equal(getRecordViewCatalog('/tags', 'need').contentViewId, 'outline')
  patchRecordViewCatalog('/pages', 'home', { contentViewId: 'source' })
  assert.equal(getRecordViewCatalog('/pages', 'home').contentViewId, 'source')
  assert.equal(getRecordViewCatalog('/tags', 'need').contentViewId, 'outline')
})

test('outline fold is per record and does not store present mode', () => {
  togglePageOutlineFold('home', 'b1')
  assert.equal(pageOutlineFolded('home').has('b1'), true)
  assert.equal(pageOutlineFolded('other').has('b1'), false)
  const src = readFileSync(resolve(import.meta.dirname, './source-mode.ts'), 'utf8')
  assert.doesNotMatch(src, /getPagePresentMode/)
  assert.doesNotMatch(src, /\/pages/)
})
