import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { Context, Service } from 'cordis'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { openAndMigrateBiu, runWithAccount, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import { CollabStore } from '@biu/host-account/store'
import { workspaceMembersCollection } from '@biu/host-account/workspace-members-collection'
import { REQUIRED_RECORD_FIELDS, type CollectionSpec, type DbRecord } from '@biu/type-file-system'
import { DatabaseService } from './index.ts'
import { SavedViewsStore } from './saved-views.ts'
import { registerDatabaseHttpRoutes } from './http-routes.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

type RouteHandler = (route: {
  params: Record<string, string>
  query: URLSearchParams
  req: { headers: Record<string, string> }
  res: { writeHead: () => void; end: () => void }
  json: () => Promise<unknown>
  bytes: () => Promise<Uint8Array>
  send: (status: number, body: unknown) => void
}) => unknown | Promise<unknown>

function createMockHttp() {
  const routes: Array<{ method: string; pattern: string; handler: RouteHandler }> = []
  return {
    route(method: string, pattern: string, handler: RouteHandler) {
      routes.push({ method: method.toUpperCase(), pattern, handler })
    },
    broadcast() {},
    async call(method: string, urlPath: string, body?: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
      const [pathname, rawQuery = ''] = urlPath.split('?')
      const segments = pathname!.split('/').filter(Boolean)
      for (const entry of routes) {
        if (entry.method !== method.toUpperCase()) continue
        const pSegs = entry.pattern.split('/').filter(Boolean)
        if (pSegs.length !== segments.length) continue
        const params: Record<string, string> = {}
        let ok = true
        for (let i = 0; i < pSegs.length; i += 1) {
          if (pSegs[i]!.startsWith(':')) {
            params[pSegs[i]!.slice(1)] = decodeURIComponent(segments[i]!)
          } else if (pSegs[i] !== segments[i]) {
            ok = false
            break
          }
        }
        if (!ok) continue
        let status = 200
        let sent: unknown = null
        await entry.handler({
          params,
          query: new URLSearchParams(rawQuery),
          req: { headers: {} },
          res: { writeHead() {}, end() {} },
          json: async () => body,
          bytes: async () => new Uint8Array(),
          send: (s, b) => {
            status = s
            sent = b
          },
        })
        return { status, body: (sent ?? {}) as Record<string, unknown> }
      }
      throw new Error(`unmatched route: ${method} ${urlPath}`)
    },
  }
}

async function setupHttpEnv() {
  const dir = mkdtempSync(join(tmpdir(), 'biu-batch-mv-'))
  dirs.push(dir)
  const dbPath = join(dir, 'biu.sqlite')
  const collab = new CollabStore(openAndMigrateBiu(dbPath))
  const http = createMockHttp()
  const ctx = new Context()
  ;(ctx as unknown as { http: typeof http }).http = http
  const db = new DatabaseService(ctx)
  db.shares.open(dbPath)
  db.tags.open(dbPath)
  const savedViews = new SavedViewsStore().open(dbPath)

  const docs = new Map<string, DbRecord>()
  const docsSpec: CollectionSpec = {
    id: 'docs',
    path: '/docs',
    label: '文档',
    schema: {
      labelField: 'title',
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', writable: true },
        status: { type: 'select', writable: true, enum: ['draft', 'done'] },
      },
    },
    records: { create: true, update: true, delete: true },
    list: () => [...docs.values()],
    get: (id) => docs.get(id) ?? null,
    create: (records) =>
      records.map((rec, i) => {
        const id = String(rec.id ?? `doc_${docs.size + i + 1}`)
        const saved: DbRecord = { id, title: String(rec.title ?? ''), status: String(rec.status ?? 'draft') }
        docs.set(id, saved)
        return saved
      }),
    update: (id, patch) => {
      const next = { ...docs.get(id)!, ...patch, id }
      docs.set(id, next)
      return next
    },
    remove: (q) => {
      for (const id of q.ids ?? []) docs.delete(id)
      return q.ids ?? []
    },
  }
  db.register(docsSpec)
  db.register(workspaceMembersCollection(collab))

  class AccountBridge extends Service {
    store = collab
    authorization = collab.authorization
    workspaceLocation = () => 'cloud' as const
    constructor(inner: Context) {
      super(inner, 'account')
    }
  }
  await ctx.plugin(AccountBridge)

  const ada = collab.register('Ada', Date.now(), 'secret1', 'ada@example.com')
  const bob = collab.register('Bob', Date.now(), 'secret1', 'bob@example.com')
  const cara = collab.register('Cara', Date.now(), 'secret1', 'cara@example.com')
  const ws = collab.createWorkspace(ada.id, 'Acme')
  collab.addMemberByEmail(ada.id, ws.id, bob.email)
  collab.addMemberByEmail(ada.id, ws.id, cara.email)
  collab.updateMemberRole(ada.id, ws.id, cara.id, 'viewer')
  collab.setActive(ada.id, ws.id)
  collab.setActive(bob.id, ws.id)
  collab.setActive(cara.id, ws.id)

  savedViews.setWorkspaceResolver(() => ws.id)
  savedViews.setPolicyGuard({
    workspaceOwner: () => ada.id,
    isWorkspaceAdmin: (_wsId, accId) => {
      const r = collab.memberRole(accId, ws.id)
      return r === 'owner' || r === 'admin'
    },
    memberViewGrantCount: (wsId, viewId) => collab.memberViewGrantCount(wsId, viewId),
    onMemberViewChanged: () => collab.authorization.invalidateAll(),
  })
  collab.authorization.setMemberViewLockChecker((wsId, viewId) => savedViews.isLockedMemberView(wsId, viewId))
  collab.authorization.setMemberViewMatcher((wsId, viewId, accId) => {
    const view = savedViews.getMemberView(wsId, viewId)
    if (!view || view.protection !== 'locked') return false
    const m = collab.memberById(wsId, accId)
    if (!m) return false
    const roleFilter = view.filters?.role
    if (roleFilter && m.role !== roleFilter) return false
    return true
  })

  registerDatabaseHttpRoutes(ctx, db, {
    savedViews,
    shares: db.shares,
    tags: db.tags,
    assets: db.assets,
    activeDataLocation: () => 'cloud',
  })

  const asUser = <T>(accId: string, fn: () => Promise<T> | T) =>
    runWithRequestWorkspace(ws.id, () => runWithAccount(accId, fn))

  return { db, collab, savedViews, http, ws, ada, bob, cara, asUser }
}

