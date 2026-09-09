import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  bindHtmlSlide,
  collectHtmlSlides,
  htmlDeckEnabled,
  htmlDeckIndex,
  htmlDeckKeyAction,
  stepHtmlDeck,
} from '../../../../.plugin-dev/page-html-blocks/html-deck.ts'

test('collects html and htmlframe slides in document order', () => {
  const editor = document.createElement('div')
  editor.className = 'tiptap'
  const a = document.createElement('div')
  a.setAttribute('data-page-block', 'html')
  const skip = document.createElement('div')
  skip.setAttribute('data-page-block', 'excalidraw')
  const b = document.createElement('div')
  b.setAttribute('data-page-block', 'htmlframe')
  const c = document.createElement('div')
  c.setAttribute('data-page-block', 'html')
  editor.append(a, skip, b, c)
  document.body.append(editor)
  bindHtmlSlide(a, { kind: 'html', html: '<div>一</div>' })
  bindHtmlSlide(b, { kind: 'htmlframe', html: '<div>二</div>', height: 300 })
  bindHtmlSlide(c, { kind: 'html', html: '<div>三</div>' })
  const slides = collectHtmlSlides(a)
  assert.equal(slides.length, 3)
  assert.equal(slides[0]?.html.includes('一'), true)
  assert.equal(slides[1]?.kind, 'htmlframe')
  assert.equal(slides[2]?.html.includes('三'), true)
  assert.equal(htmlDeckIndex(slides, b), 1)
  bindHtmlSlide(c, { kind: 'html', html: '<div>三</div>', deck: false })
  assert.equal(collectHtmlSlides(a).length, 2)
  assert.equal(htmlDeckEnabled(undefined), true)
  assert.equal(htmlDeckEnabled(false), false)
  bindHtmlSlide(a, null)
  bindHtmlSlide(b, null)
  bindHtmlSlide(c, null)
  editor.remove()
})

test('stepHtmlDeck stays on the last slide', () => {
  assert.equal(stepHtmlDeck(0, -1, 4), 0)
  assert.equal(stepHtmlDeck(0, 1, 4), 1)
  assert.equal(stepHtmlDeck(3, 1, 4), 3)
  assert.equal(stepHtmlDeck(2, 1, 4), 3)
})

test('fullscreen deck centers a slide that is smaller than the viewport', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, '../../../../.plugin-dev/page-html-blocks/web.tsx'), 'utf8')
  assert.match(src, /data-testid="html-deck-stage"/)
  assert.match(src, /alignItems: 'safe center'/)
  assert.match(src, /justifyContent: 'safe center'/)
  assert.match(src, /data-testid="html-deck-slide"/)
  assert.doesNotMatch(src, /justifyContent: 'stretch'/)
})

test('arrow keys drive the deck', () => {
  assert.equal(htmlDeckKeyAction('ArrowRight'), 1)
  assert.equal(htmlDeckKeyAction('ArrowLeft'), -1)
  assert.equal(htmlDeckKeyAction('ArrowDown'), 1)
  assert.equal(htmlDeckKeyAction('ArrowUp'), -1)
  assert.equal(htmlDeckKeyAction('Escape'), 'close')
  assert.equal(htmlDeckKeyAction('Home'), 'first')
  assert.equal(htmlDeckKeyAction('End'), 'last')
  assert.equal(htmlDeckKeyAction('a'), null)
})
