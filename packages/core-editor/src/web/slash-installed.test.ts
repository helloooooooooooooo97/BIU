/** @vitest-environment jsdom */
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Editor } from '@tiptap/core'
import { Context } from 'cordis'
import { pageEditorExtensions } from './kit.ts'
import { activateSlashBlock, filterSlashItems, SLASH_ITEMS } from './slash.ts'
import { ENABLE_PAGE_BLOCK_PLUGIN, setPageBlockPluginPhase } from './page-block-meta.ts'
import { PageEditorService } from './service.ts'
import {
  INSTALLED_PAGE_BLOCK_TYPE,
  installedPageBlocksFromRows,
  pluginRecordPath,
  reloadSlashCatalogFromStorage,
  rememberSlashBlock,
  resetSlashCatalog,
  setInstalledPageBlocks,
} from './slash-memory.ts'

function cleanup(plugin: string) {
  setPageBlockPluginPhase(plugin, 'idle')
  resetSlashCatalog()
}

test('empty install catalog keeps built-in slash items only', () => {
  resetSlashCatalog()
  assert.equal(filterSlashItems('').length, SLASH_ITEMS.length)
})

test('installedPageBlocksFromRows keeps tagged page plugins and drops the rest', () => {
  const rows = installedPageBlocksFromRows([
    { id: 'page-toc', title: '目录', installed: true, hasWeb: true, headless: true, tags: ['page', 'editor'], enabled: false, running: false },
    { id: 'headless-tool', title: '体检壳', installed: true, hasWeb: true, headless: true, tags: ['dev'] },
    { id: 'arena-rogue', title: 'Arena', installed: true, hasWeb: true, tags: ['game'] },
    { id: 'sandbox-only', name: '沙箱', sandbox: true, hasWeb: true, headless: true, tags: ['page'] },
    { id: 'no-web', title: '无页面', installed: true, headless: true, tags: ['page'] },
  ])
  assert.deepEqual(rows, [{ id: 'page-toc', label: '目录', hint: '' }])
})

test('installed page block appears in slash before it runs', () => {
  resetSlashCatalog()
  setInstalledPageBlocks([{ id: 'page-toc', label: '目录', hint: '大纲' }])
  const item = filterSlashItems('').find((entry) => entry.id === 'page-toc')
  assert.equal(item?.label, '目录')
  assert.equal(item?.pluginId, 'page-toc')
  assert.equal(item?.blockType, INSTALLED_PAGE_BLOCK_TYPE)
  assert.equal(item?.status, undefined)
  cleanup('page-toc')
})

test('picking an installed placeholder starts the plugin and inserts the block', async () => {
  resetSlashCatalog()
  setInstalledPageBlocks([{ id: 'page-toc', label: '目录', hint: '大纲' }])
  const ctx = new Context()
  new PageEditorService(ctx)
  let fiber: { dispose: () => Promise<void> } | undefined
  const onEnable = () => {
    fiber = ctx.plugin({
      name: 'toc',
      inject: ['pageEditor'],
      apply(inner) {
        inner.pageEditor.registerBlock({
          kind: 'toc',
          plugin: 'page-toc',
          label: '目录',
          defaults: { title: '大纲' },
          View: () => null,
        })
      },
    })
  }
  window.addEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '/',
    contentType: 'markdown',
  })
  const from = editor.state.selection.from - 1
  const range = { from: Math.max(1, from), to: editor.state.selection.from }
  try {
    await activateSlashBlock(editor, range, 'page-toc')
    const md = editor.getMarkdown()
    assert.match(md, /:::pageBlock \{kind=toc plugin=page-toc id=[a-z0-9]+\}/)
    assert.match(md, /大纲/)
  } finally {
    window.removeEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
    editor.destroy()
    await fiber?.dispose()
    cleanup('page-toc')
  }
})

test('failed start keeps the slash item and points at the plugin record', async () => {
  resetSlashCatalog()
  setInstalledPageBlocks([{ id: 'page-toc', label: '目录', hint: '大纲' }])
  const ctx = new Context()
  new PageEditorService(ctx)
  const onEnable = () => setPageBlockPluginPhase('page-toc', 'failed')
  window.addEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
  const editor = new Editor({
    extensions: pageEditorExtensions(),
    content: '/',
    contentType: 'markdown',
  })
  const from = editor.state.selection.from - 1
  const range = { from: Math.max(1, from), to: editor.state.selection.from }
  try {
    await activateSlashBlock(editor, range, 'page-toc')
    assert.equal(editor.getJSON().content?.some((node) => node.type === 'pageBlock'), false)
    const item = filterSlashItems('').find((entry) => entry.id === 'page-toc')
    assert.equal(item?.status, 'failed')
    assert.equal(item?.pluginHref, pluginRecordPath('page-toc'))
    assert.equal(item?.pluginHref, '/database/plugins/record/page-toc')
  } finally {
    window.removeEventListener(ENABLE_PAGE_BLOCK_PLUGIN, onEnable)
    editor.destroy()
    cleanup('page-toc')
  }
})

test('cold start shows last registered page block without a live view', () => {
  resetSlashCatalog()
  setInstalledPageBlocks([{ id: 'page-toc', label: '目录', hint: '大纲' }])
  rememberSlashBlock({
    kind: 'toc',
    plugin: 'page-toc',
    label: '目录',
    hint: '大纲',
    aliases: ['toc'],
    blockType: 'toc',
    blockTypeLabel: '目录',
  })
  reloadSlashCatalogFromStorage()
  const item = filterSlashItems('').find((entry) => entry.id === 'toc')
  assert.equal(item?.label, '目录')
  assert.equal(item?.pluginId, 'page-toc')
  assert.equal(item?.id, 'toc')
  cleanup('page-toc')
})

test('confirmed remembered blocks stay after the live view unmounts', async () => {
  resetSlashCatalog()
  setInstalledPageBlocks([{ id: 'page-algorithm', label: '算法题', hint: '' }])
  const ctx = new Context()
  new PageEditorService(ctx)
  const fiber = ctx.plugin({
    name: 'algo',
    inject: ['pageEditor'],
    apply(inner) {
      inner.pageEditor.registerBlock({
        kind: 'algorithm',
        plugin: 'page-algorithm',
        label: '算法题',
        aliases: ['leetcode'],
        View: () => null,
      })
    },
  })
  await fiber
  await fiber.dispose()
  assert.equal(filterSlashItems('leetcode').some((entry) => entry.id === 'algorithm'), true)
  cleanup('page-algorithm')
})