test('member views API supports locked dynamic groups, unlocked snapshot resolve, and freeze/revoke release', async () => {
  const { db, collab, savedViews, http, ada, bob, cara, asUser } = await setupHttpEnv()

  // Admin creates a locked member view (role=member -> matches Bob) and Bob creates a personal shortcut view
  savedViews.applyPatch(
    '/workspace-members',
    { upsert: [{ id: 'mv-editors', name: '编辑成员', protection: 'locked', scope: 'workspace', filters: { role: 'member' } }] },
    ada.id,
  )
  savedViews.applyPatch(
    '/workspace-members',
    { upsert: [{ id: 'mv-bob-shortcut', name: 'Bob快捷名单', protection: 'personal', scope: 'personal', filters: { role: 'viewer' } }] },
    bob.id,
  )

  // Ada sees locked view, NOT Bob's personal view
  const adaViewsRes = await asUser(ada.id, () => http.call('GET', '/api/db/member-views'))
  assert.equal(adaViewsRes.status, 200)
  const adaViews = adaViewsRes.body.views as Array<{ id: string; isLocked: boolean; memberCount: number; grantCount: number }>
  assert.deepEqual(adaViews.map((v) => v.id), ['mv-editors'])
  assert.equal(adaViews[0]?.isLocked, true)
  assert.equal(adaViews[0]?.memberCount, 1)

  // Bob sees both locked view and his own personal shortcut view, and can resolve shortcut members
  const bobResolve = await asUser(bob.id, () => http.call('GET', '/api/db/member-views/mv-bob-shortcut/resolve'))
  assert.equal(bobResolve.status, 200)
  assert.deepEqual((bobResolve.body.members as Array<{ id: string }>).map((m) => m.id), [cara.id])
  // Ada cannot resolve Bob's personal view
  const adaResolveBob = await asUser(ada.id, () => http.call('GET', '/api/db/member-views/mv-bob-shortcut/resolve'))
  assert.equal(adaResolveBob.status, 404)

  // Ada creates a private doc and grants mv-editors dynamically
  await asUser(ada.id, () => db.create('/docs', [{ id: 'd1', title: '内部方案' }], { scope: 'personal' }))
  await asUser(ada.id, () => collab.grantMemberView(ada.id, '/docs', 'd1', 'mv-editors', 'editor'))

  // Bob can read d1 via mv-editors; silent unlock is blocked by MEMBER_VIEW_REFERENCED
  assert.equal((await asUser(bob.id, () => db.list('/docs'))).items.length, 1)
  assert.throws(
    () =>
      savedViews.applyPatch(
        '/workspace-members',
        { upsert: [{ id: 'mv-editors', name: '编辑成员', protection: 'public', scope: 'workspace', filters: { role: 'member' } }] },
        ada.id,
      ),
    /MEMBER_VIEW_REFERENCED/,
  )

  // Non-admin cannot call release
  const bobRelease = await asUser(bob.id, () =>
    http.call('POST', '/api/db/member-views/mv-editors/release', { action: 'unlock', mode: 'freeze' }),
  )
  assert.equal(bobRelease.status, 403)

  // Admin releases with mode='freeze' -> Bob's access is frozen to static account grant and view becomes unlocked
  const freezeRes = await asUser(ada.id, () =>
    http.call('POST', '/api/db/member-views/mv-editors/release', { action: 'unlock', mode: 'freeze', targetProtection: 'public' }),
  )
  assert.equal(freezeRes.status, 200)
  assert.equal(freezeRes.body.frozenRecords, 1)
  assert.equal(freezeRes.body.expandedGrants, 1)
  assert.equal(savedViews.isLockedMemberView(collab.activeWorkspaceId()!, 'mv-editors'), false)
  // Bob STILL reads d1 via the frozen static grant!
  assert.equal((await asUser(bob.id, () => db.list('/docs'))).items.length, 1)

  // Re-lock and test mode='revoke' + action='delete'
  savedViews.applyPatch(
    '/workspace-members',
    { upsert: [{ id: 'mv-editors', name: '编辑成员', protection: 'locked', scope: 'workspace', filters: { role: 'member' } }] },
    ada.id,
  )
  await asUser(ada.id, () => db.create('/docs', [{ id: 'd2', title: '机密方案' }], { scope: 'personal' }))
  await asUser(ada.id, () => collab.grantMemberView(ada.id, '/docs', 'd2', 'mv-editors', 'viewer'))
  assert.equal((await asUser(bob.id, () => db.list('/docs'))).items.some((r) => r.id === 'd2'), true)

  const revokeDel = await asUser(ada.id, () =>
    http.call('POST', '/api/db/member-views/mv-editors/release', { action: 'delete', mode: 'revoke' }),
  )
  assert.equal(revokeDel.status, 200)
  assert.equal(revokeDel.body.revokedRecords, 1)
  assert.equal(savedViews.getMemberView(collab.activeWorkspaceId()!, 'mv-editors'), null)
  // Bob loses access to d2 immediately after revoke
  assert.equal((await asUser(bob.id, () => db.list('/docs'))).items.some((r) => r.id === 'd2'), false)
})

