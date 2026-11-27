type DatabaseSync = import('node:sqlite').DatabaseSync

export const LATEST_BIU_SCHEMA = 62

export const CREATE_CORE_SQL = `
CREATE TABLE IF NOT EXISTS pages (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  parent_id TEXT,
  depends_on_json TEXT NOT NULL DEFAULT '[]',
  emoji TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS pages_updated_at ON pages(updated_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS pages_created_at ON pages(created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS pages_title ON pages(title COLLATE NOCASE, id);
CREATE INDEX IF NOT EXISTS pages_parent_id ON pages(parent_id);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo',
  priority TEXT NOT NULL DEFAULT 'med',
  difficulty TEXT NOT NULL DEFAULT 'med',
  assignee TEXT NOT NULL DEFAULT '',
  due_at INTEGER,
  notes TEXT NOT NULL DEFAULT '',
  sort REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  creator_json TEXT,
  assignee_json TEXT,
  assigned_at INTEGER,
  description TEXT NOT NULL DEFAULT '',
  reports_json TEXT NOT NULL DEFAULT '[]',
  start_at INTEGER,
  project TEXT NOT NULL DEFAULT '',
  tags_json TEXT NOT NULL DEFAULT '[]',
  parent_id TEXT DEFAULT '',
  depends_on TEXT NOT NULL DEFAULT '[]',
  depth INTEGER NOT NULL DEFAULT 0,
  trigger_json TEXT NOT NULL DEFAULT '{}',
  report_interval_sec INTEGER NOT NULL DEFAULT 60,
  last_report_prompt_at INTEGER,
  report_prompt_count INTEGER NOT NULL DEFAULT 0,
  tag_json TEXT NOT NULL DEFAULT '{}',
  emoji TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS tasks_status_sort ON tasks(status, sort, updated_at DESC);
CREATE TABLE IF NOT EXISTS tags (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL,
  fields_json TEXT NOT NULL DEFAULT '[]',
  notes TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS tags_label ON tags(label);
CREATE TABLE IF NOT EXISTS tag_stamps (
  tag_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (tag_id, collection, record_id)
);
CREATE INDEX IF NOT EXISTS tag_stamps_tag ON tag_stamps(tag_id);
CREATE INDEX IF NOT EXISTS tag_stamps_record ON tag_stamps(collection, record_id);
CREATE TABLE IF NOT EXISTS tag_record_values (
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  tag_json TEXT NOT NULL,
  PRIMARY KEY (collection, record_id)
);
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
CREATE TABLE IF NOT EXISTS record_meta (
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  emoji TEXT,
  tags_json TEXT,
  created_by_json TEXT,
  updated_by_json TEXT,
  deleted_at INTEGER,
  PRIMARY KEY (collection, record_id)
);
CREATE INDEX IF NOT EXISTS record_meta_deleted ON record_meta(collection, deleted_at);
CREATE TABLE IF NOT EXISTS attachments (
  name TEXT PRIMARY KEY,
  etag TEXT NOT NULL,
  mime TEXT NOT NULL,
  bytes INTEGER NOT NULL,
  kind TEXT NOT NULL DEFAULT 'asset',
  storage TEXT NOT NULL DEFAULT 'hash',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS content_refs (
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (collection, record_id, name, source)
);
CREATE TABLE IF NOT EXISTS block_refs (
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  name TEXT NOT NULL,
  source TEXT NOT NULL,
  PRIMARY KEY (collection, record_id, block_id, name, source)
);
CREATE INDEX IF NOT EXISTS content_refs_record ON content_refs(collection, record_id);
CREATE INDEX IF NOT EXISTS block_refs_record ON block_refs(collection, record_id);
CREATE INDEX IF NOT EXISTS block_refs_block ON block_refs(collection, record_id, block_id);
CREATE TABLE IF NOT EXISTS record_banners (
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  html TEXT NOT NULL,
  PRIMARY KEY (collection, record_id)
);
CREATE TABLE IF NOT EXISTS banner_gallery (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  style TEXT NOT NULL DEFAULT 'mine',
  title TEXT NOT NULL DEFAULT '',
  html TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS shares (
  token TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  collection TEXT NOT NULL,
  view_id TEXT NOT NULL DEFAULT '',
  record_id TEXT NOT NULL DEFAULT '',
  rule_id TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL DEFAULT '',
  share_plugins INTEGER NOT NULL DEFAULT 0,
  allow_copy INTEGER NOT NULL DEFAULT 1,
  workspace_id TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS shares_target ON shares(kind, collection, view_id, record_id, rule_id);
CREATE TABLE IF NOT EXISTS saved_views (
  workspace_id TEXT NOT NULL DEFAULT '',
  collection TEXT NOT NULL,
  view_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (workspace_id, collection, view_id)
);
CREATE TABLE IF NOT EXISTS record_views (
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  views_json TEXT NOT NULL DEFAULT '[]',
  prop_views_json TEXT NOT NULL DEFAULT '[]',
  layouts_json TEXT NOT NULL DEFAULT '[]',
  PRIMARY KEY (collection, record_id)
);
-- 已删视图的墓碑：别的窗口拿着旧快照推 upsert 时不能把删掉的视图复活
CREATE TABLE IF NOT EXISTS saved_view_tombstones (
  workspace_id TEXT NOT NULL DEFAULT '',
  collection TEXT NOT NULL,
  view_id TEXT NOT NULL,
  deleted_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, collection, view_id)
);
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  version INTEGER NOT NULL,
  project_json TEXT,
  event_count INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL DEFAULT 0,
  mascot_json TEXT,
  config_json TEXT
);
CREATE TABLE IF NOT EXISTS page_block_index (
  page_id TEXT NOT NULL,
  block_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  plugin TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  page_title TEXT NOT NULL DEFAULT '',
  data_json TEXT NOT NULL,
  page_created_at INTEGER NOT NULL DEFAULT 0,
  page_updated_at INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (page_id, block_id)
);
CREATE INDEX IF NOT EXISTS page_block_index_page ON page_block_index(page_id);
CREATE TABLE IF NOT EXISTS page_block_cover (
  page_id TEXT PRIMARY KEY,
  page_updated_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS page_block_index_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS gc_candidates (
  name TEXT PRIMARY KEY,
  first_seen INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  token TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  email TEXT,
  active_workspace_id TEXT NOT NULL DEFAULT '',
  must_change_password INTEGER NOT NULL DEFAULT 0,
  password_recall TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS accounts_token ON accounts(token);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_email ON accounts(email) WHERE email IS NOT NULL AND length(email) > 0;
CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  avatar TEXT NOT NULL DEFAULT ''
);
CREATE TABLE IF NOT EXISTS workspace_members (
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  role TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  display_name TEXT NOT NULL DEFAULT '',
  avatar TEXT NOT NULL DEFAULT '',
  member_kind TEXT NOT NULL DEFAULT 'member',
  PRIMARY KEY (workspace_id, account_id)
);
CREATE INDEX IF NOT EXISTS workspace_members_account ON workspace_members(account_id);
CREATE TABLE IF NOT EXISTS workspace_invites (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  workspace_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  role TEXT NOT NULL,
  collection TEXT NOT NULL DEFAULT '',
  record_id TEXT NOT NULL DEFAULT '',
  view_id TEXT NOT NULL DEFAULT '',
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
CREATE TABLE IF NOT EXISTS resource_policies (
  workspace_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  owner_account_id TEXT NOT NULL,
  access_mode TEXT NOT NULL,
  member_default_role TEXT NOT NULL DEFAULT 'viewer',
  parent_collection TEXT NOT NULL DEFAULT '',
  parent_record_id TEXT NOT NULL DEFAULT '',
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  inherit_parent INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (workspace_id, collection, record_id)
);
CREATE INDEX IF NOT EXISTS resource_policies_parent
  ON resource_policies(workspace_id, parent_collection, parent_record_id);
CREATE TABLE IF NOT EXISTS record_grants (
  workspace_id TEXT NOT NULL,
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  role TEXT NOT NULL,
  effect TEXT NOT NULL DEFAULT 'allow',
  granted_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, collection, record_id, subject_type, subject_id)
);
CREATE INDEX IF NOT EXISTS record_grants_subject
  ON record_grants(workspace_id, subject_type, subject_id);
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
CREATE TABLE IF NOT EXISTS collab_state (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS cloud_connections (
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
CREATE INDEX IF NOT EXISTS cloud_connections_active ON cloud_connections(local_account_id, active);
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
CREATE TABLE IF NOT EXISTS plugin_packages (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  package_hash TEXT NOT NULL,
  package_path TEXT NOT NULL,
  source_kind TEXT NOT NULL,
  trust_state TEXT NOT NULL,
  tenant_mode TEXT NOT NULL,
  has_web INTEGER NOT NULL DEFAULT 0,
  has_host INTEGER NOT NULL DEFAULT 0,
  manifest_json TEXT NOT NULL DEFAULT '{}',
  installed_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (id, version)
);
CREATE INDEX IF NOT EXISTS plugin_packages_trust
  ON plugin_packages(trust_state, id);
CREATE TABLE IF NOT EXISTS plugin_assignments (
  workspace_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  plugin_version TEXT NOT NULL DEFAULT '',
  subject_type TEXT NOT NULL,
  subject_id TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, plugin_id, subject_type, subject_id)
);
CREATE INDEX IF NOT EXISTS plugin_assignments_subject
  ON plugin_assignments(workspace_id, subject_type, subject_id);
CREATE INDEX IF NOT EXISTS plugin_assignments_plugin
  ON plugin_assignments(workspace_id, plugin_id);
CREATE TABLE IF NOT EXISTS plugin_workspace_config (
  workspace_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_by TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, plugin_id)
);
CREATE TABLE IF NOT EXISTS plugin_account_config (
  workspace_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  config_json TEXT NOT NULL DEFAULT '{}',
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, plugin_id, account_id)
);
CREATE INDEX IF NOT EXISTS plugin_account_config_account
  ON plugin_account_config(account_id, workspace_id);
CREATE TABLE IF NOT EXISTS plugin_loads (
  workspace_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  plugin_id TEXT NOT NULL,
  loaded_at INTEGER NOT NULL,
  PRIMARY KEY (workspace_id, account_id, plugin_id)
);
CREATE INDEX IF NOT EXISTS plugin_loads_plugin
  ON plugin_loads(plugin_id);
CREATE TABLE IF NOT EXISTS plugin_audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id TEXT NOT NULL,
  workspace_id TEXT NOT NULL DEFAULT '',
  plugin_id TEXT NOT NULL DEFAULT '',
  action TEXT NOT NULL,
  detail_json TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS plugin_audit_created
  ON plugin_audit_log(created_at DESC);
CREATE INDEX IF NOT EXISTS plugin_audit_workspace
  ON plugin_audit_log(workspace_id, created_at DESC);
`

