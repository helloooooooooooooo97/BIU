import { test } from 'vitest'
import assert from 'node:assert/strict'
import { BANNER_PRESETS, BANNER_STYLE_IDS, isBannerPreset, presetsOf } from './banner-presets.ts'

test('banner presets cover four styles in static and live kinds', () => {
  const ids = new Set<string>()
  for (const item of BANNER_PRESETS) {
    assert.equal(ids.has(item.id), false, item.id)
    ids.add(item.id)
    assert.ok(item.title.trim())
    assert.ok(item.note.trim().length >= 4)
    assert.ok(item.html.includes(item.title) || item.html.length > 80)
  }
  for (const style of BANNER_STYLE_IDS) {
    const still = presetsOf('html').filter((item) => item.style === style)
    const moving = presetsOf('htmlframe').filter((item) => item.style === style)
    assert.ok(still.length >= 8, style)
    assert.ok(moving.length >= 4, style)
  }
  assert.ok(BANNER_PRESETS.some((item) => item.id === 'us-cranbrook'))
  assert.ok(BANNER_PRESETS.some((item) => item.id === 'eu-weingart'))
  assert.ok(BANNER_PRESETS.some((item) => item.id === 'jp-hara'))
  assert.ok(BANNER_PRESETS.some((item) => item.id === 'cn-steiner'))
  const sample = BANNER_PRESETS[0]!
  assert.equal(isBannerPreset({ kind: sample.kind, html: sample.html }), true)
  assert.equal(isBannerPreset({ kind: 'html', html: '<div>custom</div>' }), false)
  assert.match(sample.html, /max-height:100%/)
  assert.match(sample.html, /-webkit-line-clamp:2/)
})
