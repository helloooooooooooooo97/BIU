import {
  replaceContentRefs as replaceContentRefsRows,
  upsertAttachmentRow,
} from '@biu/host-plugin-loader/data-dir'
import {
  asPerson,
  asPersonList,
  collectAssetNames,
  type PersonValue,
} from '@biu/type-file-system'
import { bannerGalleryId, isBannerPreset } from '../banner-presets.ts'
import { parsePageBanner, type PageBanner, type PageBannerKind } from '../page-banner.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export type RecordMetaSnapshot = {
  emoji: string | null
  tags: string[] | null
  createdBy: PersonValue | null
  updatedBy: PersonValue[]
  deletedAt: number | null
}

/**
 * 负责记录通用元数据（emoji / createdBy / updatedBy / deletedAt）、
 * 页面横幅（record_banners / banner_gallery）以及附件引用（content_refs / block_refs）的持久化与生命周期。
 */
export class RecordMetaStore {
  constructor(private readonly ensureDb: () => DatabaseSync) {}

  ensureTables() {
    this.ensurePersonMetaColumns()
    this.ensureDeletedAtColumn()
    this.ensureBannerTable()
  }

  private ensurePersonMetaColumns() {
    const db = this.ensureDb()
    const cols = db.prepare('PRAGMA table_info(record_meta)').all() as Array<{ name: string }>
    const names = new Set(cols.map((col) => col.name))
    if (!names.has('created_by_json')) db.exec(`ALTER TABLE record_meta ADD COLUMN created_by_json TEXT`)
    if (!names.has('updated_by_json')) db.exec(`ALTER TABLE record_meta ADD COLUMN updated_by_json TEXT`)
    if (!names.has('deleted_at')) db.exec(`ALTER TABLE record_meta ADD COLUMN deleted_at INTEGER`)
  }

  private ensureDeletedAtColumn() {
    const db = this.ensureDb()
    const cols = db.prepare('PRAGMA table_info(record_meta)').all() as Array<{ name: string }>
    if (!cols.some((col) => col.name === 'deleted_at')) {
      db.exec(`ALTER TABLE record_meta ADD COLUMN deleted_at INTEGER`)
    }
    db.exec('CREATE INDEX IF NOT EXISTS record_meta_deleted ON record_meta(collection, deleted_at)')
  }

  private ensureBannerTable() {
    const db = this.ensureDb()
    const cols = db.prepare('PRAGMA table_info(record_meta)').all() as Array<{ name: string }>
    if (!cols.some((col) => col.name === 'banner_json')) return
    const rows = db
      .prepare('SELECT collection, record_id, banner_json FROM record_meta WHERE banner_json IS NOT NULL AND banner_json != \'\'')
      .all() as Array<{ collection: string; record_id: string; banner_json: string }>
    const put = db.prepare(
      `INSERT INTO record_banners (collection, record_id, kind, html)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(collection, record_id) DO UPDATE SET kind = excluded.kind, html = excluded.html`,
    )
    for (const row of rows) {
      let parsed: PageBanner | null = null
      try {
        parsed = parsePageBanner(JSON.parse(row.banner_json))
      } catch {
        parsed = parsePageBanner(row.banner_json)
      }
      if (!parsed) continue
      put.run(row.collection, row.record_id, parsed.kind, parsed.html)
    }
  }

  recordMeta(collection: string, recordId: string): RecordMetaSnapshot | null {
    const row = this.ensureDb()
      .prepare('SELECT emoji, tags_json, created_by_json, updated_by_json, deleted_at FROM record_meta WHERE collection = ? AND record_id = ?')
      .get(collection, recordId) as {
        emoji: string | null
        tags_json: string | null
        created_by_json?: string | null
        updated_by_json?: string | null
        deleted_at?: number | null
      } | undefined
    if (!row) return null
    let tags: string[] | null = null
    if (row.tags_json != null) {
      try {
        const parsed = JSON.parse(row.tags_json) as unknown
        tags = Array.isArray(parsed)
          ? [...new Set(parsed.map((item) => String(item).trim()).filter(Boolean))]
          : []
      } catch {
        tags = []
      }
    }
    const parsePerson = (raw: string | null | undefined) => {
      if (raw == null || raw === '') return null
      try {
        return asPerson(JSON.parse(raw))
      } catch {
        return asPerson(raw)
      }
    }
    const parsePeople = (raw: string | null | undefined) => {
      if (raw == null || raw === '') return []
      try {
        return asPersonList(JSON.parse(raw))
      } catch {
        return asPersonList(raw)
      }
    }
    return {
      emoji: row.emoji != null ? String(row.emoji) : null,
      tags,
      createdBy: parsePerson(row.created_by_json),
      updatedBy: parsePeople(row.updated_by_json),
      deletedAt: Number(row.deleted_at) > 0 ? Number(row.deleted_at) : null,
    }
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
  ): { emoji: string | null; tags: string[] | null; createdBy: PersonValue | null; updatedBy: PersonValue[] } {
    this.ensureDb()
      .prepare(
        `INSERT INTO record_meta (collection, record_id, emoji, tags_json, created_by_json, updated_by_json)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(collection, record_id) DO UPDATE SET
           emoji = COALESCE(excluded.emoji, record_meta.emoji),
           tags_json = COALESCE(excluded.tags_json, record_meta.tags_json),
           created_by_json = COALESCE(excluded.created_by_json, record_meta.created_by_json),
           updated_by_json = COALESCE(excluded.updated_by_json, record_meta.updated_by_json)`,
      )
      .run(
        collection,
        recordId,
        patch.emoji !== undefined ? String(patch.emoji ?? '') : null,
        patch.tags !== undefined
          ? JSON.stringify([...new Set(patch.tags.map((item) => String(item).trim()).filter(Boolean))])
          : null,
        patch.createdBy !== undefined ? JSON.stringify(patch.createdBy) : null,
        patch.updatedBy !== undefined ? JSON.stringify(asPersonList(patch.updatedBy)) : null,
      )
    return this.recordMeta(collection, recordId) ?? { emoji: null, tags: null, createdBy: null, updatedBy: [], deletedAt: null }
  }

