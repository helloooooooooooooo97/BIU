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
  assert.equal(BIU_MIGRATIONS.at(-1)?.name, 'dynamic-groups-and-view-policies')
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
  assert.equal(view.view_id, 'builtin-all:/agents')
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
  assert.deepEqual(JSON.parse(view.payload_json), {
    columns: ['title', 'tag::dp::复杂度'],
    groupBy: 'tag::dp::复杂度',
  })
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

test('v57 migrates view_grants, shared views, and view public shares into independent access_rules', () => {
  const db = openSqlite(':memory:')
  migrateBiu(db, {}, 56)
  db.exec(`
    INSERT INTO saved_views (workspace_id, collection, view_id, payload_json, updated_at)
    VALUES (
      'ws_1', '/pages', 'v_q3',
      '{"id":"v_q3","name":"Q3 客户","scope":"shared","createdBy":"acc_a","mode":"board","groupBy":"status","columns":["title","status"],"filterTree":{"op":"and","rules":[{"field":"tag","op":"eq","value":"q3"}]}}',
      100
    );
    INSERT INTO view_grants (workspace_id, collection, view_id, subject_type, subject_id, role, effect, granted_by, created_at)
    VALUES
      ('ws_1', '/pages', 'v_q3', 'account', 'acc_b', 'viewer', 'allow', 'acc_a', 101),
      ('ws_1', '/pages', 'v_q3', 'workspace', 'ws_1', 'editor', 'allow', 'acc_a', 102);
    INSERT INTO shares (token, kind, collection, view_id, record_id, workspace_id, created_by, created_at, updated_at)
    VALUES ('tok_keep_1', 'view', '/pages', 'v_q3', '', 'ws_1', 'acc_a', 103, 103);
  `)
  migrateBiu(db)

  const rules = db.prepare('SELECT * FROM access_rules WHERE workspace_id = ?').all('ws_1') as Array<{
    id: string
    name: string
    created_by: string
    filter_tree_json: string
    columns_json: string
    display_snapshot_json: string
    enabled: number
  }>
  assert.equal(rules.length, 1)
  assert.equal(rules[0]!.name, 'Q3 客户')
  assert.equal(rules[0]!.created_by, 'acc_a')
  assert.equal(rules[0]!.enabled, 1)
  assert.deepEqual(JSON.parse(rules[0]!.filter_tree_json), { op: 'and', rules: [{ field: 'tag', op: 'eq', value: 'q3' }] })
  assert.deepEqual(JSON.parse(rules[0]!.columns_json), ['title', 'status'])
  assert.deepEqual(JSON.parse(rules[0]!.display_snapshot_json), { mode: 'board', groupBy: 'status' })

  const grants = db.prepare('SELECT subject_type, subject_id, role FROM access_rule_grants WHERE rule_id = ? ORDER BY subject_type').all(rules[0]!.id) as Array<{
    subject_type: string
    subject_id: string
    role: string
  }>
  assert.deepEqual(
    grants.map((g) => ({ ...g })),
    [
      { subject_type: 'account', subject_id: 'acc_b', role: 'viewer' },
      { subject_type: 'workspace', subject_id: 'ws_1', role: 'editor' },
    ],
  )

  const migratedView = db.prepare('SELECT payload_json FROM saved_views WHERE view_id = ?').get('v_q3') as { payload_json: string }
  assert.equal(JSON.parse(migratedView.payload_json).scope, 'personal')

  const migratedShare = db.prepare('SELECT token, kind, view_id, rule_id FROM shares WHERE token = ?').get('tok_keep_1') as {
    token: string
    kind: string
    view_id: string
    rule_id: string
  }
  assert.equal(migratedShare.kind, 'rule')
  assert.equal(migratedShare.view_id, '')
  assert.equal(migratedShare.rule_id, rules[0]!.id)
  db.close()
})

