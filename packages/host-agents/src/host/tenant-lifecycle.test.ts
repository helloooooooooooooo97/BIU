import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Context } from 'cordis'
import { runWithAccount, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import { emitTenantRevoked, emitWorkspaceDeleted } from '@biu/host-plugin-loader/tenant-state'
import { AgentsService } from './index.ts'

test('host-agents disposes live agents on tenant/revoked and workspace/deleted events', async () => {
  const ctx = new Context()
  const store = new Map<string, { id: string; version: number; events: unknown[] }>()
  ctx.provide('sessions')
  ctx.set('sessions', {
    get: async (id: string) => store.get(id) ?? null,
    create: async (id = `s-${store.size + 1}`) => {
      const rec = { id, version: 1, events: [] }
      store.set(id, rec)
      return rec
    },
  } as never)
  ctx.provide('agentLoop')
  ctx.set('agentLoop', { run: async () => ({ text: '', steps: [] }) } as never)

  const agents = new AgentsService(ctx)

  await runWithAccount('acc-a', () => runWithRequestWorkspace('ws-a', () => agents.create('sess-a')))
  await runWithAccount('acc-b', () => runWithRequestWorkspace('ws-b', () => agents.create('sess-b')))

  assert.ok(agents.get('sess-a'))
  assert.ok(agents.get('sess-b'))

  // Revoking acc-a in ws-a disposes sess-a only
  emitTenantRevoked(ctx, { accountId: 'acc-a', workspaceId: 'ws-a' })
  assert.equal(agents.get('sess-a'), undefined)
  assert.ok(agents.get('sess-b'))

  // Deleting ws-b disposes sess-b
  emitWorkspaceDeleted(ctx, 'ws-b')
  assert.equal(agents.get('sess-b'), undefined)
})
