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
