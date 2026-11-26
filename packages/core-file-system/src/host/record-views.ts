import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import type { CollectionSpec, DbRecord } from '@biu/type-file-system'
import { listedRecordLayouts, parseRecordLayouts, parseRecordSandboxes } from '@biu/type-file-system/record-views'
import { normalizeCollectionPath } from '../paths.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export type RecordViewCatalog = {
  views: unknown[]
  propViews: unknown[]
  layouts: unknown[]
}

const CATALOG_KEYS = ['views', 'propViews', 'layouts'] as const

export class RecordViewsStore {
  private db: DatabaseSync | null = null

  open(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = openAndMigrateBiu(path)
    return this
  }

  private ensure() {
    if (!this.db) this.open()
    return this.db!
  }

  read(collectionPath: string, recordId: string): RecordViewCatalog {
    const collection = normalizeCollectionPath(collectionPath)
    const id = String(recordId ?? '').trim()
    if (!collection || !id) return { views: [], propViews: [], layouts: [] }
    const row = this.ensure()
      .prepare('SELECT views_json, prop_views_json, layouts_json FROM record_views WHERE collection = ? AND record_id = ?')
      .get(collection, id) as { views_json: string; prop_views_json: string; layouts_json: string } | undefined
    if (!row) return { views: [], propViews: [], layouts: [] }
    return {
      views: parseRecordSandboxes(row.views_json),
      propViews: parseRecordSandboxes(row.prop_views_json),
      layouts: parseRecordLayouts(row.layouts_json),
    }
  }

  write(collectionPath: string, recordId: string, patch: Partial<RecordViewCatalog>) {
    const collection = normalizeCollectionPath(collectionPath)
    const id = String(recordId ?? '').trim()
    if (!collection || !id) return this.read(collection, id)
    const db = this.ensure()
    db.exec('BEGIN IMMEDIATE')
    try {
      const current = this.read(collection, id)
      const next: RecordViewCatalog = {
        views: patch.views !== undefined ? parseRecordSandboxes(patch.views) : current.views,
        propViews: patch.propViews !== undefined ? parseRecordSandboxes(patch.propViews) : current.propViews,
        layouts: patch.layouts !== undefined ? parseRecordLayouts(patch.layouts) : current.layouts,
      }
      db
        .prepare(
          `INSERT INTO record_views (collection, record_id, views_json, prop_views_json, layouts_json)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(collection, record_id) DO UPDATE SET
             views_json = excluded.views_json,
             prop_views_json = excluded.prop_views_json,
             layouts_json = excluded.layouts_json`,
        )
        .run(collection, id, JSON.stringify(next.views), JSON.stringify(next.propViews), JSON.stringify(next.layouts))
      db.exec('COMMIT')
      return next
    } catch (error) {
      db.exec('ROLLBACK')
      throw error
    }
  }
}

function withoutCatalog(patch: Record<string, unknown>) {
  const next = { ...patch }
  for (const key of CATALOG_KEYS) delete next[key]
  return next
}

function catalogPatch(raw: Record<string, unknown>): Partial<RecordViewCatalog> | null {
  const patch: Partial<RecordViewCatalog> = {}
  let hit = false
  for (const key of CATALOG_KEYS) {
    if (key in raw) {
      patch[key] = raw[key] as unknown[]
      hit = true
    }
  }
  return hit ? patch : null
}

export function attachRecordViews(store: RecordViewsStore, collectionPath: string, row: DbRecord | null | undefined) {
  if (!row) return row
  const extra = store.read(collectionPath, row.id)
  return {
    ...row,
    views: extra.views,
    propViews: extra.propViews,
    layouts: listedRecordLayouts(extra.layouts),
  }
}

export function wrapCollectionRecordViews(spec: CollectionSpec, store: RecordViewsStore): CollectionSpec {
  const path = spec.path
  const get = spec.get.bind(spec)
  const list = spec.list.bind(spec)
  const update = spec.update?.bind(spec)
  const create = spec.create?.bind(spec)
  return {
    ...spec,
    get: async (id) => attachRecordViews(store, path, await get(id)),
    list: async (query) => {
      const rows = await list(query)
      return rows.map((row) => attachRecordViews(store, path, row) as DbRecord)
    },
    update: update
      ? async (id, patch, options) => {
          const catalog = catalogPatch(patch)
          if (catalog) store.write(path, id, catalog)
          const rest = withoutCatalog(patch)
          const row = Object.keys(rest).length ? await update(id, rest, options) : await get(id)
          return attachRecordViews(store, path, row) as DbRecord
        }
      : spec.update,
    create: create
      ? async (rows) => {
          const created = await create(rows.map((row) => withoutCatalog(row)))
          created.forEach((row, index) => {
            const catalog = catalogPatch(rows[index] ?? {})
            if (catalog) store.write(path, row.id, catalog)
          })
          return created.map((row) => attachRecordViews(store, path, row) as DbRecord)
        }
      : spec.create,
  }
}
