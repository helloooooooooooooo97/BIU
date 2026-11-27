import { test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { CREATE_CORE_SQL, LATEST_BIU_SCHEMA, tableColumnNames, tableNames } from './biu-schema.ts'
import { assertBiuMigrationLog, BIU_MIGRATIONS, migrateBiu, openAndMigrateBiu } from './biu-migrate.ts'
import { getSchemaVersion, openSqlite, setSchemaVersion } from './sqlite-open.ts'
import { readEditorContent, writeEditorContent } from './editor-content.ts'
import { liveAssetNames } from './gc-assets.ts'

test('empty database fast path matches upgraded v1 fixture', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-mig-'))
  const fast = openAndMigrateBiu(join(dir, 'fast.sqlite'))
  const staged = openSqlite(join(dir, 'staged.sqlite'))
  staged.exec(CREATE_CORE_SQL)
  staged.exec(`INSERT INTO pages (id, title, notes, parent_id, depends_on_json, emoji, created_at, updated_at)
    VALUES ('p1', 'Home', '![x](/api/db/file/keep.png)', null, '[]', '', 1, 1)`)
  staged.exec(`INSERT INTO tasks (id, title, created_at, updated_at, description)
    VALUES ('t1', 'Do', 1, 1, '![y](/api/db/file/task.png)')`)
  setSchemaVersion(staged, 1)
  migrateBiu(staged)
  assert.equal(getSchemaVersion(fast), LATEST_BIU_SCHEMA)
  assert.equal(getSchemaVersion(staged), LATEST_BIU_SCHEMA)
  const names = (db: typeof fast) => tableNames(db).filter((name) => name !== 'sqlite_sequence').sort()
  assert.deepEqual(names(fast), names(staged))
  assert.deepEqual(tableColumnNames(fast, 'pages').sort(), tableColumnNames(staged, 'pages').sort())
  assert.equal(tableColumnNames(fast, 'pages').includes('notes'), false)
  assert.equal(tableColumnNames(fast, 'tasks').includes('description'), false)
  assert.equal(tableColumnNames(fast, 'facets').includes('notes'), false)
  assert.equal(tableColumnNames(fast, 'editor_content').includes('version'), true)
  assert.equal(tableColumnNames(fast, 'page_block_index').includes('collection'), true)
  assert.equal(tableColumnNames(fast, 'gc_candidates').includes('name'), true)
  assert.deepEqual(tableColumnNames(fast, 'page_block_index').sort(), tableColumnNames(staged, 'page_block_index').sort())
  assert.match(readEditorContent(staged, '/pages', 'p1'), /keep\.png/)
  assert.match(readEditorContent(staged, '/tasks', 't1'), /task\.png/)
  const live = liveAssetNames(staged)
  assert.equal(live.has('keep.png'), true)
  assert.equal(live.has('task.png'), true)
  fast.close()
  staged.close()
})

test('BIU_MIGRATIONS versions are unique and increasing', () => {
  assertBiuMigrationLog()
  assert.equal(BIU_MIGRATIONS.at(-1)?.version, LATEST_BIU_SCHEMA)
  assert.equal(BIU_MIGRATIONS.at(-1)?.name, 'unify_views_record_permissions_and_remove_builtin')
  assert.throws(() => assertBiuMigrationLog([{ version: 2 }, { version: 2 }]), /重复/)
  assert.throws(() => assertBiuMigrationLog([{ version: 3 }, { version: 1 }]), /单调递增/)
})

test('member role migration preserves owner, admin and member', () => {
  const db = openSqlite(':memory:')
  migrateBiu(db, {}, 25)
  db.exec(`
    INSERT INTO accounts (id, name, token, password_hash, created_at, email)
    VALUES ('a1', 'A', 't1', 'p1', 1, 'a@example.com');
    INSERT INTO workspaces (id, name, owner_id, created_at) VALUES ('w1', 'W', 'a1', 1);
    INSERT INTO workspace_members (workspace_id, account_id, role, created_at)
    VALUES ('w1', 'a1', 'admin', 1);
  `)
  migrateBiu(db)
  const row = db.prepare(`SELECT role FROM workspace_members WHERE workspace_id = 'w1'`).get() as { role: string }
  assert.equal(row.role, 'admin')
  db.close()
})

