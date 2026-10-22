import { test } from 'vitest'
import assert from 'node:assert/strict'
import { skillsCollection } from './collection.ts'
import type { SkillsService } from './index.ts'

test('skills list does not scan skill directories for every row', async () => {
  let listedFiles = 0
  const skills = {
    list: () => [{ id: 'a', name: 'A', description: '', source: '', enabled: true, notes: 'body', createdAt: 1, updatedAt: 1 }],
    recordOrNull: (id: string) => (id === 'a' ? skills.list()[0] : null),
    filesOf() {
      listedFiles += 1
      return ['SKILL.md']
    },
    create: () => skills.list()[0],
    import: () => skills.list()[0],
    patch: () => skills.list()[0],
    remove() {},
    setEnabled() {},
  } as unknown as SkillsService
  const spec = skillsCollection(skills)
  const rows = await spec.list()
  assert.equal(rows[0]?.title, 'A')
  assert.equal(rows[0]?.fileList, '')
  assert.equal(listedFiles, 0)
  const one = await spec.get!('a')
  assert.equal(one?.fileList, 'SKILL.md')
  assert.equal(listedFiles, 1)
})
