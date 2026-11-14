import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { REQUIRED_RECORD_FIELDS, type CollectionSchema } from '@biu/type-file-system'
import { listGroupedCollection } from './group-list.ts'
import type { ListPage } from './db-client.ts'

const schema: CollectionSchema = {
  labelField: 'title',
  fields: {
    ...REQUIRED_RECORD_FIELDS,
    title: { type: 'string' },
    status: { type: 'select', enum: ['todo', 'doing', 'done'] },
    shareScope: { type: 'select', enum: ['私人', '空间', '共享'] },
  },
}

test('grouped collection fetches each group page instead of a mixed 200', async () => {
  const calls: Array<{ limit: number; offset: number; filters?: Record<string, unknown> }> = []
  const list = async (input: {
    path: string
    limit: number
    offset?: number
    filters?: Record<string, unknown>
  }): Promise<ListPage> => {
    calls.push({ limit: input.limit, offset: input.offset ?? 0, filters: input.filters })
    const status = String(input.filters?.status ?? '')
    if (input.filters?.$tree) return { items: [], total: 0, schema }
    if (status === 'doing') return { items: [{ id: 'd1', title: 'doing-1', status: 'doing' }], total: 41, schema }
    if (status === 'todo') return { items: [], total: 0, schema }
    return { items: [], total: 3, schema }
  }
  const page = await listGroupedCollection({
    path: '/tasks',
    groupBy: 'status',
    schema,
    pageSize: 20,
    groupPages: { doing: 1 },
    list,
  })
  assert.ok(page)
  assert.equal(calls.some((call) => call.limit === 200), false)
  assert.deepEqual(
    calls.map((call) => ({
      status: call.filters?.status,
      empty: Boolean(call.filters?.$tree),
      limit: call.limit,
      offset: call.offset,
    })),
    [
      { status: 'todo', empty: false, limit: 20, offset: 0 },
      { status: 'doing', empty: false, limit: 20, offset: 20 },
      { status: 'done', empty: false, limit: 20, offset: 0 },
      { status: undefined, empty: true, limit: 20, offset: 0 },
    ],
  )
  assert.deepEqual(
    page!.buckets.map((item) => [item.key, item.total, item.rows.map((row) => row.id)]),
    [
      ['doing', 41, ['d1']],
      ['done', 3, []],
      ['', 0, []],
    ],
  )
})

test('empty leading shareScope groups fill the first nonempty group before return', async () => {
  const calls: Array<{ scope?: unknown; limit: number }> = []
  const page = await listGroupedCollection({
    path: '/plugins',
    groupBy: 'shareScope',
    schema,
    pageSize: 50,
    list: async (input) => {
      const scope = input.filters?.$scope
      calls.push({ scope, limit: input.limit })
      if (scope === 'shared') {
        const rows =
          input.limit > 1
            ? [
                { id: 'p1', title: 'API 调试块', tags: ['page'] },
                { id: 'p2', title: 'HTML', tags: ['editor'] },
              ]
            : [{ id: 'p1', title: 'API 调试块', tags: ['page'] }]
        return { items: rows, total: 13, schema }
      }
      return { items: [], total: 0, schema }
    },
  })
  assert.deepEqual(calls, [
    { scope: 'personal', limit: 50 },
    { scope: 'workspace', limit: 50 },
    { scope: 'shared', limit: 50 },
  ])
  assert.deepEqual(
    page!.buckets.map((item) => [item.key, item.total, item.rows.map((row) => row.id)]),
    [['共享', 13, ['p1', 'p2']]],
  )
})

test('wrap groups larger than the window still fetch every group at page size', async () => {
  const extra = Array.from({ length: 12 }, (_, i) => `g${i}`)
  const limits: number[] = []
  const page = await listGroupedCollection({
    path: '/tasks',
    groupBy: 'status',
    schema,
    extraValues: extra,
    pageSize: 100,
    wrap: true,
    list: async (input) => {
      limits.push(input.limit)
      return { items: [{ id: String(limits.length), title: 'row' }], total: 80, schema }
    },
  })
  assert.ok(limits.every((limit) => limit === 100))
  assert.equal(limits.length, 16)
  assert.ok(page!.buckets.every((bucket) => bucket.rows.length === 1))
})

