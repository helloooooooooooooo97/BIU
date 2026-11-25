import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Context } from 'cordis'
import { runWithAccount, runWithRequestWorkspace } from './data-dir.ts'
import { emitTenantRevoked, emitWorkspaceDeleted, TenantStateMap } from './tenant-state.ts'

function withTenant<T>(accountId: string, workspaceId: string, fn: () => T): T {
  return runWithAccount(accountId, () => runWithRequestWorkspace(workspaceId, fn))
}

test('TenantStateMap isolates tenant state and auto-disposes on tenant/revoked and workspace/deleted', () => {
  const ctx = new Context()
  const disposed: string[] = []
  const store = new TenantStateMap<string>(ctx, {
    onDispose: (value) => disposed.push(value),
  })

  withTenant('acct-a', 'ws-1', () => store.set('a-ws1'))
  withTenant('acct-a', 'ws-2', () => store.set('a-ws2'))
  withTenant('acct-b', 'ws-1', () => store.set('b-ws1'))
  assert.equal(store.size, 3)

  // Revoking acct-a in ws-1 disposes only a-ws1
  emitTenantRevoked(ctx, { accountId: 'acct-a', workspaceId: 'ws-1' })
  assert.deepEqual(disposed, ['a-ws1'])
  assert.equal(withTenant('acct-a', 'ws-1', () => store.get()), undefined)
  assert.equal(withTenant('acct-a', 'ws-2', () => store.get()), 'a-ws2')
  assert.equal(withTenant('acct-b', 'ws-1', () => store.get()), 'b-ws1')

  // Deleting ws-1 disposes b-ws1 without touching a-ws2
  emitWorkspaceDeleted(ctx, 'ws-1')
  assert.deepEqual(disposed, ['a-ws1', 'b-ws1'])
  assert.equal(store.size, 1)

  // Account-wide revocation disposes remaining a-ws2
  emitTenantRevoked(ctx, { accountId: 'acct-a' })
  assert.deepEqual(disposed, ['a-ws1', 'b-ws1', 'a-ws2'])
  assert.equal(store.size, 0)
})

test('TenantStateMap with account granularity ignores workspace-only revocation but clears on full account revoke', () => {
  const ctx = new Context()
  const modes = new TenantStateMap<'minimal' | 'standard'>(ctx, { granularity: 'account' })

  withTenant('acct-a', 'ws-1', () => modes.set('minimal'))
  emitTenantRevoked(ctx, { accountId: 'acct-a', workspaceId: 'ws-1' })
  assert.equal(withTenant('acct-a', 'ws-2', () => modes.get()), 'minimal')

  emitTenantRevoked(ctx, { accountId: 'acct-a' })
  assert.equal(withTenant('acct-a', 'ws-2', () => modes.get()), undefined)
})
