import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { TAG_TONES, tagTone } from './tag-chip.tsx'

test('tagTone is stable and stays in the shared palette', () => {
  assert.equal(tagTone('dp'), tagTone('dp'))
  assert.equal(TAG_TONES.includes(tagTone('动态规划') as (typeof TAG_TONES)[number]), true)
  assert.notEqual(tagTone('dp'), tagTone('graph'))
})

test('TagChip ships the tinted chip markup', () => {
  const src = readFileSync(resolve(import.meta.dirname, './tag-chip.tsx'), 'utf8')
  assert.match(src, /function TagChip/)
  assert.match(src, /className=\{\`biu-tag/)
  assert.match(src, /color-mix\(in srgb,var\(--biu-tag/)
  assert.match(src, /color:var\(--biu-color-text/)
  assert.match(src, /38%,transparent/)
  assert.match(src, /function tagTextColor/)
  assert.match(src, /icon\?: ReactNode/)
  assert.match(src, /biu-tag-icon/)
  assert.match(src, /TAG_TONE_ROSE/)
  assert.match(src, /TAG_TONE_BLUE/)
  assert.match(src, /TAG_TONE_ORANGE/)
  assert.match(src, /TAG_TONE_GREEN/)
  assert.match(src, /TAG_TONE_RED/)
  assert.equal(TAG_TONES.includes('var(--biu-color-ink-pink)' as (typeof TAG_TONES)[number]), true)
  assert.equal(TAG_TONES.includes('var(--biu-color-ink-blue)' as (typeof TAG_TONES)[number]), true)
  assert.equal(TAG_TONES.includes('var(--biu-color-ink-orange)' as (typeof TAG_TONES)[number]), true)
  assert.equal(TAG_TONES.includes('var(--biu-color-ink-green)' as (typeof TAG_TONES)[number]), true)
  assert.equal(TAG_TONES.includes('var(--biu-color-ink-red)' as (typeof TAG_TONES)[number]), true)
})
