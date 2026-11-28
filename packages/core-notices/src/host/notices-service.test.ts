import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context, Service } from 'cordis'
import { apply } from './notices-service.ts'

test('notices plugin registers /notices when database is present', async () => {
  const ctx = new Context()
  const paths: string[] = []
  const routes: string[] = []
  const accountEvents: Array<{ accountId: string; type: string }> = []
  class DatabaseStub extends Service {
    constructor(c: Context) {
      super(c, 'database')
    }
    register(spec: { path: string }) {
      paths.push(spec.path)
    }
  }
  class HttpStub extends Service {
    constructor(c: Context) {
      super(c, 'http')
    }
    route(_method: string, pattern: string) {
      routes.push(pattern)
    }
    broadcastAccount(accountId: string, type: string) {
      accountEvents.push({ accountId, type })
    }
    broadcast() {}
  }
  new DatabaseStub(ctx)
  new HttpStub(ctx)
  await ctx.plugin({ apply })
  assert.equal(paths.includes('/notices'), true)
  assert.equal(routes.includes('/api/db/notices/clear'), true)
  assert.equal(routes.includes('/api/db/notices/read-all'), true)
  const svc = ctx.get('notices')
  assert.ok(svc)
  svc.push({ kind: 'channel', title: '@了你', sourceKey: 'channel-mention:c1', accountId: 'acct-bob', workspaceId: 'ws-1' })
  assert.deepEqual(accountEvents, [{ accountId: 'acct-bob', type: 'notices/change' }])
})
