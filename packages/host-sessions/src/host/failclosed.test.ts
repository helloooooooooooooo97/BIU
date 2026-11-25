import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { Context } from 'cordis'
import { SessionsService } from './index.ts'

const originalOnline = process.env.BIU_ONLINE

afterEach(() => {
  if (originalOnline === undefined) delete process.env.BIU_ONLINE
  else process.env.BIU_ONLINE = originalOnline
})

test('host-sessions inWorkspace fails closed in cloud RBAC mode when actor or workspace is missing', () => {
  process.env.BIU_ONLINE = '1'
  const ctx = new Context()
  ctx.provide('sessionStore')
  ctx.set('sessionStore', {
    get: async () => null,
    put: async () => {},
    list: async () => [],
    listSummaries: async () => [],
    delete: async () => false,
  } as never)
  ctx.provide('account')
  ctx.set('account', {
    authorization: {
      currentActor: () => null,
      authorize: () => ({ allowed: false }),
    },
    store: {
      activeWorkspaceId: () => null,
      membership: () => ({ active: null, home: null, mine: new Set(), any: new Set(), strict: true }),
      attach: () => {},
    },
  } as never)

  const sessions = new SessionsService(ctx)
  assert.equal(sessions.inWorkspace('sess-victim'), false)
})
