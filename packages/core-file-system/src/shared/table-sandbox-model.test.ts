import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  createTableSandboxItem,
  isTableSandboxModeId,
  normalizeTableSandboxViews,
} from './table-sandbox-model.ts'
import { normalizeSavedView } from './saved-view.ts'

test('createTableSandboxItem generates valid sandbox mode id and default template', () => {
  const first = createTableSandboxItem([], '代码提交')
  assert.equal(isTableSandboxModeId(first.id), true)
  assert.equal(first.name, '沙箱视图 1')
  assert.match(first.code, /biu\.rows/)
  assert.match(first.code, /代码提交/)

  const second = createTableSandboxItem([first], '代码提交')
  assert.equal(second.name, '沙箱视图 2')
  assert.notEqual(second.id, first.id)
})

test('normalizeTableSandboxViews deduplicates, filters invalid ids, and preserves data', () => {
  const normalized = normalizeTableSandboxViews([
    { id: 'table', name: 'invalid', code: 'x' },
    { id: 'sandbox-a', name: '看板', code: 'export default () => null', data: { col: 'status' } },
    { id: 'sandbox-a', name: 'dup', code: 'ignored' },
    { id: 'sandbox-b', name: '', code: 'export default () => null' },
  ])
  assert.ok(normalized)
  assert.equal(normalized.length, 2)
  assert.equal(normalized[0]!.id, 'sandbox-a')
  assert.deepEqual(normalized[0]!.data, { col: 'status' })
  assert.equal(normalized[1]!.name, '沙箱视图 2')
})

test('SavedView preserves sandboxViews and sandbox-* mode through normalization', () => {
  const item = createTableSandboxItem([], '任务')
  const view = normalizeSavedView({
    id: 'v1',
    name: '自定义看板',
    mode: item.id,
    sortField: 'title',
    sortDir: 'asc',
    filters: {},
    columns: ['title'],
    sandboxViews: [item],
  })
  assert.equal(view.mode, item.id)
  assert.equal(view.sandboxViews?.length, 1)
  assert.equal(view.sandboxViews?.[0]?.id, item.id)
})
