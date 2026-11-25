import assert from 'node:assert/strict'
import { afterEach, test, vi } from 'vitest'
import { Context } from 'cordis'
import { runWithAccount } from '@biu/host-plugin-loader/data-dir'

vi.mock('./git.ts', () => ({
  behindMain: async () => 0,
  fetchMain: async () => {},
  mergeMain: async () => {},
  scheduleRestart: () => {},
  updateSource: () => ({ remote: 'origin', ref: 'main' }),
}))

import * as updatePlugin from './index.ts'

type RouteHandler = (route: {
  send(status: number, body: unknown): void
}) => Promise<void> | void

const originalOnline = process.env.BIU_ONLINE

afterEach(() => {
  if (originalOnline === undefined) delete process.env.BIU_ONLINE
  else process.env.BIU_ONLINE = originalOnline
})

test('host-update rejects non-super-admin on GET and POST /api/update in cloud RBAC mode', async () => {
  process.env.BIU_ONLINE = '1'
  const routes = new Map<string, RouteHandler>()

  const ctx = new Context()
  ctx.provide('http')
  ctx.set('http', {
    route(method: string, path: string, handler: RouteHandler) {
      routes.set(`${method} ${path}`, handler)
    },
  } as never)
  ctx.provide('account')
  ctx.set('account', {
    store: {
      isSuperAdmin: (accountId: string) => accountId === 'acc-super',
    },
  } as never)

  await ctx.plugin(updatePlugin)

  const getHandler = routes.get('GET /api/update')
  const postHandler = routes.get('POST /api/update')
  assert.ok(getHandler, 'GET /api/update should be registered')
  assert.ok(postHandler, 'POST /api/update should be registered')

  // Unauthenticated request in cloud RBAC mode -> 403
  for (const handler of [getHandler, postHandler]) {
    let status = 0
    let body: unknown
    await handler({
      send(s, b) {
        status = s
        body = b
      },
    })
    assert.equal(status, 403)
    assert.match(String((body as { error?: string })?.error ?? ''), /超级管理员/)
  }

  // Regular authenticated user -> 403
  for (const handler of [getHandler, postHandler]) {
    let status = 0
    await runWithAccount('acc-regular', async () => {
      await handler({
        send(s) {
          status = s
        },
      })
    })
    assert.equal(status, 403)
  }

  // Super-admin passes the authz guard (GET returns 200)
  let superStatus = 0
  await runWithAccount('acc-super', async () => {
    await getHandler({
      send(s) {
        superStatus = s
      },
    })
  })
  assert.equal(superStatus, 200)
})
