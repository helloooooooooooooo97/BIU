import { test } from 'vitest'
import assert from 'node:assert/strict'
import { TREE_HAS_KIDS, listTreeChildren, listTreeCollection, treeRootFilter } from './tree-list.ts'
import type { ListPage } from './db-client.ts'

test('treeRootFilter asks for empty parent', () => {
  const filter = treeRootFilter('parentId')
  const tree = filter.$tree as { children: Array<{ field: string; op: string }> }
  assert.equal(tree.children[0]?.field, 'parentId')
  assert.equal(tree.children[0]?.op, 'is_empty')
})

test('tree list only queries roots then probes which have direct children', async () => {
  const calls: Array<{ query?: string; filters?: Record<string, unknown>; limit: number; offset?: number; columns?: string[] }> = []
  const list = async (input: {
    path: string
    limit: number
    offset?: number
    query?: string
    filters?: Record<string, unknown>
    columns?: string[]
  }): Promise<ListPage> => {
    calls.push({ query: input.query, filters: input.filters, limit: input.limit, offset: input.offset ?? 0, columns: input.columns })
    const raw = JSON.stringify(input.filters ?? {})
    if (raw.includes('tree-roots')) {
      return {
        items: [
          { id: 'root-a', title: 'A', parentId: '' },
          { id: 'root-b', title: 'B', parentId: '' },
        ],
        total: 40,
      }
    }
    return { items: [{ id: 'child-a', parentId: 'root-a' }], total: 1 }
  }
  const page = await listTreeCollection({
    path: '/pages',
    limit: 20,
    offset: 20,
    query: 'geo',
    parentKey: 'parentId',
    tree: true,
    list,
  })
  assert.equal(page.total, 40)
  assert.deepEqual(
    page.items.map((row) => [row.id, row[TREE_HAS_KIDS]]),
    [
      ['root-a', true],
      ['root-b', false],
    ],
  )
  assert.equal(calls.length, 2)
  assert.equal(calls[0]?.offset, 20)
  assert.equal(calls[0]?.limit, 20)
  assert.equal(calls[0]?.query, 'geo')
  assert.ok(JSON.stringify(calls[0]?.filters).includes('is_empty'))
  assert.deepEqual(calls[1]?.columns, ['parentId'])
  assert.equal(calls[1]?.query, undefined)
})

test('tree children load only the asked parent, then probe grandchildren flags', async () => {
  const calls: Array<{ filters?: Record<string, unknown>; columns?: string[] }> = []
  const page = await listTreeChildren({
    path: '/pages',
    parentKey: 'parentId',
    parentId: 'root-a',
    list: async (input) => {
      calls.push({ filters: input.filters, columns: input.columns })
      const raw = JSON.stringify(input.filters ?? {})
      if (raw.includes('tree-has-kids')) return { items: [], total: 0 }
      return { items: [{ id: 'child-a', title: 'A1', parentId: 'root-a' }], total: 1 }
    },
  })
  assert.deepEqual(page.items.map((row) => [row.id, row[TREE_HAS_KIDS]]), [['child-a', false]])
  assert.deepEqual(calls[0]?.filters, { parentId: 'root-a' })
})

test('tree off is a plain list', async () => {
  const page = await listTreeCollection({
    path: '/pages',
    limit: 10,
    tree: false,
    parentKey: 'parentId',
    list: async () => ({ items: [{ id: 'x' }], total: 1 }),
  })
  assert.deepEqual(page.items.map((row) => row.id), ['x'])
})

test('100-row tree probes keep request URLs small and bound concurrent requests', async () => {
  const roots = Array.from({ length: 100 }, (_, i) => ({ id: `root${String(i).padStart(8, '0')}`, parentId: '' }))
  const probed = new Set<string>()
  let inFlight = 0, peak = 0, probes = 0
  const page = await listTreeCollection({
    path: '/pages', tree: true, parentKey: 'parentId', limit: 100,
    list: async input => {
      const filter = input.filters as { $tree?: { id?: string; children: Array<{ value: string }> } }
      if (filter?.$tree?.id === 'tree-roots') return { items: roots, total: 100 }
      const ids = filter.$tree!.children.map(rule => rule.value)
      for (const id of ids) probed.add(id)
      const query = new URLSearchParams({ path: input.path, limit: String(input.limit), filter: JSON.stringify(filter), columns: input.columns!.join(',') })
      assert.ok(query.toString().length < 4000, 'probe URL leaves space for authorization headers')
      probes++; inFlight++; peak = Math.max(peak, inFlight)
      await new Promise(resolve => setTimeout(resolve, 5))
      inFlight--
      const items = ids.filter(id => Number(id.slice(4)) % 2 === 0).map(id => ({ id: `child-${id}`, parentId: id }))
      return { items, total: items.length }
    },
  })
  assert.equal(probes, 5)
  assert.equal(probed.size, 100)
  assert.ok(peak <= 4)
  assert.equal(page.total, 100)
  assert.deepEqual(page.items.map(row => row[TREE_HAS_KIDS]), roots.map((_, i) => i % 2 === 0))
})
