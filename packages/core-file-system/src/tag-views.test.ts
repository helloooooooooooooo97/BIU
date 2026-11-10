import { test } from 'vitest'
import assert from 'node:assert/strict'
import { compileHostSource } from './web/tag-host-compile.ts'
import { defaultTagSandboxSource, isTagViewDocName, parseTagViews, tagIdFromViewDocName, tagViewFileNames } from './tag-views.ts'

test('parseTagViews keeps sandbox catalog entries', () => {
  const views = parseTagViews([{ id: '8fdbc4f8', name: '卡', file: 'tag-view-need-8fdbc4f8.jsx' }])
  assert.equal(views.length, 1)
  assert.equal(views[0]?.dataFile, 'tag-view-data-8fdbc4f8.json')
  assert.equal(isTagViewDocName('tag-view-need-8fdbc4f8.jsx'), true)
  assert.equal(tagIdFromViewDocName('tag-view-need-8fdbc4f8.jsx'), 'need')
  assert.ok(tagViewFileNames({ id: 'need', views }).includes('tag-views-need.json'))
})

test('default tag sandbox source compiles', () => {
  const src = defaultTagSandboxSource('动态规划')
  const compiled = compileHostSource(src)
  assert.equal(compiled.ok, true)
  assert.match(src, /组件 API/)
  assert.match(src, /数据 API/)
  assert.match(src, /biu\.tag\(\)/)
  assert.match(src, /biu\.patch/)
  assert.match(src, /<Field name=\{field\.key\}/)
})
