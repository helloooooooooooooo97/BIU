import { BoundedMap } from '@biu/biu-ui/cache'
import {
  openAndMigrateBiu,
  writeEditorContent,
  readEditorContent,
} from '@biu/host-plugin-loader/data-dir'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import {
  isEmptySchemaValue,
  normalizeSchemaPack,
  normalizeSchemaValue,
  type CollectionSchemaPack,
  type PersonValue,
  type SchemaFieldValue,
} from '@biu/type-file-system'
import { retainArchivedSchemaValue } from '../shared/tag-value-compat.ts'
import { parseTagFlatColumnKey } from '../query-logic.ts'
import { TAGS_COLLECTION_PATH } from '../paths.ts'
import { strategyForField } from '../shared/group-strategies.ts'
import type { PageBanner, PageBannerKind } from '../page-banner.ts'
import { RecordMetaStore } from './record-meta-store.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export type TagStamp = {
  collection: string
  id: string
  path: string
  title: string
}

type TagRow = {
  id: string
  label: string
  fields_json: string
  notes?: string
  created_at?: number
  updated_at?: number
}

export type TagEntry = {
  pack: CollectionSchemaPack
  notes: string
  createdAt: number
  updatedAt: number
}
type StampRow = { tag_id: string; collection: string; record_id: string; title: string }

export function slugTagId(label: string, used: Set<string>) {
  const base =
    label
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 24) || 'tag'
  let id = /^[a-z]/.test(base) ? base : `t-${base}`
  let n = 2
  while (used.has(id) || !/^[a-z][a-z0-9-]{0,31}$/.test(id)) {
    id = `${base.slice(0, 20)}-${n}`
    if (!/^[a-z]/.test(id)) id = `t-${id}`
    n += 1
  }
  return id
}

function packFromRow(row: TagRow): CollectionSchemaPack | null {
  let fields: unknown = []
  try {
    fields = JSON.parse(row.fields_json || '[]')
  } catch {
    fields = []
  }
  return normalizeSchemaPack({ id: row.id, label: row.label, fields })
}

function entryFromRow(db: DatabaseSync, row: TagRow): TagEntry | null {
  const pack = packFromRow(row)
  if (!pack) return null
  const updated = Number(row.updated_at) || 0
  const created = Number(row.created_at) || 0
  const createdAt = created > 0 ? created : updated
  const updatedAt = updated > 0 ? updated : createdAt
  return {
    pack,
    notes: readEditorContent(db, TAGS_COLLECTION_PATH, row.id),
    createdAt,
    updatedAt,
  }
}

const TAG_ROW_SQL = 'id, label, fields_json, created_at, updated_at'

/** 分面目录由 File System 用 SQLite 管：目录 + 跨表倒排，查询不扫全表。 */
export class TagStore {
  private db: DatabaseSync | null = null
  readonly metaStore = new RecordMetaStore(() => this.ensure())
  private statsVersion = 0
  private filledCountsCache: { version: number; data: Record<string, Record<string, number>> } | null = null
  private observedOptionsCache = new BoundedMap<string, { version: number; data: Record<string, string[]> }>(256)

  private invalidateStatsCache() {
    this.statsVersion += 1
    this.filledCountsCache = null
    this.observedOptionsCache.clear()
  }

  open(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = openAndMigrateBiu(path)
    this.invalidateStatsCache()
    this.ensureCreatedAtColumn()
    this.ensureGroupIndexTables()
    this.metaStore.ensureTables()
    this.removeCollectedRowIndexes()
    return this
  }

  /** Repair old read-side indexing of synthetic /tags/<collection>::<id> rows. */
  private removeCollectedRowIndexes() {
    // These rows are derived projections; real tag definitions and all source
    // records are retained, including any legacy tag definition with this ID.
    const db = this.db!
    db.exec('SAVEPOINT repair_collected_tag_indexes')
    try {
      for (const table of ['tag_stamps', 'tag_record_values', 'tag_group_values']) {
        db.exec(`DELETE FROM ${table} WHERE collection = '/tags' AND instr(record_id, '::') > 0
          AND NOT EXISTS (SELECT 1 FROM tags WHERE tags.id = ${table}.record_id)`)
      }
      db.exec('RELEASE repair_collected_tag_indexes')
    } catch (error) {
      db.exec('ROLLBACK TO repair_collected_tag_indexes')
      db.exec('RELEASE repair_collected_tag_indexes')
      throw error
    }
  }

