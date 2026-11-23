import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { performance } from 'node:perf_hooks'
import { afterEach, describe, it } from 'vitest'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import { queryPagesGroupPage, queryPagesListPage } from './sql-query.ts'

const temps: string[] = []

function makeTempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'biu-sql-perf-'))
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

describe('Phase 1 SQL pushdown 100,000-row performance benchmark', () => {
  it('benchmarks SQL pushdown vs legacy full-table JS scan on 100,000 rows', () => {
    const ROW_COUNT = 100_000
    const dir = makeTempDir()
    const db = openAndMigrateBiu(join(dir, 'biu.sqlite'), { foreignKeys: false })

    try {
      const tSeed0 = performance.now()
      db.exec('BEGIN IMMEDIATE')
      const insertPage = db.prepare(
        `INSERT INTO pages (id, title, parent_id, depends_on_json, emoji, created_at, updated_at)
         VALUES (?, ?, NULL, '[]', '', ?, ?)`,
      )
      const insertStamp = db.prepare(
        `INSERT INTO tag_stamps (tag_id, collection, record_id, title) VALUES ('tag-10', '/pages', ?, ?)`,
      )
      const insertAttr = db.prepare(
        `INSERT INTO tag_attr_index (collection, pack_id, field_key, record_id, val_text, val_num)
         VALUES ('/pages', 'tag-10', ?, ?, ?, ?)`,
      )
      const projects = ['BIU', 'Cordis', 'Editor', 'Mobile', 'Cloud']
      const baseTs = 1795400000000
      for (let i = 0; i < ROW_COUNT; i += 1) {
        const id = `pg_${String(i).padStart(7, '0')}`
        const title = i === 98765 ? 'NeedleTarget98765 多维表格性能基准测试' : `需求记录 #${i} 模块性能优化与索引压测`
        const ts = baseTs + i * 10
        insertPage.run(id, title, ts, ts)
        if (i % 2 === 0) {
          insertStamp.run(id, title)
          insertAttr.run('项目', id, projects[i % projects.length]!, null)
          insertAttr.run('+', id, String(i % 1000), i % 1000)
        }
      }
      db.exec('COMMIT')
      const seedMs = performance.now() - tSeed0

      // --- Baseline: Legacy full-table JS scan + JS sort + slice ---
      const tLegacyList0 = performance.now()
      const allRows = db
        .prepare(`SELECT id, title, parent_id, depends_on_json, emoji, created_at, updated_at FROM pages ORDER BY id`)
        .all() as Array<{ id: string; title: string; updated_at: number }>
      allRows.sort((a, b) => b.updated_at - a.updated_at)
      const legacySlice = allRows.slice(0, 50)
      const legacyListMs = performance.now() - tLegacyList0

      // --- Phase 1: SQL pushdown ORDER BY updatedAt DESC LIMIT 50 ---
      const tSqlList0 = performance.now()
      const sqlList = queryPagesListPage(db, {
        sortField: 'updatedAt',
        sortDir: 'desc',
        limit: 50,
        offset: 0,
      })
      const sqlListMs = performance.now() - tSqlList0
      assert.ok(sqlList)
      assert.equal(sqlList.total, ROW_COUNT)
      assert.equal(sqlList.rows.length, 50)
      assert.equal(sqlList.rows[0]?.id, legacySlice[0]?.id)

      // --- Baseline: Legacy JS substring search ---
      const tLegacySearch0 = performance.now()
      const allForSearch = db
        .prepare(`SELECT id, title, updated_at FROM pages`)
        .all() as Array<{ id: string; title: string; updated_at: number }>
      const legacyHits = allForSearch.filter((r) => r.title.toLowerCase().includes('needletarget98765'))
      const legacySearchMs = performance.now() - tLegacySearch0

      // --- Phase 1: FTS5 search ---
      const tSqlSearch0 = performance.now()
      const sqlSearch = queryPagesListPage(db, {
        q: 'NeedleTarget98765',
        sortField: 'updatedAt',
        sortDir: 'desc',
        limit: 50,
        offset: 0,
      })
      const sqlSearchMs = performance.now() - tSqlSearch0
      assert.ok(sqlSearch)
      assert.equal(sqlSearch.total, 1)
      assert.equal(sqlSearch.rows[0]?.id, legacyHits[0]?.id)

      // --- Phase 1: Indexed dynamic tag attribute filter + sort ---
      const tSqlAttr0 = performance.now()
      const sqlAttr = queryPagesListPage(db, {
        tagId: 'tag-10',
        filter: { 'tag::tag-10::项目': 'BIU' },
        sortField: 'updatedAt',
        sortDir: 'desc',
        limit: 50,
        offset: 0,
      })
      const sqlAttrMs = performance.now() - tSqlAttr0
      assert.ok(sqlAttr)
      assert.equal(sqlAttr.total, 10_000)
      assert.equal(sqlAttr.rows.length, 50)

      // --- Phase 1: SQL GROUP BY on 50,000 tagged rows ---
      const tSqlGroup0 = performance.now()
      const sqlGroups = queryPagesGroupPage(db, {
        field: 'tag::tag-10::项目',
        tagId: 'tag-10',
      })
      const sqlGroupMs = performance.now() - tSqlGroup0
      assert.ok(sqlGroups)
      assert.equal(sqlGroups.length, 5)
      assert.equal(sqlGroups.reduce((sum, b) => sum + b.count, 0), 50_000)

      // --- Phase 1: O(1) ID lookup vs Legacy SELECT id FROM pages ---
      const tLegacyId0 = performance.now()
      const idSet = new Set((db.prepare('SELECT id FROM pages').all() as Array<{ id: string }>).map((r) => r.id))
      const legacyHas = idSet.has('pg_0050000')
      const legacyIdMs = performance.now() - tLegacyId0

      const tFastId0 = performance.now()
      const fastHas = Boolean(db.prepare('SELECT 1 FROM pages WHERE id = ? LIMIT 1').get('pg_0050000'))
      const fastIdMs = performance.now() - tFastId0
      assert.equal(fastHas, legacyHas)

      const report = {
        rows: ROW_COUNT,
        seedMs: Number(seedMs.toFixed(1)),
        listTop50: {
          legacyMs: Number(legacyListMs.toFixed(2)),
          sqlPushdownMs: Number(sqlListMs.toFixed(2)),
          speedup: `${(legacyListMs / Math.max(sqlListMs, 0.01)).toFixed(1)}x`,
        },
        ftsSearch: {
          legacyMs: Number(legacySearchMs.toFixed(2)),
          fts5Ms: Number(sqlSearchMs.toFixed(2)),
          speedup: `${(legacySearchMs / Math.max(sqlSearchMs, 0.01)).toFixed(1)}x`,
        },
        tagAttrFilterTop50: {
          sqlPushdownMs: Number(sqlAttrMs.toFixed(2)),
          matched: sqlAttr.total,
        },
        sqlGroupBy50k: {
          sqlGroupMs: Number(sqlGroupMs.toFixed(2)),
          buckets: sqlGroups.length,
        },
        createIdCheck: {
          legacyMs: Number(legacyIdMs.toFixed(2)),
          indexedMs: Number(fastIdMs.toFixed(3)),
          speedup: `${(legacyIdMs / Math.max(fastIdMs, 0.001)).toFixed(0)}x`,
        },
      }
      console.log('[PERF_BENCHMARK_100K]', JSON.stringify(report, null, 2))

      // Performance assertions: Phase 1 SQL pushdown must be dramatically faster than legacy full scan
      assert.ok(sqlListMs < legacyListMs / 5, `expected SQL list (${sqlListMs}ms) << legacy (${legacyListMs}ms)`)
      assert.ok(sqlSearchMs < legacySearchMs / 5, `expected FTS5 (${sqlSearchMs}ms) << legacy (${legacySearchMs}ms)`)
      assert.ok(fastIdMs < 5, `expected O(1) ID lookup (${fastIdMs}ms) < 5ms`)
    } finally {
      db.close()
    }
  }, 60_000)
})
