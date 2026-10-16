import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { inspectLocalShellSource, resourceKind } from './page-perf/cdp.mjs'
import { builtinAllViewId, databaseRecordPath, databaseViewPath } from './page-perf/discover-routes.mjs'
import { stressInteractSource } from './page-perf/interact.mjs'

const dir = join(dirname(fileURLToPath(import.meta.url)), 'page-perf')
const names = [
  'cdp.mjs',
  'console-errors.mjs',
  'discover-routes.mjs',
  'interact.mjs',
  'measure-page.mjs',
  'measure-routes.mjs',
  'seed-local.mjs',
  'snapshot-plugins.mjs',
]

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
  assert.match(sources['measure-routes.mjs'], /from '\.\/discover-routes\.mjs'/)
  assert.match(sources['measure-routes.mjs'], /from '\.\/interact\.mjs'/)
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
  assert.match(sources['seed-local.mjs'], /BIU_PERF_SESSIONS/)
  assert.match(sources['seed-local.mjs'], /BIU_PERF_SKILLS/)
  assert.match(sources['seed-local.mjs'], /3000/)
  assert.match(sources['seed-local.mjs'], /压测百行/)
  assert.match(sources['seed-local.mjs'], /压测块页/)
  assert.match(sources['discover-routes.mjs'], /builtin-all:/)
  assert.match(sources['discover-routes.mjs'], /session-debug/)
  assert.match(sources['discover-routes.mjs'], /record-from-view/)
  assert.match(sources['discover-routes.mjs'], /builtin-member/)
  assert.match(sources['interact.mjs'], /下一页/)
  assert.match(sources['interact.mjs'], /tasks-search/)
  assert.match(sources['interact.mjs'], /tasks-tree-toggle/)
})

test('resourceKind splits snapshot, list, and store web.js', () => {
  assert.equal(resourceKind('http://127.0.0.1:3151/api/snapshot'), 'snapshot')
  assert.equal(resourceKind('http://127.0.0.1:3151/api/db/list?path=/pages'), 'db-list')
  assert.equal(resourceKind('http://127.0.0.1:3151/api/plugin-store/files/page-toc/web.js?v=abc'), 'plugin-web')
  assert.equal(resourceKind('http://127.0.0.1:5174/packages/core-chat/src/web/index.ts'), 'module')
  assert.match(inspectLocalShellSource(), /data-testid="app-shell"/)
  assert.match(inspectLocalShellSource(), /tableRows/)
  assert.match(inspectLocalShellSource(), /chatTurns/)
  assert.match(stressInteractSource(), /下一页/)
})

test('discover-routes covers every local-space URL shape', () => {
  assert.equal(builtinAllViewId('/pages'), 'builtin-all:/pages')
  assert.equal(databaseViewPath('/tasks', 'builtin-all:/tasks'), '/database/tasks/view/builtin-all%3A%2Ftasks')
  assert.equal(
    databaseRecordPath('/pages', 'p000', '1792'),
    '/database/pages/view/1792/record/p000',
  )
  const collections = [
    '/facets',
    '/mcp',
    '/notices',
    '/page-blocks',
    '/pages',
    '/plugins',
    '/sessions',
    '/skills',
    '/tasks',
    '/trash',
    '/views',
    '/workspace-members',
  ]
  const source = readFileSync(join(dir, 'discover-routes.mjs'), 'utf8')
  assert.match(source, /kind: 'home'/)
  assert.match(source, /kind: 'database'/)
  assert.match(source, /\/debug/)
  for (const path of collections) {
    assert.equal(builtinAllViewId(path).startsWith('builtin-all:'), true)
  }
})
