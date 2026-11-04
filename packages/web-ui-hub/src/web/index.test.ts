import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Context } from 'cordis'
import * as slots from '@biu/web-slots'
import * as appModules from '@biu/web-app-modules'
import * as snapshot from '@biu/web-snapshot'
import * as sessionView from '@biu/web-session-view'
import * as projectView from '@biu/web-project-view'
import * as uiHub from './index.ts'
import {
  isRuntimeWebModule,
  isStoreWebPlugin,
  orderUiPlugins,
  pageRouteNeedsStoreWeb,
  runtimeWebModuleHref,
  runtimeWebPlugin,
  storeWebPluginRequested,
} from './index.ts'
import { uiPackageLoaders } from 'virtual:cordis-ui-loaders'

const Dummy = () => null

function plugin(id: string, enabled: boolean, web?: string) {
  return {
    id,
    name: id,
    layer: 'capability',
    blurb: '',
    inject: [] as string[],
    togglable: true,
    enabled,
    state: enabled ? 'active' : 'off',
    ...(web ? { web } : {}),
  }
}

test('store plugin web urls are runtime modules', () => {
  assert.equal(isRuntimeWebModule('/api/plugin-store/files/store-hello/web.js'), true)
  assert.equal(isRuntimeWebModule('@biu/core-task-system/web'), false)
})

test('runtime web href keeps snapshot code version instead of Date.now', () => {
  const href = runtimeWebModuleHref(
    '/api/plugin-store/files/page-toc/web.js?v=abc123&workspaceId=ws_1',
    'http://127.0.0.1:5174',
  )
  assert.equal(href, 'http://127.0.0.1:5174/api/plugin-store/files/page-toc/web.js?v=abc123&workspaceId=ws_1')
})

test('runtime web href only busts when the url has no version', () => {
  const href = runtimeWebModuleHref('/api/plugin-store/files/x/web.js', 'http://127.0.0.1:5174')
  assert.match(href, /^http:\/\/127\.0\.0\.1:5174\/api\/plugin-store\/files\/x\/web\.js\?v=\d+$/)
})

test('store web plugins are the packed store packages, not core ui', () => {
  assert.equal(
    isStoreWebPlugin({ packageName: 'store:page-toc', web: '/api/plugin-store/files/page-toc/web.js?v=1' }),
    true,
  )
  assert.equal(isStoreWebPlugin({ packageName: '@biu/core-chat', web: '@biu/core-chat/web' }), false)
  assert.equal(pageRouteNeedsStoreWeb('/database/pages/record/p000'), true)
  assert.equal(pageRouteNeedsStoreWeb('/database/tasks'), false)
  assert.equal(pageRouteNeedsStoreWeb('/'), false)
  assert.equal(storeWebPluginRequested({ id: 'page-toc', packageName: 'store:page-toc' }, ['page-toc']), true)
  assert.equal(storeWebPluginRequested({ id: 'page-excalidraw', packageName: 'store:page-excalidraw' }, ['page-toc']), false)
})

test('requested store page blocks mount without a click or size gate', () => {
  const src = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  assert.match(src, /storeWebPluginRequested\(row, storeWebRequested\)/)
  assert.match(src, /await mountRow\(row\)/)
  assert.doesNotMatch(src, /storeWebNeedsClick/)
  assert.doesNotMatch(src, /storeWebExceedsAutoLimit/)
  assert.doesNotMatch(src, /STORE_WEB_AUTO_MAX_BYTES/)
  assert.doesNotMatch(src, /phase: 'deferred'/)
  assert.doesNotMatch(src, /storeWebForced/)
})

test('runtimeWebPlugin keeps inject when default is apply', () => {
  function apply() {}
  const plugin = runtimeWebPlugin({
    name: 'page-excalidraw',
    inject: ['pageEditor'],
    apply,
    default: apply,
  }) as { name?: string; inject?: string[]; apply?: unknown }
  assert.equal(plugin.name, 'page-excalidraw')
  assert.deepEqual(plugin.inject, ['pageEditor'])
  assert.equal(plugin.apply, apply)
})

