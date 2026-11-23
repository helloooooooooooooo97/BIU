import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

test('biu-ui fold uses grid 0fr to 1fr', () => {
  const src = readFileSync(resolve(import.meta.dirname, './sidebar-fold.tsx'), 'utf8')
  const css = readFileSync(resolve(import.meta.dirname, '../../../web/sidebar.css'), 'utf8')
  assert.match(src, /function SidebarFold/)
  assert.match(src, /className=\{\`sidebar-fold\$\{open \? ' is-open' : ''\}/)
  assert.match(src, /is-animating/)
  assert.match(src, /animate = true/)
  assert.match(src, /setAnimating\(animate\)/)
  assert.match(src, /openRef\.current !== open/)
  assert.match(css, /\.sidebar-chevron\.is-open\s*\{\s*transform:\s*rotate\(90deg\)/)
  assert.match(css, /@keyframes sidebar-expand-in/)
  assert.match(css, /transition:\s*transform 180ms cubic-bezier\(0\.22, 1, 0\.36, 1\), opacity 140ms ease/)
})

test('table groups and detail tags/properties share the sidebar fold transition curves', () => {
  const sidebarCss = readFileSync(resolve(import.meta.dirname, '../../../web/sidebar.css'), 'utf8')
  const fsdbCss = readFileSync(resolve(import.meta.dirname, '../../core-file-system/src/web/fsdb-style.ts'), 'utf8')
  const propRow = readFileSync(resolve(import.meta.dirname, '../../core-file-system/src/web/property-row.tsx'), 'utf8')
  const propHost = readFileSync(resolve(import.meta.dirname, '../../core-file-system/src/web/record-prop-host.tsx'), 'utf8')
  const rowTitle = readFileSync(resolve(import.meta.dirname, '../../core-file-system/src/web/browser-row-title.tsx'), 'utf8')
  const tablePaint = readFileSync(resolve(import.meta.dirname, '../../core-file-system/src/web/browser-table-paint.tsx'), 'utf8')
  const browser = readFileSync(resolve(import.meta.dirname, '../../core-file-system/src/web/browser.tsx'), 'utf8')

  assert.match(sidebarCss, /(?:^|\})\.sidebar-fold\s*\{\s*display:\s*grid;\s*grid-template-rows:\s*0fr;/)
  assert.match(propRow, /sidebar-chevron\$\{expanded \? ' is-open' : ''\}/)
  assert.match(propHost, /<SidebarFold open=\{!hidden\}>/)
  assert.match(rowTitle, /sidebar-chevron\$\{collapsed \? '' : ' is-open'\}/)
  assert.match(tablePaint, /sidebar-chevron\$\{folded \? '' : ' is-open'\}/)
  assert.match(browser, /function captureTableFoldSnapshot\(\)/)
  assert.match(fsdbCss, /\.fsdb-prop-tr\.is-tag-fold \.fsdb-schema-pack\{display:grid;grid-template-rows:0fr;transition:grid-template-rows 180ms cubic-bezier\(\.22,1,\.36,1\)\}/)
  assert.doesNotMatch(fsdbCss, /\.fsdb-prop-tr\.is-tag-fold:not\(\.is-open\) \.fsdb-schema-pack\{display:none\}/)
})
