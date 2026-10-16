import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectLocalShellSource, resourceKind } from './page-perf/cdp.mjs'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'page-perf')
const names = ['cdp.mjs', 'console-errors.mjs', 'measure-page.mjs', 'measure-routes.mjs', 'seed-local.mjs', 'snapshot-plugins.mjs']

test('page plugin perf helpers stay as separate scripts in one folder', () => {
  const found = readdirSync(dir).filter((name) => name.endsWith('.mjs')).sort()
  assert.deepEqual(found, names)
  const sources = Object.fromEntries(names.map((name) => [name, readFileSync(join(dir, name), 'utf8')]))
  assert.match(sources['cdp.mjs'], /export async function openPageSession/)
  assert.match(sources['cdp.mjs'], /export function inspectLocalShellSource/)
  assert.match(sources['cdp.mjs'], /export function resourceKind/)
  assert.match(sources['measure-page.mjs'], /from '\.\/cdp\.mjs'/)
  assert.match(sources['console-errors.mjs'], /from '\.\/cdp\.mjs'/)
  assert.match(sources['snapshot-plugins.mjs'], /from '\.\/cdp\.mjs'/)
  assert.match(sources['measure-routes.mjs'], /from '\.\/cdp\.mjs'/)
  assert.match(sources['seed-local.mjs'], /from '\.\/cdp\.mjs'/)
  assert.doesNotMatch(Object.values(sources).join('\n'), /8cbf03ae2ea7a65571fc66be30598028bcf34976df4c53c2/)
  assert.match(sources['cdp.mjs'], /BIU_PERF_TOKEN/)
  assert.match(sources['cdp.mjs'], /BIU_PERF_WORKSPACE/)
  assert.match(sources['seed-local.mjs'], /\/api\/db\/create/)
  assert.match(sources['measure-routes.mjs'], /\/database/)
  assert.match(sources['measure-routes.mjs'], /plugin-web-serial/)
  assert.match(sources['measure-routes.mjs'], /inspectLocalShellSource/)
  assert.match(sources['measure-routes.mjs'], /BIU_PERF_ONLY/)
  assert.match(sources['seed-local.mjs'], /BIU_PERF_PAGES/)
})

test('resourceKind splits snapshot, list, and store web.js', () => {
  assert.equal(resourceKind('http://127.0.0.1:3151/api/snapshot'), 'snapshot')
  assert.equal(resourceKind('http://127.0.0.1:3151/api/db/list?path=/pages'), 'db-list')
  assert.equal(resourceKind('http://127.0.0.1:3151/api/plugin-store/files/page-toc/web.js?v=abc'), 'plugin-web')
  assert.equal(resourceKind('http://127.0.0.1:5174/packages/core-chat/src/web/index.ts'), 'module')
  assert.match(inspectLocalShellSource(), /data-testid="app-shell"/)
})
