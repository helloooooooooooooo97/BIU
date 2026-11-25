import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Context } from 'cordis'
import { HttpService } from './index.ts'

test('host-http disconnectTenantSockets closes only matching tenant sockets with 4403', () => {
  const ctx = new Context()
  const http = new HttpService(ctx, { port: 0 } as never)

  const closedCalls: Array<{ id: string; code: number; reason: string }> = []
  const makeSocket = (id: string) =>
    ({
      readyState: 1,
      OPEN: 1,
      close(code: number, reason: string) {
        closedCalls.push({ id, code, reason })
      },
      terminate() {
        closedCalls.push({ id, code: -1, reason: 'terminate' })
      },
    }) as never

  const sockA = makeSocket('sock-a')
  const sockB = makeSocket('sock-b')

  const internal = http as unknown as {
    registerSocket: (socket: unknown, meta: { accountId?: string; workspaceId?: string; token: string }) => void
  }
  internal.registerSocket(sockA, { accountId: 'acc-a', workspaceId: 'ws-a', token: 'tok-a' })
  internal.registerSocket(sockB, { accountId: 'acc-b', workspaceId: 'ws-b', token: 'tok-b' })

  const closed = http.disconnectTenantSockets(
    (meta) => meta.accountId === 'acc-a' && meta.workspaceId === 'ws-a',
    'tenant revoked',
  )
  assert.equal(closed, 1)
  assert.deepEqual(closedCalls, [{ id: 'sock-a', code: 4403, reason: 'tenant revoked' }])

  // Second call for ws-b closes sock-b
  const closed2 = http.disconnectTenantSockets((meta) => meta.workspaceId === 'ws-b', 'workspace deleted')
  assert.equal(closed2, 1)
  assert.equal(closedCalls.length, 2)
  assert.deepEqual(closedCalls[1], { id: 'sock-b', code: 4403, reason: 'workspace deleted' })
})
