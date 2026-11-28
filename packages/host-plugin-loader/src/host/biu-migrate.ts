import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { openPooledSqlite, sharedSqlitePoolStats, closeAllSharedSqliteConnections } from './sqlite-pool.ts'
import { assertSqliteVersion, getSchemaVersion, isEmptyDatabase, quoteSqlitePath, setSchemaVersion } from './sqlite-open.ts'
import { CREATE_CHANNELS_SQL, CREATE_CORE_SQL, LATEST_BIU_SCHEMA, createLatestSchema, dropLegacyEditorColumns, ensurePagesPerfIndexes, rebuildPageBlockCollectionKeys, tableColumnNames, tableNames } from './biu-schema.ts'
import { copyLegacyBodies, rebuildContentRefs } from './editor-content.ts'
import { parseFrontmatterBody } from './gc-assets.ts'

type DatabaseSync = import('node:sqlite').DatabaseSync

export type Migration = {
  version: number
  module: string
  name: string
  up: (db: DatabaseSync, ctx: MigrateCtx) => void
}

export type MigrateCtx = {
  sqlitePath?: string
  dataDir?: string
  workspace?: string
}

export function renameSessionsTableToAgents(db: DatabaseSync) {
  if (hasTable(db, 'agents')) return
  if (!hasTable(db, 'sessions')) return
  db.exec('ALTER TABLE sessions RENAME TO agents')
}

function renameTable(db: DatabaseSync, from: string, to: string) {
  if (!hasTable(db, from) || hasTable(db, to)) return
  db.exec(`ALTER TABLE ${from} RENAME TO ${to}`)
}

function renameColumn(db: DatabaseSync, table: string, from: string, to: string) {
  if (!hasTable(db, table)) return
  const cols = tableColumnNames(db, table)
  if (!cols.includes(from) || cols.includes(to)) return
  db.exec(`ALTER TABLE ${table} RENAME COLUMN ${from} TO ${to}`)
}

function rewriteFacetToken(value: string) {
  if (value === 'facet') return 'tag'
  if (value === 'facetId') return 'tagId'
  if (value.startsWith('facet::')) return `tag::${value.slice('facet::'.length)}`
  if (value === '/facets' || value.startsWith('/facets/')) return `/tags${value.slice('/facets'.length)}`
  return value
}

function rewriteFacetJson(value: unknown): unknown {
  if (typeof value === 'string') return rewriteFacetToken(value)
  if (Array.isArray(value)) return value.map(rewriteFacetJson)
  if (!value || typeof value !== 'object') return value
  const out: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    const nextKey = rewriteFacetToken(key)
    let next = rewriteFacetJson(item)
    if (nextKey === 'type' && (item === 'facet' || item === 'tag')) next = 'tag'
    out[nextKey] = next
  }
  return out
}

function migrateFacetNameToTag(db: DatabaseSync) {
  renameTable(db, 'facets', 'tags')
  renameTable(db, 'facet_stamps', 'tag_stamps')
  renameTable(db, 'facet_record_values', 'tag_record_values')
  renameColumn(db, 'tag_stamps', 'facet_id', 'tag_id')
  renameColumn(db, 'tag_record_values', 'facet_json', 'tag_json')
  renameColumn(db, 'tasks', 'facet_json', 'tag_json')
  db.exec('DROP INDEX IF EXISTS facets_label')
  db.exec('DROP INDEX IF EXISTS facet_stamps_facet')
  db.exec('DROP INDEX IF EXISTS facet_stamps_record')
  if (hasTable(db, 'tags')) db.exec('CREATE INDEX IF NOT EXISTS tags_label ON tags(label)')
  if (hasTable(db, 'tag_stamps')) {
    db.exec('CREATE INDEX IF NOT EXISTS tag_stamps_tag ON tag_stamps(tag_id)')
    db.exec('CREATE INDEX IF NOT EXISTS tag_stamps_record ON tag_stamps(collection, record_id)')
  }
  remapCollectionPath(db, '/facets', '/tags')
  if (hasTable(db, 'tags')) {
    const packs = db.prepare('SELECT id, fields_json FROM tags').all() as Array<{ id: string; fields_json: string }>
    const save = db.prepare('UPDATE tags SET fields_json = ? WHERE id = ?')
    for (const pack of packs) {
      try {
        const next = rewriteFacetJson(JSON.parse(pack.fields_json || '[]'))
        save.run(JSON.stringify(next), pack.id)
      } catch {
        /* keep */
      }
    }
  }
  if (hasTable(db, 'saved_views')) {
    const rows = db.prepare('SELECT collection, view_id, payload_json FROM saved_views').all() as Array<{
      collection: string
      view_id: string
      payload_json: string
    }>
    const save = db.prepare('UPDATE saved_views SET payload_json = ? WHERE collection = ? AND view_id = ?')
    for (const row of rows) {
      try {
        const next = JSON.stringify(rewriteFacetJson(JSON.parse(row.payload_json || '{}')))
        if (next !== row.payload_json) save.run(next, row.collection, row.view_id)
      } catch {
        /* keep */
      }
    }
  }
  if (hasTable(db, 'agents') && tableColumnNames(db, 'agents').includes('config_json')) {
    const rows = db.prepare('SELECT id, config_json FROM agents').all() as Array<{ id: string; config_json: string | null }>
    const save = db.prepare('UPDATE agents SET config_json = ? WHERE id = ?')
    for (const row of rows) {
      if (!row.config_json) continue
      try {
        const parsed = JSON.parse(row.config_json) as Record<string, unknown>
        if (!('facet' in parsed) && !JSON.stringify(parsed).includes('facet')) continue
        const next = rewriteFacetJson(parsed)
        save.run(JSON.stringify(next), row.id)
      } catch {
        /* keep */
      }
    }
  }
}

function remapSessionsCollectionToAgents(db: DatabaseSync) {
  remapCollectionPath(db, '/' + 'sessions', '/agents')
}

function remapCollectionPath(db: DatabaseSync, from: string, to: string) {
  for (const table of tableNames(db)) {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) continue
    const cols = tableColumnNames(db, table)
    for (const col of ['collection', 'parent_collection']) {
      if (!cols.includes(col)) continue
      db.exec(
        `UPDATE ${table} SET ${col} = '${to}' || substr(${col}, ${from.length + 1})
         WHERE ${col} = '${from}' OR ${col} LIKE '${from}/%'`,
      )
    }
  }
  if (!hasTable(db, 'saved_views') || !tableColumnNames(db, 'saved_views').includes('payload_json')) return
  const rows = db.prepare('SELECT collection, view_id, payload_json FROM saved_views').all() as Array<{
    collection: string
    view_id: string
    payload_json: string
  }>
  const update = db.prepare('UPDATE saved_views SET view_id = ?, payload_json = ? WHERE collection = ? AND view_id = ?')
  const legacyAll = `builtin-all:${from}`
  const nextAll = `builtin-all:${to}`
  for (const row of rows) {
    let payload = row.payload_json
    try {
      const parsed = JSON.parse(row.payload_json) as { tablePath?: unknown; id?: unknown }
      if (typeof parsed.tablePath === 'string' && (parsed.tablePath === from || parsed.tablePath.startsWith(`${from}/`))) {
        parsed.tablePath = `${to}${parsed.tablePath.slice(from.length)}`
      }
      if (typeof parsed.id === 'string') parsed.id = parsed.id.replace(legacyAll, nextAll)
      payload = JSON.stringify(parsed)
    } catch {
      /* keep raw */
    }
    const nextViewId = row.view_id.replace(legacyAll, nextAll)
    if (payload === row.payload_json && nextViewId === row.view_id) continue
    update.run(nextViewId, payload, row.collection, row.view_id)
  }
}

function hasTable(db: DatabaseSync, name: string) {
  return tableNames(db).includes(name)
}

