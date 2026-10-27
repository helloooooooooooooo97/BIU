import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  bindHtmlSlide,
  collectHtmlSlides,
  cssBoxSize,
  htmlDeckEnabled,
  htmlDeckIndex,
  htmlDeckKeyAction,
  htmlLooksFillLayout,
  HTML_FILL_HOST_PX,
  stepHtmlDeck,
} from '../../../../.plugin-dev/page-sandbox/web/html-deck.ts'

test('cssBoxSize turns numbers into px and keeps css units', () => {
  assert.equal(cssBoxSize(320), '320px')
  assert.equal(cssBoxSize('100%'), '100%')
  assert.equal(cssBoxSize('100vh'), '100vh')
  assert.equal(cssBoxSize(undefined), undefined)
})

test('collects sandbox slides in document order', () => {
  const editor = document.createElement('div')
  editor.className = 'tiptap'
  const a = document.createElement('div')
  a.setAttribute('data-page-block', 'sandbox')
  const skip = document.createElement('div')
  skip.setAttribute('data-page-block', 'excalidraw')
  const b = document.createElement('div')
  b.setAttribute('data-page-block', 'sandbox')
  const c = document.createElement('div')
  c.setAttribute('data-page-block', 'sandbox')
  editor.append(a, skip, b, c)
  document.body.append(editor)
  bindHtmlSlide(a, { kind: 'sandbox', html: '<div>一</div>' })
  bindHtmlSlide(b, { kind: 'sandbox', html: '<div>二</div>', height: 300 })
  bindHtmlSlide(c, { kind: 'sandbox', html: '<div>三</div>' })
  const slides = collectHtmlSlides(a)
  assert.equal(slides.length, 3)
  assert.equal(slides[0]?.html.includes('一'), true)
  assert.equal(slides[1]?.kind, 'sandbox')
  assert.equal(slides[2]?.html.includes('三'), true)
  assert.equal(htmlDeckIndex(slides, b), 1)
  bindHtmlSlide(c, { kind: 'sandbox', html: '<div>三</div>', deck: false })
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

test('fullscreen deck fills the viewport', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, '../../../../.plugin-dev/page-sandbox/web/index.tsx'), 'utf8')
  assert.match(src, /data-testid="html-deck-stage"/)
  assert.match(src, /data-testid="html-deck-slide"/)
  assert.match(src, /index >= total - 1 \? \{ opacity: 0\.35/)
  assert.match(src, /root\.requestFullscreen/)
  assert.match(src, /document.documentElement/)
  assert.match(src, /maxWidth: 'none'/)
  assert.match(src, /html-deck-slide"\]>\*/)
  assert.match(src, /max-width:none!important/)
  assert.doesNotMatch(src, /alignItems: 'safe center'/)
  assert.doesNotMatch(src, /justifyContent: 'safe center'/)
  assert.doesNotMatch(src, /min\(100%, 960px\)/)
  assert.doesNotMatch(src, /padding: 32/)
})

test('poster html with height 100% and absolute children fills a host', () => {
  const magazine = `<div style="min-height:100%;height:100%;display:flex"><p>刊</p></div>`
  const poster = `<div style="height:100%;overflow:hidden;position:relative"><div style="position:absolute">初番</div><div style="position:absolute">二番</div><div style="position:absolute">三番</div></div>`
  assert.equal(htmlLooksFillLayout(magazine), false)
  assert.equal(htmlLooksFillLayout(poster), true)
  assert.equal(HTML_FILL_HOST_PX, 280)
})

test('jsx sandbox mounts a react root and flushes before pick stamping', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, '../../../../.plugin-dev/page-sandbox/web/sandbox.ts'), 'utf8')
  assert.match(src, /flushSync/)
  assert.match(src, /data-html-react-root/)
  assert.doesNotMatch(src, /host-context\(html\.pick-mode\)/)
})

test('html block compile accepts markup and rejects bad scripts', async () => {
  const { compileHtmlSource } = await import('../../../../.plugin-dev/page-sandbox/shared/compile.ts')
  assert.deepEqual(compileHtmlSource('<div class="x">ok</div>'), { ok: true, mode: 'markup' })
  assert.equal(compileHtmlSource('<script>require("fs")</script>').ok, false)
  assert.equal(
    compileHtmlSource('export default function App() { return <div style={{ color: "var(--biu-color-text)" }}>ok</div> }').ok,
    true,
  )
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
