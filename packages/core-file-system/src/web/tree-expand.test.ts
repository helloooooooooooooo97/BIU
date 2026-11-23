import { test } from 'vitest'
import assert from 'node:assert/strict'
import { CELL_POP_IGNORE, CELL_RANGE_IGNORE } from './use-browser-table-nav.ts'
import { rowsWithTreeKids } from './browser-list-cache.ts'
import { flattenTree } from './fields.ts'

test('tree toggle button is ignored by table cell pointer-capture and pop handlers', () => {
  assert.match(CELL_RANGE_IGNORE, /\.tasks-tree-toggle\b/)
  assert.match(CELL_POP_IGNORE, /\.tasks-tree-toggle\b/)
})

test('rowsWithTreeKids attaches multi-level descendants regardless of kidsByParent key order and flattenTree expands/collapses cleanly', () => {
  const root = { id: 'root-1', title: '根节点', parentId: '' }
  const child = { id: 'child-1', title: '子节点', parentId: 'root-1' }
  const grand = { id: 'grand-1', title: '孙节点', parentId: 'child-1' }

  // 故意让子节点的 key 排在根节点之前，验证收敛合并不会丢失孙节点
  const kidsByParent = {
    'child-1': [grand],
    'root-1': [child],
  }
  const merged = rowsWithTreeKids([root], kidsByParent)
  assert.deepEqual(
    merged.map((r) => r.id),
    ['root-1', 'child-1', 'grand-1'],
  )

  // 默认全部收起：只显示根节点
  assert.deepEqual(
    flattenTree(merged, 'parentId', {}).map((r) => [r.row.id, r.depth]),
    [['root-1', 0]],
  )

  // 展开根节点：显示根节点 + 子节点
  assert.deepEqual(
    flattenTree(merged, 'parentId', { 'root-1': false }).map((r) => [r.row.id, r.depth]),
    [
      ['root-1', 0],
      ['child-1', 1],
    ],
  )

  // 展开根节点 + 子节点：显示三层
  assert.deepEqual(
    flattenTree(merged, 'parentId', { 'root-1': false, 'child-1': false }).map((r) => [r.row.id, r.depth]),
    [
      ['root-1', 0],
      ['child-1', 1],
      ['grand-1', 2],
    ],
  )

  // 收起根节点：子节点和孙节点一并收起
  assert.deepEqual(
    flattenTree(merged, 'parentId', { 'root-1': true, 'child-1': false }).map((r) => [r.row.id, r.depth]),
    [['root-1', 0]],
  )
})
