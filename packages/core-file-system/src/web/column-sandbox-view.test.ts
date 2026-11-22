import { test } from 'vitest'
import assert from 'node:assert/strict'
import { normalizeSchemaPack } from '@biu/type-file-system'
import {
  activeColumnSandboxItem,
  compileColumnSandbox,
  defaultColumnSandboxCode,
  normalizeColumnViews,
  resolveColumnSandboxItems,
} from './column-sandbox-view.tsx'

test('defaultColumnSandboxCode compiles cleanly for every field kind', () => {
  for (const kind of ['string', 'number', 'boolean', 'select', 'multi-select', 'url', 'datetime'] as const) {
    const code = defaultColumnSandboxCode({ key: 'k', label: '测试列', kind })
    const res = compileColumnSandbox(code)
    assert.equal(res.ok, true, `failed to compile default template for ${kind}: ${res.ok ? '' : res.error}`)
  }
})

test('compileColumnSandbox blocks external imports and surfaces syntax errors', () => {
  const blocked = compileColumnSandbox(`import fs from 'node:fs'\nexport default function Cell() { return <span /> }`)
  assert.equal(blocked.ok, false)
  const bad = compileColumnSandbox(`export default function Cell() { return <span> }`)
  assert.equal(bad.ok, false)
})

test('normalizeColumnViews validates items, activeId, and JSON string input', () => {
  const raw = JSON.stringify({
    priority: {
      activeId: 'sv-1',
      items: [{ id: 'sv-1', name: '彩色徽章', code: 'export default function Cell({ value }) { return <span>{value}</span> }' }],
    },
    broken: { activeId: 'missing', items: [{ id: 'sv-2', name: 'A', code: '' }] },
    empty: { activeId: 'default', items: [] },
  })
  const norm = normalizeColumnViews(raw)
  assert.ok(norm)
  assert.equal(norm.priority?.activeId, 'sv-1')
  assert.equal(activeColumnSandboxItem(norm.priority)?.name, '彩色徽章')
  assert.equal(norm.broken?.activeId, 'default')
  assert.equal(activeColumnSandboxItem(norm.broken), null)
  assert.equal(norm.empty, undefined)
})

test('tag-owned sandbox views store code on tag fields while table view stores only activeId pointer', () => {
  const pack = normalizeSchemaPack({
    id: 'tag-10',
    label: '代码提交',
    fields: [
      {
        key: '状态',
        label: '状态',
        type: 'select',
        views: [
          { id: 'sv-badge', name: '彩色状态', code: 'export default function Cell({ value }) { return <b>{value}</b> }' },
          { id: 'sv-badge', name: '重复应去重', code: '' },
          { id: 'default', name: '保留名应忽略', code: '' },
        ],
      },
    ],
  })
  assert.ok(pack)
  assert.equal(pack.fields[0]?.views?.length, 1)
  assert.equal(pack.fields[0]?.views?.[0]?.id, 'sv-badge')

  // 表格视图里只保存轻量 { activeId } 指针，不冗余拷贝代码
  const norm = normalizeColumnViews({
    'tag::tag-10::状态': { activeId: 'sv-badge' },
    'tag::tag-10::类型': { activeId: 'default' },
  })
  assert.deepEqual(norm, { 'tag::tag-10::状态': { activeId: 'sv-badge' } })

  const items = resolveColumnSandboxItems('tag::tag-10::状态', norm['tag::tag-10::状态'], [pack])
  assert.equal(items.length, 1)
  assert.equal(activeColumnSandboxItem(norm['tag::tag-10::状态'], items)?.name, '彩色状态')

  // 标签里删掉该视图后，表格视图的 activeId 自动安全回退为 null（默认视图）
  const emptyPack = { ...pack, fields: [{ ...pack.fields[0]!, views: undefined }] }
  const afterDelete = resolveColumnSandboxItems('tag::tag-10::状态', norm['tag::tag-10::状态'], [emptyPack])
  assert.equal(activeColumnSandboxItem(norm['tag::tag-10::状态'], afterDelete), null)
})
