import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

const root = resolve(import.meta.dirname, '../../../..')

test('composer model menu is a nested Fast / effort / model pop', () => {
  const menu = readFileSync(resolve(import.meta.dirname, './composer-model-menu.tsx'), 'utf8')
  const composer = readFileSync(resolve(import.meta.dirname, './composer.tsx'), 'utf8')
  const css = readFileSync(resolve(root, 'web/style.css'), 'utf8')
  assert.match(composer, /ComposerModelMenu/)
  assert.doesNotMatch(composer, /composer-model-modes/)
  assert.match(menu, /composer-model-panel/)
  assert.match(menu, /composer-model-flyout/)
  assert.match(menu, /composer-model-switch/)
  assert.match(menu, />Fast</)
  assert.match(menu, />力度</)
  assert.match(menu, />模型</)
  assert.match(menu, /添加模型/)
  assert.match(menu, /placeholder="搜索模型"/)
  assert.match(css, /\.composer-model-pop\s*\{/)
  assert.match(css, /\.composer-model-switch\.is-on/)
  assert.match(css, /\.composer-model-add-models/)
})