export const CREATE_EDITOR_SQL = `
CREATE TABLE IF NOT EXISTS editor_content (
  collection TEXT NOT NULL,
  record_id TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (collection, record_id)
);
CREATE INDEX IF NOT EXISTS editor_content_record ON editor_content(collection, record_id);
`

export const CREATE_LATEST_SQL = `${CREATE_CORE_SQL}\n${CREATE_EDITOR_SQL}`

function hasTable(db: DatabaseSync, name: string) {
  return tableNames(db).includes(name)
}

export function dropSqliteColumn(db: DatabaseSync, table: string, name: string) {
  if (!hasTable(db, table)) return
  if (!tableColumnNames(db, table).includes(name)) return
  db.exec(`ALTER TABLE ${table} DROP COLUMN ${name}`)
}

/** Recreate page-block tables with collection in the primary key. Idempotent. */
export function rebuildPageBlockCollectionKeys(db: DatabaseSync) {
  if (!hasTable(db, 'page_block_index')) {
    db.exec(`
      CREATE TABLE page_block_index (
        collection TEXT NOT NULL,
        page_id TEXT NOT NULL,
        block_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        plugin TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        page_title TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL,
        page_created_at INTEGER NOT NULL DEFAULT 0,
        page_updated_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (collection, page_id, block_id)
      );
      CREATE INDEX IF NOT EXISTS page_block_index_page ON page_block_index(collection, page_id);
    `)
  } else if (!tableColumnNames(db, 'page_block_index').includes('collection')) {
    db.exec('DROP INDEX IF EXISTS page_block_index_page')
    db.exec(`
      CREATE TABLE page_block_index_new (
        collection TEXT NOT NULL,
        page_id TEXT NOT NULL,
        block_id TEXT NOT NULL,
        kind TEXT NOT NULL,
        plugin TEXT NOT NULL DEFAULT '',
        title TEXT NOT NULL,
        page_title TEXT NOT NULL DEFAULT '',
        data_json TEXT NOT NULL,
        page_created_at INTEGER NOT NULL DEFAULT 0,
        page_updated_at INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (collection, page_id, block_id)
      );
      INSERT INTO page_block_index_new (
        collection, page_id, block_id, kind, plugin, title, page_title, data_json, page_created_at, page_updated_at
      )
      SELECT '/pages', page_id, block_id, kind, plugin, title, page_title, data_json, page_created_at, page_updated_at
      FROM page_block_index;
      DROP TABLE page_block_index;
      ALTER TABLE page_block_index_new RENAME TO page_block_index;
      CREATE INDEX IF NOT EXISTS page_block_index_page ON page_block_index(collection, page_id);
    `)
  }
  if (!hasTable(db, 'page_block_cover')) {
    db.exec(`
      CREATE TABLE page_block_cover (
        collection TEXT NOT NULL,
        page_id TEXT NOT NULL,
        page_updated_at INTEGER NOT NULL,
        PRIMARY KEY (collection, page_id)
      );
    `)
  } else if (!tableColumnNames(db, 'page_block_cover').includes('collection')) {
    db.exec(`
      CREATE TABLE page_block_cover_new (
        collection TEXT NOT NULL,
        page_id TEXT NOT NULL,
        page_updated_at INTEGER NOT NULL,
        PRIMARY KEY (collection, page_id)
      );
      INSERT INTO page_block_cover_new (collection, page_id, page_updated_at)
      SELECT '/pages', page_id, page_updated_at FROM page_block_cover;
      DROP TABLE page_block_cover;
      ALTER TABLE page_block_cover_new RENAME TO page_block_cover;
    `)
  }
}

