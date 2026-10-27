import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { SLIDE_LAYOUT_PRESETS } from './slide-md.ts'
import { PAGE_EDITOR_STYLE } from './style.ts'

test('layout picker is a reusable popover, not slide-only chrome', () => {
  const src = readFileSync(resolve(import.meta.dirname, './layout-picker.tsx'), 'utf8')
  assert.match(src, /export function LayoutPicker/)
  assert.match(src, /export function LayoutGlyph/)
  assert.match(src, /HeadlessPopover/)
  assert.match(src, /data-testid="layout-picker"/)
  assert.equal(SLIDE_LAYOUT_PRESETS.some((item) => item.id === 'split' && item.columns.length === 2), true)
})

test('slide chrome has no filled card background and no pager copy', () => {
  assert.match(PAGE_EDITOR_STYLE, /\[data-slide\]\{[^}]*background:transparent/)
  assert.match(PAGE_EDITOR_STYLE, /\.page-slide-body\{[^}]*background:transparent/)
  assert.match(PAGE_EDITOR_STYLE, /\[data-slide-cell\]\{[^}]*background:transparent/)
  assert.doesNotMatch(PAGE_EDITOR_STYLE, /page-slide-nav|page-deck-nav/)
  const view = readFileSync(resolve(import.meta.dirname, './slide-view.tsx'), 'utf8')
  assert.doesNotMatch(view, /上一页|下一页|加一页/)
  assert.match(view, /LayoutPicker/)
})