  private ensureGroupIndexTables() {
    this.db!.exec(`
      CREATE TABLE IF NOT EXISTS tag_group_fields (
        collection TEXT NOT NULL, field TEXT NOT NULL, signature TEXT NOT NULL,
        PRIMARY KEY (collection, field)
      );
      CREATE TABLE IF NOT EXISTS tag_group_values (
        collection TEXT NOT NULL, field TEXT NOT NULL, record_id TEXT NOT NULL, value TEXT NOT NULL,
        PRIMARY KEY (collection, field, record_id, value)
      );
      CREATE INDEX IF NOT EXISTS tag_group_lookup ON tag_group_values(collection, field, value, record_id);
      CREATE TABLE IF NOT EXISTS tag_attr_index (
        collection TEXT NOT NULL,
        pack_id TEXT NOT NULL,
        field_key TEXT NOT NULL,
        record_id TEXT NOT NULL,
        val_text TEXT NOT NULL DEFAULT '',
        val_num REAL,
        PRIMARY KEY (collection, pack_id, field_key, record_id)
      );
      CREATE INDEX IF NOT EXISTS tag_attr_text ON tag_attr_index(collection, pack_id, field_key, val_text, record_id);
      CREATE INDEX IF NOT EXISTS tag_attr_num ON tag_attr_index(collection, pack_id, field_key, val_num, record_id);
    `)
    const hasAttr = this.db!.prepare('SELECT 1 FROM tag_attr_index LIMIT 1').get()
    if (!hasAttr) {
      const hasValues = this.db!.prepare('SELECT 1 FROM tag_record_values LIMIT 1').get()
      if (hasValues) {
        this.backfillAttrIndex()
      }
    }
  }

