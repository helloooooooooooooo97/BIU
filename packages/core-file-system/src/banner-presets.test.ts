import { test } from 'vitest'
import assert from 'node:assert/strict'
import { BANNER_PRESETS, BANNER_STYLE_IDS, isBannerPreset, presetsOf } from './banner-presets.ts'

test('banner presets cover four styles in static and live kinds', () => {
  for (const style of BANNER_STYLE_IDS) {
    assert.ok(presetsOf('html').some((item) => item.style === style))
    assert.ok(presetsOf('htmlframe').some((item) => item.style === style))
  }
  const sample = BANNER_PRESETS[0]!
  assert.equal(isBannerPreset({ kind: sample.kind, html: sample.html }), true)
  assert.equal(isBannerPreset({ kind: 'html', html: '<div>custom</div>' }), false)
})
