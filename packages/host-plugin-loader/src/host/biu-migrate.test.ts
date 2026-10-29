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
  assert.equal(BIU_MIGRATIONS.at(-1)?.name, 'facet.field.identity')
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
    INSERT INTO facets (id, label, fields_json, created_at, updated_at)
    VALUES (
      'dp',
      '动态规划',
      '[{"key":"complexity","type":"string","label":"复杂度"},{"key":"dup","type":"string","label":"复杂度"}]',
      1,
      1
    );
    INSERT INTO facet_record_values (collection, record_id, facet_json)
    VALUES ('/notes', 'n1', '{"tags":["dp"],"values":{"dp":{"complexity":"O(n)"}}}');
    INSERT INTO saved_views (collection, view_id, payload_json, updated_at)
    VALUES ('/notes', 'v1', '{"columns":["title","facet::dp::complexity"],"groupBy":"facet::dp::complexity"}', 1);
  `)
  migrateBiu(db)
  const pack = db.prepare('SELECT fields_json FROM facets WHERE id = ?').get('dp') as { fields_json: string }
  assert.deepEqual(JSON.parse(pack.fields_json), [{ key: '复杂度', type: 'string' }])
  const row = db.prepare('SELECT facet_json FROM facet_record_values WHERE record_id = ?').get('n1') as { facet_json: string }
  assert.deepEqual(JSON.parse(row.facet_json), { tags: ['dp'], values: { dp: { 复杂度: 'O(n)' } } })
  const view = db.prepare('SELECT payload_json FROM saved_views WHERE view_id = ?').get('v1') as { payload_json: string }
  assert.deepEqual(JSON.parse(view.payload_json), {
    columns: ['title', 'facet::dp::复杂度'],
    groupBy: 'facet::dp::复杂度',
  })
  db.close()
})
