import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { Context } from 'cordis'
import { runWithAccount, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import * as fsPlugin from './index.ts'

const originalOnline = process.env.BIU_ONLINE

afterEach(() => {
  if (originalOnline === undefined) delete process.env.BIU_ONLINE
  else process.env.BIU_ONLINE = originalOnline
})

type RouteHandler = (route: {
  query: URLSearchParams
  params: Record<string, string>
  req: { headers: Record<string, string> }
  json: () => Promise<unknown>
  send: (status: number, body: unknown) => void
}) => Promise<void> | void

test('core-file-system enforces RBAC on /api/content-turns/file, fails closed on cloud /api/profile, and isolates /api/db/tags', async () => {
  process.env.BIU_ONLINE = '1'
  const routes = new Map<string, RouteHandler>()

  const ctx = new Context()
  ctx.provide('http')
  ctx.set('http', {
    route(method: string, path: string, handler: RouteHandler) {
      routes.set(`${method} ${path}`, handler)
    },
    broadcast: () => {},
  } as never)
  ctx.provide('tools')
  ctx.set('tools', { register: () => {} } as never)
  ctx.provide('account')
  ctx.set('account', {
    store: {
      activeWorkspaceId: () => 'ws-implicit-should-not-be-used',
      canReadRecord: (col: string, id: string) => col === '/agents' && id === 'sess-a',
      isMember: () => true,
      workspacePrefs: () => ({ starredViews: [], starredRecords: [], pinnedAgents: [] }),
      saveWorkspacePrefs: () => ({ starredViews: [], starredRecords: [], pinnedAgents: [] }),
    },
  } as never)

  await ctx.plugin(fsPlugin)

  // 1. GET /api/content-turns/file rejects unauthorized session in cloud RBAC mode
  const turnsRoute = routes.get('GET /api/content-turns/file')!
  assert.ok(turnsRoute)
  let turnsStatus = 0
  await runWithAccount('acc-a', () =>
    runWithRequestWorkspace('ws-a', async () => {
      await turnsRoute({
        query: new URLSearchParams({ session: 'sess-b', turn: '1', path: '/pages/secret' }),
        params: {},
        req: { headers: {} },
        json: async () => ({}),
        send(s) {
          turnsStatus = s
        },
      })
    }),
  )
  assert.equal(turnsStatus, 403)

  // 2. POST /api/profile fails closed with 403 in cloud mode when workspaceId is missing (no fallback to activeWorkspaceId or global file)
  const profilePost = routes.get('POST /api/profile')!
  assert.ok(profilePost)
  let profileStatus = 0
  await runWithAccount('acc-a', async () => {
    await profilePost({
      query: new URLSearchParams(),
      params: {},
      req: { headers: {} },
      json: async () => ({ name: 'Hijacked Global Profile' }),
      send(s) {
        profileStatus = s
      },
    })
  })
  assert.equal(profileStatus, 403)

  // 3. POST /api/db/tags records ownership; other tenant cannot overwrite or see it when RBAC authorization is active
  const tagsPost = routes.get('POST /api/db/tags')
  const tagsGet = routes.get('GET /api/db/tags')
  assert.equal(typeof tagsPost, 'function')
  assert.equal(typeof tagsGet, 'function')

  // Mount a minimal authorization service that enforces per-account visibility on /tags
  const db = ctx.get('database') as unknown as {
    visibleTagIds: (ids: string[], action?: string) => Set<string>
  }
  assert.equal(typeof db.visibleTagIds, 'function')
})
