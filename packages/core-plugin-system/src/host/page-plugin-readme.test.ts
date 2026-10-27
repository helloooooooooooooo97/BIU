import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')
const sandbox = join(root, '.plugin-dev')

test('page-sandbox store listing is Sandbox, not HTML', () => {
  const manifest = JSON.parse(readFileSync(join(sandbox, 'page-sandbox', 'manifest.json'), 'utf8')) as {
    id: string
    name: string
  }
  assert.equal(manifest.id, 'page-sandbox')
  assert.equal(manifest.name, 'Sandbox')
})

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
    assert.match(src, /from '@biu\/reui'/, `${file} should import host ReUI`)
    assert.doesNotMatch(src, /from '@biu\/biu-ui'/, `${file} should not import @biu/biu-ui`)
    assert.doesNotMatch(src, /#9ec1ff/, `${file} should not hardcode send-button blue`)
  }
})

test('page plugin READMEs use live :::pageBlock fences, not wrapped in markdown code fences', () => {
  const ids = [
    'api-playground',
    'english-lab',
    'fitness-tracker',
    'option-matrix',
    'page-algorithm',
    'page-browser',
    'page-code-runner',
    'page-excalidraw',
    'page-html-blocks',
    'page-sandbox',
    'page-regression',
    'page-terminal',
    'page-toc',
    'page-video',
    'plugin-doctor',
  ]
  for (const id of ids) {
    const src = readFileSync(join(sandbox, id, 'README.md'), 'utf8')
    assert.match(src, /示例写法/, `${id} README should include 示例写法`)
    const live = src.replace(/```[\s\S]*?```/g, '')
    assert.match(
      live,
      new RegExp(`:::pageBlock \\{kind=\\S+ plugin=${id}(?:[\\s}])`),
      `${id} README must use :::pageBlock {plugin=${id}} as live markdown, not inside a code fence`,
    )
    assert.doesNotMatch(
      src,
      /```[^\n]*\n:::pageBlock/,
      `${id} README must not wrap :::pageBlock in an outer code fence`,
    )
  }
})

test('reui page blocks import @biu/reui rather than injecting STYLE_CSS or using BiuUi', () => {
  const files = [
    'page-toc/web/index.tsx',
    'api-playground/web/index.tsx',
    'option-matrix/web/index.tsx',
    'page-regression/web/index.tsx',
    'plugin-doctor/web/index.tsx',
    'fitness-tracker/web/index.tsx',
    'page-algorithm/web/index.tsx',
    'english-lab/web/index.tsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(sandbox, file), 'utf8')
    assert.match(src, /from '@biu\/reui'/, `${file} should import host ReUI`)
    assert.doesNotMatch(src, /from '@biu\/biu-ui'/, `${file} should not import host BiuUi`)
    assert.doesNotMatch(src, /from '\.\/reui'/, `${file} should not vendor a local reui copy`)
    assert.doesNotMatch(src, /const STYLE_CSS = `/, `${file} should not inject STYLE_CSS`)
  }
})
