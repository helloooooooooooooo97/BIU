import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '../../../..')

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
  assert.match(composer, /composer-model-flyout/)
  assert.match(css, /\.composer-model-pop\s*\{/)
  assert.match(css, /\.composer-model-flyout\s*\{[^}]*position:\s*fixed/)
  assert.match(css, /\.composer-model-flyout\s*\{[^}]*z-index:\s*240/)
  assert.match(css, /\.composer-model-flyout\s*\{[^}]*width:\s*200px/)
  assert.match(css, /\.composer-model-panel,\s*\n\.composer-model-flyout\s*\{[^}]*border:\s*1px solid/)
  assert.doesNotMatch(
    css,
    /\.composer-model-panel,\s*\n\.composer-model-flyout\s*\{[^}]*--dsw-shadow-lv2/,
  )
  assert.match(css, /\.composer-model-switch\.is-on/)
  assert.match(css, /\.composer-model-add-models/)
})