  private backfillAttrIndex() {
    const db = this.db!
    const rows = db.prepare('SELECT collection, record_id, tag_json FROM tag_record_values').all() as Array<{
      collection: string
      record_id: string
      tag_json: string
    }>
    if (!rows.length) return
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const row of rows) {
        this.syncAttrIndexRecord(row.collection, row.record_id, normalizeSchemaValue(row.tag_json))
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  private indexGroupRecord(collection: string, field: string, recordId: string, tag: unknown) {
    const parsed = parseTagFlatColumnKey(field)!
    const spec = this.get(parsed.packId)?.fields.find(item => item.key === parsed.fieldKey && !item.deleted)
    const strategy = spec && strategyForField(spec)
    const db = this.ensure()
    db.prepare('DELETE FROM tag_group_values WHERE collection = ? AND field = ? AND record_id = ?').run(collection, field, recordId)
    if (!spec || !strategy) return
    const row = { id: recordId, tag: normalizeSchemaValue(tag) }
    // A detached tag must not keep contributing stale attribute values.
    if (!row.tag.tags.includes(parsed.packId)) return
    const values = strategy.bucketOf(row, { fieldKey: field, groupBy: field, field: spec })
    const insert = db.prepare('INSERT OR IGNORE INTO tag_group_values VALUES (?, ?, ?, ?)')
    for (const value of values) if (value !== '') insert.run(collection, field, recordId, value)
  }

  /** On-demand, persistent attribute index. Only indexed fields incur write work. */
  attributeGroups(collection: string, field: string, visibleIds: string[]) {
    const parsed = parseTagFlatColumnKey(field)
    const spec = parsed && this.get(parsed.packId)?.fields.find(item => item.key === parsed.fieldKey && !item.deleted)
    const strategy = spec && strategyForField(spec)
    if (!spec || !strategy || !['select', 'multi-select', 'tag', 'person', 'ref', 'multi-ref'].includes(strategy.kind)) return null
    const db = this.ensure()
    const signature = JSON.stringify(spec)
    const indexed = db.prepare('SELECT signature FROM tag_group_fields WHERE collection = ? AND field = ?').get(collection, field) as { signature: string } | undefined
    if (indexed?.signature !== signature) {
      db.exec('BEGIN IMMEDIATE')
      try {
        db.prepare('DELETE FROM tag_group_values WHERE collection = ? AND field = ?').run(collection, field)
        const rows = db.prepare(
          `SELECT v.record_id, v.tag_json FROM tag_stamps s
           INNER JOIN tag_record_values v ON v.collection = s.collection AND v.record_id = s.record_id
           WHERE s.collection = ? AND s.tag_id = ?`,
        ).all(collection, parsed.packId) as Array<{ record_id: string; tag_json: string }>
        for (const row of rows) this.indexGroupRecord(collection, field, row.record_id, row.tag_json)
        db.prepare('INSERT OR REPLACE INTO tag_group_fields VALUES (?, ?, ?)').run(collection, field, signature)
        db.exec('COMMIT')
      } catch (error) { db.exec('ROLLBACK'); throw error }
    }
    const ids = JSON.stringify([...new Set(visibleIds)])
    const groups = db.prepare(`SELECT v.value AS key, COUNT(*) AS total FROM json_each(?) a
      CROSS JOIN tag_group_values v ON a.value = v.record_id
      WHERE v.collection = ? AND v.field = ? GROUP BY v.value ORDER BY v.value`).all(ids, collection, field) as Array<{ key: string; total: number }>
    const filled = db.prepare(`SELECT COUNT(DISTINCT v.record_id) AS n FROM json_each(?) a
      CROSS JOIN tag_group_values v ON a.value = v.record_id WHERE v.collection = ? AND v.field = ?`).get(ids, collection, field) as { n: number }
    return [...groups.map(row => ({ key: row.key, total: Number(row.total) })), { key: '', total: new Set(visibleIds).size - filled.n }]
  }

  private ensureCreatedAtColumn() {
    const db = this.db!
    const cols = db.prepare('PRAGMA table_info(tags)').all() as Array<{ name: string }>
    if (!cols.some((col) => col.name === 'created_at')) {
      db.exec(`ALTER TABLE tags ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0`)
    }
    db.exec(`UPDATE tags SET created_at = updated_at WHERE created_at = 0 AND updated_at > 0`)
  }

  notes(id: string) {
    const want = String(id ?? '').trim()
    if (!want) return ''
    return readEditorContent(this.ensure(), TAGS_COLLECTION_PATH, want)
  }

  private dropTagGroupIndexes(tagId: string, fieldKey?: string) {
    const db = this.ensure()
    const fields = db.prepare('SELECT collection, field FROM tag_group_fields').all() as Array<{ collection: string; field: string }>
    for (const item of fields) {
      const parsed = parseTagFlatColumnKey(item.field)
      if (parsed?.packId !== tagId) continue
      if (fieldKey && parsed.fieldKey !== fieldKey) continue
      db.prepare('DELETE FROM tag_group_values WHERE collection = ? AND field = ?').run(item.collection, item.field)
      db.prepare('DELETE FROM tag_group_fields WHERE collection = ? AND field = ?').run(item.collection, item.field)
    }
  }

  private savePack(pack: CollectionSchemaPack, notes?: string) {
    const now = Date.now()
    const db = this.ensure()
    const prev = this.get(pack.id)
    const prevNotes = notes !== undefined && prev ? this.notes(pack.id) : ''
    db.prepare(
        `INSERT INTO tags (id, label, fields_json, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           label = excluded.label,
           fields_json = excluded.fields_json,
           updated_at = excluded.updated_at`,
      )
      .run(pack.id, pack.label, JSON.stringify(pack.fields), now, now)
    if (!prev || (notes !== undefined && notes !== prevNotes)) {
      writeEditorContent(db, TAGS_COLLECTION_PATH, pack.id, notes ?? '', { transaction: false })
    }
    if (!prev) return
    const renames = this.detectFieldKeyRenames(prev.fields, pack.fields)
    if (renames.size > 0) this.migrateRecordBagKeys(pack.id, renames)
    const liveNext = new Map(pack.fields.filter((field) => !field.deleted).map((field) => [field.key, field]))
    for (const field of prev.fields.filter((item) => !item.deleted)) {
      const next = liveNext.get(field.key)
      if (!next || JSON.stringify(next) !== JSON.stringify(field)) this.dropTagGroupIndexes(pack.id, field.key)
    }
  }

  private detectFieldKeyRenames(
    prevFields: CollectionSchemaPack['fields'],
    nextFields: CollectionSchemaPack['fields'],
  ): Map<string, string> {
    const prevLive = prevFields.filter((f) => !f.deleted)
    const nextLive = nextFields.filter((f) => !f.deleted)
    const prevKeys = new Set(prevLive.map((f) => f.key))
    const nextKeys = new Set(nextLive.map((f) => f.key))
    const removed = prevLive.filter((f) => !nextKeys.has(f.key))
    const added = nextLive.filter((f) => !prevKeys.has(f.key))
    const renames = new Map<string, string>()
    if (!removed.length || !added.length) return renames

    const usedNew = new Set<string>()
    // 1. 优先按相同 label 迁移（例如把旧的中文 key 迁到稳定数字 key）
    for (const oldF of removed) {
      const oldLabel = String(oldF.label ?? oldF.key).trim().toLowerCase()
      const hit = added.find(
        (newF) =>
          !usedNew.has(newF.key) &&
          newF.type === oldF.type &&
          String(newF.label ?? newF.key).trim().toLowerCase() === oldLabel,
      )
      if (hit) {
        renames.set(oldF.key, hit.key)
        usedNew.add(hit.key)
      }
    }
    // 2. 同长度、同位置、同类型的 1-to-1 改名迁移（例如通过 MCP/JSON 直接把旧 key 改成新名字）
    if (prevLive.length === nextLive.length) {
      for (let i = 0; i < prevLive.length; i += 1) {
        const oldF = prevLive[i]!
        const newF = nextLive[i]!
        if (oldF.key === newF.key) continue
        if (nextKeys.has(oldF.key) || prevKeys.has(newF.key)) continue
        if (renames.has(oldF.key) || usedNew.has(newF.key)) continue
        if (oldF.type !== newF.type) continue
        renames.set(oldF.key, newF.key)
        usedNew.add(newF.key)
      }
    }
    return renames
  }

  private migrateRecordBagKeys(tagId: string, renames: Map<string, string>) {
    const want = String(tagId ?? '').trim()
    if (!want || renames.size === 0) return
    const db = this.ensure()
    const rows = db.prepare('SELECT collection, record_id, tag_json FROM tag_record_values').all() as Array<{
      collection: string
      record_id: string
      tag_json: string
    }>
    for (const row of rows) {
      let parsed: ReturnType<typeof normalizeSchemaValue>
      try {
        parsed = normalizeSchemaValue(JSON.parse(row.tag_json || '{}'))
      } catch {
        continue
      }
      const bag = parsed.values[want]
      if (!bag) continue
      let changed = false
      const nextBag: Record<string, unknown> = { ...bag }
      for (const [oldKey, newKey] of renames) {
        if (!Object.prototype.hasOwnProperty.call(nextBag, oldKey)) continue
        if (!Object.prototype.hasOwnProperty.call(nextBag, newKey) || nextBag[newKey] == null || nextBag[newKey] === '') {
          nextBag[newKey] = nextBag[oldKey]
        }
        delete nextBag[oldKey]
        changed = true
      }
      if (!changed) continue
      const values = { ...parsed.values, [want]: nextBag }
      this.writeRecordTag(row.collection, row.record_id, { tags: parsed.tags, values }, row.record_id)
    }
  }

  private bagValueFilled(value: unknown) {
    if (value == null) return false
    if (typeof value === 'string' && !value.trim()) return false
    if (Array.isArray(value) && value.length === 0) return false
    return true
  }

  pruneRecordBags(tagId: string, keep: Set<string>) {
    const want = String(tagId ?? '').trim()
    if (!want) return
    const db = this.ensure()
    const rows = db.prepare('SELECT collection, record_id, tag_json FROM tag_record_values').all() as Array<{
      collection: string
      record_id: string
      tag_json: string
    }>
    for (const row of rows) {
      let parsed: ReturnType<typeof normalizeSchemaValue>
      try {
        parsed = normalizeSchemaValue(JSON.parse(row.tag_json || '{}'))
      } catch {
        continue
      }
      const bag = parsed.values[want]
      if (!bag) continue
      let changed = false
      const nextBag: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(bag)) {
        if (!keep.has(key)) {
          changed = true
          continue
        }
        nextBag[key] = value
      }
      if (!changed) continue
      const values = { ...parsed.values, [want]: nextBag }
      this.writeRecordTag(row.collection, row.record_id, { tags: parsed.tags, values }, row.record_id)
    }
  }

