import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import { openAndMigrateBiu, runWithAccount } from '@biu/host-plugin-loader/data-dir'
import { CollabStore } from './store.ts'

function setupStore() {
  const dir = mkdtempSync(join(tmpdir(), 'biu-access-req-'))
  const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
  const store = new CollabStore(db)
  return {
    db,
    store,
    cleanup: () => {
      db.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

test('access request lifecycle: submit, deduplicate pending, approve with role adjustment, and reject concurrent re-approval', () => {
  const { store, cleanup } = setupStore()
  try {
    const ada = store.register('Ada', 1, 'secret1', 'ada@example.com')
    const bob = store.register('Bob', 2, 'secret1', 'bob@example.com')
    const cara = store.register('Cara', 3, 'secret1', 'cara@example.com')
    const ws = store.createWorkspace(ada.id, 'Team')
    store.addMemberByEmail(ada.id, ws.id, bob.email)
    store.addMemberByEmail(ada.id, ws.id, cara.email)
    store.setActive(ada.id, ws.id)
    store.setActive(bob.id, ws.id)
    store.setActive(cara.id, ws.id)

    runWithAccount(ada.id, () => store.attach(ws.id, '/pages', 'doc-1', 10, { accessMode: 'private' }))
    // Cara is explicit manager on doc-1
    store.authorization.grant(
      ada.id,
      { type: 'record', workspaceId: ws.id, collection: '/pages', recordId: 'doc-1' },
      'account',
      cara.id,
      'manager',
      11,
    )

    // Bob submits viewer request
    const first = runWithAccount(bob.id, () => store.createAccessRequest(bob.id, '/pages', 'doc-1', 'viewer', '请开只读', 100))
    assert.equal(first.submitted, true)
    assert.equal(first.delivered, true)
    assert.equal(first.updated, false)
    assert.equal(first.request?.requestedRole, 'viewer')
    assert.equal(first.request?.note, '请开只读')
    assert.deepEqual(first.approverIds, [ada.id, cara.id])

    // Duplicate pending request updates in place instead of creating a second row
    const second = runWithAccount(bob.id, () => store.createAccessRequest(bob.id, '/pages', 'doc-1', 'editor', '改申请编辑', 110))
    assert.equal(second.updated, true)
    assert.equal(second.request?.id, first.request?.id)
    assert.equal(second.request?.requestedRole, 'editor')
    assert.equal(second.request?.note, '改申请编辑')

    // Inbox visibility: Ada (owner) and Cara (manager) see it; Bob does not
    assert.equal(runWithAccount(ada.id, () => store.listAccessRequests(ada.id, { scope: 'inbox' })).length, 1)
    assert.equal(runWithAccount(cara.id, () => store.listAccessRequests(cara.id, { scope: 'inbox' })).length, 1)
    assert.equal(runWithAccount(bob.id, () => store.listAccessRequests(bob.id, { scope: 'inbox' })).length, 0)
    assert.equal(runWithAccount(bob.id, () => store.listAccessRequests(bob.id, { scope: 'mine' })).length, 1)

    // Bob cannot self-approve
    assert.throws(
      () => runWithAccount(bob.id, () => store.decideAccessRequest(bob.id, first.request!.id, 'approve')),
      /没有审批/,
    )

    // Cara approves and downgrades grantedRole to viewer
    const approved = runWithAccount(cara.id, () =>
      store.decideAccessRequest(cara.id, first.request!.id, 'approve', { grantedRole: 'viewer', decisionNote: '先给查看' }, 120),
    )
    assert.equal(approved.request.status, 'approved')
    assert.equal(approved.request.grantedRole, 'viewer')
    assert.equal(approved.request.handledBy, cara.id)

    // Second decision on the same request is rejected (idempotency / concurrency guard)
    assert.throws(
      () => runWithAccount(ada.id, () => store.decideAccessRequest(ada.id, first.request!.id, 'reject')),
      /已被处理/,
    )

    // Bob now has viewer access, can request upgrade to editor, but cannot re-request viewer
    const authRead = store.authorization.authorize(
      { type: 'account', accountId: bob.id, workspaceId: ws.id },
      'resource:read',
      { type: 'record', workspaceId: ws.id, collection: '/pages', recordId: 'doc-1' },
    )
    assert.equal(authRead.allowed, true)
    assert.equal(authRead.allowed && authRead.effectiveRole, 'viewer')

    assert.throws(
      () => runWithAccount(bob.id, () => store.createAccessRequest(bob.id, '/pages', 'doc-1', 'viewer')),
      /已经拥有该权限/,
    )
    const upgrade = runWithAccount(bob.id, () => store.createAccessRequest(bob.id, '/pages', 'doc-1', 'editor', '需要修改', 130))
    assert.equal(upgrade.delivered, true)
    assert.equal(upgrade.updated, false)
    assert.notEqual(upgrade.request?.id, first.request?.id)

    // Bob can cancel his own pending upgrade request
    const cancelled = runWithAccount(bob.id, () => store.cancelAccessRequest(bob.id, upgrade.request!.id, 140))
    assert.equal(cancelled.status, 'cancelled')
  } finally {
    cleanup()
  }
})

test('access request enforces oracle protection, external share policy, guest/viewer caps, and /agents ceiling', () => {
  const { db, store, cleanup } = setupStore()
  try {
    const ada = store.register('Ada', 1, 'secret1', 'guard-ada@example.com')
    const bob = store.register('Bob', 2, 'secret1', 'guard-bob@example.com')
    const viewerUser = store.register('View', 3, 'secret1', 'guard-viewer@example.com')
    const ext = store.register('Ext', 4, 'secret1', 'guard-ext@example.com')
    const wsA = store.createWorkspace(ada.id, 'WS A')
    const wsB = store.createWorkspace(bob.id, 'WS B')
    store.addMemberByEmail(ada.id, wsA.id, bob.email)
    store.addMemberByEmail(ada.id, wsA.id, viewerUser.email)
    store.updateMemberRole(ada.id, wsA.id, viewerUser.id, 'viewer')
    store.addMemberByEmail(ada.id, wsA.id, ext.email)
    db.prepare(`UPDATE workspace_members SET member_kind = 'external' WHERE workspace_id = ? AND account_id = ?`).run(wsA.id, ext.id)
    store.setActive(ada.id, wsA.id)
    store.setActive(bob.id, wsA.id)
    store.setActive(viewerUser.id, wsA.id)
    store.setActive(ext.id, wsA.id)

    runWithAccount(ada.id, () => store.attach(wsA.id, '/agents', 'ag-1', 10, { accessMode: 'private' }))
    runWithAccount(ada.id, () => store.attach(wsA.id, '/plugins', 'plug-1', 10, { accessMode: 'private' }))

    // Non-existent record or record in another workspace: silent submitted=true, delivered=false (no oracle)
    const missing = runWithAccount(bob.id, () => store.createAccessRequest(bob.id, '/pages', 'no-such-id', 'viewer'))
    assert.equal(missing.submitted, true)
    assert.equal(missing.delivered, false)
    assert.equal(missing.request, null)

    store.setActive(bob.id, wsB.id)
    const crossWs = runWithAccount(bob.id, () => store.createAccessRequest(bob.id, '/plugins', 'plug-1', 'viewer'))
    assert.equal(crossWs.submitted, true)
    assert.equal(crossWs.delivered, false)
    assert.equal(crossWs.request, null)
    store.setActive(bob.id, wsA.id)

    // Personal-only /notices collection rejected
    assert.throws(
      () => runWithAccount(bob.id, () => store.createAccessRequest(bob.id, '/notices', 'n-1', 'viewer')),
      /不支持权限申请/,
    )

    // Workspace viewer cannot request editor
    assert.throws(
      () => runWithAccount(viewerUser.id, () => store.createAccessRequest(viewerUser.id, '/plugins', 'plug-1', 'editor')),
      /最高仅可申请可查看/,
    )

    // /agents respects allowEditShare=false
    store.updateWorkspacePermissions(ada.id, wsA.id, { collections: { '/agents': { allowEditShare: false } } })
    assert.throws(
      () => runWithAccount(bob.id, () => store.createAccessRequest(bob.id, '/agents', 'ag-1', 'editor')),
      /关闭代理可编辑分享/,
    )
    const agentViewReq = runWithAccount(bob.id, () => store.createAccessRequest(bob.id, '/agents', 'ag-1', 'viewer'))
    assert.equal(agentViewReq.delivered, true)

    // External collaborator blocked when allowExternalShare=false
    store.updateWorkspacePermissions(ada.id, wsA.id, { collections: { '/plugins': { allowExternalShare: false } } })
    assert.throws(
      () => runWithAccount(ext.id, () => store.createAccessRequest(ext.id, '/plugins', 'plug-1', 'viewer')),
      /禁止对外分享/,
    )
  } finally {
    cleanup()
  }
})
