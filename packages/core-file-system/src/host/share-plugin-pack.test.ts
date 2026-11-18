import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { readSharePluginWebJs } from './share-plugin-pack.ts'

test('readSharePluginWebJs prefers packed web.js without requiring the plugin to be running', () => {
  const cwd = mkdtempSync(join(tmpdir(), 'share-web-'))
  mkdirSync(join(cwd, '.plugin', 'page-toc'), { recursive: true })
  writeFileSync(join(cwd, '.plugin', 'page-toc', 'web.js'), 'export const name = "page-toc"\n')
  assert.match(readSharePluginWebJs(cwd, 'page-toc') ?? '', /page-toc/)
  assert.equal(readSharePluginWebJs(cwd, 'missing-plugin'), null)
})
