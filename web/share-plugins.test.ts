import { test } from 'vitest'
import assert from 'node:assert/strict'
import { sharePluginInjectOk, sharePluginModuleUrls, shareWebPluginOf } from './share-plugins.ts'

test('share plugin urls try packed share API then sandbox source', () => {
  const urls = sharePluginModuleUrls('tok', 'page-terminal', '123456')
  assert.equal(urls[0], '/api/share/tok/plugin/page-terminal/web.js?password=123456')
  assert.ok(urls.some((item) => item.includes('/.plugin-dev/page-terminal/web/index.tsx')))
})

test('share web plugin keeps blockEditor inject', () => {
  function apply() {}
  const plugin = shareWebPluginOf({
    name: 'page-terminal',
    inject: ['blockEditor'],
    apply,
    default: apply,
  }) as { name?: string; inject?: string[] }
  assert.equal(plugin.name, 'page-terminal')
  assert.deepEqual(plugin.inject, ['blockEditor'])
  assert.equal(sharePluginInjectOk(plugin.inject), true)
  assert.equal(sharePluginInjectOk(['blockEditor', 'databaseUi']), true)
  assert.equal(sharePluginInjectOk(['blockEditor', 'slots']), false)
})
