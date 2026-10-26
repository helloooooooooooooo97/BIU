import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { parseDeck, patchSlide } from '../../../../.plugin-dev/page-deck/web/model.ts'

test('deck plugin registers a basic slash block', async () => {
  const src = await readFile(resolve(import.meta.dirname, '../../../../.plugin-dev/page-deck/web/index.tsx'), 'utf8')
  assert.match(src, /kind: 'deck'/)
  assert.match(src, /plugin: name/)
  assert.match(src, /blockType: 'basic'/)
  assert.match(src, /data-testid="deck-focus-toggle"/)
  assert.match(src, /requestFullscreen/)
  assert.match(src, /from '@biu\/reui'/)
  assert.doesNotMatch(src, /from '@biu\/biu-ui'/)
})

test('empty deck data paints five layout presets', () => {
  const deck = parseDeck({})
  assert.deepEqual(deck.slides.map((slide) => slide.layout), ['title', 'split', 'hero', 'trio', 'stack'])
  const next = patchSlide(deck, deck.slides[0]!.id, { layout: 'trio' })
  assert.equal(next.slides[0]?.cells.length, 3)
})
