import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSharePluginWebJs } from './share-plugin-pack.ts'

test('readSharePluginWebJs prefers packed web.js without requiring the plugin to be running', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'share-web-'))
  mkdirSync(join(cwd, '.plugin', 'page-sandbox'), { recursive: true })
  writeFileSync(join(cwd, '.plugin', 'page-sandbox', 'web.js'), 'export const name = "page-sandbox"\n')
  assert.match(readSharePluginWebJs(cwd, 'page-sandbox') ?? '', /page-sandbox/)
  assert.equal(readSharePluginWebJs(cwd, 'missing-plugin'), null)
})
