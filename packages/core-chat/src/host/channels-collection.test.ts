import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Context } from 'cordis'
import { describe, it } from 'vitest'
import { CollabStore } from '@biu/host-account/store'
import { openAndMigrateBiu, runWithAccount, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import { runWithSession } from '@biu/host-sessions/scope'
import { ChannelService } from './channels.ts'
import { channelsCollection } from './channels-collection.ts'

function createFixture() {
  const dir = mkdtempSync(join(tmpdir(), 'biu-channels-col-'))
  const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
  const store = new CollabStore(db)
  const alice = store.register('Alice', Date.now(), 'pass123456', 'alice@example.com')
  const bob = store.register('Bob', Date.now(), 'pass123456', 'bob@example.com')
  const carol = store.register('Carol', Date.now(), 'pass123456', 'carol@example.com')
  const ws = store.createWorkspace(alice.id, 'Chat FS WS')
  store.addMemberByEmail(alice.id, ws.id, 'bob@example.com')
  store.addMemberByEmail(alice.id, ws.id, 'carol@example.com')

  runWithAccount(alice.id, () =>
    runWithRequestWorkspace(ws.id, () => store.attach(ws.id, '/agents', 'ag-alice', Date.now(), { accessMode: 'private' })),
  )
  runWithAccount(bob.id, () =>
    runWithRequestWorkspace(ws.id, () => store.attach(ws.id, '/agents', 'ag-bob', Date.now(), { accessMode: 'private' })),
  )

  const agents = new Map([
    ['ag-alice', { id: 'ag-alice', title: '赤板灵' }],
    ['ag-bob', { id: 'ag-bob', title: '青拱星' }],
  ])

  const fakeCtx = {
    get: (key: string) => (key === 'account' ? { store } : undefined),
    sessions: {
      peekSummary: (id: string) => agents.get(id) ?? null,
    },
    tools: {
      schemas: () => [],
      invoke: async () => ({ ok: true }),
    },
    http: {
      broadcast: () => undefined,
      broadcastAccount: () => undefined,
    },
    effect: () => undefined,
  } as unknown as Context
  ;(fakeCtx as unknown as { account: { store: CollabStore } }).account = { store }

  let llmCalls = 0
  const service = new ChannelService(fakeCtx, () => ({
    chat: async () => {
      llmCalls += 1
      return { content: 'auto reply', toolCalls: [] }
    },
  }))
  const collection = channelsCollection(service)

  const asUser = <T>(accountId: string, fn: () => T): T =>
    runWithAccount(accountId, () => runWithRequestWorkspace(ws.id, fn))

  return {
    alice,
    bob,
    carol,
    service,
    collection,
    asUser,
    getLlmCalls: () => llmCalls,
    cleanup: () => {
      service.dispose()
      db.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

describe('channelsCollection (/channels)', () => {
  it('lists and reads only channels visible to current actor, and sends messages attributed to both user and agent', async () => {
    const fx = createFixture()
    try {
      const { alice, bob, carol, service, collection, asUser } = fx
      const created = asUser(alice.id, () =>
        service.createChannel({
          name: '项目协作群',
          accessMode: 'private',
          memberAccountIds: [bob.id],
          agentIds: ['ag-alice'],
        }),
      )
      asUser(bob.id, () => service.addMember(created.channel.id, 'agent', 'ag-bob'))
      const dm = asUser(alice.id, () => service.openOrCreateDm(bob.id))

      // Alice & Bob 可见群聊与私聊；非成员 Carol 看不到
      const aliceList = await asUser(alice.id, () => collection.list())
      assert.equal(aliceList.length, 2)
      const carolList = await asUser(carol.id, () => collection.list())
      assert.equal(carolList.length, 0)
      const carolRead = await asUser(carol.id, () => collection.get(created.channel.id))
      assert.equal(carolRead, null)

      // Agent 在 Alice 的会话上下文下调用 action=send 替 Alice 发消息
      const sendAction = collection.actions?.find((a) => a.id === 'send')
      assert.ok(sendAction && 'run' in sendAction && sendAction.run)
      const chRecord = (await asUser(alice.id, () => collection.get(created.channel.id)))!
      assert.ok(chRecord)

      const sendRes = (await asUser(alice.id, () =>
        runWithSession('ag-alice', () =>
          sendAction.run!(created.channel.id, chRecord, {
            text: '@青拱星 帮忙看一下今天的构建日志',
          }),
        ),
      )) as Record<string, unknown>

      assert.equal(sendRes.ok, true)
      assert.equal(sendRes.senderName, 'Alice')
      assert.equal(sendRes.viaAgentId, 'ag-alice')
      assert.equal(sendRes.viaAgentName, '赤板灵')

      // 验证落库消息同时携带用户身份（senderType=account, senderId=alice）与 Agent 身份（viaAgentId/Name），且不触发无限互唤
      const msgs = asUser(bob.id, () => service.listMessages(created.channel.id))
      assert.equal(msgs.length, 1)
      assert.equal(msgs[0]?.senderType, 'account')
      assert.equal(msgs[0]?.senderId, alice.id)
      assert.equal(msgs[0]?.senderName, 'Alice')
      assert.equal(msgs[0]?.viaAgentId, 'ag-alice')
      assert.equal(msgs[0]?.viaAgentName, '赤板灵')
      assert.equal(fx.getLlmCalls(), 0)

      // db_read 正文 Markdown 包含成员、消息以及「由 Agent 赤板灵 代发」标记
      const refreshed = await asUser(bob.id, () => collection.get(created.channel.id))
      const content = String(refreshed?.content ?? '')
      assert.ok(content.includes('# 项目协作群（群聊）'))
      assert.ok(content.includes('由 Agent 赤板灵 代发'))
      assert.ok(content.includes('今天的构建日志'))

      // 私聊 DM 同样支持通过 /channels/<dmId> action=send 代发
      const dmRecord = (await asUser(alice.id, () => collection.get(dm.channel.id)))!
      const dmRes = (await asUser(alice.id, () =>
        runWithSession('ag-alice', () => sendAction.run!(dm.channel.id, dmRecord, { text: '私聊同步进度' })),
      )) as Record<string, unknown>
      assert.equal(dmRes.viaAgentId, 'ag-alice')
      assert.equal(dmRes.senderName, 'Alice')

      // action=search 与 action=messages 正常工作
      const searchAction = collection.actions?.find((a) => a.id === 'search')
      assert.ok(searchAction && 'run' in searchAction && searchAction.run)
      const searchRes = (await asUser(bob.id, () =>
        searchAction.run!(created.channel.id, chRecord, { q: '构建日志' }),
      )) as { total: number; hits: Array<{ text: string }> }
      assert.equal(searchRes.total, 1)
      assert.ok(searchRes.hits[0]?.text.includes('构建日志'))

      const messagesAction = collection.actions?.find((a) => a.id === 'messages')
      assert.ok(messagesAction && 'run' in messagesAction && messagesAction.run)
      const pageRes = (await asUser(bob.id, () =>
        messagesAction.run!(created.channel.id, chRecord, { limit: 10 }),
      )) as { messages: Array<{ viaAgentId?: string; senderName: string }> }
      assert.equal(pageRes.messages.length, 1)
      assert.equal(pageRes.messages[0]?.viaAgentId, 'ag-alice')
    } finally {
      fx.cleanup()
    }
  })
})
