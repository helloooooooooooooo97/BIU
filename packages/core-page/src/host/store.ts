import { access, mkdir, unlink } from 'node:fs/promises'
import { basename, join } from 'node:path'
import type { CollectionListQuery, DbRecord, SchemaFieldValue } from '@biu/type-file-system'
import { allocateRecordId, emptySchemaValue, isAssetFileName, isAssignableRecordId, normalizeSchemaValue } from '@biu/type-file-system'
import {
  DATA_DIR_NAME,
  adoptCasAssets,
  assetsRootPath,
  dataHome,
  migrateLegacyPageDir,
  openAndMigrateBiu,
  PAGE_DB,
  PAGE_ROOT,
  hashedAssetRel,
  isHashedAssetName,
  readContentAddressed,
  readDocument,
  writeDocument,
  AssetConflictError,
  upsertAttachmentRow,
  writeEditorContent,
  readEditorContent,
  gcCasAssets,
  ASSET_GC_GRACE_MS as SHARED_ASSET_GC_GRACE_MS,
  workspaceFromSqlite,
} from '@biu/host-plugin-loader/data-dir'
import { splitMarkdown } from './markdown.ts'

export { PAGE_ROOT, PAGE_DB, PAGE_ASSETS } from '@biu/host-plugin-loader/data-dir'
export { AssetConflictError as PageAssetConflictError } from '@biu/host-plugin-loader/data-dir'
export const ASSET_GC_GRACE_MS = SHARED_ASSET_GC_GRACE_MS

const ID_RE = /^[A-Za-z0-9._-]+$/

export function isPageAssetFileName(name: string) {
  return isAssetFileName(name)
}

export type PageRow = DbRecord & {
  title: string
  tags: string[]
  notes: string
  parentId: string | null
  dependsOn: string[]
  tag: SchemaFieldValue
  emoji: string
  createdAt: number
  updatedAt: number
}

export type WorkspaceFs = {
  resolve: (rel: string) => string
  read: (rel: string) => Promise<string>
  write: (rel: string, content: string) => Promise<unknown>
  list: (rel?: string) => Promise<string[]>
}

function asStringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => String(item)).filter(Boolean)
}

