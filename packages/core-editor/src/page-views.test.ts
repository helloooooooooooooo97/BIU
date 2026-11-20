import { test } from 'vitest'
import assert from 'node:assert/strict'
import { defaultContentSandboxSource, parseRecordSandboxes } from '@biu/type-file-system/record-views'

test('parseRecordSandboxes keeps sandbox views bound to files', () => {
  assert.deepEqual(
    parseRecordSandboxes([
      { id: 'site1', name: '官网', kind: 'sandbox', file: 'view-p1-site1.jsx', dataFile: 'view-data-p1-site1.json' },
      { id: '', file: 'skip.jsx' },
      { id: 'site1', file: 'dup.jsx' },
    ]),
    [
      {
        id: 'site1',
        name: '官网',
        kind: 'sandbox',
        file: 'view-p1-site1.jsx',
        dataFile: 'view-data-p1-site1.json',
      },
    ],
  )
  assert.deepEqual(parseRecordSandboxes('not-json'), [])
})

test('default sandbox source is a host component that uses Block', async () => {
  const { compileHostSource } = await import('@biu/core-file-system/sandbox-compile')
  const src = defaultContentSandboxSource('演示页')
  assert.match(src, /export default function App/)
  assert.match(src, /组件 API/)
  assert.match(src, /数据 API/)
  assert.match(src, /biu\.blocks\(\)/)
  assert.match(src, /biu\.update\(/)
  assert.match(src, /biu\.read\(\)/)
  assert.match(src, /biu\.files/)
  assert.match(src, /<Block id=\{open\}/)
  assert.match(src, /<Field name/)
  assert.match(src, /内容视图 · 页面概览/)
  assert.match(src, /内容视图介绍/)
  assert.match(src, /biu\.page\(\)/)
  assert.equal(compileHostSource(src).ok, true)
})
