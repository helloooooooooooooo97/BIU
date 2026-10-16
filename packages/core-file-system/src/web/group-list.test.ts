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
  assert.doesNotMatch(browser, /groupBy \? 200/)
  assert.match(browser, /listGroupedCollection\(/)
  assert.match(browser, /JSON\.stringify\(groupPages\)/)
  assert.match(browser, /count = group\.total \?\? group\.rows\.length/)
  assert.match(browser, /group\.total != null \? group\.rows/)
})
