import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { Context } from 'cordis'
import { HubService } from './index.ts'

const originalOnline = process.env.BIU_ONLINE

afterEach(() => {
  if (originalOnline === undefined) delete process.env.BIU_ONLINE
  else process.env.BIU_ONLINE = originalOnline
})

test('host-hub strips global debug events from snapshotFor for non-super-admins in cloud RBAC mode', () => {
  process.env.BIU_ONLINE = '1'
  const ctx = new Context()
  ctx.provide('http')
  ctx.set('http', {
    broadcast: () => {},
    listRoutes: () => [],
  } as never)
  ctx.provide('tools')
  ctx.set('tools', { names: () => [] } as never)
  ctx.provide('account')
  ctx.set('account', {
    store: {
      isSuperAdmin: (id: string) => id === 'acc-super',
      canAccessPlugin: () => true,
    },
  } as never)

  const hub = new HubService(ctx, [])
  // Emit a cross-tenant event into the global Cordis dispatch bus
  ;(ctx as unknown as { emit: (...args: unknown[]) => void }).emit('internal/dispatch', 'emit', 'session/event', [
    { sessionId: 'sess-secret', text: 'TOP_SECRET' },
  ])

  assert.ok(hub.listEvents().length >= 1, 'event should be recorded internally')

  const regularSnapshot = hub.snapshotFor('acc-user', 'ws-a')
  assert.deepEqual(regularSnapshot.events, [])

  const superSnapshot = hub.snapshotFor('acc-super', 'ws-a')
  assert.ok(superSnapshot.events.length >= 1)
})
