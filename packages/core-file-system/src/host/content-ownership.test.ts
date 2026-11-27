/** @vitest-environment node */
import { test, vi } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { Context } from 'cordis'
import { openAndMigrateBiu } from '@biu/host-plugin-loader/data-dir'
import { DatabaseService } from './index.ts'
import { PagesStore } from '../../../core-page/src/host/store.ts'
import { pagesCollection } from '../../../core-page/src/host/index.ts'
import { PageBlocksIndex } from '../../../core-page/src/host/page-blocks-index.ts'
import { SkillsService } from '../../../host-skills/src/host/index.ts'
import { skillsCollection } from '../../../host-skills/src/host/collection.ts'
import { PluginStoreService } from '../../../core-plugin-system/src/host/store.ts'
import { pluginsCollection } from '../../../core-plugin-system/src/host/collection.ts'

test('host content writes persist once while collection mirrors and metadata still update', async () => {
  const root = await mkdtemp(join(tmpdir(), 'content-owner-'))
  const previousHome = process.env.BIU_HOME
  const previousSkillRoot = process.env.BIU_SKILL_ROOT
  process.env.BIU_HOME = root
  process.env.BIU_SKILL_ROOT = join(root, '.biu/skill')
  const contexts = [new Context(), new Context(), new Context()]
  const sqlPath = join(root, '.biu/biu.sqlite')
  await mkdir(join(root, '.biu'), { recursive: true })
  const sql = openAndMigrateBiu(sqlPath)
  try {
    const db = new DatabaseService(contexts[0]!)
    db.tags.open(sqlPath)
    const pages = new PagesStore({
      resolve: (path) => join(root, path),
      read: (path) => readFile(join(root, path), 'utf8'),
      write: (path, body) => writeFile(join(root, path), body),
      list: (path = '.') => readdir(join(root, path)),
    }, join(root, '.biu/assets'))
    const page = await pages.create({ title: 'Page', notes: 'before' })
    const index = new PageBlocksIndex(pages)
    const reindex = vi.spyOn(index, 'reindexPage')
    db.register(pagesCollection(pages, index))
    const skills = new SkillsService(contexts[1]!)
    const skill = skills.create({ name: 'Example', description: 'test skill', notes: 'before' })
    db.register(skillsCollection(skills))
    const pluginDir = join(root, '.plugin-dev/demo')
    await mkdir(pluginDir, { recursive: true })
    await writeFile(join(pluginDir, 'manifest.json'), JSON.stringify({ id: 'demo', name: 'Demo', blurb: 'test' }))
    await writeFile(join(pluginDir, 'README.md'), 'before')
    Object.assign(contexts[2]!, { hub: { adopt: async () => {}, drop: async () => {}, snapshot: () => ({ plugins: [] }) } })
    const plugins = new PluginStoreService(contexts[2]!, join(root, '.plugin'), join(root, 'store.json'), join(root, '.plugin-dev')).open()
    db.register(pluginsCollection(plugins))

    const paths = [`/pages/${page.id}`, `/skills/${skill.id}`, '/plugins/demo']
    // Warm read-side migration before measuring actual writes.
    for (const path of paths) await db.content(path)
    sql.exec(`CREATE TABLE content_write_audit (collection TEXT, record_id TEXT);
      CREATE TRIGGER audit_content_insert AFTER INSERT ON editor_content BEGIN
        INSERT INTO content_write_audit VALUES (NEW.collection, NEW.record_id);
      END;
      CREATE TRIGGER audit_content_update AFTER UPDATE ON editor_content BEGIN
        INSERT INTO content_write_audit VALUES (NEW.collection, NEW.record_id);
      END;`)
    for (const path of paths) {
      const before = await db.content(path)
      const written = await db.writeContent(path, '# after\n', before.version) as { value: unknown; version?: number }
      assert.equal(written.value, '# after\n', path)
      assert.equal(written.version, (before.version ?? 0) + 1, path)
      await assert.rejects(() => db.writeContent(path, 'stale', before.version), /正文版本冲突/)
    }
    const counts = sql.prepare('SELECT collection, count(*) AS writes FROM content_write_audit GROUP BY collection').all()
    assert.deepEqual(counts.map((row) => ({ ...row })), [
      { collection: '/pages', writes: 1 },
      { collection: '/plugins', writes: 1 },
      { collection: '/skills', writes: 1 },
    ])
    assert.equal((await pages.get(page.id))?.notes, '# after\n')
    assert.equal(reindex.mock.calls.length, 1)
    assert.equal(reindex.mock.calls[0]?.[0].notes, '# after\n')
    assert.match(await readFile(join(root, '.biu/skill', `${skill.id}.md`), 'utf8'), /# after/)
    assert.equal(await readFile(join(pluginDir, 'README.md'), 'utf8'), '# after\n')
    // Direct store callers retain responsibility for persisting their own writes.
    await pages.update(page.id, { notes: 'direct page' })
    skills.patch(skill.id, { notes: 'direct skill' })
    await plugins.writeReadme('demo', 'direct plugin')
    for (const path of paths) assert.match(String((await db.content(path)).value), /^direct /)
  } finally {
    for (const ctx of contexts) await ctx.fiber.dispose()
    sql.close()
    if (previousHome === undefined) delete process.env.BIU_HOME
    else process.env.BIU_HOME = previousHome
    if (previousSkillRoot === undefined) delete process.env.BIU_SKILL_ROOT
    else process.env.BIU_SKILL_ROOT = previousSkillRoot
    await rm(root, { recursive: true, force: true })
  }
})