test('viewer role migration preserves workspace viewers', () => {
  const db = openSqlite(':memory:')
  migrateBiu(db, {}, 27)
  db.exec(`
    INSERT INTO accounts (id, name, token, password_hash, created_at, email)
    VALUES ('viewer-a1', 'Viewer', 'viewer-t1', 'p1', 1, 'viewer@example.com');
    INSERT INTO workspaces (id, name, owner_id, created_at) VALUES ('viewer-w1', 'W', 'viewer-a1', 1);
    INSERT INTO workspace_members (workspace_id, account_id, role, created_at)
    VALUES ('viewer-w1', 'viewer-a1', 'viewer', 1);
  `)
  migrateBiu(db)
  const row = db.prepare(`SELECT role FROM workspace_members WHERE workspace_id = 'viewer-w1'`).get() as { role: string }
  assert.equal(row.role, 'viewer')
  db.close()
})

test('snapshotBefore writes a pre-migration copy', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-snap-'))
  const sqlitePath = join(dir, 'biu.sqlite')
  const db = openSqlite(sqlitePath)
  db.exec(CREATE_CORE_SQL)
  setSchemaVersion(db, 1)
  migrateBiu(db, { sqlitePath, dataDir: dir })
  const backups = readdirSync(join(dir, 'backup'))
  assert.ok(backups.some((name) => name.startsWith('pre-v')))
  db.close()
})

test('snapshotBefore aborts migrate when backup cannot be written', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-snap-fail-'))
  const sqlitePath = join(dir, 'biu.sqlite')
  const db = openSqlite(sqlitePath)
  db.exec(CREATE_CORE_SQL)
  setSchemaVersion(db, 1)
  writeFileSync(join(dir, 'backup'), 'not-a-directory')
  assert.throws(() => migrateBiu(db, { sqlitePath, dataDir: dir }), /快照失败/)
  assert.equal(getSchemaVersion(db), 1)
  db.close()
})

test('snapshotBefore skips memory databases', () => {
  const db = openSqlite(':memory:')
  db.exec(CREATE_CORE_SQL)
  setSchemaVersion(db, 1)
  migrateBiu(db, { sqlitePath: ':memory:' })
  assert.equal(getSchemaVersion(db), LATEST_BIU_SCHEMA)
  db.close()
})

test('newer schema version refuses to start', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-new-'))
  const db = openSqlite(join(dir, 'biu.sqlite'))
  db.exec('CREATE TABLE x (id TEXT)')
  setSchemaVersion(db, LATEST_BIU_SCHEMA + 5)
  assert.throws(() => migrateBiu(db), /比代码/)
  db.close()
})

test('skill markdown bodies are copied into editor_content', () => {
  const root = mkdtempSync(join(tmpdir(), 'biu-skill-mig-'))
  const dataDir = join(root, '.biu')
  mkdirSync(join(dataDir, 'skill'), { recursive: true })
  writeFileSync(
    join(dataDir, 'skill', 'demo.md'),
    '---\nname: Demo\n---\n\n![s](/api/db/file/skill.png)\n',
  )
  const db = openSqlite(join(dataDir, 'biu.sqlite'))
  db.exec(CREATE_CORE_SQL)
  setSchemaVersion(db, 1)
  migrateBiu(db, { dataDir, workspace: root, sqlitePath: join(dataDir, 'biu.sqlite') })
  assert.match(readEditorContent(db, '/skills', 'demo'), /skill\.png/)
  assert.equal(liveAssetNames(db, { dataDir, workspace: root }).has('skill.png'), true)
  db.close()
})