function asTime(value: unknown, fallback: number): number {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime()
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value === 'string' && value.trim()) {
    const asNum = Number(value)
    if (Number.isFinite(asNum) && /^\d+(\.\d+)?$/.test(value.trim())) return asNum
    const parsed = Date.parse(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function asNotes(value: unknown): string | undefined {
  if (value == null) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>
    if (typeof rec.body === 'string') return rec.body
    if (typeof rec.body === 'object') return JSON.stringify(rec.body, null, 2)
  }
  return String(value)
}

export function fileUrl(name: string) {
  return `/api/db/file/${encodeURIComponent(name)}`
}

function pageRel(id: string) {
  if (!ID_RE.test(id)) throw new Error(`invalid page id: ${id}`)
  return `${PAGE_ROOT}/${id}.md`
}

function rowFromFile(id: string, raw: string): PageRow {
  const { matter, body } = splitMarkdown(raw)
  const now = Date.now()
  const createdAt = asTime(matter.createdAt, now)
  const updatedAt = asTime(matter.updatedAt, createdAt)
  return {
    id,
    title: String(matter.title ?? id),
    tags: asStringList(matter.tags),
    notes: body,
    parentId: matter.parentId == null || matter.parentId === '' ? null : String(matter.parentId),
    dependsOn: asStringList(matter.dependsOn),
    tag: normalizeSchemaValue(matter.tag ?? matter.facet),
    emoji: String(matter.emoji ?? ''),
    createdAt,
    updatedAt,
  }
}

function emptyRow(id: string, ts: number): PageRow {
  return {
    id,
    title: '未命名页面',
    tags: [],
    notes: '',
    parentId: null,
    dependsOn: [],
    tag: emptySchemaValue(),
    emoji: '',
    createdAt: ts,
    updatedAt: ts,
  }
}

function applyPatch(current: PageRow, patch: Record<string, unknown>): PageRow {
  const notes = asNotes(patch.notes)
  return {
    ...current,
    id: current.id,
    title: 'title' in patch ? String(patch.title ?? '').trim() : current.title,
    notes: 'notes' in patch ? (notes ?? '') : current.notes,
    tags: current.tags,
    parentId: 'parentId' in patch
      ? patch.parentId == null || patch.parentId === '' ? null : String(patch.parentId)
      : current.parentId,
    dependsOn: 'dependsOn' in patch ? asStringList(patch.dependsOn) : current.dependsOn,
    tag: current.tag,
    emoji: 'emoji' in patch ? String(patch.emoji ?? '') : current.emoji,
    createdAt: current.createdAt,
    updatedAt: typeof patch.updatedAt === 'number' && patch.updatedAt > 0 ? patch.updatedAt : Date.now(),
  }
}

const NAMED_ASSET_CACHE_LIMIT = 16

const PAGE_ORDER_COLUMNS: Record<string, string> = {
  id: 'id',
  title: 'title COLLATE NOCASE',
  createdAt: 'created_at',
  updatedAt: 'updated_at',
  parentId: 'parent_id',
}

const PAGE_FILTER_COLUMNS: Record<string, string> = {
  id: 'id',
  title: 'title',
  parentId: 'parent_id',
  emoji: 'emoji',
}

function pageOrderSql(
  sorts: Array<{ field: string; dir: string }> | undefined,
  sortField: string | undefined,
  dir: 'ASC' | 'DESC',
) {
  const rules = sorts?.length
    ? sorts
    : [{ field: sortField?.trim() || 'title', dir: dir.toLowerCase() }]
  const parts: string[] = []
  for (const rule of rules) {
    const column = PAGE_ORDER_COLUMNS[rule.field]
    if (!column) continue
    parts.push(`${column} ${rule.dir === 'desc' ? 'DESC' : 'ASC'}`)
  }
  if (!parts.length) parts.push('title COLLATE NOCASE ASC')
  if (!parts.some((part) => part.startsWith('id '))) parts.push('id ASC')
  return parts.join(', ')
}

export class PagesStore {
  constructor(
    private fs: WorkspaceFs,
    private assetsDir = assetsRootPath(dataHome()),
  ) {}

  private db: import('node:sqlite').DatabaseSync | null = null
  private namedAssetCache = new Map<string, { bytes: Buffer; type: string; etag: string }>()

  private async ensureDirs() {
    migrateLegacyPageDir(this.fs.resolve('.'))
    await mkdir(this.assetsDir, { recursive: true })
  }

  private async openDb() {
    await this.ensureDirs()
    if (this.db) return this.db
    const db = openAndMigrateBiu(this.fs.resolve(PAGE_DB), { foreignKeys: false })
    this.db = db
    db.exec('CREATE INDEX IF NOT EXISTS pages_title ON pages(title)')
    db.exec('CREATE INDEX IF NOT EXISTS pages_updated_at ON pages(updated_at)')
    db.exec('CREATE INDEX IF NOT EXISTS pages_created_at ON pages(created_at)')
    db.exec('CREATE INDEX IF NOT EXISTS pages_parent_id ON pages(parent_id)')
    await this.migrateMarkdown()
    adoptCasAssets(this.fs.resolve(DATA_DIR_NAME))
    return db
  }

  async sqlite() {
    return this.openDb()
  }

  private async migrateMarkdown() {
    if (!this.db) return
    let names: string[] = []
    try {
      names = await this.fs.list(PAGE_ROOT)
    } catch {
      names = []
    }
    for (const name of names) {
      if (!name.endsWith('.md')) continue
      const id = name.slice(0, -3)
      if (!ID_RE.test(id)) continue
      try {
        const row = rowFromFile(id, await this.fs.read(pageRel(id)))
        const hit = this.db.prepare('SELECT id FROM pages WHERE id = ?').get(id) as { id?: string } | undefined
        if (!hit) this.upsert(row)
        else if (!readEditorContent(this.db, '/pages', id).trim() && row.notes) this.upsert(row)
        await unlink(this.fs.resolve(pageRel(id)))
      } catch {
        /* skip unreadable */
      }
    }
  }

  private upsert(row: PageRow, writeNotes = true) {
    if (!this.db) return
    this.db.prepare(`
      INSERT INTO pages (
        id, title, parent_id,
        depends_on_json, emoji, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title,
        parent_id=excluded.parent_id, depends_on_json=excluded.depends_on_json, emoji=excluded.emoji,
        updated_at=excluded.updated_at
    `).run(row.id, row.title, row.parentId, JSON.stringify(row.dependsOn), row.emoji, row.createdAt, row.updatedAt)
    if (writeNotes) writeEditorContent(this.db, '/pages', row.id, row.notes, { transaction: false })
  }

  async list(ids?: string[]): Promise<PageRow[]> {
    const db = await this.openDb()
    if (ids) {
      const wanted = ids.filter((id) => ID_RE.test(id))
      if (!wanted.length) return []
      const found = new Map<string, PageRow>()
      const chunkSize = 999
      for (let i = 0; i < wanted.length; i += chunkSize) {
        const chunk = wanted.slice(i, i + chunkSize)
        const placeholders = chunk.map(() => '?').join(',')
        const listed = db.prepare(`
          SELECT id, title, parent_id,
            depends_on_json, emoji, created_at, updated_at
          FROM pages WHERE id IN (${placeholders})
        `).all(...chunk) as SqlPage[]
        for (const row of listed) found.set(row.id, { ...rowFromSql(row), notes: '' })
      }
      return wanted.flatMap((id) => {
        const row = found.get(id)
        return row ? [row] : []
      })
    }
    const listed = db.prepare(`
      SELECT id, title, parent_id,
        depends_on_json, emoji, created_at, updated_at
      FROM pages ORDER BY id
    `).all() as SqlPage[]
    return listed.map(rowFromSql)
  }

  async pagedList(query?: CollectionListQuery): Promise<{ items: PageRow[]; total: number }> {
    if (query?.ids?.length) {
      const items = await this.list(query.ids)
      return { items, total: items.length }
    }
    const db = await this.openDb()
    const limit = Math.min(200, Math.max(1, Number(query?.limit) || 50))
    const offset = Math.max(0, Math.floor(Number(query?.offset) || 0))
    const dir = query?.sortDir === 'desc' ? 'DESC' : 'ASC'
    const order = pageOrderSql(query?.sorts, query?.sortField, dir)
    const q = String(query?.q ?? '').trim().toLowerCase()
    const trash = query?.trash === true
    const deleted = trash
      ? `EXISTS (SELECT 1 FROM record_meta m WHERE m.collection = '/pages' AND m.record_id = pages.id AND m.deleted_at > 0)`
      : `NOT EXISTS (SELECT 1 FROM record_meta m WHERE m.collection = '/pages' AND m.record_id = pages.id AND m.deleted_at > 0)`
    const clauses = [deleted]
    const params: unknown[] = []
    if (q) {
      clauses.push('instr(lower(title), ?) > 0')
      params.push(q)
    }
    const filter = query?.filter ?? {}
    for (const [key, expected] of Object.entries(filter)) {
      if (expected == null || expected === '') continue
      const column = PAGE_FILTER_COLUMNS[key]
      if (!column) continue
      clauses.push(`${column} = ?`)
      params.push(String(expected))
    }
    const where = clauses.join(' AND ')
    const total = Number((db.prepare(`SELECT COUNT(*) AS n FROM pages WHERE ${where}`).get(...params) as { n: number }).n)
    const listed = db.prepare(`
      SELECT id, title, parent_id,
        depends_on_json, emoji, created_at, updated_at
      FROM pages WHERE ${where}
      ORDER BY ${order}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as SqlPage[]
    return { items: listed.map((row) => ({ ...rowFromSql(row), notes: '' })), total }
  }

  async get(id: string): Promise<PageRow | null> {
    if (!ID_RE.test(id)) return null
    const db = await this.openDb()
    const hit = db.prepare(`
      SELECT id, title, parent_id,
        depends_on_json, emoji, created_at, updated_at
      FROM pages WHERE id = ?
    `).get(id) as SqlPage | undefined
    if (!hit) return null
    const row = rowFromSql(hit)
    row.notes = readEditorContent(db, '/pages', id)
    return row
  }

  async update(id: string, patch: Record<string, unknown>): Promise<PageRow> {
    const current = await this.get(id)
    if (!current) throw new Error(`unknown page: ${id}`)
    const next = applyPatch(current, patch)
    await this.openDb()
    this.upsert(next, 'notes' in patch)
    return (await this.get(id))!
  }

  async create(fields: Record<string, unknown> = {}): Promise<PageRow> {
    const db = await this.openDb()
    const existing = new Set((db.prepare('SELECT id FROM pages').all() as Array<{ id: string }>).map((row) => row.id))
    const requested = typeof fields.id === 'string' ? fields.id.trim() : ''
    let id = requested && isAssignableRecordId(requested) && ID_RE.test(requested) && !existing.has(requested)
      ? requested
      : allocateRecordId()
    while (existing.has(id) || !ID_RE.test(id)) id = allocateRecordId()
    const ts = Date.now()
    const row = applyPatch(emptyRow(id, ts), { ...fields })
    row.id = id
    row.createdAt = typeof fields.createdAt === 'number' && fields.createdAt > 0 ? fields.createdAt : ts
    row.updatedAt = typeof fields.updatedAt === 'number' && fields.updatedAt > 0 ? fields.updatedAt : ts
    if (typeof fields.title === 'string') row.title = fields.title.trim()
    await this.write(row)
    return (await this.get(id))!
  }

  async remove(id: string) {
    if (!ID_RE.test(id)) throw new Error(`unknown page: ${id}`)
    const db = await this.openDb()
    const info = db.prepare('DELETE FROM pages WHERE id = ?').run(id)
    if (!info.changes) throw new Error(`unknown page: ${id}`)
    try {
      await unlink(this.fs.resolve(pageRel(id)))
    } catch {
      /* leftover markdown */
    }
  }

  async writeAsset(name: string, content: string | Buffer | Uint8Array, opts?: { etag?: string }) {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/') || !isPageAssetFileName(file)) throw new Error('invalid asset')
    const written = await writeDocument(join(this.assetsDir, 'name'), file, content, opts)
    const db = await this.openDb()
    upsertAttachmentRow(db, {
      name: written.name,
      etag: written.etag,
      mime: mimeOf(written.name),
      bytes: written.bytes.length,
      kind: 'asset',
      storage: 'name',
    })
    this.rememberNamedAsset(written.name, { bytes: written.bytes, type: mimeOf(written.name), etag: written.etag })
    return { name: written.name, href: fileUrl(written.name), etag: written.etag }
  }

  async assetEtag(name: string): Promise<string> {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/')) throw new Error('invalid asset')
    if (isHashedAssetName(file)) {
      await access(join(this.assetsDir, 'hash', hashedAssetRel(file)))
      return file
    }
    const cached = this.namedAssetCache.get(file)
    if (cached) return cached.etag
    const db = await this.openDb()
    const row = db.prepare('SELECT etag FROM attachments WHERE name = ?').get(file) as { etag?: string } | undefined
    if (row?.etag) return row.etag
    return (await this.readAsset(file)).etag
  }

  async readAsset(name: string): Promise<{ bytes: Buffer; type: string; etag: string }> {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/')) throw new Error('invalid asset')
    if (isHashedAssetName(file)) {
      try {
        const { bytes } = await readContentAddressed(join(this.assetsDir, 'hash'), file)
        return { bytes, type: mimeOf(file), etag: file }
      } catch {
        /* named fallback */
      }
    }
    const cached = this.namedAssetCache.get(file)
    if (cached) {
      this.rememberNamedAsset(file, cached)
      return cached
    }
    try {
      const { bytes, etag } = await readDocument(join(this.assetsDir, 'name'), file)
      const rec = { bytes, type: mimeOf(file), etag }
      this.rememberNamedAsset(file, rec)
      return rec
    } catch {
      throw new Error('not found')
    }
  }

  private rememberNamedAsset(file: string, rec: { bytes: Buffer; type: string; etag: string }) {
    this.namedAssetCache.delete(file)
    this.namedAssetCache.set(file, rec)
    while (this.namedAssetCache.size > NAMED_ASSET_CACHE_LIMIT) {
      const oldest = this.namedAssetCache.keys().next().value
      if (oldest == null) break
      this.namedAssetCache.delete(oldest)
    }
  }

  private async runGc(opts?: { graceMs?: number; now?: number; candidateMs?: number }) {
    if (!this.db) return
    const sqlitePath = this.fs.resolve(PAGE_DB)
    await gcCasAssets({
      db: this.db,
      assetsDir: this.assetsDir,
      ...workspaceFromSqlite(sqlitePath),
      graceMs: opts?.graceMs,
      now: opts?.now,
      candidateMs: opts?.candidateMs,
    })
  }

  async gcAssets(opts?: { graceMs?: number; now?: number; candidateMs?: number }) {
    await this.openDb()
    adoptCasAssets(this.fs.resolve(DATA_DIR_NAME))
    await this.runGc(opts)
  }

  private async write(row: PageRow) {
    await this.openDb()
    this.upsert(row)
  }
}

type SqlPage = {
  id: string
  title: string
  parent_id: string | null
  depends_on_json: string
  emoji: string
  created_at: number
  updated_at: number
}

function parseJson<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function rowFromSql(row: SqlPage): PageRow {
  return {
    id: row.id,
    title: row.title,
    tags: [],
    notes: '',
    parentId: row.parent_id == null || row.parent_id === '' ? null : String(row.parent_id),
    dependsOn: asStringList(parseJson(row.depends_on_json ?? '[]', [])),
    tag: emptySchemaValue(),
    emoji: row.emoji ?? '',
    createdAt: Number(row.created_at) || 0,
    updatedAt: Number(row.updated_at) || 0,
  }
}

function mimeOf(name: string) {
  const ext = name.toLowerCase().slice(name.lastIndexOf('.'))
  if (ext === '.png') return 'image/png'
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg'
  if (ext === '.gif') return 'image/gif'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.svg') return 'image/svg+xml'
  if (ext === '.avif') return 'image/avif'
  if (ext === '.bmp') return 'image/bmp'
  if (ext === '.json' || ext === '.excalidraw') return 'application/json; charset=utf-8'
  if (ext === '.js' || ext === '.jsx' || ext === '.ts' || ext === '.tsx') return 'text/javascript; charset=utf-8'
  if (ext === '.zip') return 'application/zip'
  if (ext === '.pdf') return 'application/pdf'
  return 'application/octet-stream'
}
