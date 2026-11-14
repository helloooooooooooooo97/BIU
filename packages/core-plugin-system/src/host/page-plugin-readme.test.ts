import { test } from 'vitest'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')
const sandbox = join(root, '.plugin-dev')

test('sandbox is a core page block, not a store plugin', () => {
  const src = readFileSync(join(root, 'packages/core-editor/src/web/sandbox/block.tsx'), 'utf8')
  assert.match(src, /export const name = 'page-sandbox'/)
  assert.match(src, /label: '沙箱'/)
  assert.match(src, /function registerSandboxBlock/)
  assert.equal(existsSync(join(sandbox, 'page-sandbox')), false)
})

test('page block playground UIs use ReUI tokens instead of hardcoded light-theme colors', () => {
  const files = [
    'page-toc/web/index.tsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(sandbox, file), 'utf8')
    assert.match(src, /from '@biu\/reui'/, `${file} should import host ReUI`)
    assert.doesNotMatch(src, /from '@biu\/biu-ui'/, `${file} should not import @biu/biu-ui`)
    assert.doesNotMatch(src, /#9ec1ff/, `${file} should not hardcode send-button blue`)
  }
})

test('page plugin READMEs use live :::editorBlock fences, not wrapped in markdown code fences', () => {
  const ids = [
    'page-algorithm',
    'page-browser',
    'page-code-runner',
    'page-excalidraw',
    'page-html-blocks',
    'page-terminal',
    'page-tag',
    'page-toc',
    'page-video',
  ]
  for (const id of ids) {
    const src = readFileSync(join(sandbox, id, 'README.md'), 'utf8')
    assert.match(src, /示例写法/, `${id} README should include 示例写法`)
    const live = src.replace(/```[\s\S]*?```/g, '')
    assert.match(
      live,
      new RegExp(`:::editorBlock \\{kind=\\S+ plugin=${id}(?:[\\s}])`),
      `${id} README must use :::editorBlock {plugin=${id}} as live markdown, not inside a code fence`,
    )
    assert.doesNotMatch(
      src,
      /```[^\n]*\n:::editorBlock/,
      `${id} README must not wrap :::editorBlock in an outer code fence`,
    )
  }
})

test('reui page blocks import @biu/reui rather than injecting STYLE_CSS or using BiuUi', () => {
  const files = [
    'page-toc/web/index.tsx',
    'page-algorithm/web/index.tsx',
  ]
  for (const file of files) {
    const src = readFileSync(join(sandbox, file), 'utf8')
    assert.match(src, /from '@biu\/reui'/, `${file} should import host ReUI`)
    assert.doesNotMatch(src, /from '@biu\/biu-ui'/, `${file} should not import host BiuUi`)
    assert.doesNotMatch(src, /from '\.\/reui'/, `${file} should not vendor a local reui copy`)
    assert.doesNotMatch(src, /const STYLE_CSS = `/, `${file} should not inject STYLE_CSS`)
  }
})
