import { afterEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { Context, Service } from 'cordis'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseService } from './index.ts'
import type { CollectionSpec, DbRecord } from '@biu/type-file-system'
import { REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import { openAndMigrateBiu, runWithAccount } from '@biu/host-plugin-loader/data-dir'
import { CollabStore } from '@biu/host-account/store'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function docsCollection(): CollectionSpec {
  const rows = new Map<string, DbRecord & { content?: string }>()
  return {
    id: 'docs',
    path: '/docs',
    label: '文档',
    schema: {
      labelField: 'title',
      parentField: 'parentId',
      contentField: 'content',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        parentId: { type: 'string', writable: true },
        summary: { type: 'string', writable: true },
        secret: { type: 'string', writable: true },
        content: { type: 'string', writable: true },
      },
    },
    records: { create: true, update: true, delete: true },
    list: () => [...rows.values()],
    get: (id) => rows.get(id) ?? null,
    create: (records) =>
      records.map((rec, i) => {
        const id = String(rec.id ?? `doc_${rows.size + i + 1}`)
        const saved: DbRecord & { content?: string } = {
          id,
          title: String(rec.title ?? ''),
          parentId: String(rec.parentId ?? ''),
          summary: String(rec.summary ?? ''),
          secret: String(rec.secret ?? ''),
          content: typeof rec.content === 'string' ? rec.content : '',
        }
        rows.set(id, saved)
        return saved
      }),
    update: (id, patch) => {
      const current = rows.get(id)
      if (!current) throw new Error(`unknown doc: ${id}`)
      const next = { ...current, ...patch, id }
      rows.set(id, next)
      return next
    },
    remove: (query) => {
      const ids = query.ids ?? []
      for (const id of ids) rows.delete(id)
      return ids
    },
  }
}

async function setupEnv() {
  const dir = mkdtempSync(join(tmpdir(), 'biu-duplicate-'))
  dirs.push(dir)
  const ctx = new Context()
  const db = new DatabaseService(ctx)
  db.register(docsCollection())
  const collab = new CollabStore(openAndMigrateBiu(join(dir, 'biu.sqlite')))

  class AccountBridge extends Service {
    store = collab
    authorization = collab.authorization
    workspaceLocation = () => 'cloud' as const
    constructor(inner: Context) {
      super(inner, 'account')
    }
  }
  await ctx.plugin(AccountBridge)

  const ada = collab.register('Ada', Date.now(), 'secret1', 'ada@example.com')
  const bob = collab.register('Bob', Date.now(), 'secret1', 'bob@example.com')
  const cara = collab.register('Cara', Date.now(), 'secret1', 'cara@example.com')
  const workspace = collab.createWorkspace(ada.id, 'Team')
  collab.addMemberByEmail(ada.id, workspace.id, bob.email)
  collab.addMemberByEmail(ada.id, workspace.id, cara.email)
  collab.setActive(ada.id, workspace.id)
  collab.setActive(bob.id, workspace.id)
  collab.setActive(cara.id, workspace.id)
  return { db, collab, workspace, ada, bob, cara }
}

test('duplicating a workspace record as personal creates an isolated private copy and leaves source untouched', async () => {
  const { db, collab, workspace, ada, bob } = await setupEnv()

  const parentCreated = await runWithAccount(ada.id, () =>
    db.create('/docs', [{ id: 'ws-folder', title: '团队目录' }], { scope: 'workspace' }),
  )
  assert.equal(parentCreated.items[0]?.path, '/docs/ws-folder')

  await runWithAccount(ada.id, () =>
    db.create(
      '/docs',
      [
        {
          id: 'ws-doc',
          title: '产品方案',
          parentId: 'ws-folder',
          summary: '公开摘要',
          secret: '内部参数',
          content: '# 方案正文\n第一版',
        },
      ],
      { scope: 'workspace' },
    ),
  )

  const dup = await runWithAccount(bob.id, () => db.duplicate('/docs/ws-doc', { scope: 'personal' }))
  assert.equal(dup.kind, 'duplicated')
  assert.equal(dup.sourcePath, '/docs/ws-doc')
  assert.equal(dup.scope, 'personal')
  assert.notEqual(dup.path, '/docs/ws-doc')
  assert.equal(dup.value.title, '产品方案（副本）')
  assert.equal(dup.value.summary, '公开摘要')
  assert.equal(dup.value.parentId, '')

  const copyId = String(dup.value.id)
  assert.equal(
    collab.collectionOwnership(workspace.id, '/docs').get(copyId),
    'personal',
  )
  const copyBody = await runWithAccount(bob.id, () => db.content(`/docs/${copyId}`))
  assert.equal(copyBody.value, '# 方案正文\n第一版')

  assert.equal(
    collab.collectionOwnership(workspace.id, '/docs').get('ws-doc'),
    'workspace',
  )
  await assert.rejects(() => runWithAccount(ada.id, () => db.read(`/docs/${copyId}`)), /unknown record/)
})

test('duplicate enforces record-level read permission for private and direct-granted records', async () => {
  const { db, collab, ada, bob, cara } = await setupEnv()

  await runWithAccount(ada.id, () =>
    db.create(
      '/docs',
      [
        {
          id: 'fin-1',
          title: '财务预算',
          summary: 'Q4 总览',
          secret: '高管薪资机密',
          content: '机密正文',
        },
      ],
      { scope: 'workspace' },
    ),
  )
  // Switch record to private -> Bob & Cara lose baseline workspace access
  collab.setRecordAccessMode(ada.id, '/docs', 'fin-1', 'private')

  // Cara (no read permission) cannot duplicate
  await assert.rejects(() => runWithAccount(cara.id, () => db.duplicate('/docs/fin-1', { scope: 'personal' })), /unknown record/)

  // Ada grants Bob explicit viewer access
  collab.shareWithEmail(ada.id, '/docs', 'fin-1', bob.email, 'viewer', 'internal')

  const dup = await runWithAccount(bob.id, () => db.duplicate('/docs/fin-1', { scope: 'personal' }))
  assert.equal(dup.value.title, '财务预算（副本）')
  assert.equal(dup.value.summary, 'Q4 总览')
  assert.equal(dup.value.secret, '高管薪资机密')
})
