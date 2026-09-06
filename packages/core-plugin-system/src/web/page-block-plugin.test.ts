/** @vitest-environment jsdom */
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