  purgePackField(tagId: string, fieldKey: string) {
    const want = String(tagId ?? '').trim()
    const key = String(fieldKey ?? '').trim()
    if (!want || !key) return
    const db = this.ensure()
    const rows = db.prepare('SELECT collection, record_id, tag_json FROM tag_record_values').all() as Array<{
      collection: string
      record_id: string
      tag_json: string
    }>
    for (const row of rows) {
      let parsed: ReturnType<typeof normalizeSchemaValue>
      try {
        parsed = normalizeSchemaValue(JSON.parse(row.tag_json || '{}'))
      } catch {
        continue
      }
      const bag = parsed.values[want]
      if (!bag || !Object.prototype.hasOwnProperty.call(bag, key)) continue
      const nextBag = { ...bag }
      delete nextBag[key]
      const values = { ...parsed.values, [want]: nextBag }
      this.writeRecordTag(row.collection, row.record_id, { tags: parsed.tags, values }, row.record_id)
    }
  }

  /** 统计某个标签下各 select / multi-select 字段在历史记录中出现过的值，供 Agent / MCP 自动发现候选枚举。 */
  observedFieldOptions(tagId: string, limit = 20): Record<string, string[]> {
    const want = String(tagId ?? '').trim()
    if (!want) return {}
    const cacheKey = `${want}\0${limit}`
    const cached = this.observedOptionsCache.get(cacheKey)
    if (cached && cached.version === this.statsVersion) return cached.data
    const pack = this.get(want)
    if (!pack) return {}
    const selectKeys = new Set(
      pack.fields
        .filter((f) => !f.deleted && (f.type === 'select' || f.type === 'multi-select') && !f.enum?.length)
        .map((f) => f.key),
    )
    if (!selectKeys.size) return {}
    const counts = new Map<string, Map<string, number>>()
    // 先在 SQLite 层用 instr 过滤包含目标 tagId 的行，避免无关记录进入 JS JSON.parse。
    const rows = this.ensure()
      .prepare('SELECT tag_json FROM tag_record_values WHERE instr(tag_json, ?) > 0')
      .all(want) as Array<{ tag_json: string }>
    for (const row of rows) {
      let parsed: ReturnType<typeof normalizeSchemaValue>
      try {
        parsed = normalizeSchemaValue(JSON.parse(row.tag_json || '{}'))
      } catch {
        continue
      }
      const bag = parsed.values[want]
      if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue
      for (const key of selectKeys) {
        const raw = bag[key]
        const vals = Array.isArray(raw) ? raw : raw != null ? [raw] : []
        for (const item of vals) {
          const text = String(item ?? '').trim()
          if (!text) continue
          let map = counts.get(key)
          if (!map) {
            map = new Map()
            counts.set(key, map)
          }
          map.set(text, (map.get(text) ?? 0) + 1)
        }
      }
    }
    const out: Record<string, string[]> = {}
    for (const [key, map] of counts) {
      const sorted = [...map.entries()]
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
        .slice(0, limit)
        .map(([val]) => val)
      if (sorted.length) out[key] = sorted
    }
    this.observedOptionsCache.set(cacheKey, { version: this.statsVersion, data: out })
    return out
  }

