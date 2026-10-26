import { test } from 'vitest'
import assert from 'node:assert/strict'
import { fitCells, parseDeck, patchSlide, stepDeck, demoSlides } from './model.ts'

test('parseDeck seeds demo layouts when empty', () => {
  const deck = parseDeck({})
  assert.equal(deck.slides.length, 5)
  assert.deepEqual(deck.slides.map((slide) => slide.layout), ['title', 'split', 'hero', 'trio', 'stack'])
})

test('switching layout keeps leading cells and pads the rest', () => {
  const deck = parseDeck({ slides: demoSlides() })
  const slide = deck.slides[1]!
  const next = patchSlide(deck, slide.id, { layout: 'trio' })
  const hit = next.slides.find((item) => item.id === slide.id)
  assert.equal(hit?.layout, 'trio')
  assert.equal(hit?.cells.length, 3)
  assert.equal(hit?.cells[0]?.text, slide.cells[0]?.text)
})

test('fitCells never exceeds the layout slot count', () => {
  const cells = fitCells(
    [
      { id: 'a', kind: 'text', text: '1' },
      { id: 'b', kind: 'text', text: '2' },
      { id: 'c', kind: 'text', text: '3' },
      { id: 'd', kind: 'text', text: '4' },
    ],
    'split',
  )
  assert.equal(cells.length, 2)
  assert.equal(cells[0]?.id, 'a')
})

test('stepDeck clamps', () => {
  assert.equal(stepDeck(0, -1, 5), 0)
  assert.equal(stepDeck(4, 1, 5), 4)
  assert.equal(stepDeck(2, 1, 5), 3)
})