test('v41 remaps stored /sessions collection paths to /agents', () => {
  const db = openSqlite(':memory:')
  migrateBiu(db, {}, 40)
  db.exec(`
    INSERT INTO record_meta (collection, record_id, emoji, tags_json) VALUES ('/sessions', 's1', '', '[]');
    INSERT INTO saved_views (collection, view_id, payload_json, updated_at)
    VALUES ('/sessions', 'builtin-all:/sessions', '{"id":"builtin-all:/sessions","tablePath":"/sessions","name":"全部"}', 1);
  `)
  migrateBiu(db)
  const meta = db.prepare('SELECT collection FROM record_meta WHERE record_id = ?').get('s1') as { collection: string }
  assert.equal(meta.collection, '/agents')
  const view = db.prepare('SELECT collection, view_id, payload_json FROM saved_views').get() as {
    collection: string
    view_id: string
    payload_json: string
  }
  assert.equal(view.collection, '/agents')
  assert.equal(view.view_id, 'all')
  assert.match(view.payload_json, /"tablePath":"\/agents"/)
  db.close()
})

test('v42 renames the sessions table to agents', () => {
  const db = openSqlite(':memory:')
  migrateBiu(db, {}, 41)
  if (tableNames(db).includes('agents') && !tableNames(db).includes('sessions')) {
    db.exec('ALTER TABLE agents RENAME TO sessions')
  }
  db.exec(`INSERT INTO sessions (id, version, title, updated_at) VALUES ('s1', 1, 'Chat', 1)`)
  migrateBiu(db)
  assert.equal(tableNames(db).includes('agents'), true)
  assert.equal(tableNames(db).includes('sessions'), false)
  const row = db.prepare('SELECT title FROM agents WHERE id = ?').get('s1') as { title: string }
  assert.equal(row.title, 'Chat')
  db.close()
})

test('content_refs keep markdown links and drop prose mentions', () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-refs-'))
  const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
  writeEditorContent(
    db,
    '/plugins',
    'page-excalidraw',
    '落在 .biu/assets/page，页面正文；assets/画板-edd9.json 只是提及。\n![ok](/api/db/file/keep.png)\n',
  )
  const names = (
    db.prepare('SELECT name FROM content_refs WHERE collection = ?').all('/plugins') as Array<{ name: string }>
  ).map((row) => row.name)
  assert.deepEqual(names.sort(), ['keep.png'])
  assert.equal(liveAssetNames(db).has('keep.png'), true)
  assert.equal(liveAssetNames(db).has('page'), false)
  db.close()
})

test('facet field identity migration folds label into key and remaps values', () => {
  const db = openSqlite(':memory:')
  migrateBiu(db, {}, 42)
  db.exec(`
    INSERT INTO tags (id, label, fields_json, created_at, updated_at)
    VALUES (
      'dp',
      '动态规划',
      '[{"key":"complexity","type":"string","label":"复杂度"},{"key":"dup","type":"string","label":"复杂度"}]',
      1,
      1
    );
    INSERT INTO tag_record_values (collection, record_id, tag_json)
    VALUES ('/notes', 'n1', '{"tags":["dp"],"values":{"dp":{"complexity":"O(n)"}}}');
    INSERT INTO saved_views (collection, view_id, payload_json, updated_at)
    VALUES ('/notes', 'v1', '{"columns":["title","facet::dp::complexity"],"groupBy":"facet::dp::complexity"}', 1);
  `)
  migrateBiu(db)
  const pack = db.prepare('SELECT fields_json FROM tags WHERE id = ?').get('dp') as { fields_json: string }
  assert.deepEqual(JSON.parse(pack.fields_json), [{ key: '复杂度', type: 'string' }])
  const row = db.prepare('SELECT tag_json FROM tag_record_values WHERE record_id = ?').get('n1') as { tag_json: string }
  assert.deepEqual(JSON.parse(row.tag_json), { tags: ['dp'], values: { dp: { 复杂度: 'O(n)' } } })
  const view = db.prepare('SELECT payload_json FROM saved_views WHERE view_id = ?').get('v1') as { payload_json: string }
  const parsedView = JSON.parse(view.payload_json) as Record<string, unknown>
  assert.deepEqual(parsedView.columns, ['title', 'tag::dp::复杂度'])
  assert.equal(parsedView.groupBy, 'tag::dp::复杂度')
  db.close()
})