export function dropLegacyEditorColumns(db: DatabaseSync) {
  dropSqliteColumn(db, 'pages', 'notes')
  dropSqliteColumn(db, 'tasks', 'description')
  dropSqliteColumn(db, 'tags', 'notes')
}

export function ensurePagesPerfIndexes(db: DatabaseSync) {
  if (hasTable(db, 'pages')) {
    db.exec(`
      CREATE INDEX IF NOT EXISTS pages_updated_at ON pages(updated_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS pages_created_at ON pages(created_at DESC, id DESC);
      CREATE INDEX IF NOT EXISTS pages_title ON pages(title COLLATE NOCASE, id);
      CREATE INDEX IF NOT EXISTS pages_parent_id ON pages(parent_id);
    `)
    const hadFts = hasTable(db, 'pages_fts')
    try {
      db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS pages_fts USING fts5(
          id UNINDEXED,
          title,
          tokenize='unicode61'
        );
        CREATE TRIGGER IF NOT EXISTS pages_fts_ai AFTER INSERT ON pages BEGIN
          INSERT INTO pages_fts(id, title) VALUES (new.id, new.title);
        END;
        CREATE TRIGGER IF NOT EXISTS pages_fts_ad AFTER DELETE ON pages BEGIN
          DELETE FROM pages_fts WHERE id = old.id;
        END;
        CREATE TRIGGER IF NOT EXISTS pages_fts_au AFTER UPDATE OF title ON pages BEGIN
          DELETE FROM pages_fts WHERE id = old.id;
          INSERT INTO pages_fts(id, title) VALUES (new.id, new.title);
        END;
      `)
      if (!hadFts) {
        const hasPages = db.prepare('SELECT 1 FROM pages LIMIT 1').get()
        if (hasPages) {
          db.exec('INSERT INTO pages_fts(id, title) SELECT id, title FROM pages')
        }
      }
    } catch {
      /* FTS5 unavailable in custom SQLite build */
    }
  }
  db.exec(`
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
}

export function applyLatestSchemaPatches(db: DatabaseSync) {
  rebuildPageBlockCollectionKeys(db)
  dropLegacyEditorColumns(db)
  ensurePagesPerfIndexes(db)
}

export function createLatestSchema(db: DatabaseSync) {
  db.exec(CREATE_LATEST_SQL)
  applyLatestSchemaPatches(db)
}

export function tableNames(db: DatabaseSync) {
  return (
    db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`).all() as Array<{
      name: string
    }>
  ).map((row) => row.name)
}

export function tableColumnNames(db: DatabaseSync, table: string) {
  return (db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name)
}

/** Shared tables used by assets. Prefer migrateBiu(); kept for adopt paths that only need refs. */
export function ensureBiuAssetSchema(db: DatabaseSync) {
  db.exec(CREATE_LATEST_SQL)
  try {
    const cols = tableColumnNames(db, 'attachments')
    if (!cols.includes('storage')) {
      db.exec(`ALTER TABLE attachments ADD COLUMN storage TEXT NOT NULL DEFAULT 'hash'`)
    }
    db.exec(`UPDATE attachments SET storage = 'hash' WHERE storage IN ('cas', '')`)
    db.exec(`UPDATE attachments SET storage = 'name' WHERE storage = 'doc'`)
  } catch {
    /* dummy sqlite */
  }
}