  recordBanner(collection: string, recordId: string): PageBanner | null {
    const row = this.ensureDb()
      .prepare('SELECT kind, html FROM record_banners WHERE collection = ? AND record_id = ?')
      .get(collection, recordId) as { kind?: string; html?: string } | undefined
    if (!row || typeof row.html !== 'string' || !row.html.trim()) return null
    return parsePageBanner({ kind: row.kind, html: row.html })
  }

  writeRecordBanner(collection: string, recordId: string, banner: PageBanner | null) {
    const db = this.ensureDb()
    if (!banner) {
      db.prepare('DELETE FROM record_banners WHERE collection = ? AND record_id = ?').run(collection, recordId)
      return null
    }
    db.prepare(
      `INSERT INTO record_banners (collection, record_id, kind, html)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(collection, record_id) DO UPDATE SET kind = excluded.kind, html = excluded.html`,
    ).run(collection, recordId, banner.kind, banner.html)
    if (!isBannerPreset(banner)) this.rememberBannerGallery(banner)
    return this.recordBanner(collection, recordId)
  }

  rememberBannerGallery(banner: PageBanner, title = '自定义') {
    if (isBannerPreset(banner)) return
    const html = banner.html.trim()
    if (!html) return
    const id = bannerGalleryId(banner.kind, html)
    this.ensureDb()
      .prepare(
        `INSERT INTO banner_gallery (id, kind, style, title, html, created_at)
         VALUES (?, ?, 'mine', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, html = excluded.html`,
      )
      .run(id, banner.kind, title, html, Date.now())
  }

  listBannerGallery(): Array<{ id: string; kind: PageBannerKind; style: string; title: string; html: string }> {
    const rows = this.ensureDb()
      .prepare('SELECT id, kind, style, title, html FROM banner_gallery ORDER BY created_at DESC')
      .all() as Array<{ id: string; kind: string; style: string; title: string; html: string }>
    return rows.flatMap((row) => {
      const parsed = parsePageBanner({ kind: row.kind, html: row.html })
      if (!parsed || isBannerPreset(parsed)) return []
      return [{ id: row.id, kind: parsed.kind, style: row.style || 'mine', title: row.title || '自定义', html: parsed.html }]
    })
  }

  forgetBannerGallery(id: string) {
    const key = id.trim()
    if (!key) return false
    const result = this.ensureDb().prepare('DELETE FROM banner_gallery WHERE id = ?').run(key)
    return Number(result.changes) > 0
  }

  deletedIds(collection: string) {
    const rows = this.ensureDb()
      .prepare('SELECT record_id FROM record_meta WHERE collection = ? AND deleted_at IS NOT NULL AND deleted_at > 0')
      .all(collection) as Array<{ record_id: string }>
    return new Set(rows.map((row) => row.record_id))
  }

  isDeleted(collection: string, recordId: string) {
    const row = this.ensureDb()
      .prepare('SELECT deleted_at FROM record_meta WHERE collection = ? AND record_id = ?')
      .get(collection, recordId) as { deleted_at?: number | null } | undefined
    return Number(row?.deleted_at) > 0
  }

  markDeleted(collection: string, recordId: string, at = Date.now()) {
    this.ensureDb()
      .prepare(
        `INSERT INTO record_meta (collection, record_id, deleted_at)
         VALUES (?, ?, ?)
         ON CONFLICT(collection, record_id) DO UPDATE SET deleted_at = excluded.deleted_at`,
      )
      .run(collection, recordId, at)
  }

  restoreDeleted(collection: string, recordId: string) {
    this.ensureDb()
      .prepare('UPDATE record_meta SET deleted_at = NULL WHERE collection = ? AND record_id = ?')
      .run(collection, recordId)
  }

