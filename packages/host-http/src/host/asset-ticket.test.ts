import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import { isAssetTicketEligiblePath, signAssetTicket, verifyAssetTicket } from './asset-ticket.ts'

describe('HMAC short-lived asset tickets', () => {
  it('signs and verifies valid tickets with accountId and workspaceId', () => {
    const now = 1_800_000_000_000
    const ticket = signAssetTicket({ accountId: 'acc_1', workspaceId: 'ws_1', ttlMs: 60_000, now })
    const query = new URLSearchParams({
      uid: ticket.uid,
      ws: ticket.ws,
      exp: String(ticket.exp),
      sig: ticket.sig,
    })
    const verified = verifyAssetTicket(query, now + 30_000)
    assert.deepEqual(verified, { accountId: 'acc_1', workspaceId: 'ws_1' })
  })

  it('rejects expired tickets', () => {
    const now = 1_800_000_000_000
    const ticket = signAssetTicket({ accountId: 'acc_1', workspaceId: 'ws_1', ttlMs: 60_000, now })
    const query = new URLSearchParams({
      uid: ticket.uid,
      ws: ticket.ws,
      exp: String(ticket.exp),
      sig: ticket.sig,
    })
    assert.equal(verifyAssetTicket(query, now + 60_001), null)
  })

  it('rejects tampered workspaceId, accountId, expiry, or signature', () => {
    const now = 1_800_000_000_000
    const ticket = signAssetTicket({ accountId: 'acc_1', workspaceId: 'ws_1', ttlMs: 60_000, now })

    const tamperedWs = new URLSearchParams({
      uid: ticket.uid,
      ws: 'ws_2',
      exp: String(ticket.exp),
      sig: ticket.sig,
    })
    assert.equal(verifyAssetTicket(tamperedWs, now + 1000), null)

    const tamperedUid = new URLSearchParams({
      uid: 'acc_2',
      ws: ticket.ws,
      exp: String(ticket.exp),
      sig: ticket.sig,
    })
    assert.equal(verifyAssetTicket(tamperedUid, now + 1000), null)

    const tamperedExp = new URLSearchParams({
      uid: ticket.uid,
      ws: ticket.ws,
      exp: String(ticket.exp + 999999),
      sig: ticket.sig,
    })
    assert.equal(verifyAssetTicket(tamperedExp, now + 1000), null)
  })

  it('restricts asset tickets strictly to read-only binary/media routes', () => {
    assert.equal(isAssetTicketEligiblePath('GET', '/api/db/file/abc.png'), true)
    assert.equal(isAssetTicketEligiblePath('GET', '/api/page/file/abc.png'), true)
    assert.equal(isAssetTicketEligiblePath('GET', '/api/doc/file/abc.pdf'), true)
    assert.equal(isAssetTicketEligiblePath('GET', '/api/agents/s1/artifacts/out.png'), true)
    assert.equal(isAssetTicketEligiblePath('GET', '/api/channels/ch-1/uploads/img-1.png'), true)

    assert.equal(isAssetTicketEligiblePath('POST', '/api/channels/ch-1/uploads/img-1.png'), false)

    assert.equal(isAssetTicketEligiblePath('PUT', '/api/db/file/abc.png'), false)
    assert.equal(isAssetTicketEligiblePath('POST', '/api/db/file/abc.png'), false)
    assert.equal(isAssetTicketEligiblePath('DELETE', '/api/db/file/abc.png'), false)
    assert.equal(isAssetTicketEligiblePath('GET', '/api/db/list'), false)
    assert.equal(isAssetTicketEligiblePath('GET', '/api/account/me'), false)
  })
})
