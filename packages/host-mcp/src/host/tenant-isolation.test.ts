import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, test } from 'vitest'
import { Context, Service } from 'cordis'
import { openAndMigrateBiu, runWithAccount, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import { CollabStore } from '@biu/host-account/store'
import { DatabaseService } from '@biu/core-file-system/host'
import { McpService } from './index.ts'
import { mcpCollection } from './collection.ts'

const originalOnline = process.env.BIU_ONLINE
const originalHome = process.env.BIU_HOME
const originalDataDir = process.env.BIU_DATA_DIR
const tempDirs: string[] = []

afterEach(() => {
  if (originalOnline === undefined) delete process.env.BIU_ONLINE
  else process.env.BIU_ONLINE = originalOnline
  if (originalHome === undefined) delete process.env.BIU_HOME
  else process.env.BIU_HOME = originalHome
  if (originalDataDir === undefined) delete process.env.BIU_DATA_DIR
  else process.env.BIU_DATA_DIR = originalDataDir
  while (tempDirs.length) {
    rmSync(tempDirs.pop()!, { recursive: true, force: true })
  }
})

test('MCP supports 3-state sharing while isolating enabled state per account', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-mcp-per-account-'))
  tempDirs.push(dir)
  process.env.BIU_ONLINE = '1'
  process.env.BIU_HOME = dir
  process.env.BIU_DATA_DIR = dir

  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const collab = new CollabStore(openAndMigrateBiu(join(dir, 'biu.sqlite')))
  class AccountBridge extends Service {
    store = collab
    authorization = collab.authorization
    workspaceLocation = () => 'cloud' as const
    constructor(inner: Context) {
      super(inner, 'account')
    }
  }
  await ctx.plugin(AccountBridge)

  const mcp = new McpService(ctx)
  // Stub connect so we test per-account enable/disable without real network I/O
  const connectedByAccount = new Map<string, Set<string>>()
  const origDisconnect = mcp.disconnect.bind(mcp)
  mcp.connect = async (id: string) => {
    const row = mcp.listServers().find((s) => s.id === id)
    if (!row) throw new Error(`unknown mcp server: ${id}`)
    const acc = collab.authorization.currentActor()?.accountId ?? ''
    if (!connectedByAccount.has(acc)) connectedByAccount.set(acc, new Set())
    connectedByAccount.get(acc)!.add(id)
    return { ...row, status: 'ready' as const, enabled: true }
  }
  mcp.disconnect = async (id: string) => {
    const acc = collab.authorization.currentActor()?.accountId ?? ''
    connectedByAccount.get(acc)?.delete(id)
    return origDisconnect(id)
  }
  db.register(mcpCollection(mcp))

  const ada = collab.register('', Date.now(), 'secret1', 'mcp-ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'mcp-bob@example.com')
  const carol = collab.register('', Date.now(), 'secret1', 'mcp-carol@example.com')
  const workspace = collab.createWorkspace(ada.id, 'MCP Team')
  collab.addMemberByEmail(ada.id, workspace.id, bob.email)
  collab.addMemberByEmail(ada.id, workspace.id, carol.email)
  for (const u of [ada, bob, carol]) collab.setActive(u.id, workspace.id)

  const asUser = <T>(accountId: string, fn: () => T) =>
    runWithRequestWorkspace(workspace.id, () => runWithAccount(accountId, fn))

  // /mcp schema exposes shareScope (3-state sharing enabled)
  const stat = await asUser(ada.id, () => db.stat('/mcp'))
  if (stat.kind === 'collection') {
    assert.ok(stat.schema.fields.shareScope)
  }

  // Ada creates a private HTTP MCP server with headers
  const created = await asUser(ada.id, () =>
    db.create('/mcp', [
      {
        title: 'team-docs',
        transport: 'http',
        url: 'https://mcp.example.com/sse',
        headers: ['Authorization: Bearer shared-token-123'],
        enabled: true,
      },
    ]),
  )
  const serverId = String(created.items[0]!.value.id)
  assert.equal(serverId, 'team-docs')
  assert.equal(created.items[0]!.value.shareScope, '私人')
  assert.equal(created.items[0]!.value.enabled, true)

  // Private by default: Bob and Carol cannot see it
  const bobBefore = (await asUser(bob.id, () => db.list('/mcp'))) as { items: Array<{ id: string }> }
  assert.equal(bobBefore.items.some((r) => r.id === serverId), false)

  // Ada shares it with Bob as viewer (3-state: shared)
  asUser(ada.id, () => collab.shareWithEmail(ada.id, '/mcp', serverId, bob.email, 'viewer', 'internal'))

  const readRecord = async (accountId: string, path: string) => {
    const res = await asUser(accountId, () => db.read(path))
    assert.equal(res.kind, 'record')
    return (res as { kind: 'record'; value: Record<string, unknown> }).value
  }

  // Bob sees the shared server (including config/headers), but enabled defaults to false for Bob!
  const bobRow = await readRecord(bob.id, `/mcp/${serverId}`)
  assert.equal(bobRow.shareScope, '共享')
  assert.equal(bobRow.url, 'https://mcp.example.com/sse')
  assert.deepEqual(bobRow.headers, ['Authorization: Bearer shared-token-123'])
  assert.equal(bobRow.enabled, false)

  // Bob (even as viewer) can enable it for himself via action or enabled-only update
  await asUser(bob.id, () => db.action(`/mcp/${serverId}`, 'enable'))
  const bobAfterEnable = await readRecord(bob.id, `/mcp/${serverId}`)
  assert.equal(bobAfterEnable.enabled, true)
  assert.equal(connectedByAccount.get(bob.id)?.has(serverId), true)

  // Bob as viewer CANNOT modify shared server url/headers
  await assert.rejects(() =>
    asUser(bob.id, () => db.update(`/mcp/${serverId}`, { url: 'https://evil.example.com' })),
  )

  // Ada disables it for herself -> Ada sees enabled=false, Bob STILL sees enabled=true!
  await asUser(ada.id, () => db.update(`/mcp/${serverId}`, { enabled: false }))
  const adaAfterDisable = await readRecord(ada.id, `/mcp/${serverId}`)
  assert.equal(adaAfterDisable.enabled, false)
  const bobStillEnabled = await readRecord(bob.id, `/mcp/${serverId}`)
  assert.equal(bobStillEnabled.enabled, true)

  // Ada upgrades to workspace-wide (3-state: workspace) -> Carol now sees it (default disabled)
  asUser(ada.id, () => collab.setRecordAccessMode(ada.id, '/mcp', serverId, 'members', 'viewer'))
  const carolRow = await readRecord(carol.id, `/mcp/${serverId}`)
  assert.equal(carolRow.shareScope, '空间')
  assert.equal(carolRow.enabled, false)
})

test('MCP blank drafts across workspaces allocate globally unique ids without 409 collision', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'biu-mcp-multi-ws-'))
  tempDirs.push(dir)
  process.env.BIU_ONLINE = '1'
  process.env.BIU_HOME = dir
  process.env.BIU_DATA_DIR = dir

  const ctx = new Context()
  const db = new DatabaseService(ctx)
  const collab = new CollabStore(openAndMigrateBiu(join(dir, 'biu.sqlite')))
  class AccountBridge extends Service {
    store = collab
    authorization = collab.authorization
    workspaceLocation = () => 'cloud' as const
    constructor(inner: Context) {
      super(inner, 'account')
    }
  }
  await ctx.plugin(AccountBridge)

  const mcp = new McpService(ctx)
  db.register(mcpCollection(mcp))

  const ada = collab.register('', Date.now(), 'secret1', 'mcp-ws-ada@example.com')
  const bob = collab.register('', Date.now(), 'secret1', 'mcp-ws-bob@example.com')
  const wsA = collab.createWorkspace(ada.id, 'MCP WS A')
  const wsB = collab.createWorkspace(bob.id, 'MCP WS B')
  collab.setActive(ada.id, wsA.id)
  collab.setActive(bob.id, wsB.id)

  const asCtx = <T>(workspaceId: string, accountId: string, fn: () => T) =>
    runWithRequestWorkspace(workspaceId, () => runWithAccount(accountId, fn))

  const draftA = await asCtx(wsA.id, ada.id, () => db.create('/mcp', [{}]))
  const draftB = await asCtx(wsB.id, bob.id, () => db.create('/mcp', [{}]))
  const idA = String(draftA.items[0]!.value.id)
  const idB = String(draftB.items[0]!.value.id)
  assert.match(idA, /^new-server-[0-9a-f]{8}$/)
  assert.match(idB, /^new-server-[0-9a-f]{8}$/)
  assert.notEqual(idA, idB)

  // Creating a named server colliding with another workspace fails cleanly and rolls back the temp draft
  await asCtx(wsA.id, ada.id, () =>
    db.create('/mcp', [{ title: 'shared-mcp', transport: 'http', url: 'https://a.example.com/mcp', enabled: false }]),
  )
  await assert.rejects(() =>
    asCtx(wsB.id, bob.id, () =>
      db.create('/mcp', [{ title: 'shared-mcp', transport: 'http', url: 'https://b.example.com/mcp', enabled: false }]),
    ),
  )
  const wsBRows = (await asCtx(wsB.id, bob.id, () => db.list('/mcp'))) as { items: Array<{ id: string }> }
  assert.deepEqual(
    wsBRows.items.map((r) => r.id).filter((id) => id !== 'echo'),
    [idB],
  )
})
