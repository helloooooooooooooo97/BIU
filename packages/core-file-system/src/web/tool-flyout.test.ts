import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('toolbar flyouts share one fsdb-tool-flyout shell', () => {
  const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
  const start = css.indexOf('/* 工具浮窗外壳 */')
  assert.ok(start >= 0)
  const block = css.slice(start)
  const shell = block.match(/\.fsdb-tool-flyout,[^{]+\{[^}]+\}/)
  assert.ok(shell)
  const rule = shell[0]
  for (const name of [
    'tasks-viewdd-menu',
    'tasks-sort-menu',
    'tasks-filter-menu',
    'fsdb-col-menu',
    'fsdb-bulk-menu',
    'fsdb-col-facet-flyout',
    'fsdb-layout-menu',
  ]) {
    assert.match(rule, new RegExp(name))
  }
  assert.match(rule, /border-radius:10px/)
  assert.doesNotMatch(rule, /border-radius:(6|7|8)px/)
  assert.match(rule, /padding:8px/)
  assert.doesNotMatch(rule, /padding:(6|12)px/)
  assert.match(rule, /box-shadow:var\(--biu-shadow-md\)/)
  assert.match(rule, /max-height:min\(70vh,520px\)/)
  assert.match(block, /prefers-reduced-motion/)
  assert.match(block, /\.fsdb-tool-flyout \.db-search-menu/)
  assert.match(block, /box-shadow:none/)
  assert.match(block, /\.fsdb-tool-flyout \.tasks-sort-search/)
  assert.match(block, /background:transparent/)

  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const views = readFileSync(resolve(import.meta.dirname, './view-order-menu.tsx'), 'utf8')
  const menus = readFileSync(resolve(import.meta.dirname, './query-menus.tsx'), 'utf8')
  const columns = readFileSync(resolve(import.meta.dirname, './column-order-menu.tsx'), 'utf8')
  const layout = readFileSync(resolve(import.meta.dirname, './layout-prefs-menu.tsx'), 'utf8')
  const search = readFileSync(resolve(import.meta.dirname, './flyout-search.tsx'), 'utf8')
  assert.match(search, /fsdb-tool-flyout \$\{className\}/)
  assert.match(views, /<SearchableFlyout className="tasks-viewdd-menu">/)
  assert.match(css, /\.fsdb-tool-flyout \.tasks-viewdd-item-name\{[^}]*font-weight:var\(--biu-font-weight-medium,500\)/)
  assert.match(css, /\.fsdb-checkrow-label\{[^}]*font-weight:var\(--biu-font-weight-medium\)/)
  assert.match(css, /\.fsdb-mode-plus\{[^}]*font-weight:var\(--biu-font-weight-medium\)/)
  assert.match(css, /\.fsdb-layout-opt\{[^}]*font-weight:var\(--biu-font-weight-medium\)/)
  assert.match(block, /font-weight:var\(--biu-font-weight-medium,500\)/)
  assert.match(block, /\.fsdb-tool-flyout button/)
  assert.match(views, /tasks-viewdd-item-name font-medium/)
  assert.match(views, /tasks-viewdd-saveas fsdb-tool-row font-medium/)
  assert.match(search, /tasks-sort-search font-medium/)
  assert.match(menus, /fsdb-tool-flyout fsdb-query-menu/)
  assert.match(columns, /fsdb-col-facet-flyout fsdb-tool-flyout/)
  assert.match(layout, /fsdb-tool-flyout fsdb-layout-menu/)
  assert.match(browser, /fsdb-tool-flyout fsdb-bulk-menu/)
  assert.match(readFileSync(resolve(import.meta.dirname, './controls.tsx'), 'utf8'), /fsdb-checkrow fsdb-tool-row/)
})
