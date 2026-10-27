import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { placeComposerModelFlyout } from './composer-model-menu.tsx'

const root = resolve(import.meta.dirname, '../../../..')

test('model flyout opens left when the panel sits on the right edge', () => {
  const box = placeComposerModelFlyout({ left: 1100, right: 1328, bottom: 700 }, 200, 1440, 800)
  assert.equal(box.left, 1100 - 6 - 200)
  assert.equal(box.bottom, 100)
})

test('model flyout opens right when there is room', () => {
  const box = placeComposerModelFlyout({ left: 40, right: 268, bottom: 700 }, 200, 1440, 800)
  assert.equal(box.left, 268 + 6)
})


test('composer model menu renders knobs from catalog, not hardcoded vendor rows', () => {
  const menu = readFileSync(resolve(import.meta.dirname, './composer-model-menu.tsx'), 'utf8')
  const catalog = readFileSync(resolve(import.meta.dirname, '../host/model-catalog.ts'), 'utf8')
  const composer = readFileSync(resolve(import.meta.dirname, './composer.tsx'), 'utf8')
  const css = readFileSync(resolve(root, 'web/style.css'), 'utf8')
  assert.match(composer, /ComposerModelMenu/)
  assert.doesNotMatch(composer, /composer-model-modes/)
  assert.match(menu, /modelKnobs\(capabilities\)/)
  assert.match(menu, /knob\.kind === 'toggle'/)
  assert.doesNotMatch(menu, />Fast</)
  assert.match(menu, />模型</)
  assert.match(menu, /添加模型/)
  assert.match(menu, /placeholder="搜索模型"/)
  assert.match(catalog, /label: '思考'/)
  assert.match(catalog, /label: '快'/)
  assert.match(catalog, /label: '力度'/)
  assert.match(catalog, /label: '上下文'/)
  assert.match(menu, /createPortal/)
  assert.match(menu, /placeComposerModelFlyout/)
  assert.match(composer, /composer-model-flyout/)
  assert.match(css, /\.composer-model-pop\s*\{/)
  assert.match(css, /\.composer-model-flyout\s*\{[^}]*position:\s*fixed/)
  assert.match(css, /\.composer-model-flyout\s*\{[^}]*z-index:\s*240/)
  assert.match(css, /\.composer-model-flyout\s*\{[^}]*width:\s*200px/)
  assert.match(css, /\.composer-model-panel,\s*\n\.composer-model-flyout\s*\{[^}]*border:\s*var\(--biu-stroke-width\) solid/)
  assert.match(css, /\.composer-model-panel,\s*\n\.composer-model-flyout\s*\{[^}]*background:\s*var\(--biu-color-bg-subtle\)/)
  assert.match(css, /html\.dark \.composer-model-panel,\s*\nhtml\.dark \.composer-model-flyout\s*\{[^}]*background:\s*#202020/)
  assert.match(
    css,
    /\.composer-model-panel,\s*\n\.composer-model-flyout\s*\{[^}]*box-shadow:\s*var\(--biu-shadow-md\)/,
  )
  assert.match(css, /\.composer-model-switch\.is-on/)
  assert.match(css, /\.composer-model-add-models/)
})