function addColumn(db: DatabaseSync, table: string, name: string, ddl: string) {
  if (!hasTable(db, table)) return
  if (tableColumnNames(db, table).includes(name)) return
  db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`)
}

function dropColumn(db: DatabaseSync, table: string, name: string) {
  if (!hasTable(db, table)) return
  if (!tableColumnNames(db, table).includes(name)) return
  db.exec(`ALTER TABLE ${table} DROP COLUMN ${name}`)
}

function baseline(db: DatabaseSync) {
  assertSqliteVersion(db)
  db.exec(CREATE_CORE_SQL)
  addColumn(db, 'pages', 'notes', `notes TEXT NOT NULL DEFAULT ''`)
  addColumn(db, 'pages', 'depends_on_json', `depends_on_json TEXT NOT NULL DEFAULT '[]'`)
  addColumn(db, 'pages', 'emoji', `emoji TEXT NOT NULL DEFAULT ''`)
  dropColumn(db, 'pages', 'tags_json')
  dropColumn(db, 'pages', 'facet_json')
  for (const [name, ddl] of [
    ['creator_json', 'creator_json TEXT'],
    ['assignee_json', 'assignee_json TEXT'],
    ['assigned_at', 'assigned_at INTEGER'],
    ['description', `description TEXT NOT NULL DEFAULT ''`],
    ['reports_json', `reports_json TEXT NOT NULL DEFAULT '[]'`],
    ['start_at', 'start_at INTEGER'],
    ['project', `project TEXT NOT NULL DEFAULT ''`],
    ['tags_json', `tags_json TEXT NOT NULL DEFAULT '[]'`],
    ['parent_id', `parent_id TEXT DEFAULT ''`],
    ['depends_on', `depends_on TEXT NOT NULL DEFAULT '[]'`],
    ['depth', 'depth INTEGER NOT NULL DEFAULT 0'],
    ['difficulty', `difficulty TEXT NOT NULL DEFAULT 'med'`],
    ['trigger_json', `trigger_json TEXT NOT NULL DEFAULT '{}'`],
    ['report_interval_sec', 'report_interval_sec INTEGER NOT NULL DEFAULT 60'],
    ['last_report_prompt_at', 'last_report_prompt_at INTEGER'],
    ['report_prompt_count', 'report_prompt_count INTEGER NOT NULL DEFAULT 0'],
    ['facet_json', `facet_json TEXT NOT NULL DEFAULT '{}'`],
    ['emoji', `emoji TEXT NOT NULL DEFAULT ''`],
  ] as Array<[string, string]>) {
    addColumn(db, 'tasks', name, ddl)
  }
  addColumn(db, 'facets', 'notes', `notes TEXT NOT NULL DEFAULT ''`)
  addColumn(db, 'facets', 'created_at', 'created_at INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'record_meta', 'created_by_json', 'created_by_json TEXT')
  addColumn(db, 'record_meta', 'updated_by_json', 'updated_by_json TEXT')
  addColumn(db, 'attachments', 'storage', `storage TEXT NOT NULL DEFAULT 'hash'`)
  addColumn(db, 'shares', 'share_plugins', 'share_plugins INTEGER NOT NULL DEFAULT 0')
  addColumn(db, 'shares', 'allow_copy', 'allow_copy INTEGER NOT NULL DEFAULT 1')
  addColumn(db, 'page_block_index', 'page_title', `page_title TEXT NOT NULL DEFAULT ''`)
  addColumn(db, 'sessions', 'mascot_json', 'mascot_json TEXT')
  addColumn(db, 'sessions', 'config_json', 'config_json TEXT')
  if (hasTable(db, 'sessions') && tableColumnNames(db, 'sessions').includes('type')) {
    dropColumn(db, 'sessions', 'type')
  }
  addColumn(db, 'agents', 'mascot_json', 'mascot_json TEXT')
  addColumn(db, 'agents', 'config_json', 'config_json TEXT')
  if (hasTable(db, 'agents') && tableColumnNames(db, 'agents').includes('type')) {
    dropColumn(db, 'agents', 'type')
  }
  if (hasTable(db, 'attachments')) {
    db.exec(`UPDATE attachments SET storage = 'hash' WHERE storage IN ('cas', '')`)
    db.exec(`UPDATE attachments SET storage = 'name' WHERE storage = 'doc'`)
  }
  db.exec('DROP TABLE IF EXISTS task_views')
}

function upsertBodies(db: DatabaseSync, collection: string, rows: Array<{ id: string; body: string }>) {
  const upsert = db.prepare(
    `INSERT INTO editor_content (collection, record_id, body, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(collection, record_id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`,
  )
  const now = Date.now()
  for (const row of rows) upsert.run(collection, row.id, row.body, now)
}

function skillBodies(ctx: MigrateCtx): Array<{ id: string; body: string }> {
  const root = ctx.dataDir ? join(ctx.dataDir, 'skill') : ''
  if (!root || !existsSync(root)) return []
  const out: Array<{ id: string; body: string }> = []
  for (const name of readdirSync(root)) {
    if (!name.endsWith('.md')) continue
    const path = join(root, name)
    if (!statSync(path).isFile()) continue
    out.push({ id: name.slice(0, -3), body: parseFrontmatterBody(readFileSync(path, 'utf8')) })
  }
  return out
}

function pluginReadmes(ctx: MigrateCtx): Array<{ id: string; body: string }> {
  const workspace = ctx.workspace ?? (ctx.dataDir ? dirname(ctx.dataDir) : '')
  if (!workspace) return []
  const out: Array<{ id: string; body: string }> = []
  for (const tree of ['.plugin-dev', '.plugin']) {
    const root = join(workspace, tree)
    if (!existsSync(root) || !statSync(root).isDirectory()) continue
    for (const id of readdirSync(root)) {
      const readme = join(root, id, 'README.md')
      if (!existsSync(readme) || !statSync(readme).isFile()) continue
      if (!out.some((row) => row.id === id)) out.push({ id, body: readFileSync(readme, 'utf8') })
    }
  }
  return out
}

function rewritePageBlockMentions(db: DatabaseSync) {
  if (!hasTable(db, 'editor_content') || !hasTable(db, 'page_block_index')) return
  if (!tableColumnNames(db, 'page_block_index').includes('collection')) return
  const rows = db.prepare('SELECT DISTINCT collection, page_id, block_id FROM page_block_index').all() as Array<{
    collection: string
    page_id: string
    block_id: string
  }>
  const bodies = db.prepare('SELECT collection, record_id, body FROM editor_content').all() as Array<{
    collection: string
    record_id: string
    body?: string
  }>
  const update = db.prepare('UPDATE editor_content SET body = ? WHERE collection = ? AND record_id = ?')
  for (const row of bodies) {
    let next = String(row.body ?? '')
    for (const block of rows) {
      const from = `/editor-blocks/${block.page_id}::${block.block_id}`
      const to = `/editor-blocks/${block.collection}::${block.page_id}::${block.block_id}`
      if (from !== to) next = next.split(from).join(to)
    }
    if (next !== (row.body ?? '')) update.run(next, row.collection, row.record_id)
  }
}

const RESERVED_FACET_FIELD_NAMES = new Set(
  [
    'id',
    'title',
    'createdAt',
    'updatedAt',
    'content',
    'emoji',
    'parentId',
    'dependsOn',
    'createdBy',
    'updatedBy',
    'facet',
    'tags',
    '标题',
    '创建时间',
    '更新时间',
    '内容',
    '图标',
    '标签',
    '父级',
    '依赖',
    '创建人',
    '编辑人',
  ].map((name) => name.toLowerCase()),
)

function isMigratableFacetFieldName(name: string) {
  const next = name.trim()
  if (!next || next.length > 64) return false
  if (next.includes('::') || /[/\\]/.test(next) || /[\u0000-\u001f]/.test(next)) return false
  return !RESERVED_FACET_FIELD_NAMES.has(next.toLowerCase())
}

function migrateFacetFieldIdentity(db: DatabaseSync) {
  const names = tableNames(db)
  const packTable = names.includes('facets') ? 'facets' : names.includes('tags') ? 'tags' : ''
  if (!packTable) return
  const remaps = new Map<string, Map<string, string>>()
  const packs = db.prepare(`SELECT id, fields_json FROM ${packTable}`).all() as Array<{ id: string; fields_json: string }>
  const save = db.prepare(`UPDATE ${packTable} SET fields_json = ? WHERE id = ?`)
  for (const pack of packs) {
    let listed: unknown = []
    try {
      listed = JSON.parse(pack.fields_json || '[]')
    } catch {
      continue
    }
    if (!Array.isArray(listed)) continue
    const fields: unknown[] = []
    const seen = new Set<string>()
    const map = new Map<string, string>()
    for (const item of listed) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue
      const row = item as Record<string, unknown>
      const oldKey = String(row.key ?? '').trim()
      const label = String(row.label ?? '').trim()
      const want = [label, oldKey].find((name) => isMigratableFacetFieldName(name)) ?? ''
      if (!want) continue
      const taken = seen.has(want.toLowerCase())
      const dest = taken ? [...map.values()].find((name) => name.toLowerCase() === want.toLowerCase()) ?? want : want
      if (!taken) {
        seen.add(want.toLowerCase())
        const next: Record<string, unknown> = { key: dest, type: row.type }
        if (row.writable === false) next.writable = false
        if (Array.isArray(row.enum)) next.enum = row.enum
        if (row.enumLabels && typeof row.enumLabels === 'object') next.enumLabels = row.enumLabels
        fields.push(next)
      }
      if (oldKey && oldKey !== dest) map.set(oldKey, dest)
    }
    save.run(JSON.stringify(fields), pack.id)
    if (map.size) remaps.set(pack.id, map)
  }
  if (!remaps.size) return
  const valueTable = names.includes('facet_record_values') ? 'facet_record_values' : names.includes('tag_record_values') ? 'tag_record_values' : ''
  const valueCol = valueTable === 'tag_record_values' ? 'tag_json' : 'facet_json'
  if (valueTable) {
    const rows = db.prepare(`SELECT collection, record_id, ${valueCol} AS facet_json FROM ${valueTable}`).all() as Array<{
      collection: string
      record_id: string
      facet_json: string
    }>
    const put = db.prepare(`UPDATE ${valueTable} SET ${valueCol} = ? WHERE collection = ? AND record_id = ?`)
    for (const row of rows) {
      let parsed: unknown
      try {
        parsed = JSON.parse(row.facet_json || '{}')
      } catch {
        continue
      }
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
      const rec = parsed as { tags?: unknown; values?: unknown }
      if (!rec.values || typeof rec.values !== 'object' || Array.isArray(rec.values)) continue
      let changed = false
      const values: Record<string, Record<string, unknown>> = {}
      for (const [packId, bag] of Object.entries(rec.values as Record<string, unknown>)) {
        if (!bag || typeof bag !== 'object' || Array.isArray(bag)) {
          values[packId] = bag as Record<string, unknown>
          continue
        }
        const map = remaps.get(packId)
        if (!map) {
          values[packId] = bag as Record<string, unknown>
          continue
        }
        const next: Record<string, unknown> = {}
        for (const [key, value] of Object.entries(bag as Record<string, unknown>)) {
          const dest = map.get(key) ?? key
          if (dest !== key) changed = true
          if (dest in next && (next[dest] != null && next[dest] !== '')) continue
          next[dest] = value
        }
        values[packId] = next
      }
      if (changed) put.run(JSON.stringify({ ...rec, values }), row.collection, row.record_id)
    }
  }
  if (!tableNames(db).includes('saved_views')) return
  const views = db.prepare('SELECT collection, view_id, payload_json FROM saved_views').all() as Array<{
    collection: string
    view_id: string
    payload_json: string
  }>
  const saveView = db.prepare('UPDATE saved_views SET payload_json = ? WHERE collection = ? AND view_id = ?')
  const rewrite = (value: unknown): unknown => {
    if (typeof value === 'string') {
      const prefix = value.startsWith('tag::') ? 'tag::' : value.startsWith('facet::') ? 'facet::' : ''
      if (!prefix) return value
      const rest = value.slice(prefix.length)
      const split = rest.indexOf('::')
      if (split <= 0) return value
      const packId = rest.slice(0, split)
      const fieldKey = rest.slice(split + 2)
      const dest = remaps.get(packId)?.get(fieldKey)
      return dest ? `${prefix}${packId}::${dest}` : value
    }
    if (Array.isArray(value)) return value.map(rewrite)
    if (!value || typeof value !== 'object') return value
    const out: Record<string, unknown> = {}
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      out[String(rewrite(key))] = rewrite(item)
    }
    return out
  }
  for (const row of views) {
    let parsed: unknown
    try {
      parsed = JSON.parse(row.payload_json || '{}')
    } catch {
      continue
    }
    const next = rewrite(parsed)
    const encoded = JSON.stringify(next)
    if (encoded !== row.payload_json) saveView.run(encoded, row.collection, row.view_id)
  }
}

export const BIU_MIGRATIONS: Migration[] = [
  { version: 1, module: 'core', name: 'baseline', up: (db) => baseline(db) },
  { version: 2, module: 'tasks', name: 'drop.task_views', up: (db) => db.exec('DROP TABLE IF EXISTS task_views') },
  { version: 3, module: 'facets', name: 'ensure.facet.columns', up: (db) => {
    addColumn(db, 'facets', 'notes', `notes TEXT NOT NULL DEFAULT ''`)
    addColumn(db, 'facets', 'created_at', 'created_at INTEGER NOT NULL DEFAULT 0')
  } },
  { version: 4, module: 'core-page', name: 'ensure.page.columns', up: (db) => {
    addColumn(db, 'pages', 'depends_on_json', `depends_on_json TEXT NOT NULL DEFAULT '[]'`)
    dropColumn(db, 'pages', 'tags_json')
    dropColumn(db, 'pages', 'facet_json')
  } },
  { version: 5, module: 'core-file-system', name: 'create.editor_content', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS editor_content (
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        body TEXT NOT NULL DEFAULT '',
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (collection, record_id)
      );
      CREATE INDEX IF NOT EXISTS editor_content_record ON editor_content(collection, record_id);
    `)
  } },
  { version: 6, module: 'core-file-system', name: 'copy.pages.notes', up: (db) => copyLegacyBodies(db, '/pages') },
  { version: 7, module: 'core-file-system', name: 'copy.tasks.description', up: (db) => copyLegacyBodies(db, '/tasks') },
  { version: 8, module: 'core-file-system', name: 'copy.facets.notes', up: (db) => copyLegacyBodies(db, '/facets') },
  { version: 9, module: 'host-skills', name: 'copy.skills.files', up: (db, ctx) => upsertBodies(db, '/skills', skillBodies(ctx)) },
  { version: 10, module: 'core-plugin-system', name: 'copy.plugins.readme', up: (db, ctx) => upsertBodies(db, '/plugins', pluginReadmes(ctx)) },
  { version: 11, module: 'core-file-system', name: 'rebuild.content_refs', up: (db) => rebuildContentRefs(db) },
  { version: 12, module: 'core-page', name: 'page.block.collection', up: (db) => {
    rebuildPageBlockCollectionKeys(db)
    rewritePageBlockMentions(db)
  } },
  { version: 13, module: 'core', name: 'drop.legacy.editor.columns', up: (db) => dropLegacyEditorColumns(db) },
  { version: 14, module: 'core-file-system', name: 'rebuild.content_refs.v2', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS gc_candidates (
        name TEXT PRIMARY KEY,
        first_seen INTEGER NOT NULL,
        last_seen INTEGER NOT NULL
      );
    `)
    rebuildContentRefs(db)
  } },
  { version: 15, module: 'core-file-system', name: 'rebuild.content_refs.v3', up: (db) => rebuildContentRefs(db) },
  { version: 16, module: 'core-file-system', name: 'record.meta.deleted_at', up: (db) => {
    addColumn(db, 'record_meta', 'deleted_at', 'deleted_at INTEGER')
    db.exec('CREATE INDEX IF NOT EXISTS record_meta_deleted ON record_meta(collection, deleted_at)')
  } },
  { version: 17, module: 'core-file-system', name: 'editor_content.version', up: (db) => {
    addColumn(db, 'editor_content', 'version', 'version INTEGER NOT NULL DEFAULT 1')
  } },
  { version: 18, module: 'host-account', name: 'collab.tables', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        token TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS accounts_token ON accounts(token);
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspace_members (
        workspace_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, account_id)
      );
      CREATE INDEX IF NOT EXISTS workspace_members_account ON workspace_members(account_id);
      CREATE TABLE IF NOT EXISTS record_owners (
        workspace_id TEXT NOT NULL,
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        owner_id TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 0,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, collection, record_id)
      );
      CREATE TABLE IF NOT EXISTS sync_ops (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        workspace_id TEXT NOT NULL,
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        field TEXT NOT NULL,
        value_json TEXT NOT NULL,
        version INTEGER NOT NULL,
        author_id TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS sync_ops_ws ON sync_ops(workspace_id, id);
      CREATE TABLE IF NOT EXISTS edit_locks (
        workspace_id TEXT NOT NULL,
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, collection, record_id)
      );
      CREATE TABLE IF NOT EXISTS presence (
        workspace_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        collection TEXT NOT NULL DEFAULT '',
        record_id TEXT NOT NULL DEFAULT '',
        seen_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, account_id)
      );
    `)
  } },
  { version: 19, module: 'host-account', name: 'collab.bootstrap', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS collab_state (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );
    `)
  } },
  { version: 20, module: 'host-account', name: 'account.password', up: (db) => {
    const columns = tableColumnNames(db, 'accounts')
    if (!columns.includes('password_hash')) {
      db.exec(`ALTER TABLE accounts ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''`)
    }
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS accounts_name ON accounts(name)`)
  } },
  { version: 21, module: 'host-account', name: 'account.workspace-profile', up: (db) => {
    const columns = tableColumnNames(db, 'workspace_members')
    if (!columns.includes('display_name')) {
      db.exec(`ALTER TABLE workspace_members ADD COLUMN display_name TEXT NOT NULL DEFAULT ''`)
    }
    if (!columns.includes('avatar')) {
      db.exec(`ALTER TABLE workspace_members ADD COLUMN avatar TEXT NOT NULL DEFAULT ''`)
    }
  } },
  { version: 22, module: 'host-account', name: 'account.email', up: (db) => {
    db.exec('DROP INDEX IF EXISTS accounts_name')
    const columns = tableColumnNames(db, 'accounts')
    if (!columns.includes('email')) {
      db.exec(`ALTER TABLE accounts ADD COLUMN email TEXT`)
    }
    db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS accounts_email ON accounts(email) WHERE email IS NOT NULL AND length(email) > 0`)
  } },
  { version: 23, module: 'host-account', name: 'account.active-workspace', up: (db) => {
    const columns = tableColumnNames(db, 'accounts')
    if (!columns.includes('active_workspace_id')) {
      db.exec(`ALTER TABLE accounts ADD COLUMN active_workspace_id TEXT NOT NULL DEFAULT ''`)
    }
  } },
  { version: 24, module: 'host-account', name: 'account.record-grants', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS record_grants (
        workspace_id TEXT NOT NULL,
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, collection, record_id, account_id)
      );
    `)
  } },
  { version: 25, module: 'host-account', name: 'account.authorization-model', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_groups (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS workspace_groups_workspace ON workspace_groups(workspace_id);
      CREATE TABLE IF NOT EXISTS workspace_group_members (
        group_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (group_id, account_id)
      );
      CREATE INDEX IF NOT EXISTS workspace_group_members_account ON workspace_group_members(account_id);
      CREATE TABLE IF NOT EXISTS resource_policies (
        workspace_id TEXT NOT NULL,
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        ownership TEXT NOT NULL,
        owner_account_id TEXT NOT NULL,
        access_mode TEXT NOT NULL,
        member_default_role TEXT NOT NULL DEFAULT 'viewer',
        parent_collection TEXT NOT NULL DEFAULT '',
        parent_record_id TEXT NOT NULL DEFAULT '',
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, collection, record_id)
      );
      CREATE INDEX IF NOT EXISTS resource_policies_parent
        ON resource_policies(workspace_id, parent_collection, parent_record_id);
    `)
    const columns = tableColumnNames(db, 'record_grants')
    if (columns.includes('account_id')) {
      db.exec(`
        ALTER TABLE record_grants RENAME TO record_grants_v24;
        CREATE TABLE record_grants (
          workspace_id TEXT NOT NULL,
          collection TEXT NOT NULL,
          record_id TEXT NOT NULL,
          subject_type TEXT NOT NULL,
          subject_id TEXT NOT NULL,
          role TEXT NOT NULL,
          granted_by TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          PRIMARY KEY (workspace_id, collection, record_id, subject_type, subject_id)
        );
        INSERT INTO record_grants
          (workspace_id, collection, record_id, subject_type, subject_id, role, granted_by, created_at)
        SELECT workspace_id, collection, record_id, 'account', account_id, role, account_id, created_at
        FROM record_grants_v24;
        DROP TABLE record_grants_v24;
      `)
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS record_grants_subject
        ON record_grants(workspace_id, subject_type, subject_id);
    `)
  } },
  { version: 26, module: 'host-account', name: 'account.member-roles', up: (db) => {
    db.exec(`UPDATE workspace_members SET role = 'member' WHERE role NOT IN ('owner', 'admin', 'member')`)
  } },
  { version: 27, module: 'host-account', name: 'account.admin-role', up: (db) => {
    db.exec(`UPDATE workspace_members SET role = 'member' WHERE role NOT IN ('owner', 'admin', 'member')`)
  } },
  { version: 28, module: 'host-account', name: 'account.viewer-role', up: (db) => {
    db.exec(`UPDATE workspace_members SET role = 'member' WHERE role NOT IN ('owner', 'admin', 'member', 'viewer')`)
  } },
  { version: 29, module: 'host-account', name: 'account.external-members', up: (db) => {
    if (!tableColumnNames(db, 'workspace_members').includes('member_kind')) {
      db.exec(`ALTER TABLE workspace_members ADD COLUMN member_kind TEXT NOT NULL DEFAULT 'member'`)
    }
  } },
  { version: 30, module: 'host-account', name: 'account.invites-and-guests', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS workspace_invites (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        workspace_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        role TEXT NOT NULL,
        collection TEXT NOT NULL DEFAULT '',
        record_id TEXT NOT NULL DEFAULT '',
        resource_role TEXT NOT NULL DEFAULT 'viewer',
        expires_at INTEGER NOT NULL,
        max_uses INTEGER NOT NULL DEFAULT 1,
        use_count INTEGER NOT NULL DEFAULT 0,
        created_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        revoked_at INTEGER
      );
      CREATE UNIQUE INDEX IF NOT EXISTS workspace_invites_token ON workspace_invites(token_hash);
      CREATE INDEX IF NOT EXISTS workspace_invites_workspace ON workspace_invites(workspace_id, created_at);
      CREATE TABLE IF NOT EXISTS guest_sessions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL UNIQUE,
        workspace_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS guest_sessions_account ON guest_sessions(account_id);
    `)
  } },
  { version: 31, module: 'host-account', name: 'account.sessions-and-mcp', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS auth_sessions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        token_hash TEXT NOT NULL UNIQUE,
        device_name TEXT NOT NULL DEFAULT '',
        expires_at INTEGER,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS auth_sessions_account ON auth_sessions(account_id, revoked_at);
      CREATE TABLE IF NOT EXISTS mcp_credentials (
        id TEXT PRIMARY KEY,
        token_hash TEXT NOT NULL UNIQUE,
        account_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        allowed_tools TEXT NOT NULL DEFAULT '',
        expires_at INTEGER,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS mcp_credentials_member ON mcp_credentials(account_id, workspace_id);
    `)
  } },
  { version: 32, module: 'host-account', name: 'account.mcp-audit', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mcp_audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        credential_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        workspace_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        success INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS mcp_audit_workspace ON mcp_audit_log(workspace_id, created_at);
    `)
  } },
  { version: 33, module: 'host-account', name: 'instance.roles-and-plugin-access', up: (db) => {
    // These tables are part of CREATE_CORE_SQL so fresh databases and upgraded
    // databases always receive exactly the same contract.
    db.exec(CREATE_CORE_SQL)
  } },
  { version: 34, module: 'host-account', name: 'account.force-initial-password-change', up: (db) => {
    addColumn(db, 'accounts', 'must_change_password', 'must_change_password INTEGER NOT NULL DEFAULT 0')
  } },
  { version: 35, module: 'host-account', name: 'access.view-collaborators', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS view_grants (
        workspace_id TEXT NOT NULL,
        collection TEXT NOT NULL,
        view_id TEXT NOT NULL,
        subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        role TEXT NOT NULL,
        granted_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, collection, view_id, subject_type, subject_id)
      );
      CREATE INDEX IF NOT EXISTS view_grants_subject
        ON view_grants(workspace_id, subject_type, subject_id);
    `)
    addColumn(db, 'workspace_invites', 'view_id', "view_id TEXT NOT NULL DEFAULT ''")
  } },
  { version: 36, module: 'host-account', name: 'plugin.per-user-load', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS plugin_loads (
        workspace_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        plugin_id TEXT NOT NULL,
        loaded_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, account_id, plugin_id)
      );
      CREATE INDEX IF NOT EXISTS plugin_loads_plugin ON plugin_loads(plugin_id);
    `)
  } },
  { version: 37, module: 'host-account', name: 'drop.instance.roles', up: (db) => {
    db.exec(`
      DROP INDEX IF EXISTS instance_role_members_account;
      DROP INDEX IF EXISTS instance_role_permissions_permission;
      DROP TABLE IF EXISTS instance_role_members;
      DROP TABLE IF EXISTS instance_role_permissions;
      DROP TABLE IF EXISTS instance_roles;
    `)
  } },
  { version: 38, module: 'host-account', name: 'local-cloud.identity-boundary', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS cloud_connections (
        local_account_id TEXT PRIMARY KEY,
        origin TEXT NOT NULL,
        remote_account_id TEXT NOT NULL,
        remote_name TEXT NOT NULL DEFAULT '',
        remote_email TEXT NOT NULL DEFAULT '',
        token TEXT NOT NULL,
        connected_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS workspace_place (
        workspace_id TEXT PRIMARY KEY,
        place TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS workspace_place_place ON workspace_place(place);
      CREATE TABLE IF NOT EXISTS session_execution_leases (
        session_id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        lease_id TEXT NOT NULL UNIQUE,
        executor_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS session_execution_leases_expiry ON session_execution_leases(expires_at);
    `)
  } },
  { version: 39, module: 'host-account', name: 'account.password-recall', up: (db) => {
    addColumn(db, 'accounts', 'password_recall', `password_recall TEXT NOT NULL DEFAULT ''`)
  } },
  { version: 40, module: 'host-account', name: 'cloud.many-accounts', up: (db) => {
    db.exec(`
      CREATE TABLE cloud_connections_v40 (
        local_account_id TEXT NOT NULL,
        origin TEXT NOT NULL,
        remote_account_id TEXT NOT NULL,
        remote_name TEXT NOT NULL DEFAULT '',
        remote_email TEXT NOT NULL DEFAULT '',
        token TEXT NOT NULL,
        connected_at INTEGER NOT NULL,
        active INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (local_account_id, origin, remote_account_id)
      );
      INSERT INTO cloud_connections_v40
        (local_account_id, origin, remote_account_id, remote_name, remote_email, token, connected_at, active)
      SELECT local_account_id, origin, remote_account_id, remote_name, remote_email, token, connected_at, 1
      FROM cloud_connections;
      DROP TABLE cloud_connections;
      ALTER TABLE cloud_connections_v40 RENAME TO cloud_connections;
      CREATE INDEX IF NOT EXISTS cloud_connections_active ON cloud_connections(local_account_id, active);
    `)
  } },
  { version: 41, module: 'host-sessions', name: 'collection.sessions-to-agents', up: (db) => {
    remapSessionsCollectionToAgents(db)
  } },
  { version: 42, module: 'host-sessions', name: 'table.sessions-to-agents', up: (db) => {
    renameSessionsTableToAgents(db)
  } },
  { version: 43, module: 'core-file-system', name: 'facet.field.identity', up: (db) => {
    migrateFacetFieldIdentity(db)
  } },
  { version: 44, module: 'core-file-system', name: 'facet-to-tag', up: (db) => {
    migrateFacetNameToTag(db)
  } },
  { version: 45, module: 'core-file-system', name: 'tag.views', up: (db) => {
    addColumn(db, 'tags', 'views_json', `views_json TEXT NOT NULL DEFAULT '[]'`)
    db.exec(`
      CREATE TABLE IF NOT EXISTS tag_docs (
        name TEXT PRIMARY KEY,
        tag_id TEXT NOT NULL,
        body TEXT NOT NULL,
        etag TEXT NOT NULL,
        mime TEXT NOT NULL DEFAULT 'text/plain; charset=utf-8'
      );
      CREATE INDEX IF NOT EXISTS tag_docs_tag ON tag_docs(tag_id);
    `)
  } },
  { version: 46, module: 'host-account', name: 'drop.resource-ownership', up: (db) => {
    dropColumn(db, 'resource_policies', 'ownership')
  } },
  { version: 47, module: 'core-page', name: 'page.views', up: (db) => {
    addColumn(db, 'pages', 'views_json', `views_json TEXT NOT NULL DEFAULT '[]'`)
    addColumn(db, 'pages', 'prop_views_json', `prop_views_json TEXT NOT NULL DEFAULT '[]'`)
    addColumn(db, 'pages', 'layouts_json', `layouts_json TEXT NOT NULL DEFAULT '[]'`)
  } },
  { version: 48, module: 'core-file-system', name: 'record.views', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS record_views (
        collection TEXT NOT NULL,
        record_id TEXT NOT NULL,
        views_json TEXT NOT NULL DEFAULT '[]',
        prop_views_json TEXT NOT NULL DEFAULT '[]',
        layouts_json TEXT NOT NULL DEFAULT '[]',
        PRIMARY KEY (collection, record_id)
      )
    `)
    dropColumn(db, 'pages', 'views_json')
    dropColumn(db, 'pages', 'prop_views_json')
    dropColumn(db, 'pages', 'layouts_json')
    dropColumn(db, 'tags', 'views_json')
    dropColumn(db, 'tags', 'prop_views_json')
  } },
  { version: 49, module: 'core-file-system', name: 'drop.tag-docs', up: (db) => {
    if (hasTable(db, 'tag_docs')) db.exec('DROP TABLE tag_docs')
  } },
  { version: 50, module: 'host-account', name: 'account.avatar', up: (db) => {
    addColumn(db, 'accounts', 'avatar', `avatar TEXT NOT NULL DEFAULT ''`)
  } },
  { version: 51, module: 'core-file-system', name: 'saved-views.workspace-isolation', up: (db) => {
    if (hasTable(db, 'saved_views') && !tableColumnNames(db, 'saved_views').includes('workspace_id')) {
      db.exec(`
        CREATE TABLE saved_views_v51 (
          workspace_id TEXT NOT NULL DEFAULT '',
          collection TEXT NOT NULL,
          view_id TEXT NOT NULL,
          payload_json TEXT NOT NULL,
          updated_at INTEGER NOT NULL,
          PRIMARY KEY (workspace_id, collection, view_id)
        );
        INSERT INTO saved_views_v51 (workspace_id, collection, view_id, payload_json, updated_at)
        SELECT '', collection, view_id, payload_json, updated_at FROM saved_views;
        DROP TABLE saved_views;
        ALTER TABLE saved_views_v51 RENAME TO saved_views;
      `)
    }
    if (hasTable(db, 'saved_view_tombstones') && !tableColumnNames(db, 'saved_view_tombstones').includes('workspace_id')) {
      db.exec(`
        CREATE TABLE saved_view_tombstones_v51 (
          workspace_id TEXT NOT NULL DEFAULT '',
          collection TEXT NOT NULL,
          view_id TEXT NOT NULL,
          deleted_at INTEGER NOT NULL,
          PRIMARY KEY (workspace_id, collection, view_id)
        );
        INSERT INTO saved_view_tombstones_v51 (workspace_id, collection, view_id, deleted_at)
        SELECT '', collection, view_id, deleted_at FROM saved_view_tombstones;
        DROP TABLE saved_view_tombstones;
        ALTER TABLE saved_view_tombstones_v51 RENAME TO saved_view_tombstones;
      `)
    }
  } },
  { version: 52, module: 'host-account', name: 'grants.effect', up: (db) => {
    addColumn(db, 'record_grants', 'effect', `effect TEXT NOT NULL DEFAULT 'allow'`)
    addColumn(db, 'view_grants', 'effect', `effect TEXT NOT NULL DEFAULT 'allow'`)
  } },
  { version: 53, module: 'host-account', name: 'view-grants.columns', up: (db) => {
    addColumn(db, 'view_grants', 'readable_columns', `readable_columns TEXT`)
    addColumn(db, 'view_grants', 'writable_columns', `writable_columns TEXT`)
    addColumn(db, 'view_grants', 'denied_columns', `denied_columns TEXT`)
  } },
  { version: 54, module: 'host-account', name: 'actor-scopes', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS actor_scopes (
        workspace_id TEXT NOT NULL,
        actor_type TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        issuer_id TEXT NOT NULL,
        allowed_collections TEXT,
        allowed_views TEXT,
        max_role TEXT NOT NULL DEFAULT 'editor',
        expires_at INTEGER,
        revoked_at INTEGER,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, actor_type, actor_id)
      );
      CREATE INDEX IF NOT EXISTS actor_scopes_issuer
        ON actor_scopes(workspace_id, issuer_id);
    `)
  } },
  { version: 55, module: 'host-account', name: 'view-grants.pk-granted-by', up: (db) => {
    if (!hasTable(db, 'view_grants')) return
    db.exec(`
      CREATE TABLE view_grants_v55 (
        workspace_id TEXT NOT NULL,
        collection TEXT NOT NULL,
        view_id TEXT NOT NULL,
        subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        role TEXT NOT NULL,
        effect TEXT NOT NULL DEFAULT 'allow',
        readable_columns TEXT,
        writable_columns TEXT,
        denied_columns TEXT,
        granted_by TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (workspace_id, collection, view_id, subject_type, subject_id, granted_by)
      );
      INSERT OR REPLACE INTO view_grants_v55
        (workspace_id, collection, view_id, subject_type, subject_id, role, effect, readable_columns, writable_columns, denied_columns, granted_by, created_at)
      SELECT workspace_id, collection, view_id, subject_type, subject_id, role,
             COALESCE(effect, 'allow'), readable_columns, writable_columns, denied_columns,
             COALESCE(granted_by, ''), created_at
      FROM view_grants;
      DROP TABLE view_grants;
      ALTER TABLE view_grants_v55 RENAME TO view_grants;
      CREATE INDEX IF NOT EXISTS view_grants_subject
        ON view_grants(workspace_id, subject_type, subject_id);
    `)
  } },
  { version: 56, module: 'core-file-system', name: 'shares.workspace-and-creator', up: (db) => {
    addColumn(db, 'shares', 'workspace_id', `workspace_id TEXT NOT NULL DEFAULT ''`)
    addColumn(db, 'shares', 'created_by', `created_by TEXT NOT NULL DEFAULT ''`)
  } },
  { version: 57, module: 'host-account', name: 'access-rules.decouple-from-views', up: (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS access_rules (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        collection TEXT NOT NULL,
        name TEXT NOT NULL,
        created_by TEXT NOT NULL,
        filter_tree_json TEXT NOT NULL,
        columns_json TEXT,
        display_snapshot_json TEXT,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS access_rules_ws_col
        ON access_rules(workspace_id, collection, enabled);
      CREATE INDEX IF NOT EXISTS access_rules_owner
        ON access_rules(workspace_id, created_by);
      CREATE TABLE IF NOT EXISTS access_rule_grants (
        id TEXT PRIMARY KEY,
        rule_id TEXT NOT NULL REFERENCES access_rules(id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL,
        subject_type TEXT NOT NULL,
        subject_id TEXT NOT NULL,
        role TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        UNIQUE(rule_id, subject_type, subject_id)
      );
      CREATE INDEX IF NOT EXISTS access_rule_grants_subject
        ON access_rule_grants(workspace_id, subject_type, subject_id);
    `)
    if (hasTable(db, 'shares')) {
      addColumn(db, 'shares', 'rule_id', `rule_id TEXT NOT NULL DEFAULT ''`)
      db.exec('DROP INDEX IF EXISTS shares_target')
      db.exec('CREATE UNIQUE INDEX IF NOT EXISTS shares_target ON shares(kind, collection, view_id, record_id, rule_id)')
    }

    const shortHash = (input: string) => createHash('sha256').update(input).digest('hex').slice(0, 16)
    const parseViewPayload = (workspaceId: string, collection: string, viewId: string): Record<string, unknown> | null => {
      if (!hasTable(db, 'saved_views')) return null
      const row = (
        db
          .prepare('SELECT payload_json FROM saved_views WHERE workspace_id = ? AND collection = ? AND view_id = ?')
          .get(workspaceId, collection, viewId) ??
        db
          .prepare(`SELECT payload_json FROM saved_views WHERE workspace_id = '' AND collection = ? AND view_id = ?`)
          .get(collection, viewId)
      ) as { payload_json?: string } | undefined
      if (!row?.payload_json) return null
      try {
        const parsed = JSON.parse(row.payload_json)
        return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
      } catch {
        return null
      }
    }
    const extractFilterTreeJson = (payload: Record<string, unknown> | null): string => {
      if (payload?.filterTree && typeof payload.filterTree === 'object') {
        return JSON.stringify(payload.filterTree)
      }
      if (Array.isArray(payload?.filters) && payload.filters.length > 0) {
        return JSON.stringify({ op: 'and', rules: payload.filters })
      }
      return JSON.stringify({ op: 'and', rules: [] })
    }
    const extractColumnsJson = (payload: Record<string, unknown> | null, fallbackReadable?: string | null): string | null => {
      if (Array.isArray(payload?.columns) && payload.columns.length > 0) {
        const cols = payload.columns.filter((c): c is string => typeof c === 'string' && c.trim().length > 0)
        if (cols.length > 0) return JSON.stringify(cols)
      }
      if (fallbackReadable) {
        try {
          const parsed = JSON.parse(fallbackReadable)
          if (Array.isArray(parsed) && parsed.length > 0) return JSON.stringify(parsed)
        } catch {
          /* ignore */
        }
      }
      return null
    }
    const extractDisplaySnapshotJson = (payload: Record<string, unknown> | null): string | null => {
      if (!payload) return null
      const snap: Record<string, unknown> = {}
      if (typeof payload.mode === 'string') snap.mode = payload.mode
      if (Array.isArray(payload.sorts) && payload.sorts.length > 0) snap.sorts = payload.sorts
      if (typeof payload.groupBy === 'string' && payload.groupBy) snap.groupBy = payload.groupBy
      if (payload.groupConfig && typeof payload.groupConfig === 'object') snap.groupConfig = payload.groupConfig
      return Object.keys(snap).length > 0 ? JSON.stringify(snap) : null
    }

    const migratedRuleIdByKey = new Map<string, string>()

    // 1. 将现有 view_grants 按 (workspace_id, collection, view_id, granted_by) 迁移为独立 access_rules + access_rule_grants
    if (hasTable(db, 'view_grants')) {
      const rows = db
        .prepare(
          `SELECT workspace_id, collection, view_id, subject_type, subject_id, role, readable_columns, granted_by, created_at
           FROM view_grants
           ORDER BY created_at ASC`,
        )
        .all() as Array<{
        workspace_id: string
        collection: string
        view_id: string
        subject_type: string
        subject_id: string
        role: string
        readable_columns: string | null
        granted_by: string
        created_at: number
      }>
      const now = Date.now()
      const insertRule = db.prepare(
        `INSERT OR IGNORE INTO access_rules
           (id, workspace_id, collection, name, created_by, filter_tree_json, columns_json, display_snapshot_json, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      const insertGrant = db.prepare(
        `INSERT OR IGNORE INTO access_rule_grants
           (id, rule_id, workspace_id, subject_type, subject_id, role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      for (const row of rows) {
        if (!row.granted_by) continue
        const groupKey = `${row.workspace_id}\0${row.collection}\0${row.view_id}\0${row.granted_by}`
        let ruleId = migratedRuleIdByKey.get(groupKey)
        if (!ruleId) {
          ruleId = `rule_mig_${shortHash(groupKey)}`
          migratedRuleIdByKey.set(groupKey, ruleId)
          const payload = parseViewPayload(row.workspace_id, row.collection, row.view_id)
          const baseName = typeof payload?.name === 'string' && payload.name.trim() ? payload.name.trim() : row.view_id
          const ts = Number(row.created_at) || now
          insertRule.run(
            ruleId,
            row.workspace_id,
            row.collection,
            baseName,
            row.granted_by,
            extractFilterTreeJson(payload),
            extractColumnsJson(payload, row.readable_columns),
            extractDisplaySnapshotJson(payload),
            ts,
            ts,
          )
        }
        const grantId = `rg_mig_${shortHash(`${ruleId}\0${row.subject_type}\0${row.subject_id}`)}`
        insertGrant.run(
          grantId,
          ruleId,
          row.workspace_id,
          row.subject_type,
          row.subject_id,
          row.role,
          Number(row.created_at) || now,
        )
      }
    }

    // 2. 将 saved_views 中的 scope = 'shared' 归一为 'personal'（视图纯展示，只保留 personal / workspace 两态）
    if (hasTable(db, 'saved_views')) {
      const sharedViews = db
        .prepare(`SELECT workspace_id, collection, view_id, payload_json FROM saved_views WHERE payload_json LIKE '%"shared"%'`)
        .all() as Array<{ workspace_id: string; collection: string; view_id: string; payload_json: string }>
      const updateView = db.prepare(
        'UPDATE saved_views SET payload_json = ? WHERE workspace_id = ? AND collection = ? AND view_id = ?',
      )
      for (const view of sharedViews) {
        try {
          const parsed = JSON.parse(view.payload_json) as Record<string, unknown>
          if (parsed && typeof parsed === 'object' && parsed.scope === 'shared') {
            parsed.scope = 'personal'
            updateView.run(JSON.stringify(parsed), view.workspace_id, view.collection, view.view_id)
          }
        } catch {
          /* ignore malformed payload */
        }
      }
    }

    // 3. 将 shares 中 kind = 'view' 的公开外链迁到独立 access_rule（保留原 token 不失效）
    if (hasTable(db, 'shares')) {
      const viewShares = db
        .prepare(
          `SELECT token, collection, view_id, workspace_id, created_by, created_at
           FROM shares
           WHERE kind = 'view' AND view_id != ''`,
        )
        .all() as Array<{
        token: string
        collection: string
        view_id: string
        workspace_id: string
        created_by: string
        created_at: number
      }>
      const now = Date.now()
      const insertRule = db.prepare(
        `INSERT OR IGNORE INTO access_rules
           (id, workspace_id, collection, name, created_by, filter_tree_json, columns_json, display_snapshot_json, enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      const updateShare = db.prepare(
        `UPDATE shares SET kind = 'rule', rule_id = ?, view_id = '' WHERE token = ?`,
      )
      for (const share of viewShares) {
        const payload = parseViewPayload(share.workspace_id, share.collection, share.view_id)
        const owner = share.created_by || (typeof payload?.createdBy === 'string' ? payload.createdBy : '')
        const groupKey = `${share.workspace_id}\0${share.collection}\0${share.view_id}\0${owner}`
        let ruleId = migratedRuleIdByKey.get(groupKey)
        if (!ruleId) {
          ruleId = `rule_share_${shortHash(`${share.token}\0${groupKey}`)}`
          migratedRuleIdByKey.set(groupKey, ruleId)
          const baseName = typeof payload?.name === 'string' && payload.name.trim() ? payload.name.trim() : share.view_id
          const ts = Number(share.created_at) || now
          insertRule.run(
            ruleId,
            share.workspace_id,
            share.collection,
            baseName,
            owner,
            extractFilterTreeJson(payload),
            extractColumnsJson(payload),
            extractDisplaySnapshotJson(payload),
            ts,
            ts,
          )
        }
        updateShare.run(ruleId, share.token)
      }
    }
  } },
  { version: 58, module: 'host-account', name: 'dynamic-groups-and-view-policies', up: (db) => {
    const shortHash = (input: string) => createHash('sha256').update(input).digest('hex').slice(0, 16)
    const now = Date.now()

    // 1. 扩展 workspace_groups 支持动态成员组（kind = 'static' | 'dynamic'，filter_tree_json）
    if (hasTable(db, 'workspace_groups')) {
      addColumn(db, 'workspace_groups', 'kind', `kind TEXT NOT NULL DEFAULT 'static'`)
      addColumn(db, 'workspace_groups', 'filter_tree_json', `filter_tree_json TEXT`)
      addColumn(db, 'workspace_groups', 'updated_at', `updated_at INTEGER NOT NULL DEFAULT 0`)
    }

    const BUILTIN_MEMBER_VIEW_PRESETS: Record<string, { name: string; filterTree: Record<string, unknown> }> = {
      'builtin-member:member': {
        name: '空间成员',
        filterTree: { op: 'and', children: [{ field: 'membershipKind', op: 'eq', value: 'member' }] },
      },
      'builtin-member:external': {
        name: '外部成员',
        filterTree: { op: 'and', children: [{ field: 'membershipKind', op: 'eq', value: 'external' }] },
      },
      'builtin-member:guest': {
        name: '临时访客',
        filterTree: { op: 'and', children: [{ field: 'membershipKind', op: 'eq', value: 'guest' }] },
      },
    }

    const findWorkspaceOwner = (workspaceId: string): string => {
      if (!hasTable(db, 'workspace_members')) return ''
      const owner = db
        .prepare(
          `SELECT account_id FROM workspace_members
           WHERE workspace_id = ?
           ORDER BY CASE role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END, created_at ASC
           LIMIT 1`,
        )
        .get(workspaceId) as { account_id?: string } | undefined
      return owner?.account_id ?? ''
    }

    const parseMemberViewSnapshot = (workspaceId: string, viewId: string): { name: string; filterTreeJson: string; createdBy: string } => {
      if (hasTable(db, 'saved_views')) {
        const row = (
          db
            .prepare(`SELECT payload_json FROM saved_views WHERE workspace_id = ? AND collection = '/workspace-members' AND view_id = ?`)
            .get(workspaceId, viewId) ??
          db
            .prepare(`SELECT payload_json FROM saved_views WHERE workspace_id = '' AND collection = '/workspace-members' AND view_id = ?`)
            .get(viewId)
        ) as { payload_json?: string } | undefined
        if (row?.payload_json) {
          try {
            const parsed = JSON.parse(row.payload_json) as Record<string, unknown>
            const name = typeof parsed.name === 'string' && parsed.name.trim() ? parsed.name.trim() : viewId
            const createdBy = typeof parsed.createdBy === 'string' ? parsed.createdBy : ''
            if (parsed.filterTree && typeof parsed.filterTree === 'object') {
              return { name, filterTreeJson: JSON.stringify(parsed.filterTree), createdBy }
            }
            if (parsed.filters && typeof parsed.filters === 'object' && !Array.isArray(parsed.filters)) {
              const children = Object.entries(parsed.filters as Record<string, unknown>)
                .filter(([, val]) => String(val ?? '').trim().length > 0)
                .map(([field, val]) => ({ field, op: 'eq', value: String(val).trim() }))
              return { name, filterTreeJson: JSON.stringify({ op: 'and', children }), createdBy }
            }
            return { name, filterTreeJson: JSON.stringify({ op: 'and', children: [] }), createdBy }
          } catch {
            /* fallback to preset */
          }
        }
      }
      const preset = BUILTIN_MEMBER_VIEW_PRESETS[viewId]
      if (preset) {
        return { name: preset.name, filterTreeJson: JSON.stringify(preset.filterTree), createdBy: '' }
      }
      return { name: viewId, filterTreeJson: JSON.stringify({ op: 'and', children: [] }), createdBy: '' }
    }

    const ROLE_RANK: Record<string, number> = { viewer: 1, commenter: 2, editor: 3, manager: 4, owner: 5 }
    const migratedGroupByKey = new Map<string, string>()

    const ensureDynamicGroupForMemberView = (workspaceId: string, viewId: string): string => {
      const key = `${workspaceId}\0${viewId}`
      const hit = migratedGroupByKey.get(key)
      if (hit) return hit
      const groupId = `grp_mig_${shortHash(key)}`
      migratedGroupByKey.set(key, groupId)
      if (hasTable(db, 'workspace_groups')) {
        const snap = parseMemberViewSnapshot(workspaceId, viewId)
        const createdBy = snap.createdBy || findWorkspaceOwner(workspaceId)
        db.prepare(
          `INSERT OR IGNORE INTO workspace_groups
             (id, workspace_id, name, kind, filter_tree_json, created_by, created_at, updated_at)
           VALUES (?, ?, ?, 'dynamic', ?, ?, ?, ?)`,
        ).run(groupId, workspaceId, snap.name, snap.filterTreeJson, createdBy, now, now)
      }
      return groupId
    }

    // 2. 将 record_grants 中的 subject_type = 'member_view' 迁移为动态组 subject_type = 'group'
    if (hasTable(db, 'record_grants')) {
      const rows = db
        .prepare(
          `SELECT workspace_id, collection, record_id, subject_id, role, effect, granted_by, created_at
           FROM record_grants
           WHERE subject_type = 'member_view'`,
        )
        .all() as Array<{
        workspace_id: string
        collection: string
        record_id: string
        subject_id: string
        role: string
        effect: string
        granted_by: string
        created_at: number
      }>
      for (const row of rows) {
        const groupId = ensureDynamicGroupForMemberView(row.workspace_id, row.subject_id)
        const existing = db
          .prepare(
            `SELECT role FROM record_grants
             WHERE workspace_id = ? AND collection = ? AND record_id = ? AND subject_type = 'group' AND subject_id = ?`,
          )
          .get(row.workspace_id, row.collection, row.record_id, groupId) as { role?: string } | undefined
        if (!existing) {
          db.prepare(
            `INSERT INTO record_grants
               (workspace_id, collection, record_id, subject_type, subject_id, role, effect, granted_by, created_at)
             VALUES (?, ?, ?, 'group', ?, ?, ?, ?, ?)`,
          ).run(row.workspace_id, row.collection, row.record_id, groupId, row.role, row.effect || 'allow', row.granted_by, row.created_at)
        } else if ((ROLE_RANK[row.role] ?? 0) > (ROLE_RANK[existing.role ?? ''] ?? 0)) {
          db.prepare(
            `UPDATE record_grants SET role = ?
             WHERE workspace_id = ? AND collection = ? AND record_id = ? AND subject_type = 'group' AND subject_id = ?`,
          ).run(row.role, row.workspace_id, row.collection, row.record_id, groupId)
        }
        db.prepare(
          `DELETE FROM record_grants
           WHERE workspace_id = ? AND collection = ? AND record_id = ? AND subject_type = 'member_view' AND subject_id = ?`,
        ).run(row.workspace_id, row.collection, row.record_id, row.subject_id)
      }
    }

    // 3. 将 access_rule_grants 中的 subject_type = 'member_view' 迁移为动态组 subject_type = 'group'
    if (hasTable(db, 'access_rule_grants')) {
      const rows = db
        .prepare(
          `SELECT id, rule_id, workspace_id, subject_id, role, created_at
           FROM access_rule_grants
           WHERE subject_type = 'member_view'`,
        )
        .all() as Array<{
        id: string
        rule_id: string
        workspace_id: string
        subject_id: string
        role: string
        created_at: number
      }>
      for (const row of rows) {
        const groupId = ensureDynamicGroupForMemberView(row.workspace_id, row.subject_id)
        const existing = db
          .prepare(
            `SELECT id, role FROM access_rule_grants
             WHERE rule_id = ? AND subject_type = 'group' AND subject_id = ?`,
          )
          .get(row.rule_id, groupId) as { id?: string; role?: string } | undefined
        if (!existing) {
          db.prepare(
            `UPDATE access_rule_grants SET subject_type = 'group', subject_id = ? WHERE id = ?`,
          ).run(groupId, row.id)
        } else {
          if (existing.id && (ROLE_RANK[row.role] ?? 0) > (ROLE_RANK[existing.role ?? ''] ?? 0)) {
            db.prepare(`UPDATE access_rule_grants SET role = ? WHERE id = ?`).run(row.role, existing.id)
          }
          db.prepare(`DELETE FROM access_rule_grants WHERE id = ?`).run(row.id)
        }
      }
    }

    // 4. 为存量缺失 resource_policies 的 saved_views 补齐策略行，使 /views 100% 走通用记录 RBAC
    if (hasTable(db, 'saved_views') && hasTable(db, 'resource_policies')) {
      const views = db
        .prepare(`SELECT workspace_id, collection, view_id, payload_json, updated_at FROM saved_views WHERE workspace_id != ''`)
        .all() as Array<{
        workspace_id: string
        collection: string
        view_id: string
        payload_json: string
        updated_at: number
      }>
      const insertPolicy = db.prepare(
        `INSERT OR IGNORE INTO resource_policies
           (workspace_id, collection, record_id, owner_account_id, access_mode,
            member_default_role, parent_collection, parent_record_id, created_by, created_at)
         VALUES (?, '/views', ?, ?, ?, 'viewer', '', '', ?, ?)`,
      )
      const insertOwnerGrant = db.prepare(
        `INSERT OR IGNORE INTO record_grants
           (workspace_id, collection, record_id, subject_type, subject_id, role, effect, granted_by, created_at)
         VALUES (?, '/views', ?, 'account', ?, 'owner', 'allow', ?, ?)`,
      )
      for (const view of views) {
        let parsed: Record<string, unknown> | null = null
        try {
          parsed = JSON.parse(view.payload_json) as Record<string, unknown>
        } catch {
          parsed = null
        }
        const cleanCol = view.collection.trim().replace(/^\/+/, '')
        const recordId = `${cleanCol}::${view.view_id}`
        const owner =
          (typeof parsed?.createdBy === 'string' && parsed.createdBy.trim()) ||
          findWorkspaceOwner(view.workspace_id)
        if (!owner) continue
        const scope = parsed?.scope === 'personal' ? 'personal' : 'workspace'
        const accessMode = scope === 'personal' ? 'private' : 'members'
        const ts = Number(view.updated_at) || now
        insertPolicy.run(view.workspace_id, recordId, owner, accessMode, owner, ts)
        if (hasTable(db, 'record_grants')) {
          insertOwnerGrant.run(view.workspace_id, recordId, owner, owner, ts)
        }
      }
    }
  } },
  { version: 59, module: 'authz', name: 'k_plus_1_owner_table_and_view_protection', up: (db) => {
    // 1. resource_policies 增加 owner_table 与 inherit_parent，并按既有 access_mode / 父子链回填
    if (hasTable(db, 'resource_policies')) {
      const cols = tableColumnNames(db, 'resource_policies')
      if (!cols.includes('owner_table')) {
        db.exec(`ALTER TABLE resource_policies ADD COLUMN owner_table TEXT NOT NULL DEFAULT ''`)
      }
      if (!cols.includes('inherit_parent')) {
        db.exec(`ALTER TABLE resource_policies ADD COLUMN inherit_parent INTEGER NOT NULL DEFAULT 0`)
      }
      db.exec(
        `CREATE INDEX IF NOT EXISTS resource_policies_owner_table
         ON resource_policies(workspace_id, collection, owner_table)`,
      )
      const rows = db
        .prepare(
          `SELECT workspace_id, collection, record_id, owner_account_id, access_mode, parent_collection, parent_record_id, owner_table
           FROM resource_policies`,
        )
        .all() as Array<{
        workspace_id: string
        collection: string
        record_id: string
        owner_account_id: string
        access_mode: string
        parent_collection: string
        parent_record_id: string
        owner_table: string
      }>
      const byKey = new Map<string, (typeof rows)[number]>()
      for (const row of rows) {
        byKey.set(`${row.workspace_id}\t${row.collection}\t${row.record_id}`, row)
      }
      const resolveOwnerTable = (row: (typeof rows)[number]): string => {
        if (row.owner_table) return row.owner_table
        let cursor: (typeof rows)[number] | undefined = row
        const visited = new Set<string>()
        let depth = 0
        while (cursor && cursor.access_mode === 'inherit' && cursor.parent_record_id && depth < 64) {
          const k = `${cursor.workspace_id}\t${cursor.collection}\t${cursor.record_id}`
          if (visited.has(k)) break
          visited.add(k)
          const parentCol = cursor.parent_collection || cursor.collection
          const parent = byKey.get(`${cursor.workspace_id}\t${parentCol}\t${cursor.parent_record_id}`)
          if (!parent) break
          cursor = parent
          depth += 1
        }
        if (cursor?.access_mode === 'members') return 'workspace'
        const ownerId = (cursor?.owner_account_id || row.owner_account_id || '').trim()
        return ownerId ? `account:${ownerId}` : 'workspace'
      }
      const updatePolicy = db.prepare(
        `UPDATE resource_policies
         SET owner_table = ?, inherit_parent = ?
         WHERE workspace_id = ? AND collection = ? AND record_id = ?`,
      )
      for (const row of rows) {
        const ownerTable = resolveOwnerTable(row)
        const inheritParent = row.access_mode === 'inherit' && Boolean(row.parent_record_id) ? 1 : 0
        updatePolicy.run(ownerTable, inheritParent, row.workspace_id, row.collection, row.record_id)
      }
    }

    // 2. access_rules 增加 owner_table，存量保守归属创建者个人表避免静默扩权
    if (hasTable(db, 'access_rules')) {
      const cols = tableColumnNames(db, 'access_rules')
      if (!cols.includes('owner_table')) {
        db.exec(`ALTER TABLE access_rules ADD COLUMN owner_table TEXT NOT NULL DEFAULT ''`)
      }
      db.exec(
        `CREATE INDEX IF NOT EXISTS access_rules_ws_col_table
         ON access_rules(workspace_id, collection, owner_table, enabled)`,
      )
      db.exec(
        `UPDATE access_rules
         SET owner_table = CASE
           WHEN created_by != '' THEN 'account:' || created_by
           ELSE 'workspace'
         END
         WHERE owner_table = ''`,
      )
    }

    // 3. saved_views 补齐三态保护字段 protection ('public' | 'locked' | 'personal') 与 ownerTable
    if (hasTable(db, 'saved_views')) {
      const views = db
        .prepare(`SELECT workspace_id, collection, view_id, payload_json FROM saved_views`)
        .all() as Array<{ workspace_id: string; collection: string; view_id: string; payload_json: string }>
      const saveView = db.prepare(
        `UPDATE saved_views SET payload_json = ? WHERE workspace_id = ? AND collection = ? AND view_id = ?`,
      )
      for (const row of views) {
        try {
          const parsed = JSON.parse(row.payload_json) as Record<string, unknown>
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
          let changed = false
          const scope = parsed.scope === 'personal' ? 'personal' : 'workspace'
          if (parsed.protection !== 'public' && parsed.protection !== 'locked' && parsed.protection !== 'personal') {
            parsed.protection = scope === 'personal' ? 'personal' : 'locked'
            changed = true
          }
          if (typeof parsed.ownerTable !== 'string' || !parsed.ownerTable) {
            const createdBy = typeof parsed.createdBy === 'string' ? parsed.createdBy.trim() : ''
            parsed.ownerTable = scope === 'personal' && createdBy ? `account:${createdBy}` : 'workspace'
            changed = true
          }
          if (changed) {
            saveView.run(JSON.stringify(parsed), row.workspace_id, row.collection, row.view_id)
          }
        } catch {
          /* skip malformed payload */
        }
      }
    }

    // 4. 彻底清理已下线的 view_grants 死表与 /views 历史记录级 ACL 行
    db.exec('DROP TABLE IF EXISTS view_grants')
    if (hasTable(db, 'record_grants')) {
      db.exec(`DELETE FROM record_grants WHERE collection = '/views'`)
    }
    if (hasTable(db, 'resource_policies')) {
      db.exec(`DELETE FROM resource_policies WHERE collection = '/views'`)
    }
  } },
  { version: 60, module: 'host-account', name: 'workspace-members.single-identity', up: (db) => {
    if (!hasTable(db, 'workspace_members') || !hasTable(db, 'accounts')) return
    const memberCols = tableColumnNames(db, 'workspace_members')
    const accountCols = tableColumnNames(db, 'accounts')
    if (memberCols.includes('avatar') && accountCols.includes('avatar')) {
      // 将历史全局头像一次性平滑迁入尚未自定义头像的空间成员行，之后空间内头像完全以 workspace_members.avatar 为准
      db.exec(
        `UPDATE workspace_members
         SET avatar = COALESCE((SELECT a.avatar FROM accounts a WHERE a.id = workspace_members.account_id), '')
         WHERE COALESCE(avatar, '') = ''
           AND EXISTS (
             SELECT 1 FROM accounts a
             WHERE a.id = workspace_members.account_id AND COALESCE(a.avatar, '') != ''
           )`,
      )
      db.exec(
        `UPDATE accounts
         SET avatar = ''
         WHERE COALESCE(avatar, '') != ''
           AND EXISTS (SELECT 1 FROM workspace_members m WHERE m.account_id = accounts.id)`,
      )
    }
  } },
  { version: 61, module: 'authz', name: 'single_table_static_authz_and_member_views', up: (db) => {
    const roleRank: Record<string, number> = { viewer: 1, commenter: 2, editor: 3, manager: 4, owner: 5 }
    const now = Date.now()

    // 1. 将遗留 workspace_groups 迁移：
    //    - kind = 'dynamic' -> 转为 /workspace-members 管理员锁定视图，record_grants 改为 subject_type = 'member_view'
    //    - kind = 'static'  -> 将关联的 record_grants 展开为成员个人 account 授权，防止升级丢权
    if (hasTable(db, 'workspace_groups')) {
      const groupCols = tableColumnNames(db, 'workspace_groups')
      const hasKind = groupCols.includes('kind')
      const hasFilter = groupCols.includes('filter_tree_json')
      const groups = db
        .prepare(
          `SELECT id, workspace_id, name, created_by, created_at${hasKind ? ', kind' : ''}${hasFilter ? ', filter_tree_json' : ''}
           FROM workspace_groups`,
        )
        .all() as Array<{
        id: string
        workspace_id: string
        name: string
        created_by: string
        created_at: number
        kind?: string
        filter_tree_json?: string | null
      }>

      const hasSavedViews = hasTable(db, 'saved_views')
      const hasRecordGrants = hasTable(db, 'record_grants')
      const hasGroupMembers = hasTable(db, 'workspace_group_members')

      for (const grp of groups) {
        const isDynamic = grp.kind === 'dynamic'
        if (isDynamic && hasSavedViews) {
          const viewId = `mv_${grp.id}`
          let filterTree: unknown = undefined
          if (grp.filter_tree_json) {
            try {
              filterTree = JSON.parse(grp.filter_tree_json)
            } catch {
              filterTree = undefined
            }
          }
          const payload: Record<string, unknown> = {
            id: viewId,
            name: grp.name || '成员分组',
            scope: 'workspace',
            protection: 'locked',
            createdBy: grp.created_by,
            createdAt: grp.created_at || now,
            ...(filterTree ? { filterTree } : {}),
          }
          db.prepare(
            `INSERT OR IGNORE INTO saved_views (workspace_id, collection, view_id, payload_json, updated_at)
             VALUES (?, '/workspace-members', ?, ?, ?)`,
          ).run(grp.workspace_id, viewId, JSON.stringify(payload), now)

          if (hasRecordGrants) {
            const groupGrants = db
              .prepare(
                `SELECT collection, record_id, role, granted_by, created_at
                 FROM record_grants
                 WHERE workspace_id = ? AND subject_type = 'group' AND subject_id = ?`,
              )
              .all(grp.workspace_id, grp.id) as Array<{
              collection: string
              record_id: string
              role: string
              granted_by: string
              created_at: number
            }>
            for (const g of groupGrants) {
              const existing = db
                .prepare(
                  `SELECT role FROM record_grants
                   WHERE workspace_id = ? AND collection = ? AND record_id = ? AND subject_type = 'member_view' AND subject_id = ?`,
                )
                .get(grp.workspace_id, g.collection, g.record_id, viewId) as { role: string } | undefined
              if (!existing) {
                db.prepare(
                  `INSERT INTO record_grants (workspace_id, collection, record_id, subject_type, subject_id, role, granted_by, created_at)
                   VALUES (?, ?, ?, 'member_view', ?, ?, ?, ?)`,
                ).run(grp.workspace_id, g.collection, g.record_id, viewId, g.role, g.granted_by, g.created_at)
              } else if ((roleRank[g.role] ?? 0) > (roleRank[existing.role] ?? 0)) {
                db.prepare(
                  `UPDATE record_grants SET role = ?
                   WHERE workspace_id = ? AND collection = ? AND record_id = ? AND subject_type = 'member_view' AND subject_id = ?`,
                ).run(g.role, grp.workspace_id, g.collection, g.record_id, viewId)
              }
            }
          }
        } else if (!isDynamic && hasRecordGrants && hasGroupMembers) {
          const members = db
            .prepare('SELECT account_id FROM workspace_group_members WHERE group_id = ?')
            .all(grp.id) as Array<{ account_id: string }>
          const groupGrants = db
            .prepare(
              `SELECT collection, record_id, role, granted_by, created_at
               FROM record_grants
               WHERE workspace_id = ? AND subject_type = 'group' AND subject_id = ?`,
            )
            .all(grp.workspace_id, grp.id) as Array<{
            collection: string
            record_id: string
            role: string
            granted_by: string
            created_at: number
          }>
          for (const g of groupGrants) {
            for (const m of members) {
              const existing = db
                .prepare(
                  `SELECT role FROM record_grants
                   WHERE workspace_id = ? AND collection = ? AND record_id = ? AND subject_type = 'account' AND subject_id = ?`,
                )
                .get(grp.workspace_id, g.collection, g.record_id, m.account_id) as { role: string } | undefined
              if (!existing) {
                db.prepare(
                  `INSERT INTO record_grants (workspace_id, collection, record_id, subject_type, subject_id, role, granted_by, created_at)
                   VALUES (?, ?, ?, 'account', ?, ?, ?, ?)`,
                ).run(grp.workspace_id, g.collection, g.record_id, m.account_id, g.role, g.granted_by, g.created_at)
              } else if ((roleRank[g.role] ?? 0) > (roleRank[existing.role] ?? 0)) {
                db.prepare(
                  `UPDATE record_grants SET role = ?
                   WHERE workspace_id = ? AND collection = ? AND record_id = ? AND subject_type = 'account' AND subject_id = ?`,
                ).run(g.role, grp.workspace_id, g.collection, g.record_id, m.account_id)
              }
            }
          }
        }
      }
    }

    if (hasTable(db, 'record_grants')) {
      db.exec(`DELETE FROM record_grants WHERE subject_type = 'group'`)
    }
    if (hasTable(db, 'plugin_assignments')) {
      db.exec(`DELETE FROM plugin_assignments WHERE subject_type = 'group'`)
    }

    // 2. resource_policies 归一化：废除 restricted 与 owner_table 逻辑分表，回归 Notion 三态 access_mode（private / members / inherit）
    if (hasTable(db, 'resource_policies')) {
      db.exec(`UPDATE resource_policies SET access_mode = 'private' WHERE access_mode = 'restricted'`)
      db.exec(`DROP INDEX IF EXISTS resource_policies_owner_table`)
    }

    // 3. saved_views 清理 K+1 专属 ownerTable 强绑定与他人个人表默认视图
    if (hasTable(db, 'saved_views')) {
      const rows = db
        .prepare('SELECT workspace_id, collection, view_id, payload_json FROM saved_views')
        .all() as Array<{ workspace_id: string; collection: string; view_id: string; payload_json: string }>
      const saveStmt = db.prepare(
        'UPDATE saved_views SET payload_json = ? WHERE workspace_id = ? AND collection = ? AND view_id = ?',
      )
      const delStmt = db.prepare(
        'DELETE FROM saved_views WHERE workspace_id = ? AND collection = ? AND view_id = ?',
      )
      for (const row of rows) {
        if (row.collection === '/data') continue
        if (row.view_id.startsWith('default:account:') || row.view_id.startsWith('default:shared:')) {
          delStmt.run(row.workspace_id, row.collection, row.view_id)
          continue
        }
        try {
          const parsed = JSON.parse(row.payload_json) as Record<string, unknown>
          if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) continue
          let changed = false
          if ('ownerTable' in parsed) {
            delete parsed.ownerTable
            changed = true
          }
          if (parsed.filters && typeof parsed.filters === 'object' && !Array.isArray(parsed.filters)) {
            const filters = { ...(parsed.filters as Record<string, unknown>) }
            if ('$ownerTable' in filters) {
              delete filters.$ownerTable
              parsed.filters = filters
              changed = true
            }
          }
          if (changed) {
            saveStmt.run(JSON.stringify(parsed), row.workspace_id, row.collection, row.view_id)
          }
        } catch {
          /* skip malformed payload */
        }
      }
    }

    // 4. 下线数据侧动态规则表与成员组表
    db.exec('DROP TABLE IF EXISTS access_rule_grants')
    db.exec('DROP TABLE IF EXISTS access_rules')
    db.exec('DROP TABLE IF EXISTS workspace_group_members')
    db.exec('DROP TABLE IF EXISTS workspace_groups')
    ensurePagesPerfIndexes(db)
  } },
  { version: 62, module: 'core', name: 'unify_views_record_permissions_and_remove_builtin', up(db) {
    const now = Date.now()
    if (!hasTable(db, 'saved_views')) return

    const svCols = tableColumnNames(db, 'saved_views')
    if (!svCols.includes('revision')) {
      db.exec('ALTER TABLE saved_views ADD COLUMN revision INTEGER NOT NULL DEFAULT 1')
    }

    const wsOwners = new Map<string, string>()
    if (hasTable(db, 'workspaces')) {
      const wsRows = db.prepare('SELECT id, owner_id FROM workspaces').all() as Array<{ id: string; owner_id: string }>
      for (const ws of wsRows) {
        if (ws.id && ws.owner_id) wsOwners.set(ws.id, ws.owner_id)
      }
    }

    const hasOwnersTable = hasTable(db, 'record_owners')
    const hasPoliciesTable = hasTable(db, 'resource_policies')
    const hasGrantsTable = hasTable(db, 'record_grants')
    const policyCols = hasPoliciesTable ? tableColumnNames(db, 'resource_policies') : []
    const hasInheritParent = policyCols.includes('inherit_parent')

    const insertOwnerStmt = hasOwnersTable
      ? db.prepare(
          `INSERT INTO record_owners (workspace_id, collection, record_id, owner_id, version, updated_at)
           VALUES (?, '/views', ?, ?, 0, ?)
           ON CONFLICT(workspace_id, collection, record_id) DO NOTHING`,
        )
      : null
    const insertPolicyStmt = hasPoliciesTable
      ? hasInheritParent
        ? db.prepare(
            `INSERT INTO resource_policies
              (workspace_id, collection, record_id, owner_account_id, access_mode, member_default_role,
               parent_collection, parent_record_id, created_by, created_at, inherit_parent)
             VALUES (?, '/views', ?, ?, ?, ?, '', '', ?, ?, 0)
             ON CONFLICT(workspace_id, collection, record_id) DO NOTHING`,
          )
        : db.prepare(
            `INSERT INTO resource_policies
              (workspace_id, collection, record_id, owner_account_id, access_mode, member_default_role,
               parent_collection, parent_record_id, created_by, created_at)
             VALUES (?, '/views', ?, ?, ?, ?, '', '', ?, ?)
             ON CONFLICT(workspace_id, collection, record_id) DO NOTHING`,
          )
      : null
    const insertOwnerGrantStmt = hasGrantsTable
      ? db.prepare(
          `INSERT INTO record_grants
            (workspace_id, collection, record_id, subject_type, subject_id, role, granted_by, created_at)
           VALUES (?, '/views', ?, 'account', ?, 'owner', ?, ?)
           ON CONFLICT(workspace_id, collection, record_id, subject_type, subject_id) DO NOTHING`,
        )
      : null

    const ensureViewPolicy = (
      workspaceId: string,
      collection: string,
      viewId: string,
      ownerId: string,
      accessMode: 'private' | 'members',
      memberDefaultRole: 'viewer' | 'editor',
    ) => {
      if (!workspaceId || !ownerId) return
      const tableName = collection.replace(/^\/+/, '')
      if (!tableName || !viewId) return
      const recordId = `${tableName}::${viewId}`
      insertOwnerStmt?.run(workspaceId, recordId, ownerId, now)
      insertPolicyStmt?.run(workspaceId, recordId, ownerId, accessMode, memberDefaultRole, ownerId, now)
      insertOwnerGrantStmt?.run(workspaceId, recordId, ownerId, ownerId, now)
    }

    const hasCustomViewConfig = (parsed: Record<string, unknown>) => {
      if (typeof parsed.query === 'string' && parsed.query.trim()) return true
      if (typeof parsed.mode === 'string' && parsed.mode && parsed.mode !== 'table') return true
      if (Array.isArray(parsed.columns) && parsed.columns.length > 0) return true
      if (parsed.filters && typeof parsed.filters === 'object' && !Array.isArray(parsed.filters)) {
        if (Object.keys(parsed.filters as Record<string, unknown>).length > 0) return true
      }
      if (parsed.filterTree && typeof parsed.filterTree === 'object' && !Array.isArray(parsed.filterTree)) {
        const children = (parsed.filterTree as { children?: unknown[] }).children
        if (Array.isArray(children) && children.length > 0) return true
      }
      return false
    }

    const rows = db
      .prepare('SELECT workspace_id, collection, view_id, payload_json, updated_at FROM saved_views')
      .all() as Array<{
      workspace_id: string
      collection: string
      view_id: string
      payload_json: string
      updated_at: number
    }>

    const delStmt = db.prepare('DELETE FROM saved_views WHERE workspace_id = ? AND collection = ? AND view_id = ?')
    const upsertStmt = db.prepare(
      `INSERT INTO saved_views (workspace_id, collection, view_id, payload_json, updated_at, revision)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(workspace_id, collection, view_id) DO UPDATE SET
         payload_json = excluded.payload_json,
         updated_at = excluded.updated_at,
         revision = excluded.revision`,
    )

    // 先按 (workspace_id, collection) 分组，合并 builtin-all:*::user:* 历史分身
    const builtinAllGroups = new Map<
      string,
      Array<{
        workspaceId: string
        collection: string
        storageViewId: string
        userId: string
        parsed: Record<string, unknown>
        updatedAt: number
      }>
    >()

    const existingIdsByBucket = new Map<string, Set<string>>()
    for (const row of rows) {
      const bKey = `${row.workspace_id}\t${row.collection}`
      const set = existingIdsByBucket.get(bKey) ?? new Set<string>()
      set.add(row.view_id)
      existingIdsByBucket.set(bKey, set)
    }

    for (const row of rows) {
      let parsed: Record<string, unknown> | null = null
      try {
        const raw = JSON.parse(row.payload_json) as unknown
        if (raw && typeof raw === 'object' && !Array.isArray(raw)) parsed = raw as Record<string, unknown>
      } catch {
        parsed = null
      }
      if (!parsed) continue

      const rawViewId = String(row.view_id ?? '')
      const payloadId = String(parsed.id ?? rawViewId).trim()
      const userCut = rawViewId.indexOf('::user:')
      const baseId = userCut >= 0 ? rawViewId.slice(0, userCut) : payloadId
      const shadowUser = userCut >= 0 ? rawViewId.slice(userCut + '::user:'.length) : String(parsed.createdBy ?? '').trim()

      // 历史 builtin-all:* 分身归组处理
      if (baseId.startsWith('builtin-all:')) {
        const bKey = `${row.workspace_id}\t${row.collection}`
        const list = builtinAllGroups.get(bKey) ?? []
        list.push({
          workspaceId: row.workspace_id,
          collection: row.collection,
          storageViewId: rawViewId,
          userId: shadowUser,
          parsed,
          updatedAt: Number(row.updated_at) || now,
        })
        builtinAllGroups.set(bKey, list)
        continue
      }

      // 废弃的 builtin: 跨表聚合分身直接清理
      if (baseId.startsWith('builtin:') && !baseId.startsWith('builtin-member:')) {
        delStmt.run(row.workspace_id, row.collection, rawViewId)
        continue
      }

      // 历史 builtin-member:* 转为普通默认锁定成员视图（member / external / guest）
      let nextViewId = baseId
      let forceMemberSeed = false
      if (baseId.startsWith('builtin-member:')) {
        nextViewId = baseId.slice('builtin-member:'.length) || baseId
        forceMemberSeed = true
        if (hasGrantsTable && nextViewId !== baseId) {
          db.prepare(
            `UPDATE OR IGNORE record_grants
             SET subject_id = ?
             WHERE workspace_id = ? AND subject_type = 'member_view' AND subject_id = ?`,
          ).run(nextViewId, row.workspace_id, baseId)
          db.prepare(
            `DELETE FROM record_grants
             WHERE workspace_id = ? AND subject_type = 'member_view' AND subject_id = ?`,
          ).run(row.workspace_id, baseId)
        }
      }

      const oldProtection = String(parsed.protection ?? '')
      const oldScope = String(parsed.scope ?? '')
      const isPersonal = !forceMemberSeed && (oldProtection === 'personal' || oldScope === 'personal')
      const isLocked = forceMemberSeed || oldProtection === 'locked' || parsed.locked === true
      const accessMode: 'private' | 'members' = isPersonal ? 'private' : 'members'
      const memberDefaultRole: 'viewer' | 'editor' = isPersonal || isLocked ? 'viewer' : 'editor'
      const ownerId = String(parsed.createdBy ?? '').trim() || wsOwners.get(row.workspace_id) || ''
      const rev = Math.max(1, Number(parsed.revision) || 1)

      const cleaned: Record<string, unknown> = { ...parsed, id: nextViewId, locked: isLocked, revision: rev }
      delete cleaned.protection
      delete cleaned.scope
      delete cleaned.builtin
      delete cleaned.ownerTable
      if (ownerId && !cleaned.createdBy) cleaned.createdBy = ownerId

      if (rawViewId !== nextViewId) {
        delStmt.run(row.workspace_id, row.collection, rawViewId)
      }
      upsertStmt.run(row.workspace_id, row.collection, nextViewId, JSON.stringify(cleaned), Number(row.updated_at) || now, rev)
      ensureViewPolicy(row.workspace_id, row.collection, nextViewId, ownerId, accessMode, memberDefaultRole)
    }

    for (const [bKey, entries] of builtinAllGroups) {
      const [workspaceId, collection] = bKey.split('\t')
      const wsOwner = wsOwners.get(workspaceId) || ''
      const usedIds = existingIdsByBucket.get(bKey) ?? new Set<string>()
      const primary =
        entries.find((e) => wsOwner && e.userId === wsOwner) ??
        entries.find((e) => !e.storageViewId.includes('::user:')) ??
        entries[0]

      for (const entry of entries) {
        delStmt.run(entry.workspaceId, entry.collection, entry.storageViewId)
      }

      if (primary) {
        const targetId = usedIds.has('all') ? `all-${primary.updatedAt.toString(36)}` : 'all'
        usedIds.add(targetId)
        const ownerId = wsOwner || primary.userId || ''
        const rev = Math.max(1, Number(primary.parsed.revision) || 1)
        const cleaned: Record<string, unknown> = {
          ...primary.parsed,
          id: targetId,
          locked: false,
          revision: rev,
          ...(ownerId ? { createdBy: ownerId } : {}),
        }
        delete cleaned.protection
        delete cleaned.scope
        delete cleaned.builtin
        delete cleaned.ownerTable
        upsertStmt.run(workspaceId, collection, targetId, JSON.stringify(cleaned), primary.updatedAt, rev)
        ensureViewPolicy(workspaceId, collection, targetId, ownerId, 'members', 'editor')
      }

      for (const entry of entries) {
        if (entry === primary) continue
        if (!entry.userId || !hasCustomViewConfig(entry.parsed)) continue
        const personalId = `personal-${entry.userId.slice(0, 8)}`
        if (usedIds.has(personalId)) continue
        usedIds.add(personalId)
        const rev = Math.max(1, Number(entry.parsed.revision) || 1)
        const cleaned: Record<string, unknown> = {
          ...entry.parsed,
          id: personalId,
          locked: false,
          revision: rev,
          createdBy: entry.userId,
        }
        delete cleaned.protection
        delete cleaned.scope
        delete cleaned.builtin
        delete cleaned.ownerTable
        upsertStmt.run(workspaceId, collection, personalId, JSON.stringify(cleaned), entry.updatedAt, rev)
        ensureViewPolicy(workspaceId, collection, personalId, entry.userId, 'private', 'viewer')
      }
    }
  } },
  { version: 63, module: 'authz', name: 'retire_record_owners_and_cleanup_legacy_policy_columns', up(db) {
    if (hasTable(db, 'resource_policies')) {
      const rpCols = tableColumnNames(db, 'resource_policies')
      if (rpCols.includes('inherit_parent')) {
        db.exec(
          `UPDATE resource_policies
           SET access_mode = 'inherit'
           WHERE access_mode != 'inherit' AND inherit_parent = 1 AND parent_record_id != ''`,
        )
        dropColumn(db, 'resource_policies', 'inherit_parent')
      }
      if (rpCols.includes('owner_table')) {
        dropColumn(db, 'resource_policies', 'owner_table')
      }
    }
    if (hasTable(db, 'record_owners')) {
      if (hasTable(db, 'resource_policies')) {
        db.exec(
          `INSERT OR IGNORE INTO resource_policies
            (workspace_id, collection, record_id, owner_account_id, access_mode, member_default_role,
             parent_collection, parent_record_id, created_by, created_at)
           SELECT workspace_id, collection, record_id, owner_id, 'members', 'editor', '', '', owner_id, updated_at
           FROM record_owners`,
        )
      }
      if (hasTable(db, 'record_grants')) {
        db.exec(
          `INSERT OR IGNORE INTO record_grants
            (workspace_id, collection, record_id, subject_type, subject_id, role, effect, granted_by, created_at)
           SELECT workspace_id, collection, record_id, 'account', owner_id, 'owner', 'allow', owner_id, updated_at
           FROM record_owners
           WHERE owner_id != ''`,
        )
      }
      db.exec('DROP TABLE IF EXISTS record_owners')
    }
  } },
  { version: 64, module: 'core-chat', name: 'slack_group_channels', up(db) {
    db.exec(CREATE_CHANNELS_SQL)
  } },
]

export function assertBiuMigrationLog(rows: Array<{ version: number }> = BIU_MIGRATIONS) {
  let prev = 0
  const seen = new Set<number>()
  for (const row of rows) {
    if (!Number.isInteger(row.version) || row.version <= 0) {
      throw new Error(`BIU_MIGRATIONS version 非法: ${row.version}`)
    }
    if (seen.has(row.version)) {
      throw new Error(`BIU_MIGRATIONS 重复 version ${row.version}`)
    }
    if (row.version <= prev) {
      throw new Error(`BIU_MIGRATIONS 必须单调递增，在 v${row.version} 处乱序`)
    }
    seen.add(row.version)
    prev = row.version
  }
}

assertBiuMigrationLog()

function skipMigrationSnapshot(path: string | undefined) {
  if (!path || path === ':memory:') return true
  if (path.includes('mode=memory')) return true
  try {
    return !existsSync(path) || statSync(path).size === 0
  } catch {
    return true
  }
}

function snapshotBefore(db: DatabaseSync, ctx: MigrateCtx, nextVersion: number) {
  const path = ctx.sqlitePath
  if (skipMigrationSnapshot(path)) return
  const dir = join(ctx.dataDir ?? dirname(path!), 'backup')
  const dest = join(dir, `pre-v${nextVersion}-${Date.now()}.sqlite`)
  try {
    mkdirSync(dir, { recursive: true })
    db.exec(`VACUUM INTO ${quoteSqlitePath(dest)}`)
  } catch (error) {
    throw new Error(`migration 前快照失败（v${nextVersion}）: ${error}`)
  }
}

export function migrateBiu(db: DatabaseSync, ctx: MigrateCtx = {}, target = LATEST_BIU_SCHEMA) {
  const from = getSchemaVersion(db)
  if (from > target) {
    throw new Error(`库 schema v${from} 比代码 v${target} 新，请升级程序`)
  }
  if (from === target) return
  if (isEmptyDatabase(db) && from === 0) {
    createLatestSchema(db)
    setSchemaVersion(db, target)
    vacuumIfNeeded(db, ctx, from, target)
    return
  }
  for (const migration of BIU_MIGRATIONS) {
    if (migration.version <= from || migration.version > target) continue
    snapshotBefore(db, ctx, migration.version)
    db.exec('BEGIN IMMEDIATE')
    try {
      migration.up(db, ctx)
      setSchemaVersion(db, migration.version)
      db.exec('COMMIT')
    } catch (error) {
      try {
        db.exec('ROLLBACK')
      } catch {
        /* ignore */
      }
      throw new Error(`migration v${migration.version} (${migration.module}/${migration.name}) 失败: ${error}`)
    }
  }
  vacuumIfNeeded(db, ctx, from, target)
}

function vacuumIfNeeded(db: DatabaseSync, ctx: MigrateCtx, from: number, target: number) {
  if (from >= target) return
  const path = ctx.sqlitePath
  if (!path || path === ':memory:') return
  try {
    db.exec('VACUUM')
  } catch {
    /* other connections may hold the file */
  }
}

export {
  sharedSqlitePoolStats as sharedBiuPoolStats,
  closeAllSharedSqliteConnections as closeAllSharedBiuConnections,
}

export function openAndMigrateBiu(path: string, opts?: { foreignKeys?: boolean; checkpointOnOpen?: boolean } & MigrateCtx) {
  return openPooledSqlite(path, opts, (db) => {
    const dataDir = opts?.dataDir ?? (basename(path) === 'biu.sqlite' ? dirname(path) : undefined)
    const workspace = opts?.workspace ?? (dataDir ? dirname(dataDir) : undefined)
    migrateBiu(db, { sqlitePath: path, dataDir, workspace })
  })
}
