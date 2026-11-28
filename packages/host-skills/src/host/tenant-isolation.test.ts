import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { Context, Service } from 'cordis'
import { openAndMigrateBiu, runWithAccount, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import { CollabStore } from '@biu/host-account/store'
import { DatabaseService } from '@biu/core-file-system/host'
import { assertSkillSourcePath, workspaceSkillRoot } from './store.ts'
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

test('host-skills isolates enabled/disabled state per account within the same workspace', async () => {
  const root = mkdtempSync(join(tmpdir(), 'biu-skills-per-account-'))
  tempDirs.push(root)
  process.env.BIU_ONLINE = '1'
  process.env.BIU_DATA_DIR = root
  process.env.BIU_SKILL_ROOT = join(root, 'skill')

  const owners = new Map<string, string>()
  const readableBy = new Map<string, Set<string>>()

  const ctx = new Context()
  ctx.provide('tools')
  ctx.set('tools', { register: () => {} } as never)
  ctx.provide('database')
  ctx.set('database', { register: () => {} } as never)
  ctx.provide('http')
  ctx.set('http', { route: () => {} } as never)
  ctx.provide('account' as never)
  ctx.set('account' as never, {
    store: {
      collectionRecordOwners: (_ws: string, col: string) => (col === '/skills' ? owners : new Map()),
    },
    authorization: {
      currentActor: () => null,
      authorize: (
        actor: { accountId: string },
        _action: string,
        resource: { collection: string; recordId: string },
      ) => ({
        allowed:
          owners.get(resource.recordId) === actor.accountId ||
          Boolean(readableBy.get(resource.recordId)?.has(actor.accountId)),
      }),
    },
  } as never)

  await ctx.plugin(skillsPlugin)
  const skills = ctx.get('skills') as unknown as SkillsService
  const auth = (ctx.get('account' as never) as unknown as { authorization: { currentActor: () => unknown } }).authorization
  const asUser = <T>(accountId: string, fn: () => T) => {
    auth.currentActor = () => ({ accountId, workspaceId: 'ws-team' })
    return runWithRequestWorkspace('ws-team', () => runWithAccount(accountId, fn))
  }

  // Ada creates a skill (enabled by default for Ada)
  const created = asUser('acc-ada', () =>
    skills.create({
      id: 'shared-review',
      name: 'Code Review',
      description: 'REVIEW_SKILL_MARKER',
      notes: 'Review checklist',
    }),
  )
  owners.set(created.id, 'acc-ada')
  readableBy.set(created.id, new Set(['acc-bob']))

  // Ada sees it enabled and in her prompt
  asUser('acc-ada', () => {
    assert.equal(skills.record(created.id).enabled, true)
    assert.match(skills.promptSection(), /REVIEW_SKILL_MARKER/)
  })

  // Bob can see the shared skill, but it defaults to disabled for Bob (no prompt pollution)
  asUser('acc-bob', () => {
    assert.equal(skills.list().length, 1)
    assert.equal(skills.record(created.id).enabled, false)
    assert.doesNotMatch(skills.promptSection(), /REVIEW_SKILL_MARKER/)
  })

  // Bob enables it for himself -> Bob sees enabled=true; Ada is unaffected
  asUser('acc-bob', () => {
    skills.setEnabled(created.id, true)
    assert.equal(skills.record(created.id).enabled, true)
    assert.match(skills.promptSection(), /REVIEW_SKILL_MARKER/)
  })

  // Ada disables it for herself -> Ada sees enabled=false, while Bob STILL sees enabled=true
  asUser('acc-ada', () => {
    skills.setEnabled(created.id, false)
    assert.equal(skills.record(created.id).enabled, false)
    assert.doesNotMatch(skills.promptSection(), /REVIEW_SKILL_MARKER/)
  })
  asUser('acc-bob', () => {
    assert.equal(skills.record(created.id).enabled, true)
    assert.match(skills.promptSection(), /REVIEW_SKILL_MARKER/)
  })

  // Non-authorized user Carol cannot toggle enabled
  asUser('acc-carol', () => {
    assert.throws(() => skills.setEnabled(created.id, true), /permission denied/)
  })
})

test('host-skills allocates globally unique ids across workspaces and recovers from legacy orphan new-skill.md', async () => {
  const root = mkdtempSync(join(tmpdir(), 'biu-skills-multi-ws-'))
  tempDirs.push(root)
  process.env.BIU_ONLINE = '1'
  process.env.BIU_DATA_DIR = root
  process.env.BIU_SKILL_ROOT = join(root, 'skill')

  const ctx = new Context()
  ctx.provide('tools')
  ctx.set('tools', { register: () => {} } as never)
  ctx.provide('http')
  ctx.set('http', { route: () => {} } as never)

  const db = new DatabaseService(ctx)
  const collab = new CollabStore(openAndMigrateBiu(join(root, 'biu.sqlite')))
  class AccountBridge extends Service {
    store = collab
    authorization = collab.authorization
    workspaceLocation = () => 'cloud' as const
    constructor(inner: Context) {
      super(inner, 'account')
    }
  }
  await ctx.plugin(AccountBridge)
  await ctx.plugin(skillsPlugin)

  const ada = collab.register('', Date.now(), 'secret1', 'skill-ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'skill-bob@example.com')
  const carol = collab.register('', Date.now(), 'secret1', 'skill-carol@example.com')
  const wsA = collab.createWorkspace(ada.id, 'Skill WS A')
  const wsB = collab.createWorkspace(bob.id, 'Skill WS B')
  collab.addMemberByEmail(ada.id, wsA.id, carol.email)
  collab.setActive(ada.id, wsA.id)
  collab.setActive(carol.id, wsA.id)
  collab.setActive(bob.id, wsB.id)

  const asCtx = <T>(workspaceId: string, accountId: string, fn: () => T) =>
    runWithRequestWorkspace(workspaceId, () => runWithAccount(accountId, fn))

  // 1. Pre-seed legacy collision: wsA owns /skills/new-skill and wsB has an orphan unattached new-skill.md on disk
  asCtx(wsA.id, ada.id, () => {
    collab.attach(wsA.id, '/skills', 'new-skill', Date.now(), { accessMode: 'private' })
  })
  const wsBDir = workspaceSkillRoot(wsB.id, root)
  mkdirSync(wsBDir, { recursive: true })
  writeFileSync(
    join(wsBDir, 'new-skill.md'),
    '---\nname: 新技能\ndescription: ""\nenabled: false\n---\n\n',
    'utf8',
  )

  // 2. Bob in wsB clicks 新建 -> skips orphan new-skill.md and succeeds without 409
  const bobCreated = await asCtx(wsB.id, bob.id, () => db.create('/skills', [{}]))
  const bobId = String(bobCreated.items[0]!.value.id)
  assert.match(bobId, /^new-skill-[0-9a-f]{8}$/)

  // 3. Ada in wsA clicks 新建 -> gets her own draft id; clicking again reuses her draft
  const adaFirst = await asCtx(wsA.id, ada.id, () => db.create('/skills', [{}]))
  const adaId = String(adaFirst.items[0]!.value.id)
  assert.match(adaId, /^new-skill-[0-9a-f]{8}$/)
  assert.notEqual(adaId, bobId)

  const adaSecond = await asCtx(wsA.id, ada.id, () => db.create('/skills', [{}]))
  assert.equal(String(adaSecond.items[0]!.value.id), adaId)

  // 4. Carol in the SAME workspace wsA clicks 新建 -> gets a distinct draft id (does not hijack Ada's private draft)
  const carolFirst = await asCtx(wsA.id, carol.id, () => db.create('/skills', [{}]))
  const carolId = String(carolFirst.items[0]!.value.id)
  assert.match(carolId, /^new-skill-[0-9a-f]{8}$/)
  assert.notEqual(carolId, adaId)

  // 5. Same explicit title/slug across two workspaces disambiguates cleanly instead of failing with 409
  const wsANamed = await asCtx(wsA.id, ada.id, () =>
    db.create('/skills', [{ title: 'PDF Helper', description: 'Workspace A helper' }]),
  )
  assert.equal(String(wsANamed.items[0]!.value.id), 'pdf-helper')

  const wsBNamed = await asCtx(wsB.id, bob.id, () =>
    db.create('/skills', [{ title: 'PDF Helper', description: 'Workspace B helper' }]),
  )
  const wsBNamedId = String(wsBNamed.items[0]!.value.id)
  assert.match(wsBNamedId, /^pdf-helper-[0-9a-f]{8}$/)
})
