import { mkdir, readFile, stat, unlink, writeFile } from 'node:fs/promises'
import { basename, dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import type { DbRecord, SchemaFieldValue } from '@biu/type-file-system'
import { emptySchemaValue, normalizeSchemaValue } from '@biu/type-file-system'
import { dataPath } from '@biu/host-plugin-loader/data-dir'
import { splitMarkdown } from './markdown.ts'

export const PAGE_ROOT = '.page'
export const PAGE_DB = '.page/pages.sqlite'
export const PAGE_ASSETS = '.page/assets'
/** 正文不再引用后，附件再留一天，避免撤销/未落盘指针误删。 */
export const ASSET_GC_GRACE_MS = 24 * 60 * 60 * 1000

const ID_RE = /^[A-Za-z0-9._-]+$/
const ASSET_FILE_RE = /^[\p{L}\p{N}._-]+$/u
const ASSET_REF_RE = /(?:(?:\.page\/)?assets\/|\/api\/(?:page|db)\/file\/)([\p{L}\p{N}._-]+)/gu

export function isPageAssetFileName(name: string) {
  return Boolean(name) && name === basename(name) && name !== '.gitkeep' && ASSET_FILE_RE.test(name)
}

export function collectPageAssetNames(...chunks: unknown[]): Set<string> {
  const names = new Set<string>()
  const eat = (text: string) => {
    for (const match of text.matchAll(ASSET_REF_RE)) {
      const name = basename(match[1] ?? '')
      if (isPageAssetFileName(name)) names.add(name)
    }
  }
  for (const chunk of chunks) {
    if (chunk == null) continue
    if (typeof chunk === 'string') eat(chunk)
    else eat(JSON.stringify(chunk))
  }
  return names
}

export type PageRow = DbRecord & {
  title: string
  tags: string[]
  notes: string
  score: number
  parentId: string | null
  dependsOn: string[]
  facet: SchemaFieldValue
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
  return `/api/page/file/${encodeURIComponent(name)}`
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
    score: Number(matter.score) || 0,
    parentId: matter.parentId == null || matter.parentId === '' ? null : String(matter.parentId),
    dependsOn: asStringList(matter.dependsOn),
    facet: normalizeSchemaValue(matter.facet),
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
    score: 0,
    parentId: null,
    dependsOn: [],
    facet: emptySchemaValue(),
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
    title:
      typeof patch.title === 'string' && patch.title.trim()
        ? patch.title.trim()
        : current.title,
    notes: notes ?? current.notes,
    tags: 'tags' in patch ? asStringList(patch.tags) : current.tags,
    parentId: 'parentId' in patch
      ? patch.parentId == null || patch.parentId === '' ? null : String(patch.parentId)
      : current.parentId,
    dependsOn: 'dependsOn' in patch ? asStringList(patch.dependsOn) : current.dependsOn,
    facet: 'facet' in patch ? normalizeSchemaValue(patch.facet) : current.facet,
    emoji: 'emoji' in patch ? String(patch.emoji ?? '') : current.emoji,
    score: current.score,
    createdAt: current.createdAt,
    updatedAt: Date.now(),
  }
}

export class PagesStore {
  constructor(
    private fs: WorkspaceFs,
    private assetsDir = dataPath(process.cwd(), 'assets'),
  ) {}

  private db: import('node:sqlite').DatabaseSync | null = null

  private async ensureDirs() {
    await mkdir(dirname(this.fs.resolve(`${PAGE_ROOT}/x.md`)), { recursive: true })
    await mkdir(this.fs.resolve(PAGE_ASSETS), { recursive: true })
    await mkdir(this.assetsDir, { recursive: true })
  }

  private async openDb() {
    await this.ensureDirs()
    if (this.db) return this.db
    const { DatabaseSync } = createRequire(import.meta.url)('node:sqlite') as typeof import('node:sqlite')
    const db = new DatabaseSync(this.fs.resolve(PAGE_DB))
    db.exec('PRAGMA journal_mode = WAL')
    db.exec('PRAGMA synchronous = NORMAL')
    db.exec(`
      CREATE TABLE IF NOT EXISTS pages (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        tags_json TEXT NOT NULL DEFAULT '[]',
        notes TEXT NOT NULL DEFAULT '',
        score REAL NOT NULL DEFAULT 0,
        parent_id TEXT,
        depends_on_json TEXT NOT NULL DEFAULT '[]',
        facet_json TEXT NOT NULL DEFAULT '{}',
        emoji TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )
    `)
    const cols = db.prepare('PRAGMA table_info(pages)').all() as Array<{ name: string }>
    if (!cols.some((col) => col.name === 'depends_on_json')) {
      db.exec(`ALTER TABLE pages ADD COLUMN depends_on_json TEXT NOT NULL DEFAULT '[]'`)
    }
    this.db = db
    return db
  }

  private async migrateMarkdown() {
    if (!this.db) return
    let names: string[] = []
    try {
      names = await this.fs.list(PAGE_ROOT)
    } catch {
      return
    }
    const existing = new Set(
      (this.db.prepare('SELECT id FROM pages').all() as Array<{ id: string }>).map((row) => row.id),
    )
    for (const name of names) {
      if (!name.endsWith('.md')) continue
      const id = name.slice(0, -3)
      if (!ID_RE.test(id) || existing.has(id)) continue
      try {
        const row = rowFromFile(id, await this.fs.read(pageRel(id)))
        this.upsert(row)
        existing.add(id)
      } catch {
        /* skip unreadable */
      }
    }
  }