test('v58 migrates member_view grants to dynamic workspace_groups and backfills view resource_policies', () => {
  const db = openSqlite(':memory:')
  migrateBiu(db, {}, 57)
  db.exec(`
    INSERT INTO accounts (id, name, token, password_hash, created_at, email)
    VALUES ('acc_owner', 'Owner', 'tok_o', 'pw', 1, 'owner@example.com');
    INSERT INTO workspaces (id, name, owner_id, created_at)
    VALUES ('ws_1', 'W1', 'acc_owner', 1);
    INSERT INTO workspace_members (workspace_id, account_id, role, created_at)
    VALUES ('ws_1', 'acc_owner', 'owner', 1);
    INSERT INTO saved_views (workspace_id, collection, view_id, payload_json, updated_at)
    VALUES
      (
        'ws_1', '/workspace-members', 'mv_admins',
        '{"id":"mv_admins","name":"管理员组","scope":"workspace","createdBy":"acc_owner","filterTree":{"op":"and","children":[{"field":"role","op":"eq","value":"admin"}]}}',
        100
      ),
      (
        'ws_1', '/pages', 'v_team',
        '{"id":"v_team","name":"团队视图","scope":"workspace","createdBy":"acc_owner"}',
        101
      );
    INSERT INTO record_grants (workspace_id, collection, record_id, subject_type, subject_id, role, effect, granted_by, created_at)
    VALUES
      ('ws_1', '/pages', 'p1', 'member_view', 'mv_admins', 'editor', 'allow', 'acc_owner', 102),
      ('ws_1', '/pages', 'p2', 'member_view', 'builtin-member:external', 'viewer', 'allow', 'acc_owner', 103);
    INSERT INTO access_rules (id, workspace_id, collection, name, created_by, filter_tree_json, enabled, created_at, updated_at)
    VALUES ('rule_1', 'ws_1', '/pages', 'R1', 'acc_owner', '{"op":"and","children":[]}', 1, 104, 104);
    INSERT INTO access_rule_grants (id, rule_id, workspace_id, subject_type, subject_id, role, created_at)
    VALUES ('arg_1', 'rule_1', 'ws_1', 'member_view', 'mv_admins', 'viewer', 105);
  `)
  migrateBiu(db, {}, 58)

  const groups = db
    .prepare(`SELECT id, name, kind, filter_tree_json FROM workspace_groups WHERE workspace_id = 'ws_1' ORDER BY name`)
    .all() as Array<{ id: string; name: string; kind: string; filter_tree_json: string }>
  assert.equal(groups.length, 2)
  const adminGroup = groups.find((g) => g.name === '管理员组')!
  const extGroup = groups.find((g) => g.name === '外部成员')!
  assert.equal(adminGroup.kind, 'dynamic')
  assert.deepEqual(JSON.parse(adminGroup.filter_tree_json), { op: 'and', children: [{ field: 'role', op: 'eq', value: 'admin' }] })
  assert.equal(extGroup.kind, 'dynamic')
  assert.deepEqual(JSON.parse(extGroup.filter_tree_json), { op: 'and', children: [{ field: 'membershipKind', op: 'eq', value: 'external' }] })

  const remainingMvRecordGrants = db.prepare(`SELECT COUNT(*) AS cnt FROM record_grants WHERE subject_type = 'member_view'`).get() as { cnt: number }
  assert.equal(remainingMvRecordGrants.cnt, 0)
  const migratedP1 = db
    .prepare(`SELECT subject_type, subject_id, role FROM record_grants WHERE record_id = 'p1'`)
    .get() as { subject_type: string; subject_id: string; role: string }
  assert.deepEqual({ ...migratedP1 }, { subject_type: 'group', subject_id: adminGroup.id, role: 'editor' })

  const migratedRuleGrant = db
    .prepare(`SELECT subject_type, subject_id, role FROM access_rule_grants WHERE id = 'arg_1'`)
    .get() as { subject_type: string; subject_id: string; role: string }
  assert.deepEqual({ ...migratedRuleGrant }, { subject_type: 'group', subject_id: adminGroup.id, role: 'viewer' })

  const viewPolicy = db
    .prepare(`SELECT owner_account_id, access_mode FROM resource_policies WHERE workspace_id = 'ws_1' AND collection = '/views' AND record_id = 'pages::v_team'`)
    .get() as { owner_account_id: string; access_mode: string } | undefined
  assert.deepEqual(viewPolicy ? { ...viewPolicy } : null, { owner_account_id: 'acc_owner', access_mode: 'members' })
  db.close()
})

