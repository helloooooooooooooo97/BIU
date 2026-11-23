import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from 'cordis'
import { afterEach, beforeEach, describe, it } from 'vitest'
import * as tools from '@biu/host-tools'
import { REQUIRED_RECORD_FIELDS, type CollectionSpec, type DbRecord } from '@biu/type-file-system'
import * as fsPlugin from './index.ts'

const prevHome = process.env.BIU_HOME
beforeEach(() => {
  process.env.BIU_HOME = mkdtempSync(join(tmpdir(), 'biu-batch-update-'))
})
afterEach(() => {
  if (prevHome === undefined) delete process.env.BIU_HOME
  else process.env.BIU_HOME = prevHome
})

class StubHttp extends Service {
  constructor(ctx: Context) {
    super(ctx, 'http')
  }
  route() {}
  broadcast() {}
}

function pagesFixture(): CollectionSpec {
  const rows = new Map<string, DbRecord>([
    ['p1', { id: 'p1', title: '需求一', status: 'open' }],
    ['p2', { id: 'p2', title: '需求二', status: 'open' }],
    ['p3', { id: 'p3', title: '普通文档', status: 'archived' }],
  ])
  return {
    id: 'pages',
    path: '/pages',
    label: '页面',
    schema: {
      labelField: 'title',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        status: { type: 'select', writable: true, enum: ['open', 'done', 'archived'] },
      },
    },
    records: { update: true },
    list: () => [...rows.values()],
    get: (id) => rows.get(id) ?? null,
    update: (id, patch) => {
      const current = rows.get(id)
      if (!current) throw new Error(`unknown page: ${id}`)
      const next = { ...current, ...patch, id }
      rows.set(id, next)
      return next
    },
  }
}

async function setupCtx() {
  const ctx = new Context()
  await ctx.plugin(StubHttp)
  await ctx.plugin(tools)
  await ctx.plugin(fsPlugin)
  ctx.database.register(pagesFixture())
  await ctx.tools.invoke('db_create', {
    path: '/tags',
    records: [
      {
        title: '代码提交',
        fields: [
          { key: '类型', type: 'select', enum: ['功能优化', '缺陷修复'] },
          { key: '项目', type: 'select', enum: ['BIU', 'Other'] },
        ],
      },
    ],
  })
  const tagsList = (await ctx.tools.invoke('db_list', { path: '/tags' })) as { rows: unknown[][] }
  const tagId = String(tagsList.rows[0]![0])

  await ctx.tools.invoke('db_update', {
    path: '/pages/p1',
    fields: { tag: { tags: [tagId], values: { [tagId]: { 类型: '功能优化' } } } },
  })
  await ctx.tools.invoke('db_update', {
    path: '/pages/p2',
    fields: { tag: { tags: [tagId], values: { [tagId]: { 类型: '缺陷修复' } } } },
  })

  const createdView = (await ctx.tools.invoke('db_create', {
    path: '/views',
    records: [
      {
        title: '需求列表',
        tablePath: '/pages',
        mode: 'table',
        filters: JSON.stringify({ tag: tagId }),
      },
    ],
  })) as { ids: string[] }
  const viewRowId = createdView.ids[0]!
  const viewRecord = (await ctx.tools.invoke('db_read', { path: `/views/${viewRowId}` })) as {
    value: { viewId?: string; id: string }
  }
  const viewId = String(viewRecord.value.viewId ?? viewRowId)
  return { ctx, tagId, viewId }
}

