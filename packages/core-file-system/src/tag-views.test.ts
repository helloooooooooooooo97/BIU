import { test } from 'vitest'
import assert from 'node:assert/strict'
import { compileHostSource } from './web/tag-host-compile.ts'
import { defaultContentSandboxSource, parseRecordSandboxes, recordSandboxFileNames } from '@biu/type-file-system/record-views'

test('tag sandboxes use the shared record catalog parser', () => {
  const views = parseRecordSandboxes([{ id: '8fdbc4f8', name: '卡', file: 'tag-view-need-8fdbc4f8.jsx' }])
  assert.equal(views.length, 1)
  assert.equal(views[0]?.dataFile, 'view-data-8fdbc4f8.json')
  assert.ok(recordSandboxFileNames({ views }).includes('tag-view-need-8fdbc4f8.jsx'))
})

test('default tag sandbox source is the filesystem content view template', () => {
  const src = defaultContentSandboxSource('动态规划')
  const compiled = compileHostSource(src)
  assert.equal(compiled.ok, true)
  assert.match(src, /内容视图 · 页面概览/)
  assert.match(src, /<Field name/)
  assert.match(src, /biu\.record\(\)/)
  assert.match(src, /biu\.files/)
})
