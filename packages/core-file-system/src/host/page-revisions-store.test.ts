/** @vitest-environment node */
import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Context } from 'cordis'
import { openAndMigrateBiu, writeEditorContent } from '@biu/host-plugin-loader/data-dir'
import { REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import { collapseDiffContext, computeLineDiff } from '../shared/text-diff.ts'
import { PageRevisionStore } from './page-revisions-store.ts'
import { DatabaseService } from './index.ts'

test('computeLineDiff and collapseDiffContext produce accurate line hunks', () => {
  const before = ['L1', 'L2', 'L3', 'L4', 'L5', 'L6', 'L7', 'L8', 'L9', 'L10'].join('\n')
  const after = ['L1', 'L2', 'L3', 'L4', 'L5-mod', 'L6', 'L7', 'L8', 'L9', 'L10', 'L11'].join('\n')
  const lines = computeLineDiff(before, after)
  assert.equal(lines.some((l) => l.type === 'del' && l.text === 'L5'), true)
  assert.equal(lines.some((l) => l.type === 'add' && l.text === 'L5-mod'), true)
  assert.equal(lines.some((l) => l.type === 'add' && l.text === 'L11'), true)

  const hunks = collapseDiffContext(lines, 1)
  assert.equal(hunks[0]?.kind, 'collapse')
  if (hunks[0]?.kind === 'collapse') assert.equal(hunks[0].count, 3)
})

test('PageRevisionStore coalesces same-user edits within window and splits on actor change or restore', () => {
  const db = openAndMigrateBiu(':memory:')
  const store = new PageRevisionStore()
  const userA = { kind: 'user' as const, id: 'u-a', name: 'Alice' }
  const agent = { kind: 'agent' as const, id: 'sess-1', name: '小助手', sessionId: 'sess-1' }

  const v1 = store.record(db, {
    recordId: 'p1',
    op: 'create',
    actor: userA,
    title: '初稿',
    body: '第一行',
    fields: { title: '初稿' },
    now: 1_000,
  })!
  assert.equal(v1.version, 1)
  assert.equal(v1.summary, '创建了页面')

  // 用户在创建后马上编辑正文 -> 不和 create 合并，生成 #2
  const v2 = store.record(db, {
    recordId: 'p1',
    op: 'content',
    actor: userA,
    title: '初稿',
    body: '第一行\n第二行',
    fields: { title: '初稿' },
    now: 2_000,
  })!
  assert.equal(v2.version, 2)
  assert.equal(v2.addedLines, 1)

  // 同用户在 5 分钟内再改标题 + 正文 -> 合并进 #2
  const v2Merged = store.record(db, {
    recordId: 'p1',
    op: 'fields',
    actor: userA,
    title: '架构设计',
    body: '第一行\n第二行\n第三行',
    fields: { title: '架构设计' },
    changes: [{ field: 'title', label: '标题', before: '初稿', after: '架构设计' }],
    now: 60_000,
  })!
  assert.equal(v2Merged.version, 2)
  assert.equal(v2Merged.op, 'mixed')
  assert.equal(v2Merged.addedLines, 2)
  assert.match(v2Merged.summary, /修改了标题/)
  assert.match(v2Merged.summary, /编辑了正文/)

  // 切换到 Agent 编辑 -> 立即新起 #3
  const v3 = store.record(db, {
    recordId: 'p1',
    op: 'content',
    actor: agent,
    title: '架构设计',
    body: '第一行\nAgent 润色\n第三行',
    fields: { title: '架构设计' },
    now: 65_000,
  })!
  assert.equal(v3.version, 3)
  assert.equal(v3.actorKind, 'agent')
  assert.equal(v3.actorName, '小助手')

  const detail3 = store.get(db, 'p1', v3.id)!
  assert.equal(detail3.prevVersion, 2)
  assert.equal(detail3.prevBody, '第一行\n第二行\n第三行')
  assert.equal(detail3.body, '第一行\nAgent 润色\n第三行')

  // 恢复操作始终新起版本 #4
  const v4 = store.record(db, {
    recordId: 'p1',
    op: 'restore',
    actor: userA,
    title: '初稿',
    body: '第一行',
    fields: { title: '初稿' },
    restoreFromVersion: 1,
    now: 70_000,
  })!
  assert.equal(v4.version, 4)
  assert.equal(v4.summary, '恢复到版本 #1')

  const listed = store.list(db, 'p1')
  assert.equal(listed.total, 4)
  assert.deepEqual(
    listed.items.map((item) => item.version),
    [4, 3, 2, 1],
  )
  db.close()
})

test('DatabaseService records /pages create, field/tag updates, content edits, restore, and purge cleanup', async () => {
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.tags.open(':memory:')
  const pageRows = new Map<string, { id: string; title: string; notes: string; parentId: string; dependsOn: string[]; createdAt: number; updatedAt: number }>()
  let seq = 0

  db.register({
    id: 'pages',
    path: '/pages',
    records: { create: true, update: true, delete: true },
    schema: {
      contentField: 'notes',
      contentBackend: 'editorContent',
      parentField: 'parentId',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '标题', writable: true },
        notes: { type: 'file', label: '正文', writable: true },
        parentId: { type: 'ref', label: '父级', writable: true },
        dependsOn: { type: 'multi-ref', label: '依赖', writable: true },
      },
    },
    list: async () => [...pageRows.values()],
    get: async (id) => pageRows.get(id) ?? null,
    create: async (rows) => {
      const out = []
      for (const r of rows) {
        seq += 1
        const id = `pg_${seq}`
        const now = Date.now()
        const rec = {
          id,
          title: String(r.title ?? '未命名页面'),
          notes: '',
          parentId: String(r.parentId ?? ''),
          dependsOn: Array.isArray(r.dependsOn) ? r.dependsOn.map(String) : [],
          createdAt: now,
          updatedAt: now,
        }
        pageRows.set(id, rec)
        out.push(rec)
      }
      return out
    },
    update: async (id, patch, opts) => {
      const cur = pageRows.get(id)!
      if (patch.title !== undefined) cur.title = String(patch.title)
      if (patch.parentId !== undefined) cur.parentId = String(patch.parentId)
      if (patch.dependsOn !== undefined) cur.dependsOn = Array.isArray(patch.dependsOn) ? patch.dependsOn.map(String) : []
      if (patch.notes !== undefined && opts?.persistContent !== false) {
        writeEditorContent(db.tags.ensure(), '/pages', id, String(patch.notes))
      }
      cur.updatedAt = Date.now()
      return { ...cur }
    },
    remove: async (q) => {
      for (const id of q.ids ?? []) pageRows.delete(id)
      return q.ids ?? []
    },
  })

  // 新建一个自定义标签以验证标签属性变更追踪
  db.tags.upsert({
    id: 'tag-spec',
    label: '需求',
    fields: [{ key: '状态', label: '状态', type: 'select', enum: ['草稿', '定稿'] }],
  })

  const created = await db.create('/pages', [{ title: '版本测试页', notes: '初始正文\n第二行' }])
  const pageId = String(created.items[0]!.value.id)

  // 修改标题与标签属性
  await db.update(`/pages/${pageId}`, {
    title: '版本测试页 v2',
    tag: { tags: ['tag-spec'], values: { 'tag-spec': { 状态: '定稿' } } },
  })

  // 编辑正文
  await db.writeContent(`/pages/${pageId}`, '初始正文\n改写后的第二行\n新增第三行')

  const listed = await db.listPageRevisions(pageId)
  assert.equal(listed.total, 2) // #1 create + #2 coalesced user edits
  assert.equal(listed.items[0]?.version, 2)
  assert.equal(listed.items[1]?.version, 1)
  assert.ok(listed.items[0]?.changes.some((c) => c.label === '标题'))
  assert.ok(listed.items[0]?.changes.some((c) => c.label === '标签'))
  assert.ok(listed.items[0]?.changes.some((c) => c.label === '状态' && c.after === '定稿'))

  // 恢复到 #1（初始版本）
  const rev1Id = listed.items[1]!.id
  const restored = await db.restorePageRevision(pageId, rev1Id)
  assert.equal(restored.ok, true)
  assert.equal(restored.value.title, '版本测试页')
  assert.equal(restored.body, '初始正文\n第二行')

  const afterRestoreContent = await db.content(`/pages/${pageId}`)
  assert.equal(afterRestoreContent.value, '初始正文\n第二行')

  const listedAfter = await db.listPageRevisions(pageId)
  assert.equal(listedAfter.total, 3)
  assert.equal(listedAfter.items[0]?.op, 'restore')
  assert.equal(listedAfter.items[0]?.summary, '恢复到版本 #1')

  // 彻底删除页面时同步清理历史版本
  await db.remove('/pages', { ids: [pageId], purge: true })
  assert.equal(db.revisions.list(db.tags.ensure(), pageId).total, 0)
})
