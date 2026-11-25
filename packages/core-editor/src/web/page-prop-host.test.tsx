import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { PAGE_EDITOR_STYLE } from './style.ts'

test('pages chrome uses the default RecordProperties host instead of a page-only Properties layer', () => {
  const src = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  assert.doesNotMatch(src, /decorate\('\/pages', \{ Properties: PageProperties \}\)/)
  assert.doesNotMatch(src, /PageProperties/)
  assert.doesNotMatch(src, /page-prop-host/)
})

test('property sandbox nav tools use the same muted icon color as page chrome', () => {
  assert.match(
    PAGE_EDITOR_STYLE,
    /\.page-block-expand-nav \.page-slide-icon,.page-block-expand-nav \.layout-picker-btn\{[^}]*display:grid/,
  )
  assert.match(
    PAGE_EDITOR_STYLE,
    /\.page-block-expand-nav \.page-slide-icon,.page-block-expand-nav \.layout-picker-btn\{[^}]*place-items:center/,
  )
  assert.match(
    PAGE_EDITOR_STYLE,
    /\.page-block-expand-nav \.page-slide-icon,.page-block-expand-nav \.layout-picker-btn\{[^}]*line-height:0/,
  )
  assert.match(
    PAGE_EDITOR_STYLE,
    /\.page-block-expand-nav \.page-slide-icon,.page-block-expand-nav \.layout-picker-btn\{[^}]*color:var\(--biu-color-icon\)/,
  )
  assert.match(PAGE_EDITOR_STYLE, /\.page-block-expand-nav \.page-slide-icon:hover/)
  assert.match(PAGE_EDITOR_STYLE, /\.page-block-expand-nav \.page-slide-icon\.is-on/)
})