describe('db_list view_id and db_update batch mode', () => {
  it('supports db_list with view_id (by ID or Chinese name)', async () => {
    const { ctx, viewId } = await setupCtx()
    try {
      const byId = (await ctx.tools.invoke('db_list', {
        path: '/pages',
        view_id: viewId,
        columns: ['id', 'title'],
      })) as { total: number; rows: unknown[][] }
      assert.equal(byId.total, 2)
      assert.deepEqual(
        byId.rows.map((r) => r[0]).sort(),
        ['p1', 'p2'],
      )

      const byName = (await ctx.tools.invoke('db_list', {
        path: '/pages',
        view_id: '需求列表',
        columns: ['id'],
      })) as { total: number; rows: unknown[][] }
      assert.equal(byName.total, 2)
    } finally {
      await ctx.registry.delete(fsPlugin)
    }
  })

  it('supports dry_run preview and view_id batch tag merge without losing existing tag properties', async () => {
    const { ctx, tagId, viewId } = await setupCtx()
    try {
      const preview = (await ctx.tools.invoke('db_update', {
        path: '/pages',
        view_id: viewId,
        fields: { tag: { values: { [tagId]: { 项目: 'BIU' } } } },
        dry_run: true,
      })) as { ok: boolean; dryRun: boolean; matched: number; targetCount: number; sampleIds: string[] }
      assert.equal(preview.ok, true)
      assert.equal(preview.dryRun, true)
      assert.equal(preview.matched, 2)
      assert.equal(preview.targetCount, 2)
      assert.deepEqual([...preview.sampleIds].sort(), ['p1', 'p2'])

      // Verify dry_run did not write
      const p1Before = (await ctx.tools.invoke('db_read', { path: '/pages/p1' })) as {
        value: { tag?: { values?: Record<string, Record<string, unknown>> } }
      }
      assert.equal(p1Before.value.tag?.values?.[tagId]?.['项目'], undefined)

      // Execute real batch update by view_id
      const res = (await ctx.tools.invoke('db_update', {
        path: '/pages',
        view_id: viewId,
        fields: { tag: { values: { [tagId]: { 项目: 'BIU' } } } },
      })) as { ok: boolean; matched: number; updated: number; ids: string[] }
      assert.equal(res.ok, true)
      assert.equal(res.matched, 2)
      assert.equal(res.updated, 2)
      assert.deepEqual([...res.ids].sort(), ['p1', 'p2'])

      // Verify existing tag properties preserved + new property added; p3 untouched
      const p1After = (await ctx.tools.invoke('db_read', { path: '/pages/p1' })) as {
        value: { tag?: { tags?: string[]; values?: Record<string, Record<string, unknown>> } }
      }
      assert.equal(p1After.value.tag?.values?.[tagId]?.['类型'], '功能优化')
      assert.equal(p1After.value.tag?.values?.[tagId]?.['项目'], 'BIU')

      const p2After = (await ctx.tools.invoke('db_read', { path: '/pages/p2' })) as {
        value: { tag?: { tags?: string[]; values?: Record<string, Record<string, unknown>> } }
      }
      assert.equal(p2After.value.tag?.values?.[tagId]?.['类型'], '缺陷修复')
      assert.equal(p2After.value.tag?.values?.[tagId]?.['项目'], 'BIU')

      const p3After = (await ctx.tools.invoke('db_read', { path: '/pages/p3' })) as {
        value: { tag?: { tags?: string[] } }
      }
      assert.equal(p3After.value.tag?.tags?.length ?? 0, 0)
    } finally {
      await ctx.registry.delete(fsPlugin)
    }
  })

  it('supports heterogeneous updates array and rejects unfiltered batch update', async () => {
    const { ctx } = await setupCtx()
    try {
      await assert.rejects(
        () => ctx.tools.invoke('db_update', { path: '/pages', fields: { status: 'done' } }),
        /requires at least one selector/,
      )

      const res = (await ctx.tools.invoke('db_update', {
        path: '/pages',
        updates: [
          { id: 'p1', fields: { status: 'done' } },
          { id: 'p3', fields: { title: '已更新普通文档' } },
        ],
      })) as { ok: boolean; updated: number; ids: string[] }
      assert.equal(res.ok, true)
      assert.equal(res.updated, 2)
      assert.deepEqual(res.ids, ['p1', 'p3'])

      const p1 = (await ctx.tools.invoke('db_read', { path: '/pages/p1' })) as { value: { status: string } }
      const p3 = (await ctx.tools.invoke('db_read', { path: '/pages/p3' })) as { value: { title: string } }
      assert.equal(p1.value.status, 'done')
      assert.equal(p3.value.title, '已更新普通文档')
    } finally {
      await ctx.registry.delete(fsPlugin)
    }
  })
})
