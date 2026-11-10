import { test } from 'vitest'
import assert from 'node:assert/strict'
import { getPagePresentMode, isPageBuiltinMode, isPageCustomView, isPageSourceMode, setPagePresentMode, setPageSourceMode, togglePageSourceMode } from './source-mode.ts'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

test('source mode is off until toggled for that record', () => {
  setPageSourceMode('home', false)
  assert.equal(isPageSourceMode('home'), false)
  togglePageSourceMode('home')
  assert.equal(isPageSourceMode('home'), true)
  togglePageSourceMode('home')
  assert.equal(isPageSourceMode('home'), false)
  togglePageSourceMode('other')
  assert.equal(isPageSourceMode('home'), false)
  assert.equal(isPageSourceMode('other'), true)
})

test('present mode keeps outline separate from source', () => {
  setPagePresentMode('page-a', 'outline')
  assert.equal(getPagePresentMode('page-a'), 'outline')
  assert.equal(isPageSourceMode('page-a'), false)
  setPagePresentMode('page-a', 'table')
  assert.equal(getPagePresentMode('page-a'), 'table')
  assert.equal(isPageSourceMode('page-a'), false)
  setPagePresentMode('page-a', 'source')
  assert.equal(isPageSourceMode('page-a'), true)
})

test('custom sandbox view id is not a builtin present mode', () => {
  assert.equal(isPageBuiltinMode('doc'), true)
  assert.equal(isPageBuiltinMode('hidden'), true)
  assert.equal(isPageCustomView('site1'), true)
  assert.equal(isPageCustomView('table'), false)
  assert.equal(isPageCustomView('hidden'), false)
})

test('hidden present mode is stored and default remains doc', () => {
  assert.equal(getPagePresentMode('page-hidden-default'), 'doc')
  setPagePresentMode('page-hidden', 'hidden')
  assert.equal(getPagePresentMode('page-hidden'), 'hidden')
  assert.equal(JSON.parse(localStorage.getItem('biu.page.present') || '{}')['page-hidden'], 'hidden')
})

test('present mode survives a fresh read from storage', () => {
  localStorage.removeItem('biu.page.present')
  setPagePresentMode('page-keep', 'site1')
  assert.equal(JSON.parse(localStorage.getItem('biu.page.present') || '{}')['page-keep'], 'site1')
  assert.equal(getPagePresentMode('page-keep-reopen'), 'doc')
  localStorage.setItem('biu.page.present', JSON.stringify({ 'page-keep-reopen': 'outline' }))
  assert.equal(getPagePresentMode('page-keep-reopen'), 'outline')
})

test('switching present mode captures page scroll before paint', () => {
  const src = readFileSync(resolve(import.meta.dirname, './source-mode.ts'), 'utf8')
  assert.match(src, /capturePageScroll\(\)/)
})