  filledFieldCounts(): Record<string, Record<string, number>> {
    if (this.filledCountsCache && this.filledCountsCache.version === this.statsVersion) {
      return this.filledCountsCache.data
    }
    const live = new Map(
      this.list().map((pack) => [
        pack.id,
        new Set(pack.fields.filter((field) => !field.deleted).map((field) => field.key)),
      ]),
    )
    const rows = this.ensure().prepare('SELECT tag_json FROM tag_record_values').all() as Array<{ tag_json: string }>
    const out: Record<string, Record<string, number>> = {}
    for (const row of rows) {
      let parsed: ReturnType<typeof normalizeSchemaValue>
      try {
        parsed = normalizeSchemaValue(JSON.parse(row.tag_json || '{}'))
      } catch {
        continue
      }
      for (const [tagId, bag] of Object.entries(parsed.values)) {
        if (!bag || typeof bag !== 'object' || Array.isArray(bag)) continue
        const keep = live.get(tagId)
        if (keep && keep.size === 0) continue
        const counts = (out[tagId] ??= {})
        for (const [key, value] of Object.entries(bag)) {
          if (keep && !keep.has(key)) continue
          if (!this.bagValueFilled(value)) continue
          counts[key] = (counts[key] ?? 0) + 1
        }
        if (!Object.keys(counts).length) delete out[tagId]
      }
    }
    this.filledCountsCache = { version: this.statsVersion, data: out }
    return out
  }

  ensure() {
    if (!this.db) this.open(':memory:')
    return this.db!
  }

  list(query = ''): CollectionSchemaPack[] {
    const q = query.trim().toLowerCase()
    const rows = this.ensure().prepare(`
      SELECT t.id, t.label, t.fields_json FROM tags t
      WHERE NOT EXISTS (
        SELECT 1 FROM record_meta m
        WHERE m.collection = '/tags' AND m.record_id = t.id AND m.deleted_at > 0
      ) AND (? = '' OR instr(lower(t.id), ?) > 0 OR instr(lower(t.label), ?) > 0)
      ORDER BY t.label
    `).all(q, q, q) as TagRow[]
    return rows.map(packFromRow).filter((pack): pack is CollectionSchemaPack => Boolean(pack))
  }

