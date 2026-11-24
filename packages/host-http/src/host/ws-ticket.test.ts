import assert from 'node:assert/strict'
import { afterEach, describe, it } from 'vitest'
import {
  clearWsTicketsForTest,
  consumeWsTicket,
  issueWsTicket,
  resolveCorsOrigin,
} from './ws-ticket.ts'

afterEach(() => {
  clearWsTicketsForTest()
})

describe('ws-ticket single-use handshake tokens', () => {
  it('issues an opaque ticket that can only be consumed once', () => {
    const now = 1_700_000_000_000
    const issued = issueWsTicket({
      accountId: 'acc_1',
      workspaceId: 'ws_cloud_1',
      sessionToken: 'tok_long_lived',
      now,
    })
    assert.ok(issued.ticket.startsWith('biu_wst_'))
    assert.equal(issued.workspaceId, 'ws_cloud_1')

    const first = consumeWsTicket(issued.ticket, now + 5_000)
    assert.deepEqual(first, {
      accountId: 'acc_1',
      workspaceId: 'ws_cloud_1',
      sessionToken: 'tok_long_lived',
      exp: issued.exp,
    })

    // Replay must fail immediately
    assert.equal(consumeWsTicket(issued.ticket, now + 5_001), null)
  })

  it('rejects expired tickets', () => {
    const now = 1_700_000_000_000
    const issued = issueWsTicket({
      accountId: 'acc_1',
      workspaceId: 'ws_1',
      sessionToken: 'tok_1',
      ttlMs: 5_000,
      now,
    })
    assert.equal(consumeWsTicket(issued.ticket, now + 5_000), null)
  })
})

describe('resolveCorsOrigin allowlist', () => {
  it('defaults to wildcard when BIU_CORS_ORIGINS is unset', () => {
    assert.deepEqual(resolveCorsOrigin('http://localhost:5174', ''), { allowOrigin: '*', varyOrigin: false })
  })

  it('allows only configured origins and rejects others when BIU_CORS_ORIGINS is set', () => {
    const allow = 'https://app.biu.dev, http://localhost:5174/'
    assert.deepEqual(resolveCorsOrigin('https://app.biu.dev', allow), {
      allowOrigin: 'https://app.biu.dev',
      varyOrigin: true,
    })
    assert.deepEqual(resolveCorsOrigin('http://localhost:5174', allow), {
      allowOrigin: 'http://localhost:5174',
      varyOrigin: true,
    })
    assert.deepEqual(resolveCorsOrigin('https://evil.example', allow), {
      allowOrigin: null,
      varyOrigin: true,
    })
  })
})