test('facet-to-tag migration renames tables, columns, and collection paths', () => {
  const db = openSqlite(':memory:')
  migrateBiu(db, {}, 43)
  db.exec(`
    ALTER TABLE tags RENAME TO facets;
    ALTER TABLE tag_stamps RENAME TO facet_stamps;
    ALTER TABLE tag_record_values RENAME TO facet_record_values;
    ALTER TABLE facet_stamps RENAME COLUMN tag_id TO facet_id;
    ALTER TABLE facet_record_values RENAME COLUMN tag_json TO facet_json;
    INSERT INTO facets (id, label, fields_json, created_at, updated_at)
    VALUES ('need', '需求', '[{"key":"priority","type":"facet"}]', 1, 1);
    INSERT INTO facet_stamps (facet_id, collection, record_id, title) VALUES ('need', '/pages', 'p1', '页');
    INSERT INTO facet_record_values (collection, record_id, facet_json)
    VALUES ('/pages', 'p1', '{"tags":["need"],"values":{}}');
    INSERT INTO editor_content (collection, record_id, body, updated_at, version)
    VALUES ('/facets', 'need', 'note', 1, 1);
  `)
  migrateBiu(db)
  assert.equal(tableNames(db).includes('tags'), true)
  assert.equal(tableNames(db).includes('facets'), false)
  const pack = db.prepare('SELECT fields_json FROM tags WHERE id = ?').get('need') as { fields_json: string }
  assert.deepEqual(JSON.parse(pack.fields_json), [{ key: 'priority', type: 'tag' }])
  const stamp = db.prepare('SELECT tag_id FROM tag_stamps WHERE record_id = ?').get('p1') as { tag_id: string }
  assert.equal(stamp.tag_id, 'need')
  const body = db.prepare('SELECT collection FROM editor_content WHERE record_id = ?').get('need') as { collection: string }
  assert.equal(body.collection, '/tags')
  db.close()
})

