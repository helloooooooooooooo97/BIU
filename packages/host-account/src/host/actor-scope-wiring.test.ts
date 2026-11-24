import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { openAndMigrateBiu, runWithAccount, runWithActorContext, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import { CollabStore } from './store.ts'

describe('Production Agent & MCP actor scope wiring via AsyncLocalStorage', () => {
  it('attenuates currentActor() for agent and mcp contexts using stored actor_scopes', () => {
    const dir = mkdtempSync(join(tmpdir(), 'biu-actor-scope-'))
    const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
    try {
      const store = new CollabStore(db)
      const owner = store.register('Owner', Date.now(), 'pass123456', 'owner@example.com')
      const ws = store.createWorkspace(owner.id, 'Team WS')
      store.attach(ws.id, '/pages', 'p1', Date.now(), { accessMode: 'members', memberDefaultRole: 'editor' })
      store.attach(ws.id, '/secrets', 's1', Date.now(), { accessMode: 'members', memberDefaultRole: 'editor' })

      const auth = store.authorization

      // 1. Normal account request: owner has full update access to both /pages and /secrets
      runWithAccount(owner.id, () =>
        runWithRequestWorkspace(ws.id, () => {
          const acc = auth.currentActor()
          assert.equal(acc?.type, 'account')
          assert.equal(
            auth.authorize(acc, 'resource:update', { type: 'record', workspaceId: ws.id, collection: '/pages', recordId: 'p1' }).allowed,
            true,
          )
          assert.equal(
            auth.authorize(acc, 'resource:read', { type: 'record', workspaceId: ws.id, collection: '/secrets', recordId: 's1' }).allowed,
            true,
          )
        }),
      )

      // 2. Configure agent scope: maxRole=viewer, allowedCollections=['/pages']
      auth.setActorScope(ws.id, 'agent', 'sess-1', owner.id, {
        maxRole: 'viewer',
        allowedCollections: ['/pages'],
      })

      runWithAccount(owner.id, () =>
        runWithRequestWorkspace(ws.id, () =>
          runWithActorContext(
            { type: 'agent', actorId: 'sess-1', delegatedBy: owner.id, invokerId: owner.id },
            () => {
              const agent = auth.currentActor()
              assert.equal(agent?.type, 'agent')
              // Read /pages allowed
              assert.equal(
                auth.authorize(agent, 'resource:read', { type: 'record', workspaceId: ws.id, collection: '/pages', recordId: 'p1' }).allowed,
                true,
              )
              // Update /pages denied due to maxRole=viewer
              assert.equal(
                auth.authorize(agent, 'resource:update', { type: 'record', workspaceId: ws.id, collection: '/pages', recordId: 'p1' }).allowed,
                false,
              )
              // Read /secrets denied due to allowedCollections=['/pages']
              assert.equal(
                auth.authorize(agent, 'resource:read', { type: 'record', workspaceId: ws.id, collection: '/secrets', recordId: 's1' }).allowed,
                false,
              )
            },
          ),
        ),
      )

      // 3. Configure MCP scope and verify attenuation + immediate revocation
      auth.setActorScope(ws.id, 'mcp', 'cred-1', owner.id, {
        maxRole: 'viewer',
        allowedCollections: ['/pages'],
      })

      runWithAccount(owner.id, () =>
        runWithRequestWorkspace(ws.id, () =>
          runWithActorContext(
            { type: 'mcp', actorId: 'cred-1', delegatedBy: owner.id, invokerId: owner.id },
            () => {
              const mcp = auth.currentActor()
              assert.equal(mcp?.type, 'mcp')
              assert.equal(
                auth.authorize(mcp, 'resource:read', { type: 'record', workspaceId: ws.id, collection: '/pages', recordId: 'p1' }).allowed,
                true,
              )
              assert.equal(
                auth.authorize(mcp, 'resource:update', { type: 'record', workspaceId: ws.id, collection: '/pages', recordId: 'p1' }).allowed,
                false,
              )
            },
          ),
        ),
      )

      auth.revokeActorScope(ws.id, 'mcp', 'cred-1')
      runWithAccount(owner.id, () =>
        runWithRequestWorkspace(ws.id, () =>
          runWithActorContext(
            { type: 'mcp', actorId: 'cred-1', delegatedBy: owner.id, invokerId: owner.id },
            () => {
              const mcp = auth.currentActor()
              assert.equal(
                auth.authorize(mcp, 'resource:read', { type: 'record', workspaceId: ws.id, collection: '/pages', recordId: 'p1' }).allowed,
                false,
              )
            },
          ),
        ),
      )
    } finally {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
