/** @vitest-environment jsdom */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  ENABLE_PAGE_BLOCK_PLUGIN,
  pageBlockPluginFromEvent,
  pluginRecordHref,
} from './page-block-plugin.ts'

test('page block enable href is the plugin record, not guessed from kind', () => {
  assert.equal(pluginRecordHref('page-excalidraw'), '/database/plugins/record/page-excalidraw')
  assert.equal(
    pageBlockPluginFromEvent(new CustomEvent(ENABLE_PAGE_BLOCK_PLUGIN, { detail: { plugin: 'page-excalidraw', kind: 'excalidraw' } })),
    'page-excalidraw',
  )
})

test('enabling a page block starts the plugin and stays on the page', () => {
  const src = readFileSync(resolve(import.meta.dirname, './page-block-plugin.ts'), 'utf8')
  const listen = src.slice(src.indexOf('export function listenEnablePageBlockPlugin'))
  assert.match(listen, /startStorePlugin\(plugin\)/)
  assert.match(listen, /reportPhase\(plugin, 'ready'\)/)
  assert.match(listen, /reportPhase\(plugin, 'failed'\)/)
  assert.doesNotMatch(listen, /pushState/)
  assert.doesNotMatch(listen, /pluginRecordHref/)
})
