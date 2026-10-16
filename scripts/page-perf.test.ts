import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'page-perf')

test('page plugin perf helpers stay as separate scripts in one folder', () => {
  const names = readdirSync(dir).filter((name) => name.endsWith('.mjs')).sort()
  assert.deepEqual(names, ['cdp.mjs', 'console-errors.mjs', 'measure-page.mjs', 'snapshot-plugins.mjs'])
  const cdp = readFileSync(join(dir, 'cdp.mjs'), 'utf8')
  const measure = readFileSync(join(dir, 'measure-page.mjs'), 'utf8')
  const consoleErrors = readFileSync(join(dir, 'console-errors.mjs'), 'utf8')
  const snapshot = readFileSync(join(dir, 'snapshot-plugins.mjs'), 'utf8')
  assert.match(cdp, /export async function openPageSession/)
  assert.match(measure, /from '\.\/cdp\.mjs'/)
  assert.match(consoleErrors, /from '\.\/cdp\.mjs'/)
  assert.match(snapshot, /from '\.\/cdp\.mjs'/)
  assert.doesNotMatch(cdp + measure + consoleErrors + snapshot, /8cbf03ae2ea7a65571fc66be30598028bcf34976df4c53c2/)
  assert.match(cdp, /BIU_PERF_TOKEN/)
  assert.match(cdp, /BIU_PERF_WORKSPACE/)
})
