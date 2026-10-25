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

test('page block playground UIs use ReUI tokens instead of hardcoded light-theme colors', () => {
  const files = [
    'page-toc/web/index.tsx',
    'api-playground/web/index.tsx',
    'option-matrix/web/index.tsx',
    'page-regression/web/index.tsx',
    'plugin-doctor/web/index.tsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(sandbox, file), 'utf8')
    assert.match(src, /from '\.\/reui'/, `${file} should import local ReUI kit`)
    assert.doesNotMatch(src, /from '@biu\/biu-ui'/, `${file} should not import @biu/biu-ui`)
    assert.doesNotMatch(src, /#9ec1ff/, `${file} should not hardcode send-button blue`)
  }
})

test('reui page blocks vendor ./reui rather than injecting STYLE_CSS or using BiuUi', () => {
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
    assert.match(src, /from '\.\/reui'/, `${file} should import local ReUI kit`)
    assert.doesNotMatch(src, /from '@biu\/biu-ui'/, `${file} should not import host BiuUi`)
    assert.doesNotMatch(src, /const STYLE_CSS = `/, `${file} should not inject STYLE_CSS`)
  }
})