test('ui-hub unloads disabled plugins before importing new ones', async () => {
  const { readFile } = await import('node:fs/promises')
  const { resolve } = await import('node:path')
  const src = await readFile(resolve(import.meta.dirname, './index.ts'), 'utf8')
  const disposeAt = src.indexOf('await fiber.dispose()')
  const importAt = src.indexOf('resolvePlugin(row.id, row.web)')
  assert.ok(disposeAt > 0 && importAt > 0 && disposeAt < importAt)
  assert.match(src, /g\.React = React/)
  assert.match(src, /g\.ReactJSXRuntime/)
  assert.match(src, /g\.BiuUi = BiuUi/)
  assert.match(src, /g\.ReUI = ReUI/)
  assert.match(src, /biu:enable-page-block-plugin/)
  assert.match(src, /runtimeWebModuleHref/)
  assert.match(src, /setTimeout\(resolve, 0\)/)
  assert.match(src, /for \(const \[index, row\] of pendingStore\.entries\(\)\)/)
  assert.doesNotMatch(src, /Promise\.all\(\s*pendingStore/)
  assert.doesNotMatch(src, /imported\.entries/)
  assert.doesNotMatch(src, /fetch\(runtimeWebModuleHref/)
  assert.doesNotMatch(src, /storeWebNeedsClick/)
  assert.doesNotMatch(src, /storeWebExceedsAutoLimit/)
  assert.doesNotMatch(src, /phase: 'deferred'/)
  assert.match(src, /storeWebRequested\.add\(plugin\)/)
  assert.match(src, /storeWebPluginRequested\(row, storeWebRequested\)/)
  assert.match(src, /isStoreWebPlugin/)
})

test('session composer plugins mount before the file library and editor', () => {
  const ordered = orderUiPlugins([
    { id: 'core-editor' },
    { id: 'core-file-system' },
    { id: 'core-task-system' },
    { id: 'core-chat' },
    { id: 'core-pick' },
  ]).map((row) => row.id)
  assert.deepEqual(ordered, ['core-pick', 'core-chat', 'core-file-system', 'core-editor', 'core-task-system'])
})

test('ui-hub mounts configured ui packages including chat', async () => {
  const ctx = new Context()
  await ctx.plugin(slots)
  await ctx.plugin(appModules)
  await ctx.plugin(sessionView)
  await ctx.plugin(projectView)
  await ctx.plugin(snapshot)
  ctx.slots.fill('root', Dummy, {
    children: {
      stage: { kind: 'list' },
      demos: { kind: 'list' },
      dock: { kind: 'list' },
      project: { kind: 'single' },
      composer: { kind: 'single' },
      settings: { kind: 'list' },
      'app-modules': { kind: 'list' },
      'inspector-panels': { kind: 'list' },
      'header-tools': { kind: 'list' },
      'corner-tools': { kind: 'list' },
      'root-overlays': { kind: 'list' },
    },
  })
  const uiIds = Object.keys(uiPackageLoaders)
  assert.ok(uiIds.length >= 1, 'virtual loaders should come from cordis.plugins.json')
  const tasksUi = uiIds.find((id) => id.includes('core-task-system/web'))
  assert.ok(tasksUi, 'core-task-system-web loader missing')
  const chatUi = uiIds.find((id) => id === '@biu/core-chat/web' || id.includes('core-chat/web'))
  assert.ok(chatUi, `chat-ui loader missing in ${uiIds.join(',')}`)
  const base = ctx.snapshot.get()
  ctx.snapshot.get = () => ({
    ...base,
    plugins: [plugin('core-task-system', true, tasksUi), plugin('core-chat', true, chatUi)],
  })
  await ctx.plugin(uiHub)
  const deadline = Date.now() + 5000
  while (Date.now() < deadline && ctx.slots.list('composer').every((item) => item.id !== 'chat')) {
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
  assert.equal(ctx.slots.list('composer').some((item) => item.id === 'chat'), true)
})