  entries(query = ''): TagEntry[] {
    const db = this.ensure()
    const q = query.trim().toLowerCase()
    const rows = (
      q
        ? (db
            .prepare(
              `SELECT ${TAG_ROW_SQL} FROM tags
               WHERE instr(lower(id), ?) > 0 OR instr(lower(label), ?) > 0
               ORDER BY label`,
            )
            .all(q, q) as TagRow[])
        : (db.prepare(`SELECT ${TAG_ROW_SQL} FROM tags ORDER BY label`).all() as TagRow[])
    )
    return rows
      .map((row) => entryFromRow(db, row))
      .filter((item): item is TagEntry => item !== null && !this.isDeleted(TAGS_COLLECTION_PATH, item.pack.id))
  }

  get(idOrLabel: string): CollectionSchemaPack | null {
    const want = String(idOrLabel ?? '').trim()
    if (!want) return null
    const row = this.ensure()
      .prepare('SELECT id, label, fields_json FROM tags WHERE id = ? OR label = ? LIMIT 1')
      .get(want, want) as TagRow | undefined
    return row ? packFromRow(row) : null
  }

  entry(idOrLabel: string): TagEntry | null {
    const want = String(idOrLabel ?? '').trim()
    if (!want) return null
    const row = this.ensure()
      .prepare(`SELECT ${TAG_ROW_SQL} FROM tags WHERE id = ? OR label = ? LIMIT 1`)
      .get(want, want) as TagRow | undefined
    return row ? entryFromRow(this.ensure(), row) : null
  }

