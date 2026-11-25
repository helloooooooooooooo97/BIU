import assert from 'node:assert/strict'
import { test } from 'vitest'
import { deliverTenantEvent } from './index.ts'

test('deliverTenantEvent isolates arbitrary plugin events by default and only broadcasts explicit global events', () => {
  const tenantA = { workspaceId: 'ws-a', accountId: 'acc-a' }

  // Unknown/plugin events (like mascot) must NOT leak across workspaces or accounts
  assert.equal(deliverTenantEvent(tenantA, 'mascot', { workspaceId: 'ws-b', accountId: 'acc-b' }), false)
  assert.equal(deliverTenantEvent(tenantA, 'mascot', { workspaceId: 'ws-a', accountId: 'acc-b' }), false)
  assert.equal(deliverTenantEvent(tenantA, 'mascot'), false)
  assert.equal(deliverTenantEvent(tenantA, 'mascot', { workspaceId: 'ws-a', accountId: 'acc-a' }), true)
  assert.equal(deliverTenantEvent(tenantA, 'custom/plugin-event', { workspaceId: 'ws-b' }), false)

  // Explicit global invalidation / clock events still deliver globally
  assert.equal(deliverTenantEvent(tenantA, 'plugins/changed'), true)
  assert.equal(deliverTenantEvent(tenantA, 'clock', { workspaceId: 'ws-b' }), true)
})
