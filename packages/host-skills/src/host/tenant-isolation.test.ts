import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { Context } from 'cordis'
import { runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import { assertSkillSourcePath } from './store.ts'
import * as skillsPlugin from './index.ts'
import type { SkillsService } from './index.ts'

const originalOnline = process.env.BIU_ONLINE
const originalSkillRoot = process.env.BIU_SKILL_ROOT
const originalDataDir = process.env.BIU_DATA_DIR
const tempDirs: string[] = []

afterEach(() => {
  if (originalOnline === undefined) delete process.env.BIU_ONLINE
  else process.env.BIU_ONLINE = originalOnline
  if (originalSkillRoot === undefined) delete process.env.BIU_SKILL_ROOT
  else process.env.BIU_SKILL_ROOT = originalSkillRoot
  if (originalDataDir === undefined) delete process.env.BIU_DATA_DIR
  else process.env.BIU_DATA_DIR = originalDataDir
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true })
  }
})

type RouteHandler = (route: {
  query?: URLSearchParams
  json: () => Promise<unknown>
  send: (status: number, body: unknown) => void
  res: { writeHead: (status: number, headers: Record<string, string>) => void; end: (body: string) => void }
}) => Promise<void> | void

test('host-skills isolates skills, promptSection, and HTTP endpoints per workspace in cloud RBAC mode', async () => {
  const root = mkdtempSync(join(tmpdir(), 'biu-skills-tenant-'))
  tempDirs.push(root)
  process.env.BIU_ONLINE = '1'
  process.env.BIU_DATA_DIR = root
  process.env.BIU_SKILL_ROOT = join(root, 'skill')

  const routes = new Map<string, RouteHandler>()
  const ctx = new Context()
  ctx.provide('tools')
  ctx.set('tools', { register: () => {} } as never)
  ctx.provide('database')
  ctx.set('database', { register: () => {} } as never)
  ctx.provide('http')
  ctx.set('http', {
    route(method: string, path: string, handler: RouteHandler) {
      routes.set(`${method} ${path}`, handler)
    },
  } as never)

  await ctx.plugin(skillsPlugin)
  const skills = ctx.get('skills') as unknown as SkillsService
  assert.ok(skills)

  // Workspace A imports a skill with an extra file
  runWithRequestWorkspace('ws-alpha', () => {
    skills.import({
      id: 'alpha-secret',
      name: 'Alpha Skill',
      description: 'INJECT_ALPHA_ONLY',
      files: [
        { path: 'SKILL.md', content: '---\nname: Alpha Skill\ndescription: INJECT_ALPHA_ONLY\n---\nSecret body A' },
        { path: 'script.sh', content: 'echo alpha-secret' },
      ],
    })
  })

  // Workspace B must not see Workspace A's skill in list, promptSection, read, or fileText
  runWithRequestWorkspace('ws-beta', () => {
    assert.deepEqual(skills.list(), [])
    assert.doesNotMatch(skills.promptSection(), /INJECT_ALPHA_ONLY/)
    assert.throws(() => skills.read('alpha-secret'), /unknown skill/)
    assert.throws(() => skills.fileText('alpha-secret', 'script.sh'), /unknown skill/)
  })

  // Workspace A sees its own skill
  runWithRequestWorkspace('ws-alpha', () => {
    assert.equal(skills.list().length, 1)
    assert.match(skills.promptSection(), /INJECT_ALPHA_ONLY/)
    assert.equal(skills.fileText('alpha-secret', 'script.sh'), 'echo alpha-secret')
  })

  // Missing workspace context fails closed
  assert.deepEqual(skills.list(), [])
  assert.doesNotMatch(skills.promptSection(), /INJECT_ALPHA_ONLY/)
  assert.throws(() => skills.create({ name: 'orphan', description: 'nope' }), /缺少工作区上下文/)

  // HTTP routes reject missing workspace context with 403
  const importRoute = routes.get('POST /api/skills/import')!
  const fileRoute = routes.get('GET /api/skills/file')!
  let importStatus = 0
  await importRoute({
    json: async () => ({ files: [{ path: 'SKILL.md', content: 'hi' }] }),
    send(s) {
      importStatus = s
    },
    res: { writeHead() {}, end() {} },
  })
  assert.equal(importStatus, 403)

  let fileStatus = 0
  await fileRoute({
    query: new URLSearchParams({ id: 'alpha-secret', path: 'script.sh' }),
    json: async () => ({}),
    send(s) {
      fileStatus = s
    },
    res: { writeHead() {}, end() {} },
  })
  assert.equal(fileStatus, 403)

  // Workspace B requesting Workspace A's file via HTTP -> 404
  let crossFileStatus = 0
  await runWithRequestWorkspace('ws-beta', async () => {
    await fileRoute({
      query: new URLSearchParams({ id: 'alpha-secret', path: 'script.sh' }),
      json: async () => ({}),
      send(s) {
        crossFileStatus = s
      },
      res: { writeHead() {}, end() {} },
    })
  })
  assert.equal(crossFileStatus, 404)

  // Cloud mode refuses host filesystem `from` paths
  const hostFile = join(root, 'secret.txt')
  writeFileSync(hostFile, 'top-secret')
  assert.throws(() => assertSkillSourcePath(hostFile), /不允许通过宿主机路径/)
})
