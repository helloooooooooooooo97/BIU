import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Context, Service } from 'cordis'
import {
  type CollectionChrome,
  type CollectionViewType,
  type DatabaseUi,
  type FsDetailTools,
  type FsRecordContentView,
} from '@biu/type-file-system/ui'
import { PageBlockContent } from './page-blocks-view.tsx'
import * as pageUi from './index.ts'

class FakeDatabaseUi extends Service implements DatabaseUi {
  paths: string[] = []
  registered: Array<{ path: string; id: string; label: string; plugin?: string }> = []
  constructor(ctx: Context) {
    super(ctx, 'databaseUi')
  }
  decorate(path: string, chrome: CollectionChrome) {
    this.paths.push(path)
    assert.equal(path, '/editor-blocks')
    assert.equal(chrome.Content, PageBlockContent)
    return { dispose() {} }
  }
  registerView(path: string, view: CollectionViewType) {
    this.registered.push({ path, id: view.id, label: view.label, plugin: view.plugin })
    return { dispose() {} }
  }
  registerRowView() {
    return { dispose() {} }
  }
  registerContentView(_path: string, _view: FsRecordContentView) {
    return { dispose() {} }
  }
  registerDetailTools(_path: string, _tools: FsDetailTools) {
    return { dispose() {} }
  }
  chrome() {
    return {}
  }
  views() {
    return []
  }
  rowViews() {
    return []
  }
  contentViews() {
    return []
  }
  detailTools() {
    return {}
  }
  subscribe() {
    return () => undefined
  }
}

test('page web owns /editor-blocks chrome, not the default record editor', async () => {
  assert.equal(pageUi.name, 'page-ui')
  const ctx = new Context()
  const ui = new FakeDatabaseUi(ctx)
  await ctx.plugin(pageUi)
  assert.deepEqual(ui.paths, ['/editor-blocks'])
  assert.deepEqual(ui.registered, [{ path: '/editor-blocks', id: 'blocks', label: '组件', plugin: 'page-ui' }])
  const src = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  assert.doesNotMatch(src, /RecordEditor/)
  assert.doesNotMatch(src, /ui\.decorate\('\/pages'/)
})
