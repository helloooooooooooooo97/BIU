import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, it } from 'vitest'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import { buildFtsMatchQuery, queryPagesGroupPage, queryPagesListPage } from './sql-query.ts'
import { PagesStore } from './store.ts'

const temps: string[] = []

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'biu-sql-pushdown-'))
  temps.push(dir)
  return dir
}

afterEach(() => {
  while (temps.length) {
    const dir = temps.pop()!
    try {
      rmSync(dir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
})

describe('Phase 1 SQL pushdown correctness', () => {
  it('buildFtsMatchQuery sanitizes operators, creates prefix token queries, and defers CJK substrings to SQL LIKE', () => {
    assert.equal(buildFtsMatchQuery('table paste'), '"table"* "paste"*')
    assert.equal(buildFtsMatchQuery('  多维表格  '), null)
    assert.equal(buildFtsMatchQuery('---***'), null)
  })

  it('pushes down sort, pagination, trash, FTS5 search, tag_attr_index filter/sort, and SQL GROUP BY', async () => {
    const dir = makeTempDir()
    const db = openAndMigrateBiu(join(dir, 'biu.sqlite'), { foreignKeys: false })

    try {
      const insertPage = db.prepare(
        `INSERT INTO pages (id, title, parent_id, depends_on_json, emoji, created_at, updated_at)
         VALUES (?, ?, ?, '[]', '', ?, ?)`,
      )
      insertPage.run('p1', '多维表格粘贴优化', null, 1000, 3000)
      insertPage.run('p2', '修复列宽拖拽问题', null, 2000, 5000)
      insertPage.run('p3', '新增数据库块组件', 'p1', 3000, 4000)
      insertPage.run('p4', '已删除的草稿页面', null, 4000, 6000)

      // Mark p4 deleted in record_meta
      db.prepare(`INSERT INTO record_meta (collection, record_id, deleted_at) VALUES ('/pages', 'p4', 9999)`).run()

      // Seed tag_stamps & tag_attr_index
      const insertStamp = db.prepare(`INSERT INTO tag_stamps (tag_id, collection, record_id, title) VALUES (?, '/pages', ?, ?)`)
      const insertAttr = db.prepare(
        `INSERT INTO tag_attr_index (collection, pack_id, field_key, record_id, val_text, val_num) VALUES ('/pages', ?, ?, ?, ?, ?)`,
      )
      insertStamp.run('tag-10', 'p1', '多维表格粘贴优化')
      insertStamp.run('tag-10', 'p2', '修复列宽拖拽问题')
      insertStamp.run('tag-10', 'p3', '新增数据库块组件')

      insertAttr.run('tag-10', '项目', 'p1', 'BIU', null)
      insertAttr.run('tag-10', '项目', 'p2', 'BIU', null)
      insertAttr.run('tag-10', '项目', 'p3', 'Cordis', null)

      insertAttr.run('tag-10', '+', 'p1', '1453', 1453)
      insertAttr.run('tag-10', '+', 'p2', '5', 5)
      insertAttr.run('tag-10', '+', 'p3', '576', 576)

      // 1. Default non-trash list sorted by updatedAt DESC (excludes p4)
      const res1 = queryPagesListPage(db, {
        sortField: 'updatedAt',
        sortDir: 'desc',
        limit: 2,
        offset: 0,
      })
      assert.ok(res1)
      assert.equal(res1.total, 3)
      assert.deepEqual(res1.rows.map((r) => r.id), ['p2', 'p3'])

      // 2. Trash mode returns only p4
      const trashRes = queryPagesListPage(db, {
        trash: true,
        sortField: 'updatedAt',
        sortDir: 'desc',
        limit: 10,
        offset: 0,
      })
      assert.ok(trashRes)
      assert.equal(trashRes.total, 1)
      assert.deepEqual(trashRes.rows.map((r) => r.id), ['p4'])

      // 3. FTS5 search
      const ftsRes = queryPagesListPage(db, {
        q: '粘贴',
        sortField: 'updatedAt',
        sortDir: 'desc',
        limit: 10,
        offset: 0,
      })
      assert.ok(ftsRes)
      assert.equal(ftsRes.total, 1)
      assert.deepEqual(ftsRes.rows.map((r) => r.id), ['p1'])

      // 4. Filter by dynamic tag attribute (`tag::tag-10::项目 = BIU`) + sort by numeric `tag::tag-10::+` DESC
      const attrRes = queryPagesListPage(db, {
        tagId: 'tag-10',
        filter: { 'tag::tag-10::项目': 'BIU' },
        sortField: 'tag::tag-10::+',
        sortDir: 'desc',
        limit: 10,
        offset: 0,
      })
      assert.ok(attrRes)
      assert.equal(attrRes.total, 2)
      assert.deepEqual(attrRes.rows.map((r) => r.id), ['p1', 'p2'])

      // 5. SQL GROUP BY on dynamic tag attribute
      const groups = queryPagesGroupPage(db, {
        field: 'tag::tag-10::项目',
        tagId: 'tag-10',
      })
      assert.ok(groups)
      assert.deepEqual(groups, [
        { key: 'BIU', count: 2 },
        { key: 'Cordis', count: 1 },
      ])

      // 6. Graceful fallback (returns null) for unsupported $tree or unknown columns
      assert.equal(
        queryPagesListPage(db, {
          filter: { $tree: { op: 'and', rules: [] } },
          sortField: 'updatedAt',
          sortDir: 'desc',
          limit: 10,
          offset: 0,
        }),
        null,
      )
      assert.equal(
        queryPagesListPage(db, {
          sortField: 'createdBy',
          sortDir: 'desc',
          limit: 10,
          offset: 0,
        }),
        null,
      )

      // 7. FTS5 update/delete trigger sync
      db.prepare(`UPDATE pages SET title = '全新检索词 Alpha99' WHERE id = 'p2'`).run()
      const updatedFts = queryPagesListPage(db, {
        q: 'Alpha99',
        sortField: 'updatedAt',
        sortDir: 'desc',
        limit: 10,
        offset: 0,
      })
      assert.ok(updatedFts)
      assert.deepEqual(updatedFts.rows.map((r) => r.id), ['p2'])
    } finally {
      db.close()
    }
  })

  it('PagesStore.create uses O(1) ID existence check and syncs FTS5 automatically', async () => {
    const dir = makeTempDir()
    const store = new PagesStore(
      {
        resolve: (rel) => join(dir, rel),
        read: async () => '',
        write: async () => undefined,
        list: async () => [],
      },
      join(dir, 'assets'),
    )
    const p1 = await store.create({ title: 'First Page Sync' })
    const p2 = await store.create({ title: 'Second Page Sync', parentId: p1.id })

    const page = await store.listPage({
      q: 'Second',
      sortField: 'updatedAt',
      sortDir: 'desc',
      limit: 10,
      offset: 0,
    })
    assert.ok(page)
    assert.equal(page.total, 1)
    assert.equal(page.rows[0]?.id, p2.id)
    assert.equal(page.rows[0]?.parentId, p1.id)
  })
})