test('v61 migrates dynamic groups to locked member views, expands static groups, normalizes views, and drops legacy tables', () => {
  const db = openSqlite(':memory:')
  migrateBiu(db, {}, 60)
  db.exec(`
    CREATE TABLE IF NOT EXISTS workspace_groups (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      name TEXT NOT NULL,
      kind TEXT NOT NULL DEFAULT 'static',
      filter_tree_json TEXT,
      created_by TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS workspace_group_members (
      group_id TEXT NOT NULL,
      account_id TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      PRIMARY KEY (group_id, account_id)
    );
    CREATE TABLE IF NOT EXISTS access_rules (
      id TEXT PRIMARY KEY,
      workspace_id TEXT NOT NULL,
      collection TEXT NOT NULL,
      name TEXT NOT NULL,
      created_by TEXT NOT NULL,
      filter_tree_json TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS access_rule_grants (
      id TEXT PRIMARY KEY,
      rule_id TEXT NOT NULL,
      workspace_id TEXT NOT NULL,
      subject_type TEXT NOT NULL,
      subject_id TEXT NOT NULL,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );
    INSERT INTO workspace_groups (id, workspace_id, name, kind, filter_tree_json, created_by, created_at, updated_at)
    VALUES
      ('grp_dyn', 'ws_1', '管理员组', 'dynamic', '{"op":"and","children":[{"field":"role","op":"eq","value":"admin"}]}', 'acc_owner', 100, 100),
      ('grp_sta', 'ws_1', '项目A', 'static', NULL, 'acc_owner', 101, 101);
    INSERT INTO workspace_group_members (group_id, account_id, created_at)
    VALUES ('grp_sta', 'acc_bob', 102), ('grp_sta', 'acc_carol', 102);
    INSERT INTO resource_policies
      (workspace_id, collection, record_id, owner_account_id, access_mode, member_default_role, parent_collection, parent_record_id, created_by, created_at)
    VALUES
      ('ws_1', '/pages', 'p1', 'acc_owner', 'restricted', 'viewer', '', '', 'acc_owner', 103);
    INSERT INTO record_grants
      (workspace_id, collection, record_id, subject_type, subject_id, role, effect, granted_by, created_at)
    VALUES
      ('ws_1', '/pages', 'p1', 'group', 'grp_dyn', 'editor', 'allow', 'acc_owner', 104),
      ('ws_1', '/pages', 'p2', 'group', 'grp_sta', 'manager', 'allow', 'acc_owner', 105),
      ('ws_1', '/pages', 'p2', 'account', 'acc_bob', 'viewer', 'allow', 'acc_owner', 105);
    INSERT INTO saved_views (workspace_id, collection, view_id, payload_json, updated_at)
    VALUES
      ('ws_1', '/pages', 'v_ws', '{"id":"v_ws","name":"空间视图","scope":"workspace","protection":"public","ownerTable":"workspace","filters":{"$ownerTable":"workspace","status":"open"}}', 106),
      ('ws_1', '/pages', 'default:account:acc_owner:/pages', '{"id":"default:account:acc_owner:/pages","name":"私人页面","ownerTable":"account:acc_owner"}', 107);
  `)
  migrateBiu(db, {}, 61)

  const tables = tableNames(db)
  assert.equal(tables.includes('access_rules'), false)
  assert.equal(tables.includes('access_rule_grants'), false)
  assert.equal(tables.includes('workspace_groups'), false)
  assert.equal(tables.includes('workspace_group_members'), false)

  const lockedViewRow = db
    .prepare(`SELECT payload_json FROM saved_views WHERE workspace_id = 'ws_1' AND collection = '/workspace-members' AND view_id = 'mv_grp_dyn'`)
    .get() as { payload_json: string } | undefined
  assert.ok(lockedViewRow)
  const lockedView = JSON.parse(lockedViewRow.payload_json) as Record<string, unknown>
  assert.equal(lockedView.protection, 'locked')
  assert.equal(lockedView.name, '管理员组')

  const p1Grant = db
    .prepare(`SELECT subject_type, subject_id, role FROM record_grants WHERE workspace_id = 'ws_1' AND record_id = 'p1'`)
    .get() as { subject_type: string; subject_id: string; role: string }
  assert.deepEqual({ ...p1Grant }, { subject_type: 'member_view', subject_id: 'mv_grp_dyn', role: 'editor' })

  const p2Grants = db
    .prepare(`SELECT subject_type, subject_id, role FROM record_grants WHERE workspace_id = 'ws_1' AND record_id = 'p2' ORDER BY subject_id`)
    .all() as Array<{ subject_type: string; subject_id: string; role: string }>
  assert.deepEqual(
    p2Grants.map((g) => ({ ...g })),
    [
      { subject_type: 'account', subject_id: 'acc_bob', role: 'manager' },
      { subject_type: 'account', subject_id: 'acc_carol', role: 'manager' },
    ],
  )

  const policy = db
    .prepare(`SELECT access_mode FROM resource_policies WHERE workspace_id = 'ws_1' AND record_id = 'p1'`)
    .get() as { access_mode: string }
  assert.equal(policy.access_mode, 'private')

  const normalizedView = JSON.parse(
    (db.prepare(`SELECT payload_json FROM saved_views WHERE view_id = 'v_ws'`).get() as { payload_json: string }).payload_json,
  ) as Record<string, unknown>
  assert.equal('ownerTable' in normalizedView, false)
  assert.deepEqual(normalizedView.filters, { status: 'open' })

  const removedPersonalDefault = db
    .prepare(`SELECT view_id FROM saved_views WHERE view_id = 'default:account:acc_owner:/pages'`)
    .get()
  assert.equal(removedPersonalDefault, undefined)
  db.close()
})

