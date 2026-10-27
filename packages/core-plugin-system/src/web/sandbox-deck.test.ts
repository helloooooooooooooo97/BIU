import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  bindSandboxSlide,
  collectSandboxSlides,
  cssBoxSize,
  sandboxDeckEnabled,
  sandboxDeckIndex,
  sandboxDeckKeyAction,
  sandboxLooksFillLayout,
  SANDBOX_FILL_HOST_PX,
  stepSandboxDeck,
} from '../../../../.plugin-dev/page-sandbox/web/sandbox-deck.ts'

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
  bindSandboxSlide(a, { kind: 'sandbox', source: 'export default function A(){return <div>一</div>}' })
  bindSandboxSlide(b, { kind: 'sandbox', source: 'export default function B(){return <div>二</div>}', height: 300 })
  bindSandboxSlide(c, { kind: 'sandbox', source: 'export default function C(){return <div>三</div>}' })
  const slides = collectSandboxSlides(a)
  assert.equal(slides.length, 3)
  assert.equal(slides[0]?.source.includes('一'), true)
  assert.equal(slides[1]?.kind, 'sandbox')
  assert.equal(slides[2]?.source.includes('三'), true)
  assert.equal(sandboxDeckIndex(slides, b), 1)
  bindSandboxSlide(c, { kind: 'sandbox', source: 'export default function C(){return <div>三</div>}', deck: false })
  assert.equal(collectSandboxSlides(a).length, 2)
  assert.equal(sandboxDeckEnabled(undefined), true)
  assert.equal(sandboxDeckEnabled(false), false)
  bindSandboxSlide(a, null)
  bindSandboxSlide(b, null)
  bindSandboxSlide(c, null)
  editor.remove()
})

test('stepSandboxDeck stays on the last slide', () => {
  assert.equal(stepSandboxDeck(0, -1, 4), 0)
  assert.equal(stepSandboxDeck(0, 1, 4), 1)
  assert.equal(stepSandboxDeck(3, 1, 4), 3)
  assert.equal(stepSandboxDeck(2, 1, 4), 3)
})

test('fullscreen deck fills the viewport', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, '../../../../.plugin-dev/page-sandbox/web/index.tsx'), 'utf8')
  assert.match(src, /data-testid="sandbox-deck-stage"/)
  assert.match(src, /data-testid="sandbox-deck-slide"/)
  assert.match(src, /index >= total - 1 \? \{ opacity: 0\.35/)
  assert.match(src, /root\.requestFullscreen/)
  assert.match(src, /document.documentElement/)
  assert.match(src, /maxWidth: 'none'/)
  assert.match(src, /sandbox-deck-slide"\]>\*/)
  assert.match(src, /max-width:none!important/)
  assert.doesNotMatch(src, /alignItems: 'safe center'/)
  assert.doesNotMatch(src, /justifyContent: 'safe center'/)
  assert.doesNotMatch(src, /min\(100%, 960px\)/)
  assert.doesNotMatch(src, /padding: 32/)
})

test('poster source with height 100% and absolute children fills a host', () => {
  const magazine = `<div style="min-height:100%;height:100%;display:flex"><p>刊</p></div>`
  const poster = `<div style="height:100%;overflow:hidden;position:relative"><div style="position:absolute">初番</div><div style="position:absolute">二番</div><div style="position:absolute">三番</div></div>`
  assert.equal(sandboxLooksFillLayout(magazine), false)
  assert.equal(sandboxLooksFillLayout(poster), true)
  assert.equal(SANDBOX_FILL_HOST_PX, 280)
})

test('jsx sandbox mounts a react root and flushes before pick stamping', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, '../../../../.plugin-dev/page-sandbox/web/sandbox.ts'), 'utf8')
  assert.match(src, /flushSync/)
  assert.match(src, /data-sandbox-root/)
  assert.doesNotMatch(src, /host-context\(html\.pick-mode\)/)
})

test('sandbox compile accepts jsx and rejects imports', async () => {
  const { compileSandboxSource } = await import('../../../../.plugin-dev/page-sandbox/shared/compile.ts')
  assert.equal(compileSandboxSource('<div class="x">ok</div>').ok, false)
  assert.equal(compileSandboxSource('require("fs")\nexport default function App(){return <div/>}').ok, false)
  assert.equal(
    compileSandboxSource('export default function App() { return <div style={{ color: "var(--biu-color-text)" }}>ok</div> }').ok,
    true,
  )
})

test('arrow keys drive the deck', () => {
  assert.equal(sandboxDeckKeyAction('ArrowRight'), 1)
  assert.equal(sandboxDeckKeyAction('ArrowLeft'), -1)
  assert.equal(sandboxDeckKeyAction('ArrowDown'), 1)
  assert.equal(sandboxDeckKeyAction('ArrowUp'), -1)
  assert.equal(sandboxDeckKeyAction('Escape'), 'close')
  assert.equal(sandboxDeckKeyAction('Home'), 'first')
  assert.equal(sandboxDeckKeyAction('End'), 'last')
  assert.equal(sandboxDeckKeyAction('a'), null)
})
