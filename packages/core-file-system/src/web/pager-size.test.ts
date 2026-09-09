import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

const pager = readFileSync(resolve(import.meta.dirname, './pager-size.tsx'), 'utf8')
const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')

test('page-size menu is a local control, not CollectionBrowser state', () => {
  assert.match(browser, /<PagerSizeControl/)
  assert.match(browser, /onChange=\{setPageSize\}/)
  assert.doesNotMatch(browser, /pageSizeOpen/)
  assert.doesNotMatch(browser, /toggleMenu\('pageSize'\)/)
  assert.doesNotMatch(browser, /pageSizeMenuPos/)
  assert.match(pager, /HeadlessPopover/)
  assert.match(pager, /if \(next !== pageSize\) onChange\(next\)/)
})

test('pager next is disabled on the last page', () => {
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  assert.match(browser, /aria-label="下一页"/)
  assert.match(
    browser,
    /disabled=\{total <= 0 \|\| \(page \+ 1\) \* pageSize >= total \|\| \(items\.length > 0 && items\.length < pageSize\)\}/,
  )
  assert.match(css, /\.fsdb-page \.tasks-icon-btn:hover:not\(:disabled\)/)
  assert.match(css, /\.fsdb-pager \.tasks-icon-btn:disabled\{[^}]*opacity:\.4/)
  assert.match(css, /\.fsdb-detail-float-btn:disabled\{[^}]*opacity:\.35/)
})
