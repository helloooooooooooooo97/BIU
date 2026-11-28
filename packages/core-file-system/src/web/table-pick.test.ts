import { test } from 'vitest'
import assert from 'node:assert/strict'
import { buildTableSelectionPicks, type TableSelectionCellInfo } from './table-pick.ts'

const fixtures: Record<string, TableSelectionCellInfo> = {
  'p1::title': { id: 'p1', path: '/pages/p1', title: '架构文档', field: 'title', label: '标题', type: 'string', text: '架构文档' },
  'p1::status': { id: 'p1', path: '/pages/p1', title: '架构文档', field: 'status', label: '状态', type: 'select', text: '进行中' },
  'p2::title': { id: 'p2', path: '/pages/p2', title: '发布清单', field: 'title', label: '标题', type: 'string', text: '发布清单' },
  'p2::status': { id: 'p2', path: '/pages/p2', title: '发布清单', field: 'status', label: '状态', type: 'select', text: '已完成' },
  'p3::title': { id: 'p3', path: '/pages/p3', title: '复盘笔记', field: 'title', label: '标题', type: 'string', text: '复盘笔记' },
  'p3::status': { id: 'p3', path: '/pages/p3', title: '复盘笔记', field: 'status', label: '状态', type: 'select', text: '待开始' },
}

test('single cell produces a field pick ref', () => {
  const picks = buildTableSelectionPicks({
    cursors: [{ id: 'p1', key: 'status' }],
    recordKind: 'page',
    collectionPath: '/pages',
    collectionLabel: '页面',
    route: '/database/pages',
    readCell: (cursor) => fixtures[`${cursor.id}::${cursor.key}`],
  })
  assert.equal(picks.length, 1)
  assert.equal(picks[0]?.kind, 'page')
  assert.equal(picks[0]?.path, '/pages/p1')
  assert.equal(picks[0]?.title, '架构文档')
  assert.equal(picks[0]?.field, 'status')
  assert.equal(picks[0]?.label, '状态')
  assert.equal(picks[0]?.text, '进行中')
  assert.equal(picks[0]?.cells, undefined)
})

test('multi-cell rectangular range merges into 1 range chip with full structured cells', () => {
  const picks = buildTableSelectionPicks({
    cursors: [
      { id: 'p1', key: 'title' },
      { id: 'p1', key: 'status' },
      { id: 'p1', key: 'actions' },
      { id: 'p2', key: 'title' },
      { id: 'p2', key: 'status' },
      { id: 'p3', key: 'title' },
      { id: 'p3', key: 'status' },
    ],
    recordKind: 'page',
    collectionPath: '/pages',
    collectionLabel: '页面',
    route: '/database/pages',
    readCell: (cursor) => fixtures[`${cursor.id}::${cursor.key}`],
  })
  assert.equal(picks.length, 1)
  const range = picks[0]!
  assert.equal(range.kind, 'page')
  assert.match(range.id, /^range:/)
  assert.equal(range.title, '页面 · 3 行 × 2 列')
  assert.equal(range.label, '页面 · 3 行 × 2 列')
  assert.equal(range.path, '/pages')
  assert.equal(range.field, undefined)
  assert.equal(range.text, '架构文档\t进行中\n发布清单\t已完成\n复盘笔记\t待开始')
  assert.equal(range.cells?.length, 6)
  assert.deepEqual(range.cells?.[0], {
    path: '/pages/p1',
    id: 'p1',
    title: '架构文档',
    field: 'title',
    label: '标题',
    type: 'string',
    text: '架构文档',
  })
  assert.deepEqual(range.cells?.[5], {
    path: '/pages/p3',
    id: 'p3',
    title: '复盘笔记',
    field: 'status',
    label: '状态',
    type: 'select',
    text: '待开始',
  })
})
