import { test } from 'vitest'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '../../../../')

function ignored(rel: string) {
  try {
    execFileSync('git', ['check-ignore', '-q', '--no-index', rel], { cwd: root, stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

test('compiled js beside package sources is ignored; grok-bot js stays tracked', () => {
  assert.equal(ignored('packages/core-file-system/src/web/browser.js'), true)
  assert.equal(ignored('packages/core-editor/src/web/index.js.map'), true)
  assert.equal(ignored('.plugin-dev/page-html-blocks/web.js'), true)
  assert.equal(ignored('.plugin-dev/fs-task-rows/node_modules/foo/index.js'), true)
  assert.equal(ignored('public/grok-bot/src/character.js'), false)
  assert.equal(ignored('.plugin/page-html-blocks/web.js'), true)
})
