import { test } from 'vitest'
import assert from 'node:assert/strict'
import { compileHostSource } from './web/tag-host-compile.ts'
import { defaultContentSandboxSource } from '@biu/type-file-system/record-views'
import { isTagViewDocName, parseTagViews, tagIdFromViewDocName, tagViewFileNames } from './tag-views.ts'

test('parseTagViews keeps sandbox catalog entries', () => {
  const views = parseTagViews([{ id: '8fdbc4f8', name: '卡', file: 'tag-view-need-8fdbc4f8.jsx' }])
  assert.equal(views.length, 1)
  assert.equal(views[0]?.dataFile, 'view-data-8fdbc4f8.json')
  assert.equal(isTagViewDocName('tag-view-need-8fdbc4f8.jsx'), true)
  assert.equal(tagIdFromViewDocName('tag-view-need-8fdbc4f8.jsx'), 'need')
  assert.equal(tagIdFromViewDocName('view-need-8fdbc4f8.jsx'), 'need')
  assert.equal(tagIdFromViewDocName('view-tag-9-0ae784c0.jsx'), 'tag-9')
  assert.equal(tagIdFromViewDocName('view-data-tag-9-0ae784c0.json'), 'tag-9')
  assert.equal(tagIdFromViewDocName('view-data-need-8fdbc4f8.json'), 'need')
  assert.equal(tagIdFromViewDocName('prop-view-need-8fdbc4f8.jsx'), 'need')
  assert.equal(tagIdFromViewDocName('prop-view-data-need-8fdbc4f8.json'), 'need')
  assert.equal(isTagViewDocName('view-need-8fdbc4f8.jsx'), true)
  assert.equal(isTagViewDocName('prop-view-need-8fdbc4f8.jsx'), true)
  assert.ok(tagViewFileNames({ id: 'need', views }).includes('tag-views-need.json'))
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