test('v62 unifies view permissions into resource_policies, replaces protection with locked, and removes builtin shadows', () => {
  const db = openSqlite(':memory:')
  migrateBiu(db, {}, 61)
  db.exec(`
    INSERT INTO workspaces (id, name, owner_id, created_at) VALUES ('ws_1', 'Acme', 'acc_owner', 100);
    INSERT INTO saved_views (workspace_id, collection, view_id, payload_json, updated_at)
    VALUES
      ('ws_1', '/pages', 'v_pub', '{"id":"v_pub","name":"团队页面","scope":"workspace","protection":"public","createdBy":"acc_owner"}', 100),
      ('ws_1', '/pages', 'v_lock', '{"id":"v_lock","name":"看板","scope":"workspace","protection":"locked","createdBy":"acc_owner"}', 101),
      ('ws_1', '/pages', 'v_priv', '{"id":"v_priv","name":"我的草稿","scope":"personal","protection":"personal","createdBy":"acc_bob"}', 102),
      ('ws_1', '/pages', 'builtin-all:/pages::user:acc_owner', '{"id":"builtin-all:/pages","name":"全部页面","builtin":true,"createdBy":"acc_owner"}', 103),
      ('ws_1', '/pages', 'builtin-all:/pages::user:acc_bob', '{"id":"builtin-all:/pages","name":"Bob自定义","builtin":true,"createdBy":"acc_bob","filters":{"status":"done"}}', 104),
      ('ws_1', '/pages', 'builtin-all:/pages::user:acc_cara', '{"id":"builtin-all:/pages","name":"全部页面","builtin":true,"createdBy":"acc_cara"}', 105),
      ('ws_1', '/workspace-members', 'builtin-member:member', '{"id":"builtin-member:member","name":"空间成员","builtin":true,"filters":{"membershipKind":"member"}}', 106);
    INSERT INTO record_grants (workspace_id, collection, record_id, subject_type, subject_id, role, effect, granted_by, created_at)
    VALUES ('ws_1', '/pages', 'p1', 'member_view', 'builtin-member:member', 'viewer', 'allow', 'acc_owner', 107);
  `)
  migrateBiu(db, {}, 62)

  // Check revision column exists
  assert.equal(tableColumnNames(db, 'saved_views').includes('revision'), true)

  // Check v_pub / v_lock / v_priv policies and locked flag
  const readView = (col: string, id: string): Record<string, unknown> | null => {
    const row = db
      .prepare('SELECT payload_json, revision FROM saved_views WHERE workspace_id = ? AND collection = ? AND view_id = ?')
      .get('ws_1', col, id) as { payload_json: string; revision: number } | undefined
    return row ? { ...(JSON.parse(row.payload_json) as Record<string, unknown>), revision: row.revision } : null
  }
  const readPolicy = (recId: string) =>
    db
      .prepare('SELECT owner_account_id, access_mode, member_default_role FROM resource_policies WHERE workspace_id = ? AND collection = ? AND record_id = ?')
      .get('ws_1', '/views', recId) as { owner_account_id: string; access_mode: string; member_default_role: string } | undefined

  const pubView = readView('/pages', 'v_pub')!
  assert.equal(pubView.locked, false)
  assert.equal('protection' in pubView, false)
  assert.equal('scope' in pubView, false)
  assert.equal(pubView.revision, 1)
  assert.deepEqual({ ...readPolicy('pages::v_pub') }, { owner_account_id: 'acc_owner', access_mode: 'members', member_default_role: 'editor' })

  const lockView = readView('/pages', 'v_lock')!
  assert.equal(lockView.locked, true)
  assert.deepEqual({ ...readPolicy('pages::v_lock') }, { owner_account_id: 'acc_owner', access_mode: 'members', member_default_role: 'viewer' })

  const privView = readView('/pages', 'v_priv')!
  assert.equal(privView.locked, false)
  assert.deepEqual({ ...readPolicy('pages::v_priv') }, { owner_account_id: 'acc_bob', access_mode: 'private', member_default_role: 'viewer' })

  // builtin-all shadows collapsed: owner -> 'all' (members/editor), bob's customized shadow -> personal view, cara's unmodified shadow deleted
  assert.ok(readView('/pages', 'all'))
  assert.deepEqual({ ...readPolicy('pages::all') }, { owner_account_id: 'acc_owner', access_mode: 'members', member_default_role: 'editor' })
  assert.ok(readView('/pages', 'personal-acc_bob'))
  assert.deepEqual({ ...readPolicy('pages::personal-acc_bob') }, { owner_account_id: 'acc_bob', access_mode: 'private', member_default_role: 'viewer' })
  assert.equal(readView('/pages', 'personal-acc_car'), null)

  // builtin-member:member renamed to clean 'member' (locked=true) and record_grants remapped
  const memberView = readView('/workspace-members', 'member')!
  assert.equal(memberView.locked, true)
  const grant = db
    .prepare(`SELECT subject_id FROM record_grants WHERE workspace_id = 'ws_1' AND collection = '/pages' AND record_id = 'p1'`)
    .get() as { subject_id: string }
  assert.equal(grant.subject_id, 'member')

  db.close()
})
