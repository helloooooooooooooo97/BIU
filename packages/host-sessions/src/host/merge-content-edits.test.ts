import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mergeContentEditFiles } from '@biu/type-session'

test('mergeContentEditFiles keeps later files when a stale snapshot only has the first', () => {
  const first = [{ path: '/pages/a', title: '你好', added: 1, removed: 0, jump_line: 1 }]
  const all = [
    { path: '/pages/a', title: '你好', added: 1, removed: 0, jump_line: 1 },
    { path: '/pages/b', title: '你好', added: 1, removed: 0, jump_line: 1 },
    { path: '/pages/c', title: '你好', added: 1, removed: 0, jump_line: 1 },
    { path: '/pages/d', title: '你好', added: 1, removed: 0, jump_line: 1 },
    { path: '/pages/e', title: '你好', added: 1, removed: 0, jump_line: 1 },
  ]
  const merged = mergeContentEditFiles(all, first)
  assert.equal(merged.length, 5)
  assert.deepEqual(
    merged.map((file) => file.path),
    ['/pages/a', '/pages/b', '/pages/c', '/pages/d', '/pages/e'],
  )
})

test('mergeContentEditFiles lets a newer row for the same path win', () => {
  const prev = [{ path: '/pages/a', title: '你好', added: 1, removed: 0, jump_line: 1 }]
  const next = [{ path: '/pages/a', title: '你好', added: 2, removed: 1, jump_line: 3, reverted: true }]
  const merged = mergeContentEditFiles(prev, next)
  assert.equal(merged.length, 1)
  assert.equal(merged[0]?.added, 2)
  assert.equal(merged[0]?.reverted, true)
})