  listDeleted() {
    return this.ensureDb()
      .prepare(
        `SELECT collection, record_id, deleted_at FROM record_meta
         WHERE deleted_at IS NOT NULL AND deleted_at > 0
         ORDER BY deleted_at DESC`,
      )
      .all() as Array<{ collection: string; record_id: string; deleted_at: number }>
  }

  removeRecordMetaRows(collection: string, recordId: string) {
    const db = this.ensureDb()
    db.prepare('DELETE FROM record_meta WHERE collection = ? AND record_id = ?').run(collection, recordId)
    db.prepare('DELETE FROM record_banners WHERE collection = ? AND record_id = ?').run(collection, recordId)
    db.prepare('DELETE FROM content_refs WHERE collection = ? AND record_id = ?').run(collection, recordId)
    db.prepare('DELETE FROM block_refs WHERE collection = ? AND record_id = ?').run(collection, recordId)
  }

  putAttachment(row: { name: string; etag: string; mime: string; bytes: number; kind?: string; storage?: string }) {
    upsertAttachmentRow(this.ensureDb(), row)
  }

  linkContentRef(collection: string, recordId: string, name: string, source = 'content') {
    const file = String(name ?? '').trim()
    if (!file || !collection || !recordId) return
    this.ensureDb()
      .prepare('INSERT OR IGNORE INTO content_refs (collection, record_id, name, source) VALUES (?, ?, ?, ?)')
      .run(collection, recordId, file, source)
  }

  replaceContentRefs(collection: string, recordId: string, content: Iterable<string>, banner: Iterable<string> = []) {
    const db = this.ensureDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      replaceContentRefsRows(db, collection, recordId, content, banner)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  replaceAssetRefs(collection: string, recordId: string, names: Iterable<string>) {
    const db = this.ensureDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM content_refs WHERE collection = ? AND record_id = ? AND source = ?').run(
        collection,
        recordId,
        'asset',
      )
      const insert = db.prepare(
        'INSERT OR IGNORE INTO content_refs (collection, record_id, name, source) VALUES (?, ?, ?, ?)',
      )
      for (const name of names) {
        const file = String(name ?? '').trim()
        if (file) insert.run(collection, recordId, file, 'asset')
      }
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  upsertBlockRef(collection: string, recordId: string, blockId: string, name: string, source: string) {
    this.ensureDb()
      .prepare(
        `INSERT INTO block_refs (collection, record_id, block_id, name, source)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(collection, record_id, block_id, name, source) DO NOTHING`,
      )
      .run(collection, recordId, blockId, name, source)
  }

  replaceBlockRefs(
    collection: string,
    recordId: string,
    blockId: string,
    refs: Array<{ name: string; source: string }>,
  ) {
    const db = this.ensureDb()
    db.exec('BEGIN IMMEDIATE')
    try {
      db.prepare('DELETE FROM block_refs WHERE collection = ? AND record_id = ? AND block_id = ?').run(
        collection,
        recordId,
        blockId,
      )
      const insert = db.prepare(
        'INSERT INTO block_refs (collection, record_id, block_id, name, source) VALUES (?, ?, ?, ?, ?)',
      )
      for (const ref of refs) insert.run(collection, recordId, blockId, ref.name, ref.source)
      db.exec('COMMIT')
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }

  dropBlockRefs(collection: string, recordId: string, blockId?: string) {
    if (blockId) {
      this.ensureDb()
        .prepare('DELETE FROM block_refs WHERE collection = ? AND record_id = ? AND block_id = ?')
        .run(collection, recordId, blockId)
      return
    }
    this.ensureDb().prepare('DELETE FROM block_refs WHERE collection = ? AND record_id = ?').run(collection, recordId)
  }

  listedAttachmentNames(collection: string, recordId: string): string[] {
    const db = this.ensureDb()
    const names = new Set<string>()
    for (const row of db
      .prepare('SELECT name FROM content_refs WHERE collection = ? AND record_id = ?')
      .all(collection, recordId) as Array<{ name: string }>) {
      names.add(row.name)
    }
    for (const row of db
      .prepare('SELECT name FROM block_refs WHERE collection = ? AND record_id = ?')
      .all(collection, recordId) as Array<{ name: string }>) {
      names.add(row.name)
    }
    return [...names].sort()
  }

  recordsReferencingAsset(name: string) {
    const file = String(name ?? '').trim()
    const linked = this.ensureDb()
      .prepare(
        `SELECT collection, record_id FROM content_refs WHERE name = ?
         UNION
         SELECT collection, record_id FROM block_refs WHERE name = ?`,
      )
      .all(file, file) as Array<{ collection: string; record_id: string }>
    if (linked.length || !file) return linked
    const rows = this.ensureDb()
      .prepare('SELECT collection, record_id, tag_json FROM tag_record_values')
      .all() as Array<{ collection: string; record_id: string; tag_json?: string }>
    return rows.filter((row) => collectAssetNames(row.tag_json).has(file))
  }
}
