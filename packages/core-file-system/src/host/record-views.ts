import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import type { CollectionSpec, DbRecord } from '@biu/type-file-system'
import { parseRecordLayouts, parseRecordSandboxes } from '@biu/type-file-system/record-views'
import { normalizeCollectionPath } from '../paths.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export type RecordViewCatalog = {
  views: unknown[]
  propViews: unknown[]
  layouts: unknown[]
}

export class RecordViewsStore {
  private db: DatabaseSync | null = null

  open(path = ':memory:') {
    if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true })
    this.db = openAndMigrateBiu(path)
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS record_views (
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        views_json TEXT NOT NULL DEFAULT '[]',
        prop_views_json TEXT NOT NULL DEFAULT '[]',
        layouts_json TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (collection, record_id)
      )
    `)
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
    const current = this.read(collection, id)
    const next: RecordViewCatalog = {
      views: patch.views !== undefined ? parseRecordSandboxes(patch.views) : current.views,
      propViews: patch.propViews !== undefined ? parseRecordSandboxes(patch.propViews) : current.propViews,
      layouts: patch.layouts !== undefined ? parseRecordLayouts(patch.layouts) : current.layouts,
    }
    this.ensure()
      .prepare(
        `INSERT INTO record_views (collection, record_id, views_json, prop_views_json, layouts_json)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(collection, record_id) DO UPDATE SET
           views_json = excluded.views_json,
           prop_views_json = excluded.prop_views_json,
           layouts_json = excluded.layouts_json`,
      )
      .run(collection, id, JSON.stringify(next.views), JSON.stringify(next.propViews), JSON.stringify(next.layouts))
    return next
  }
}

function asList(value: unknown) {
  if (Array.isArray(value)) return value
  if (typeof value === 'string' && value.trim()) {
    try {
      const parsed = JSON.parse(value) as unknown
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return []
}

export function attachRecordViews(store: RecordViewsStore, collectionPath: string, row: DbRecord | null | undefined) {
  if (!row) return row
  const extra = store.read(collectionPath, row.id)
  const next: DbRecord = { ...row }
  const views = asList(row.views)
  const propViews = asList(row.propViews)
  const layouts = asList(row.layouts)
  if (views.length) next.views = row.views
  else if (extra.views.length) next.views = extra.views
  if (propViews.length) next.propViews = row.propViews
  else if (extra.propViews.length) next.propViews = extra.propViews
  if (layouts.length) next.layouts = row.layouts
  else if (extra.layouts.length) next.layouts = extra.layouts
  return next
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
      ? async (id, patch) => {
          if ('views' in patch || 'propViews' in patch || 'layouts' in patch) {
            store.write(path, id, {
              views: patch.views as unknown[] | undefined,
              propViews: patch.propViews as unknown[] | undefined,
              layouts: patch.layouts as unknown[] | undefined,
            })
          }
          const row = await update(id, patch)
          return attachRecordViews(store, path, row) as DbRecord
        }
      : spec.update,
    create: create
      ? async (rows) => {
          const created = await create(rows)
          created.forEach((row, index) => {
            const src = rows[index] ?? {}
            if ('views' in src || 'propViews' in src || 'layouts' in src) {
              store.write(path, row.id, {
                views: src.views as unknown[] | undefined,
                propViews: src.propViews as unknown[] | undefined,
                layouts: src.layouts as unknown[] | undefined,
              })
            }
          })
          return created.map((row) => attachRecordViews(store, path, row) as DbRecord)
        }
      : spec.create,
  }
}