  replace(tags: unknown[]): CollectionSchemaPack[] {
    const db = this.ensure()
    const next = tags.map((item) => normalizeSchemaPack(item)).filter((item): item is CollectionSchemaPack => Boolean(item))
    const keep = new Set(next.map((tag) => tag.id))
    db.exec('BEGIN IMMEDIATE')
    try {
      for (const tag of next) {
        this.savePack(tag)
      }
      const existing = db.prepare('SELECT id FROM tags').all() as Array<{ id: string }>
      for (const row of existing) {
        if (keep.has(row.id)) continue
        db.prepare('DELETE FROM tag_stamps WHERE tag_id = ?').run(row.id)
        db.prepare('DELETE FROM tags WHERE id = ?').run(row.id)
        this.dropTagGroupIndexes(row.id)
      }
      db.exec('COMMIT')
      this.invalidateStatsCache()
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
    return this.list()
  }

  upsert(raw: unknown, notes?: string): CollectionSchemaPack {
    const pack = normalizeSchemaPack(raw)
    if (!pack) throw new Error('invalid 标签')
    const nextNotes = notes !== undefined ? String(notes) : undefined
    if (this.isDeleted(TAGS_COLLECTION_PATH, pack.id)) this.restoreDeleted(TAGS_COLLECTION_PATH, pack.id)
    this.savePack(pack, nextNotes)
    this.invalidateStatsCache()
    return pack
  }

  removeTag(id: string): boolean {
    const db = this.ensure()
    const want = String(id ?? '').trim()
    if (!want) return false
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM tag_stamps WHERE tag_id = ?').run(want)
      const result = db.prepare('DELETE FROM tags WHERE id = ?').run(want)
      this.dropTagGroupIndexes(want)
      db.exec('COMMIT')
      this.invalidateStatsCache()
      return Number(result.changes) > 0
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  stampCounts(): Record<string, number> {
    const rows = this.ensure()
      .prepare('SELECT tag_id, COUNT(*) AS n FROM tag_stamps GROUP BY tag_id')
      .all() as Array<{ tag_id: string; n: number | bigint }>
    const out: Record<string, number> = {}
    for (const row of rows) out[row.tag_id] = Number(row.n)
    return out
  }

  indexRecord(collection: string, recordId: string, title: string, tagIds: string[]) {
    const db = this.ensure()
    const ids = [...new Set(tagIds.map((id) => String(id).trim()).filter(Boolean))]
    db.exec('SAVEPOINT tag_stamp_write')
    try {
      db.prepare('DELETE FROM tag_stamps WHERE collection = ? AND record_id = ?').run(collection, recordId)
      const insert = db.prepare(
        'INSERT INTO tag_stamps (tag_id, collection, record_id, title) VALUES (?, ?, ?, ?)',
      )
      for (const tagId of ids) insert.run(tagId, collection, recordId, title)
      db.exec('RELEASE tag_stamp_write')
    } catch (error) {
      db.exec('ROLLBACK TO tag_stamp_write')
      db.exec('RELEASE tag_stamp_write')
      throw error
    }
  }

  recordTag(collection: string, recordId: string): SchemaFieldValue | null {
    const row = this.ensure()
      .prepare('SELECT tag_json FROM tag_record_values WHERE collection = ? AND record_id = ?')
      .get(collection, recordId) as { tag_json: string } | undefined
    if (!row) return null
    return normalizeSchemaValue(row.tag_json)
  }

  writeRecordTag(collection: string, recordId: string, tag: unknown, title: string) {
    const value = retainArchivedSchemaValue(tag, this.list())
    const db = this.ensure()
    db.exec('SAVEPOINT tag_value_write')
    try {
      if (isEmptySchemaValue(value)) {
        db.prepare('DELETE FROM tag_record_values WHERE collection = ? AND record_id = ?').run(collection, recordId)
        this.indexRecord(collection, recordId, title, [])
        this.syncAttrIndexRecord(collection, recordId, value)
        this.updateGroupRecord(collection, recordId, value)
        this.invalidateStatsCache()
        return value
      }
      db.prepare(
        `INSERT INTO tag_record_values (collection, record_id, tag_json)
         VALUES (?, ?, ?)
         ON CONFLICT(collection, record_id) DO UPDATE SET tag_json = excluded.tag_json`,
      ).run(collection, recordId, JSON.stringify(value))
      this.indexRecord(collection, recordId, title, value.tags)
      this.syncAttrIndexRecord(collection, recordId, value)
      this.updateGroupRecord(collection, recordId, value)
      this.invalidateStatsCache()
      return value
    } catch (error) {
      db.exec('ROLLBACK TO tag_value_write')
      throw error
    } finally {
      db.exec('RELEASE tag_value_write')
    }
  }

  private syncAttrIndexRecord(collection: string, recordId: string, value: SchemaFieldValue) {
    const db = this.ensure()
    db.prepare('DELETE FROM tag_attr_index WHERE collection = ? AND record_id = ?').run(collection, recordId)
    if (!value.tags.length) return
    const insert = db.prepare(
      `INSERT OR REPLACE INTO tag_attr_index (collection, pack_id, field_key, record_id, val_text, val_num)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const packId of value.tags) {
      const bag = value.values[packId]
      if (!bag || typeof bag !== 'object') continue
      for (const [fieldKey, raw] of Object.entries(bag)) {
        if (raw === null || raw === undefined || raw === '') continue
        let valText = ''
        let valNum: number | null = null
        if (typeof raw === 'number' && Number.isFinite(raw)) {
          valText = String(raw)
          valNum = raw
        } else if (typeof raw === 'boolean') {
          valText = raw ? 'true' : 'false'
          valNum = raw ? 1 : 0
        } else if (typeof raw === 'string') {
          valText = raw
          const trimmed = raw.trim()
          if (trimmed && /^-?(?:\d+\.?\d*|\.\d+)$/.test(trimmed)) {
            const n = Number(trimmed)
            if (Number.isFinite(n)) valNum = n
          }
        } else if (Array.isArray(raw)) {
          valText = raw.map((item) => String(item ?? '')).filter(Boolean).join(', ')
        } else if (typeof raw === 'object') {
          try {
            valText = JSON.stringify(raw)
          } catch {
            valText = ''
          }
        }
        insert.run(collection, packId, fieldKey, recordId, valText, valNum)
      }
    }
  }

  private updateGroupRecord(collection: string, recordId: string, tag: unknown) {
    const fields = this.ensure().prepare('SELECT field FROM tag_group_fields WHERE collection = ?').all(collection) as Array<{ field: string }>
    for (const { field } of fields) this.indexGroupRecord(collection, field, recordId, tag)
  }

  recordMeta(collection: string, recordId: string) {
    return this.metaStore.recordMeta(collection, recordId)
  }

  recordBanner(collection: string, recordId: string): PageBanner | null {
    return this.metaStore.recordBanner(collection, recordId)
  }

  writeRecordBanner(collection: string, recordId: string, banner: PageBanner | null) {
    return this.metaStore.writeRecordBanner(collection, recordId, banner)
  }

  rememberBannerGallery(banner: PageBanner, title = '自定义') {
    this.metaStore.rememberBannerGallery(banner, title)
  }

  listBannerGallery(): Array<{ id: string; kind: PageBannerKind; style: string; title: string; html: string }> {
    return this.metaStore.listBannerGallery()
  }

  forgetBannerGallery(id: string) {
    return this.metaStore.forgetBannerGallery(id)
  }

  writeRecordMeta(
    collection: string,
    recordId: string,
    patch: {
      emoji?: string
      tags?: string[]
      createdBy?: PersonValue | null
      updatedBy?: PersonValue[] | PersonValue | null
    },
  ) {
    return this.metaStore.writeRecordMeta(collection, recordId, patch)
  }

  deletedIds(collection: string) {
    return this.metaStore.deletedIds(collection)
  }

  isDeleted(collection: string, recordId: string) {
    return this.metaStore.isDeleted(collection, recordId)
  }

  markDeleted(collection: string, recordId: string, at = Date.now()) {
    this.metaStore.markDeleted(collection, recordId, at)
  }

  restoreDeleted(collection: string, recordId: string) {
    this.metaStore.restoreDeleted(collection, recordId)
  }

  listDeleted() {
    return this.metaStore.listDeleted()
  }

  removeRecord(collection: string, recordId: string) {
    const db = this.ensure()
    db.prepare('DELETE FROM tag_stamps WHERE collection = ? AND record_id = ?').run(collection, recordId)
    db.prepare('DELETE FROM tag_record_values WHERE collection = ? AND record_id = ?').run(collection, recordId)
    db.prepare('DELETE FROM tag_attr_index WHERE collection = ? AND record_id = ?').run(collection, recordId)
    db.prepare('DELETE FROM tag_group_values WHERE collection = ? AND record_id = ?').run(collection, recordId)
    this.metaStore.removeRecordMetaRows(collection, recordId)
    this.invalidateStatsCache()
  }

  putAttachment(row: { name: string; etag: string; mime: string; bytes: number; kind?: string; storage?: string }) {
    this.metaStore.putAttachment(row)
  }

  linkContentRef(collection: string, recordId: string, name: string, source = 'content') {
    this.metaStore.linkContentRef(collection, recordId, name, source)
  }

  replaceContentRefs(collection: string, recordId: string, content: Iterable<string>, banner: Iterable<string> = []) {
    this.metaStore.replaceContentRefs(collection, recordId, content, banner)
  }

  replaceAssetRefs(collection: string, recordId: string, names: Iterable<string>) {
    this.metaStore.replaceAssetRefs(collection, recordId, names)
  }

  upsertBlockRef(collection: string, recordId: string, blockId: string, name: string, source: string) {
    this.metaStore.upsertBlockRef(collection, recordId, blockId, name, source)
  }

  replaceBlockRefs(
    collection: string,
    recordId: string,
    blockId: string,
    refs: Array<{ name: string; source: string }>,
  ) {
    this.metaStore.replaceBlockRefs(collection, recordId, blockId, refs)
  }

  dropBlockRefs(collection: string, recordId: string, blockId?: string) {
    this.metaStore.dropBlockRefs(collection, recordId, blockId)
  }

  listedAttachmentNames(collection: string, recordId: string): string[] {
    return this.metaStore.listedAttachmentNames(collection, recordId)
  }

  recordsReferencingAsset(name: string) {
    return this.metaStore.recordsReferencingAsset(name)
  }

  stampedIds(collection: string, tagIdOrLabel: string): Set<string> {
    const tag = this.get(tagIdOrLabel)
    const tagId = tag?.id ?? tagIdOrLabel
    const rows = this.ensure()
      .prepare('SELECT record_id FROM tag_stamps WHERE collection = ? AND tag_id = ?')
      .all(collection, tagId) as Array<{ record_id: string }>
    return new Set(rows.map((row) => row.record_id))
  }

  collect(idOrLabel: string): { tag: CollectionSchemaPack | null; items: TagStamp[] } {
    const tag = this.get(idOrLabel)
    const tagId = tag?.id ?? String(idOrLabel ?? '').trim()
    if (!tagId) return { tag: null, items: [] }
    const rows = this.ensure()
      .prepare(
        'SELECT tag_id, collection, record_id, title FROM tag_stamps WHERE tag_id = ? ORDER BY collection, record_id',
      )
      .all(tagId) as StampRow[]
    return {
      tag,
      items: rows.map((row) => ({
        collection: row.collection,
        id: row.record_id,
        path: `${row.collection}/${row.record_id}`,
        title: row.title,
      })),
    }
  }
}
