import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context, Service } from 'cordis'
import { DEFAULT_CHROME_PATH, type CollectionChrome, type CollectionViewType, type DatabaseUi } from '@biu/type-file-system/ui'
import * as editorUi from './index.ts'
import { PageEditor } from './page-editor.tsx'

class FakeDatabaseUi extends Service implements DatabaseUi {
  paths: string[] = []
  constructor(ctx: Context) {
    super(ctx, 'databaseUi')
  }
  decorate(path: string, chrome: CollectionChrome) {
    this.paths.push(path)
    assert.equal(chrome.Content, PageEditor)
    assert.ok(chrome.DetailTools)
    return { dispose() {} }
  }
  registerView(_path: string, _view: CollectionViewType) {
    return { dispose() {} }
  }
  chrome() {
    return {}
  }
  views() {
    return []
  }
  subscribe() {
    return () => undefined
  }
}

test('core-editor paints Content as the default for every file body, not a path allowlist', async () => {
  const ctx = new Context()
  const ui = new FakeDatabaseUi(ctx)
  await ctx.plugin(editorUi)
  assert.deepEqual(ui.paths, [DEFAULT_CHROME_PATH])
  assert.ok(ctx.pageEditor)
})