test('batch permissions API previews manageable counts, skips unmanageable records, and applies in single transaction', async () => {
  const { db, http, ada, bob, cara, asUser } = await setupHttpEnv()

  // Ada creates 2 docs (done & draft), Bob creates 2 docs (done & draft)
  await asUser(ada.id, () =>
    db.create(
      '/docs',
      [
        { id: 'a-done', title: 'Ada Done', status: 'done' },
        { id: 'a-draft', title: 'Ada Draft', status: 'draft' },
      ],
      { scope: 'workspace' },
    ),
  )
  await asUser(bob.id, () =>
    db.create(
      '/docs',
      [
        { id: 'b-done', title: 'Bob Done', status: 'done' },
        { id: 'b-draft', title: 'Bob Draft', status: 'draft' },
      ],
      { scope: 'personal' },
    ),
  )

  // Bob previews batch over filter { status: 'done' } -> sees a-done (workspace viewer/editor, not manageable) + b-done (owner, manageable)
  const preview = await asUser(bob.id, () =>
    http.call('POST', '/api/db/batch-permissions/preview', {
      collection: '/docs',
      filter: { status: 'done' },
    }),
  )
  assert.equal(preview.status, 200)
  assert.equal(preview.body.totalCount, 2)
  assert.equal(preview.body.manageableCount, 1)
  assert.equal(preview.body.skippedCount, 1)

  // Bob applies batch grant to Cara over filter { status: 'done' } -> updates ONLY b-done, skips a-done
  const applyGrant = await asUser(bob.id, () =>
    http.call('POST', '/api/db/batch-permissions/apply', {
      collection: '/docs',
      filter: { status: 'done' },
      mode: 'grant',
      role: 'viewer',
      subjects: [{ type: 'account', id: cara.id }],
    }),
  )
  assert.equal(applyGrant.status, 200)
  assert.equal(applyGrant.body.updatedCount, 1)
  assert.equal(applyGrant.body.skippedCount, 1)
  assert.deepEqual(applyGrant.body.updatedIds, ['b-done'])
  assert.equal((await asUser(cara.id, () => db.list('/docs'))).items.some((r) => r.id === 'b-done'), true)

  // Bob switches b-done & b-draft to members via recordIds mode (does NOT wipe Cara's explicit grant!)
  const applyMode = await asUser(bob.id, () =>
    http.call('POST', '/api/db/batch-permissions/apply', {
      collection: '/docs',
      recordIds: ['b-done', 'b-draft'],
      mode: 'access_mode',
      accessMode: 'members',
      memberDefaultRole: 'viewer',
    }),
  )
  assert.equal(applyMode.status, 200)
  assert.equal(applyMode.body.updatedCount, 2)
  assert.equal((await asUser(ada.id, () => db.list('/docs'))).items.some((r) => r.id === 'b-draft'), true)

  // Bob switches back to private -> Cara STILL retains her explicit grant on b-done, loses access to b-draft!
  await asUser(bob.id, () =>
    http.call('POST', '/api/db/batch-permissions/apply', {
      collection: '/docs',
      recordIds: ['b-done', 'b-draft'],
      mode: 'access_mode',
      accessMode: 'private',
    }),
  )
  const caraAfter = await asUser(cara.id, () => db.list('/docs'))
  assert.equal(caraAfter.items.some((r) => r.id === 'b-done'), true)
  assert.equal(caraAfter.items.some((r) => r.id === 'b-draft'), false)

  // Bob revokes Cara's grant on b-done -> Cara loses access to b-done
  const applyRevoke = await asUser(bob.id, () =>
    http.call('POST', '/api/db/batch-permissions/apply', {
      collection: '/docs',
      recordIds: ['b-done'],
      mode: 'revoke',
      subjects: [{ type: 'account', id: cara.id }],
    }),
  )
  assert.equal(applyRevoke.status, 200)
  assert.equal(applyRevoke.body.updatedCount, 1)
  assert.equal((await asUser(cara.id, () => db.list('/docs'))).items.some((r) => r.id === 'b-done'), false)
})