test('grouped collection fetches later buckets at page size without a fill pass', async () => {
  const extra = Array.from({ length: 12 }, (_, i) => `g${i}`)
  const limits: Array<{ status?: unknown; limit: number }> = []
  await listGroupedCollection({
    path: '/tasks',
    groupBy: 'status',
    schema,
    extraValues: extra,
    pageSize: 100,
    wrap: true,
    list: async (input) => {
      limits.push({ status: input.filters?.status, limit: input.limit })
      return { items: [{ id: String(limits.length), title: 'row' }], total: 80, schema }
    },
  })
  assert.deepEqual(
    limits.filter((item) => item.status === 'todo' || item.status === 'doing' || item.status === 'done'),
    [
      { status: 'todo', limit: 100 },
      { status: 'doing', limit: 100 },
      { status: 'done', limit: 100 },
    ],
  )
})

test('shareScope groups query $scope, not shareScope equality', async () => {
  const scopes: unknown[] = []
  await listGroupedCollection({
    path: '/tasks',
    groupBy: 'shareScope',
    schema,
    pageSize: 20,
    list: async (input) => {
      scopes.push(input.filters?.$scope)
      assert.equal(input.filters?.shareScope, undefined)
      return { items: [{ id: String(input.filters?.$scope), title: String(input.filters?.$scope) }], total: 1, schema }
    },
  })
  assert.deepEqual(scopes, ['personal', 'workspace', 'shared'])
})

test('grouped table fetch no longer uses a mixed 200-row page', () => {
  const browser = readFileSync(resolve(import.meta.dirname, './browser.tsx'), 'utf8')
  const grouped = readFileSync(resolve(import.meta.dirname, './group-list.ts'), 'utf8')
  assert.doesNotMatch(browser, /groupBy \? 200/)
  assert.match(browser, /listGroupedCollection\(/)
  assert.match(browser, /listTreeCollection\(/)
  assert.match(browser, /listTreeCollection\(\{\s*\n\s*\.\.\.input,\s*\n\s*tree: reqTree && Boolean\(reqParentKey\)/)
  assert.match(browser, /wrap: reqWrap/)
  assert.match(browser, /fillKeys: switching \|\| opts\?\.force \? \[\] : groupFillKeys/)
  assert.match(browser, /!opts\?\.force && !switching && loadedIdentityRef/)
  assert.match(browser, /JSON\.stringify\(groupPages\)/)
  assert.match(browser, /count = group\.total \?\? group\.rows\.length/)
  assert.match(browser, /group\.total != null \? group\.rows/)
  assert.match(grouped, /limit: pageSize/)
  assert.match(grouped, /rows: listed.items/)
})

test('ref group headers resolve record titles instead of ids', async () => {
  const schema: CollectionSchema = {
    labelField: 'title',
    fields: {
      ...REQUIRED_RECORD_FIELDS,
      title: { type: 'string' },
      parentId: { type: 'ref' },
    },
  }
  const calls: Array<{ filters?: Record<string, unknown>; columns?: string[] }> = []
  const page = await listGroupedCollection({
    path: '/pages',
    groupBy: 'parentId',
    schema,
    extraValues: ['parent-1'],
    pageSize: 20,
    list: async (input) => {
      calls.push({ filters: input.filters, columns: input.columns })
      if (input.filters?.$tree && JSON.stringify(input.filters).includes('group-ref-labels')) {
        return { items: [{ id: 'parent-1', title: '产品手册' }], total: 1, schema }
      }
      return { items: [{ id: 'c1', title: '子页', parentId: 'parent-1' }], total: 1, schema }
    },
  })
  assert.ok(calls.some((call) => JSON.stringify(call.filters).includes('group-ref-labels')))
  assert.equal(page!.buckets.find((item) => item.key === 'parent-1')?.label, '产品手册')
})

test('grouped pager reuses buckets whose page did not change', async () => {
  const calls: Array<{ status?: unknown; offset: number }> = []
  const previous = [
    { key: 'todo', label: 'todo', rows: [{ id: 't1', title: 'a', status: 'todo' }], total: 40 },
    { key: 'doing', label: 'doing', rows: [{ id: 'd1', title: 'b', status: 'doing' }], total: 1 },
  ]
  const page = await listGroupedCollection({
    path: '/tasks',
    groupBy: 'status',
    schema,
    pageSize: 20,
    groupPages: { todo: 1 },
    previous,
    previousPages: { todo: 0, doing: 0, done: 0 },
    list: async (input) => {
      calls.push({ status: input.filters?.status, offset: input.offset ?? 0 })
      return { items: [{ id: 't2', title: 'next', status: 'todo' }], total: 40, schema }
    },
  })
  assert.deepEqual(calls, [{ status: 'todo', offset: 20 }])
  assert.deepEqual(
    page!.buckets.map((item) => [item.key, item.total, item.rows.map((row) => row.id)]),
    [
      ['todo', 40, ['t2']],
      ['doing', 1, ['d1']],
      ['', 0, []],
    ],
  )
})
