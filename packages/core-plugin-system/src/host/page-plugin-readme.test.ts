import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')
const sandbox = join(root, '.plugin-dev')

test('development page blocks register under the 测试 slash group', () => {
  const files = [
    'api-playground/web/index.tsx',
    'option-matrix/web/index.tsx',
    'page-regression/web/index.tsx',
    'plugin-doctor/web/index.tsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(sandbox, file), 'utf8')
    assert.match(src, /blockType:\s*'test'/, `${file} should use blockType test`)
    assert.match(src, /blockTypeLabel:\s*'测试'/, `${file} should use blockTypeLabel 测试`)
    assert.doesNotMatch(src, /blockType:\s*'(basic|api|dev)'/, `${file} should not use a separate slash group`)
  }
})

test('page block playground UIs use design tokens instead of hardcoded light-theme colors', () => {
  const files = [
    'page-toc/web/index.tsx',
    'api-playground/web/index.tsx',
    'option-matrix/web/index.tsx',
    'page-regression/web/index.tsx',
    'plugin-doctor/web/index.tsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(sandbox, file), 'utf8')
    assert.match(src, /(--dsw-border|border-dsw-border)/, `${file} should use dsw-border`)
    assert.match(src, /(--dsw-label|text-dsw-label)/, `${file} should use dsw-label`)
    assert.doesNotMatch(src, /background:\s*'?#fff/, `${file} should not hardcode white`)
    assert.doesNotMatch(src, /#9ec1ff/, `${file} should not hardcode send-button blue`)
  }
})

test('reui page blocks import @biu/biu-ui rather than injecting STYLE_CSS', () => {
  const files = [
    'page-toc/web/index.tsx',
    'api-playground/web/index.tsx',
    'option-matrix/web/index.tsx',
    'page-regression/web/index.tsx',
    'plugin-doctor/web/index.tsx',
    'fitness-tracker/web/index.tsx',
    'page-algorithm/web/index.tsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(sandbox, file), 'utf8')
    assert.match(src, /from '@biu\/biu-ui'/, `${file} should import ReUI host components`)
    assert.doesNotMatch(src, /const STYLE_CSS = `/, `${file} should not inject STYLE_CSS`)
  }
})
