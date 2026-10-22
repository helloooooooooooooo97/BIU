import { test } from 'vitest'
import assert from 'node:assert/strict'
import { colWidthStyle, DEFAULT_VIEW_PAGE_SIZE, normalizePageSize, normalizeSavedView, parseViewColumns, rankListedViews, sortViewsByRank, tableWidthStyle, viewStateKey, type SavedView } from './saved-view.ts'

const base: SavedView = {
  id: '1',
  name: '默认',
  mode: 'table',
  sortField: 'title',
  sortDir: 'asc',
  filters: {},
  columns: ['title', 'status'],
}

test('normalizeSavedView keeps custom mode slugs and rejects junk', () => {
  const graph = normalizeSavedView({ id: '1', name: 'a', mode: 'graph', sortField: '', sortDir: 'asc', filters: {}, columns: [] })
  assert.equal(graph.mode, 'graph')
  const board = normalizeSavedView({ id: '1', name: 'a', mode: 'board', sortField: '', sortDir: 'asc', filters: {}, columns: [] })
  assert.equal(board.mode, 'table')
  const junk = normalizeSavedView({ id: '1', name: 'a', mode: '???' as SavedView['mode'], sortField: '', sortDir: 'asc', filters: {}, columns: [] })
  assert.equal(junk.mode, 'table')
  assert.equal(junk.sortField, 'title')
  assert.equal(junk.tree, true)
  assert.equal(junk.truncate, true)
  assert.equal(junk.wrap, false)
  assert.equal(junk.query, '')
  assert.equal(DEFAULT_VIEW_PAGE_SIZE, 20)
  assert.equal(junk.pageSize, 20)
  assert.equal(normalizePageSize(50), 50)
  assert.equal(normalizePageSize(undefined), 20)
  assert.deepEqual(junk.columnWidths, {})
  const fromFlat = normalizeSavedView({
    ...base,
    filters: { project: 'biu' },
    filterTree: { kind: 'group', id: 'g', combinator: 'and', children: [] },
  })
  assert.equal(fromFlat.filterTree?.children[0] && fromFlat.filterTree.children[0].kind === 'rule' && fromFlat.filterTree.children[0].value, 'biu')
})

test('parseViewColumns keeps list projection JSON strings', () => {
  assert.deepEqual(parseViewColumns(['title', 'status', 'title']), ['title', 'status'])
  assert.deepEqual(parseViewColumns('["title","dueAt"]'), ['title', 'dueAt'])
  assert.deepEqual(parseViewColumns('title,status'), ['title', 'status'])
  assert.deepEqual(
    normalizeSavedView({ ...base, columns: '["title","facet"]' as unknown as string[] }).columns,
    ['title', 'facet'],
  )
  assert.throws(() => parseViewColumns('["title"'), /columns 应为字符串数组/)
  assert.throws(() => parseViewColumns('"[\\"title\\""'), /不能按逗号拆/)
})

test('normalizeColumnWidths clamps and viewStateKey includes widths', () => {
  const wide = normalizeSavedView({ ...base, columnWidths: { title: 12, status: 900, skip: Number.NaN } })
  assert.equal(wide.columnWidths?.title, 56)
  assert.equal(wide.columnWidths?.status, 720)
  assert.equal(wide.columnWidths?.skip, undefined)
  assert.notEqual(viewStateKey(wide), viewStateKey({ ...wide, columnWidths: {} }))
})

test('colWidthStyle and tableWidthStyle declare explicit px boxes', () => {
  assert.deepEqual(colWidthStyle(240), { width: '240px', minWidth: '240px', maxWidth: '240px' })
  assert.equal(colWidthStyle(undefined), undefined)
  assert.deepEqual(tableWidthStyle({ title: 120, status: 80 }, ['title', 'status']), {
    width: '200px',
    minWidth: '200px',
    maxWidth: '200px',
  })
  assert.equal(tableWidthStyle({ title: 120 }, ['title', 'status']), undefined)
})

test('sortViewsByRank follows rank then original index', () => {
  const a = normalizeSavedView({ ...base, id: 'a', name: 'A', rank: 2 })
  const b = normalizeSavedView({ ...base, id: 'b', name: 'B', rank: 0 })
  const c = normalizeSavedView({ ...base, id: 'c', name: 'C' })
  assert.deepEqual(sortViewsByRank([a, b]).map((view) => view.id), ['b', 'a'])
  assert.deepEqual(sortViewsByRank([c, a]).map((view) => view.id), ['c', 'a'])
})

test('rankListedViews assigns 0..n-1 and keeps previous order when merge prepends builtin', () => {
  const all = normalizeSavedView({ ...base, id: 'all', name: '全部', builtin: true })
  const a = normalizeSavedView({ ...base, id: 'a', name: 'A' })
  const b = normalizeSavedView({ ...base, id: 'b', name: 'B' })
  const ranked = rankListedViews([all, a, b], [a, b, all])
  assert.deepEqual(ranked.map((view) => view.id), ['a', 'b', 'all'])
  assert.deepEqual(ranked.map((view) => view.rank), [0, 1, 2])
  assert.deepEqual(rankListedViews([all, b, a], ranked).map((view) => view.id), ['a', 'b', 'all'])
})

test('rankListedViews can put a custom view before builtin', () => {
  const all = normalizeSavedView({ ...base, id: 'all', name: '全部', builtin: true, rank: 1 })
  const mine = normalizeSavedView({ ...base, id: 'mine', name: '我的', rank: 0 })
  assert.deepEqual(rankListedViews([all, mine]).map((view) => view.id), ['mine', 'all'])
})

test('viewStateKey ignores name and treats missing query as empty', () => {
  const a = normalizeSavedView({ ...base, name: 'A', query: '' })
  const b = normalizeSavedView({ ...base, name: 'B' })
  assert.equal(viewStateKey(a), viewStateKey(b))
  assert.notEqual(viewStateKey(a), viewStateKey({ ...a, sortDir: 'desc' }))
})

test('viewStateKey treats filter trees with different ids as the same', () => {
  const a = normalizeSavedView({
    ...base,
    filterTree: { kind: 'group', id: 'g1', combinator: 'and', children: [{ kind: 'rule', id: 'r1', field: 'tags', op: 'eq', value: 'test' }] },
  })
  const b = normalizeSavedView({
    ...base,
    filterTree: { kind: 'group', id: 'g2', combinator: 'and', children: [{ kind: 'rule', id: 'r2', field: 'tags', op: 'eq', value: 'test' }] },
  })
  assert.equal(viewStateKey(a), viewStateKey(b))
})