test('v59 backfills owner_table, inherit_parent, access_rules.owner_table, and saved_views protection', () => {
  const db = openSqlite(':memory:')
  migrateBiu(db, {}, 58)
  db.exec(`
    INSERT INTO resource_policies
      (workspace_id, collection, record_id, owner_account_id, access_mode, member_default_role, parent_collection, parent_record_id, created_by, created_at)
    VALUES
      ('ws_1', '/pages', 'p_ws', 'acc_a', 'members', 'editor', '', '', 'acc_a', 1),
      ('ws_1', '/pages', 'p_priv', 'acc_a', 'private', 'viewer', '', '', 'acc_a', 2),
      ('ws_1', '/pages', 'p_child_ws', 'acc_b', 'inherit', 'viewer', '/pages', 'p_ws', 'acc_b', 3),
      ('ws_1', '/pages', 'p_child_priv', 'acc_a', 'inherit', 'viewer', '/pages', 'p_priv', 'acc_a', 4);
    INSERT INTO access_rules
      (id, workspace_id, collection, name, created_by, filter_tree_json, enabled, created_at, updated_at)
    VALUES
      ('rule_legacy', 'ws_1', '/pages', 'Legacy Rule', 'acc_a', '{"op":"and","children":[]}', 1, 5, 5);
    INSERT INTO saved_views (workspace_id, collection, view_id, payload_json, updated_at)
    VALUES
      ('ws_1', '/pages', 'v_ws', '{"id":"v_ws","name":"空间视图","scope":"workspace","createdBy":"acc_a"}', 6),
      ('ws_1', '/pages', 'v_priv', '{"id":"v_priv","name":"我的视图","scope":"personal","createdBy":"acc_a"}', 7);
  `)
  migrateBiu(db)

  const policies = new Map(
    (
      db
        .prepare(`SELECT record_id, owner_table, inherit_parent FROM resource_policies WHERE workspace_id = 'ws_1'`)
        .all() as Array<{ record_id: string; owner_table: string; inherit_parent: number }>
    ).map((r) => [r.record_id, { owner_table: r.owner_table, inherit_parent: r.inherit_parent }]),
  )
  assert.deepEqual(policies.get('p_ws'), { owner_table: 'workspace', inherit_parent: 0 })
  assert.deepEqual(policies.get('p_priv'), { owner_table: 'account:acc_a', inherit_parent: 0 })
  assert.deepEqual(policies.get('p_child_ws'), { owner_table: 'workspace', inherit_parent: 1 })
  assert.deepEqual(policies.get('p_child_priv'), { owner_table: 'account:acc_a', inherit_parent: 1 })

  const rule = db
    .prepare(`SELECT owner_table, visible_views_json FROM access_rules WHERE id = 'rule_legacy'`)
    .get() as { owner_table: string; visible_views_json: string | null }
  assert.equal(rule.owner_table, 'account:acc_a')
  assert.equal(rule.visible_views_json, null)

  const vWs = JSON.parse(
    (db.prepare(`SELECT payload_json FROM saved_views WHERE view_id = 'v_ws'`).get() as { payload_json: string }).payload_json,
  )
  const vPriv = JSON.parse(
    (db.prepare(`SELECT payload_json FROM saved_views WHERE view_id = 'v_priv'`).get() as { payload_json: string }).payload_json,
  )
  assert.equal(vWs.protection, 'locked')
  assert.equal(vWs.ownerTable, 'workspace')
  assert.equal(vPriv.protection, 'personal')
  assert.equal(vPriv.ownerTable, 'account:acc_a')
  db.close()
})
