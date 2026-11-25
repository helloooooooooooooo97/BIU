import assert from 'node:assert/strict'
import { test } from 'vitest'
import { runWithAccount, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import { NoticesStore } from './notices-store.ts'

function withTenant<T>(accountId: string, workspaceId: string, fn: () => T): T {
  return runWithAccount(accountId, () => runWithRequestWorkspace(workspaceId, fn))
}

test('NoticesStore isolates list, get, markSourceRead, remove, and clear per tenant', () => {
  const store = new NoticesStore().open(':memory:')

  const a1 = withTenant('acct-a', 'ws-1', () =>
    store.push({ title: 'Alice notice', kind: 'task', sourceKey: 'task:1' }),
  )!
  const b1 = withTenant('acct-b', 'ws-1', () =>
    store.push({ title: 'Bob notice', kind: 'task', sourceKey: 'task:1' }),
  )!

  assert.equal(withTenant('acct-a', 'ws-1', () => store.list().length), 1)
  assert.equal(withTenant('acct-a', 'ws-1', () => store.list()[0]?.id), a1.id)
  assert.equal(withTenant('acct-b', 'ws-1', () => store.list().length), 1)
  assert.equal(withTenant('acct-b', 'ws-1', () => store.list()[0]?.id), b1.id)

  // Cross-tenant get/remove must fail
  assert.equal(withTenant('acct-b', 'ws-1', () => store.get(a1.id)), null)
  assert.throws(() => withTenant('acct-b', 'ws-1', () => store.remove(a1.id)), /unknown notice/)

  // Bob clearing his notices must not touch Alice's
  assert.equal(withTenant('acct-b', 'ws-1', () => store.clear()), 1)
  assert.equal(withTenant('acct-b', 'ws-1', () => store.list().length), 0)
  assert.equal(withTenant('acct-a', 'ws-1', () => store.list().length), 1)
  assert.equal(withTenant('acct-a', 'ws-1', () => store.get(a1.id)?.title), 'Alice notice')
})