  private upsert(row: PageRow) {
    if (!this.db) return
    this.db.prepare(`
      INSERT INTO pages (
        id, title, tags_json, notes, score, parent_id,
        depends_on_json, facet_json, emoji, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        title=excluded.title, tags_json=excluded.tags_json,
        notes=excluded.notes, score=excluded.score,
        parent_id=excluded.parent_id, depends_on_json=excluded.depends_on_json, facet_json=excluded.facet_json, emoji=excluded.emoji,
        updated_at=excluded.updated_at
    `).run(...sqlValues(row))
  }

  async list(ids?: string[]): Promise<PageRow[]> {
    const db = await this.openDb()
    await this.migrateMarkdown()
    if (ids) {
      const rows: PageRow[] = []
      for (const id of ids) {
        if (!ID_RE.test(id)) continue
        const row = await this.get(id)
        if (row) rows.push(row)
      }
      return rows
    }
    const listed = db.prepare(`
      SELECT id, title, tags_json, '' AS notes, score, parent_id,
        depends_on_json, facet_json, emoji, created_at, updated_at
      FROM pages ORDER BY id
    `).all() as SqlPage[]
    return listed.map(rowFromSql)
  }

  async get(id: string): Promise<PageRow | null> {
    if (!ID_RE.test(id)) return null
    const db = await this.openDb()
    await this.migrateMarkdown()
    const hit = db.prepare('SELECT * FROM pages WHERE id = ?').get(id) as SqlPage | undefined
    return hit ? rowFromSql(hit) : null
  }

  async update(id: string, patch: Record<string, unknown>): Promise<PageRow> {
    const current = await this.get(id)
    if (!current) throw new Error(`unknown page: ${id}`)
    const next = applyPatch(current, patch)
    await this.write(next)
    await this.gcAssets()
    return (await this.get(id))!
  }

  async create(fields: Record<string, unknown> = {}): Promise<PageRow> {
    const db = await this.openDb()
    const existing = new Set((db.prepare('SELECT id FROM pages').all() as Array<{ id: string }>).map((row) => row.id))
    let n = existing.size
    let id = `p${String(n).padStart(3, '0')}`
    while (existing.has(id) || !ID_RE.test(id)) {
      n += 1
      id = `p${String(n).padStart(3, '0')}`
    }
    if (typeof fields.id === 'string' && ID_RE.test(fields.id) && !existing.has(fields.id)) id = fields.id
    const ts = Date.now()
    const row = applyPatch(emptyRow(id, ts), { ...fields, score: 0 })
    row.id = id
    row.createdAt = ts
    row.updatedAt = ts
    if (typeof fields.title === 'string' && fields.title.trim()) row.title = fields.title.trim()
    await this.write(row)
    await this.gcAssets()
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
      /* markdown sidecar optional */
    }
    await this.gcAssets()
  }

  async writeAsset(name: string, content: string | Buffer | Uint8Array) {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/') || !isPageAssetFileName(file)) throw new Error('invalid asset')
    await mkdir(this.assetsDir, { recursive: true })
    const bytes = typeof content === 'string' ? Buffer.from(content) : Buffer.from(content)
    await writeFile(join(this.assetsDir, file), bytes)
    return { name: file, href: fileUrl(file) }
  }

  async readAsset(name: string): Promise<{ bytes: Buffer; type: string }> {
    const file = basename(name)
    if (!file || file !== name.replace(/\\/g, '/')) throw new Error('invalid asset')
    try {
      const bytes = await readFile(join(this.assetsDir, file))
      return { bytes, type: mimeOf(file) }
    } catch {
      const bytes = await readFile(this.fs.resolve(`${PAGE_ASSETS}/${file}`))
      return { bytes, type: mimeOf(file) }
    }
  }

  async gcAssets(opts?: { graceMs?: number; now?: number }) {
    const graceMs = opts?.graceMs ?? ASSET_GC_GRACE_MS
    const now = opts?.now ?? Date.now()
    let names: string[] = []
    try {
      names = await this.fs.list(PAGE_ASSETS)
    } catch {
      return
    }
    const db = await this.openDb()
    const live = new Set<string>()
    const bodies = db.prepare('SELECT notes FROM pages').all() as Array<{ notes: string }>
    for (const body of bodies) {
      for (const name of collectPageAssetNames(body.notes)) live.add(name)
    }
    for (const name of names) {
      if (name === '.gitkeep' || live.has(name) || !isPageAssetFileName(name)) continue
      const full = this.fs.resolve(`${PAGE_ASSETS}/${name}`)
      try {
        const info = await stat(full)
        if (now - info.mtimeMs < graceMs) continue
        await unlink(full)
      } catch {
        // gone or unreadable
      }
    }
  }

  private async write(row: PageRow) {
    await this.openDb()
    this.upsert(row)
  }
}

type SqlPage = {
  id: string
  title: string
  tags_json: string
  notes: string
  score: number
  parent_id: string | null
  depends_on_json: string
  facet_json: string
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

function sqlValues(row: PageRow) {
  return [
    row.id,
    row.title,
    JSON.stringify(row.tags),
    row.notes ?? '',
    row.score,
    row.parentId,
    JSON.stringify(row.dependsOn),
    JSON.stringify(row.facet),
    row.emoji,
    row.createdAt,
    row.updatedAt,
  ]
}

function rowFromSql(row: SqlPage): PageRow {
  return {
    id: row.id,
    title: row.title,
    tags: asStringList(parseJson(row.tags_json, [])),
    notes: row.notes,
    score: Number(row.score) || 0,
    parentId: row.parent_id == null || row.parent_id === '' ? null : String(row.parent_id),
    dependsOn: asStringList(parseJson(row.depends_on_json ?? '[]', [])),
    facet: normalizeSchemaValue(parseJson(row.facet_json, emptySchemaValue())),
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
  if (ext === '.zip') return 'application/zip'
  if (ext === '.pdf') return 'application/pdf'
  return 'application/octet-stream'
}
