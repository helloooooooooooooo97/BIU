import { describe, expect, it, test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { supportsScrollDrivenProgress } from './page-read.ts'
import { stickyHeadOffset } from './sticky-toolbar.ts'

test('sticky head offset is whole pixels and ignores sub-pixel chatter', () => {
  assert.equal(stickyHeadOffset(120.4, 40.2, 800, 32), 80)
  assert.equal(stickyHeadOffset(120, 119.4, 800, 32), 1)
  assert.equal(stickyHeadOffset(120, 120.2, 800, 32), 0)
})

test('toolbar scrolling leaves the header position to the anchored portal', () => {
  const src = readFileSync(resolve(import.meta.dirname, './sticky-toolbar.ts'), 'utf8')
  assert.doesNotMatch(src, /translateY|writePin|pinCollectionHead/)
  assert.match(src, /requestAnimationFrame/)
  assert.doesNotMatch(src, /querySelector\('\.fsdb-bulk-slot'\)/)
  assert.doesNotMatch(src, /--fsdb-bulk-shift/)
})

describe('sticky toolbar reading progress bar', () => {
  it('uses GPU transform scaleX and native CSS Scroll-Driven Animation with JS fallback guarded by supportsScrollDrivenProgress', () => {
    const css = readFileSync(resolve(import.meta.dirname, './fsdb-style.ts'), 'utf8')
    const fsSticky = readFileSync(resolve(import.meta.dirname, './sticky-toolbar.ts'), 'utf8')
    const edSticky = readFileSync(resolve(import.meta.dirname, '../../../core-editor/src/web/sticky-toolbar.ts'), 'utf8')

    // Uses compositor-only transform: scaleX instead of background-size linear-gradient repaint
    expect(css).toContain('@keyframes fsdb-page-read{from{transform:scaleX(0)}to{transform:scaleX(1)}}')
    expect(css).toContain('transform:scaleX(var(--page-read,0))')
    expect(css).not.toContain('calc(var(--page-read,0)*100%)')

    // Native CSS Scroll-Driven Animation binds to .fsdb-right-body
    expect(css).toContain('@supports (animation-timeline:scroll())')
    expect(css).toContain('scroll-timeline-name:--fsdb-page-read')
    expect(css).toContain('animation-timeline:--fsdb-page-read')

    // Both sticky-toolbar hooks skip JS scroll/ResizeObserver/MutationObserver when native CSS is supported
    expect(fsSticky).toContain('supportsScrollDrivenProgress()')
    expect(edSticky).toContain('supportsScrollDrivenProgress()')
    expect(typeof supportsScrollDrivenProgress()).toBe('boolean')
  })
})
