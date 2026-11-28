import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'vitest'
import { Context } from 'cordis'
import {
  openAndMigrateBiu,
  runWithAccount,
  runWithActorContext,
  runWithRequestWorkspace,
} from '@biu/host-plugin-loader/data-dir'
import { CollabStore } from '@biu/host-account/store'
import {
  ChannelService,
  MAX_CHANNEL_HANDOFF_HOPS,
  buildReadonlySessionContextSummary,
  redactChannelRunEvents,
  registerChannelRoutes,
  resolveMentionedAgents,
  type ChannelLlmResolver,
} from './channels.ts'
import { buildDefaultChannelName } from '../shared/channel-types.ts'
import { inject as coreChatInject } from './index.ts'

function waitFor(check: () => boolean, timeoutMs = 2500): Promise<void> {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = () => {
      if (check()) return resolve()
      if (Date.now() - start > timeoutMs) return reject(new Error('waitFor timed out'))
      setTimeout(tick, 15)
    }
    tick()
  })
}

function makeFakeEnv(opts?: {
  agents?: Array<{ id: string; title: string; ownerAccountId: string; systemPrompt?: string }>
  llm?: ChannelLlmResolver
  invokeTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>
}) {
  const dir = mkdtempSync(join(tmpdir(), 'biu-channels-test-'))
  const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
  const store = new CollabStore(db)
  const alice = store.register('Alice', Date.now(), 'pass123456', 'alice@example.com')
  const bob = store.register('Bob', Date.now(), 'pass123456', 'bob@example.com')
  const carol = store.register('Carol', Date.now(), 'pass123456', 'carol@example.com')
  const ws = store.createWorkspace(alice.id, 'Slack WS')
  store.addMemberByEmail(alice.id, ws.id, 'bob@example.com')
  store.addMemberByEmail(alice.id, ws.id, 'carol@example.com')

  const agentMap = new Map<string, { id: string; title: string; ownerAccountId: string; systemPrompt?: string }>()
  for (const a of opts?.agents ?? []) {
    agentMap.set(a.id, a)
    runWithAccount(a.ownerAccountId, () =>
      runWithRequestWorkspace(ws.id, () => store.attach(ws.id, '/agents', a.id, Date.now(), { accessMode: 'private' })),
    )
  }

  const broadcasts: Array<{ accountId: string; type: string; payload: unknown }> = []
  const approvalListeners = new Set<(p: any) => void>()

  const fakeCtx = {
    get: (key: string) => {
      if (key === 'approvals') {
        return {
          onNotify: (fn: (p: any) => void) => {
            approvalListeners.add(fn)
            return () => approvalListeners.delete(fn)
          },
          onDecide: () => () => undefined,
        }
      }
      if (key === 'account') {
        return { store }
      }
      return undefined
    },
    sessions: {
      peekSummary: (id: string) => {
        const a = agentMap.get(id)
        if (!a) return null
        return {
          id: a.id,
          title: a.title,
          config: { systemPrompt: a.systemPrompt ?? '' },
        }
      },
    },
    tools: {
      schemas: () => [],
      invoke: async (name: string, args: Record<string, unknown>) => {
        if (opts?.invokeTool) return opts.invokeTool(name, args)
        return { ok: true, name, args }
      },
    },
    http: {
      broadcast: (type: string, payload: unknown, _ws?: string, acc?: string) => {
        broadcasts.push({ accountId: acc ?? '', type, payload })
      },
      broadcastAccount: (accountId: string, type: string, payload: unknown) => {
        broadcasts.push({ accountId, type, payload })
      },
    },
    effect: () => undefined,
  } as unknown as Context

  // 挂上 account port（供 getAccountPort 使用）
  ;(fakeCtx as any).account = { store }

  const defaultLlm: ChannelLlmResolver =
    opts?.llm ??
    ((agentId) => ({
      chat: async () => ({
        content: `reply from ${agentId}`,
        toolCalls: [],
      }),
    }))

  const service = new ChannelService(fakeCtx, defaultLlm, { db })
  const asUser = <T>(accountId: string, fn: () => T): T =>
    runWithAccount(accountId, () => runWithRequestWorkspace(ws.id, fn))

  return {
    dir,
    db,
    store,
    ws,
    alice,
    bob,
    carol,
    service,
    broadcasts,
    emitApproval: (payload: any) => {
      for (const fn of approvalListeners) fn(payload)
    },
    asUser,
    cleanup: () => {
      service.dispose()
      db.close()
      rmSync(dir, { recursive: true, force: true })
    },
  }
}

describe('Slack-style Group Channels: RBAC, Mention Dispatch, Per-Invoker Queue, Handoff, DM', () => {
  it('enforces RoomFloor + Owner/Invoker intersection in AuthorizationService', () => {
    const env = makeFakeEnv()
    try {
      const { store, ws, alice, bob, asUser } = env
      const auth = store.authorization

      // Alice 创建一篇私人文档 & 一篇空间文档
      asUser(alice.id, () => {
        store.attach(ws.id, '/pages', 'alice-private', Date.now(), { accessMode: 'private' })
        store.attach(ws.id, '/pages', 'ws-doc', Date.now(), { accessMode: 'members', memberDefaultRole: 'viewer' })
      })

      const roomCtx = {
        channelId: 'ch-1',
        denyPersonal: true,
        hasExternalMember: false,
        audienceAccountIds: [alice.id, bob.id],
      }

      // 1. Bob @ Alice 的 Agent 读 Alice 私人文档 → 必须拒绝
      const bobReadPrivate = asUser(alice.id, () =>
        runWithActorContext(
          { type: 'agent', actorId: 'agent-a', delegatedBy: alice.id, invokerId: bob.id, roomContext: roomCtx },
          () => auth.authorize(auth.currentActor(), 'resource:read', { type: 'record', workspaceId: ws.id, collection: '/pages', recordId: 'alice-private' }),
        ),
      )
      assert.equal(bobReadPrivate.allowed, false)

      // 2. 即使 Alice 自己在群里 @ 自己的 Agent 读私人文档 → 受 RoomFloor 拦截，防私密文档吐到群里
      const aliceReadPrivateInRoom = asUser(alice.id, () =>
        runWithActorContext(
          { type: 'agent', actorId: 'agent-a', delegatedBy: alice.id, invokerId: alice.id, roomContext: roomCtx },
          () => auth.authorize(auth.currentActor(), 'resource:read', { type: 'record', workspaceId: ws.id, collection: '/pages', recordId: 'alice-private' }),
        ),
      )
      assert.equal(aliceReadPrivateInRoom.allowed, false)

      // 3. 空间文档在内部群里允许读，但 Bob 只有 viewer 角色，因此 Bob @ Alice 的 Agent 写空间文档 → 拒绝
      const bobReadWs = asUser(alice.id, () =>
        runWithActorContext(
          { type: 'agent', actorId: 'agent-a', delegatedBy: alice.id, invokerId: bob.id, roomContext: roomCtx },
          () => auth.authorize(auth.currentActor(), 'resource:read', { type: 'record', workspaceId: ws.id, collection: '/pages', recordId: 'ws-doc' }),
        ),
      )
      assert.equal(bobReadWs.allowed, true)

      const bobUpdateWs = asUser(alice.id, () =>
        runWithActorContext(
          { type: 'agent', actorId: 'agent-a', delegatedBy: alice.id, invokerId: bob.id, roomContext: roomCtx },
          () => auth.authorize(auth.currentActor(), 'resource:update', { type: 'record', workspaceId: ws.id, collection: '/pages', recordId: 'ws-doc' }),
        ),
      )
      assert.equal(bobUpdateWs.allowed, false)
    } finally {
      env.cleanup()
    }
  })

  it('parses @Agent and @所有人 strictly and blocks pulling others private agents', async () => {
    const env = makeFakeEnv({
      agents: [
        { id: 'ag-1', title: '研发助手', ownerAccountId: '' },
        { id: 'ag-2', title: '产品助手', ownerAccountId: '' },
      ],
    })
    // Re-run with actual alice/bob IDs
    env.cleanup()

    const dir = mkdtempSync(join(tmpdir(), 'biu-channels-strict-'))
    const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
    const store = new CollabStore(db)
    const alice = store.register('Alice', Date.now(), 'pass123456', 'alice@example.com')
    const bob = store.register('Bob', Date.now(), 'pass123456', 'bob@example.com')
    const ws = store.createWorkspace(alice.id, 'Strict WS')
    store.addMemberByEmail(alice.id, ws.id, 'bob@example.com')
    runWithAccount(alice.id, () =>
      runWithRequestWorkspace(ws.id, () => store.attach(ws.id, '/agents', 'ag-alice', Date.now(), { accessMode: 'private' })),
    )
    runWithAccount(bob.id, () =>
      runWithRequestWorkspace(ws.id, () => store.attach(ws.id, '/agents', 'ag-bob', Date.now(), { accessMode: 'private' })),
    )

    const fakeCtx = {
      get: () => undefined,
      account: { store },
      sessions: {
        peekSummary: (id: string) =>
          id === 'ag-alice'
            ? { id, title: '研发助手', config: {} }
            : id === 'ag-bob'
              ? { id, title: '产品助手', config: {} }
              : null,
      },
      tools: { schemas: () => [], invoke: async () => ({ ok: true }) },
      http: { broadcast: () => undefined, broadcastAccount: () => undefined },
      effect: () => undefined,
    } as unknown as Context

    const calls: string[] = []
    const svc = new ChannelService(
      fakeCtx,
      (agentId) => ({
        chat: async () => {
          calls.push(agentId)
          return { content: `${agentId} 已收到`, toolCalls: [] }
        },
      }),
      { db },
    )
    const asUser = <T>(acc: string, fn: () => T) => runWithAccount(acc, () => runWithRequestWorkspace(ws.id, fn))

    try {
      const created = asUser(alice.id, () =>
        svc.createChannel({ name: '研发群', memberAccountIds: [bob.id], agentIds: ['ag-alice'] }),
      )

      // Bob 不能把 Alice 的 Agent 拉进群，也不能替 Alice 拉；但 Bob 可以拉自己的 ag-bob
      assert.throws(() => asUser(bob.id, () => svc.addMember(created.channel.id, 'agent', 'ag-alice')), /只能将自己创建的 Agent/)
      asUser(bob.id, () => svc.addMember(created.channel.id, 'agent', 'ag-bob'))

      // 无 @ 的普通人类消息：Agent 严格保持静默
      const plain = asUser(bob.id, () => svc.sendMessage(created.channel.id, { text: '大家好，今天发布顺利吗？' }))
      assert.equal(plain.triggeredRunIds.length, 0)
      assert.equal(calls.length, 0)

      // 显式 @研发助手：只唤醒 ag-alice
      const single = asUser(bob.id, () => svc.sendMessage(created.channel.id, { text: '@研发助手 帮我看下 PR' }))
      assert.equal(single.triggeredRunIds.length, 1)
      await waitFor(() => calls.length === 1)
      assert.deepEqual(calls, ['ag-alice'])

      // @所有人：同时唤醒两个群内 Agent
      const all = asUser(alice.id, () => svc.sendMessage(created.channel.id, { text: '@所有人 同步一下进展' }))
      assert.equal(all.triggeredRunIds.length, 2)
      await waitFor(() => calls.length === 3)
      assert.equal(calls.includes('ag-bob'), true)
    } finally {
      svc.dispose()
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('isolates per-invoker turns, supports controlled handoff up to maxHops, and enforces cancel + trace redaction', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'biu-channels-queue-'))
    const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
    const store = new CollabStore(db)
    const alice = store.register('Alice', Date.now(), 'pass123456', 'alice@example.com')
    const bob = store.register('Bob', Date.now(), 'pass123456', 'bob@example.com')
    const carol = store.register('Carol', Date.now(), 'pass123456', 'carol@example.com')
    const ws = store.createWorkspace(alice.id, 'Queue WS')
    store.addMemberByEmail(alice.id, ws.id, 'bob@example.com')
    store.addMemberByEmail(alice.id, ws.id, 'carol@example.com')
    runWithAccount(alice.id, () =>
      runWithRequestWorkspace(ws.id, () => {
        store.attach(ws.id, '/agents', 'ag-research', Date.now(), { accessMode: 'private' })
        store.attach(ws.id, '/agents', 'ag-writer', Date.now(), { accessMode: 'private' })
      }),
    )

    const fakeCtx = {
      get: () => undefined,
      account: { store },
      sessions: {
        peekSummary: (id: string) =>
          id === 'ag-research'
            ? { id, title: '研究员', config: {} }
            : id === 'ag-writer'
              ? { id, title: '撰稿人', config: {} }
              : null,
      },
      tools: {
        schemas: () => [],
        invoke: async () => 'secret-internal-result',
      },
      http: { broadcast: () => undefined, broadcastAccount: () => undefined },
      effect: () => undefined,
    } as unknown as Context

    const runRecords: Array<{ agentId: string; invokerId: string }> = []
    let releaseFirst: (() => void) | null = null
    let firstStarted = false

    const svc = new ChannelService(
      fakeCtx,
      (agentId, _owner, invoker) => ({
        chat: async (_msgs, _tools, signal, opts) => {
          runRecords.push({ agentId, invokerId: invoker })
          if (agentId === 'ag-research' && !firstStarted) {
            firstStarted = true
            await new Promise<void>((resolve) => {
              releaseFirst = resolve
              signal?.addEventListener('abort', () => resolve(), { once: true })
            })
            if (signal?.aborted) throw new Error('cancelled')
            await opts?.onReasoningDelta?.('internal thought')
            await opts?.onDelta?.('调研完成，请 @撰稿人 整理成文')
            return { content: '调研完成，请 @撰稿人 整理成文', toolCalls: [] }
          }
          // 撰稿人尝试反 @ 研究员（应被 visitedAgents 防环拦截，不会死循环）
          return { content: '成稿完毕 @研究员', toolCalls: [] }
        },
      }),
      { db },
    )
    const asUser = <T>(acc: string, fn: () => T) => runWithAccount(acc, () => runWithRequestWorkspace(ws.id, fn))

    try {
      const ch = asUser(alice.id, () =>
        svc.createChannel({
          name: '内容协作群',
          memberAccountIds: [bob.id, carol.id],
          agentIds: ['ag-research', 'ag-writer'],
        }),
      )

      // Bob 先 @研究员（卡在第一个 Turn）
      const bobSend = asUser(bob.id, () => svc.sendMessage(ch.channel.id, { text: '@研究员 调研一下方案' }))
      await waitFor(() => firstStarted)

      // Carol 无权取消 Bob 触发的 Turn
      assert.throws(
        () => asUser(carol.id, () => svc.cancelRun(ch.channel.id, bobSend.triggeredRunIds[0]!)),
        /permission denied/,
      )

      // 期间 Bob 再连发一条 @研究员（同人 → 合并进同一排队槽? 此时 Bob 第一条已在跑，新一条进队列）
      const bobFollow1 = asUser(bob.id, () => svc.sendMessage(ch.channel.id, { text: '@研究员 补充条件 1' }))
      const bobFollow2 = asUser(bob.id, () => svc.sendMessage(ch.channel.id, { text: '@研究员 补充条件 2' }))
      // 同人连续排队合并为同一个 runId
      assert.equal(bobFollow1.triggeredRunIds[0], bobFollow2.triggeredRunIds[0])

      // Carol 也 @研究员（不同人 → 绝不合并，必须分配独立 runId！）
      const carolSend = asUser(carol.id, () => svc.sendMessage(ch.channel.id, { text: '@研究员 帮我也查一个' }))
      assert.notEqual(carolSend.triggeredRunIds[0], bobFollow1.triggeredRunIds[0])

      // 放行第一轮 → 触发受控 Handoff 到 @撰稿人（且透传 invokerId = bob.id，不会反 @ 死循环）
      releaseFirst!()
      await waitFor(() => runRecords.filter((r) => r.agentId === 'ag-writer').length >= 1)
      await waitFor(() => runRecords.filter((r) => r.agentId === 'ag-research').length === 3)

      const writerRun = runRecords.find((r) => r.agentId === 'ag-writer')
      assert.equal(writerRun?.invokerId, bob.id, 'handoff must propagate original human invokerId')

      // 验证不同角色读取 run detail 的脱敏级别
      const firstRunId = bobSend.triggeredRunIds[0]!
      const ownerView = asUser(alice.id, () => svc.getRunDetail(ch.channel.id, firstRunId))
      const invokerView = asUser(bob.id, () => svc.getRunDetail(ch.channel.id, firstRunId))
      const memberView = asUser(carol.id, () => svc.getRunDetail(ch.channel.id, firstRunId))
      assert.equal(ownerView.viewerRole, 'owner')
      assert.equal(ownerView.events.some((e) => e.kind === 'thinking'), true)
      assert.equal(invokerView.viewerRole, 'invoker')
      assert.equal(invokerView.events.some((e) => e.kind === 'thinking'), false)
      assert.equal(memberView.viewerRole, 'member')
      assert.equal(memberView.events.some((e) => e.kind === 'delta'), false)
    } finally {
      svc.dispose()
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reuses 1v1 human DM rooms and hides DMs from third parties', () => {
    const env = makeFakeEnv()
    try {
      const { alice, bob, carol, service, asUser } = env
      const dm1 = asUser(alice.id, () => service.openOrCreateDm(bob.id))
      const dm2 = asUser(bob.id, () => service.openOrCreateDm(alice.id))
      assert.equal(dm1.channel.id, dm2.channel.id)
      assert.equal(dm1.channel.kind, 'dm')
      assert.equal(dm1.channel.name, 'Bob')
      assert.equal(dm2.channel.name, 'Alice')

      // Carol 无权访问 Alice 和 Bob 的私聊
      assert.throws(() => asUser(carol.id, () => service.getChannelDetail(dm1.channel.id)), /unknown channel/)
    } finally {
      env.cleanup()
    }
  })

  it('resolveMentionedAgents and redactChannelRunEvents pure helpers behave strictly', () => {
    const agents = [
      { id: 'a1', name: '代码审查' },
      { id: 'a2', name: '发布助手' },
    ]
    assert.deepEqual(resolveMentionedAgents('普通聊天没有艾特', [], agents).agentIds, [])
    assert.deepEqual(resolveMentionedAgents('@代码审查 看看这个 diff', [], agents).agentIds, ['a1'])
    assert.deepEqual(resolveMentionedAgents('@所有人 开会了', [], agents).agentIds, ['a1', 'a2'])
    assert.equal(MAX_CHANNEL_HANDOFF_HOPS, 3)

    const sample = [
      { ts: 1, kind: 'thinking' as const, text: 'secret thought' },
      { ts: 2, kind: 'tool_call' as const, toolName: 'db_list', args: { secret: '123' } },
      { ts: 3, kind: 'tool_result' as const, toolName: 'db_list', ok: true, detail: 'raw secret rows' },
      { ts: 4, kind: 'done' as const, text: 'ok' },
    ]
    const invokerRedacted = redactChannelRunEvents(sample, 'invoker')
    assert.equal(invokerRedacted.some((e) => e.kind === 'thinking'), false)
    assert.equal(invokerRedacted.find((e) => e.kind === 'tool_call')?.args, undefined)
    const memberRedacted = redactChannelRunEvents(sample, 'member')
    assert.equal(memberRedacted.every((e) => e.kind === 'status' || e.kind === 'done'), true)
  })

  it('declares llm in core-chat inject and invokes ctx.get("llm").forConfig without Cordis inject error', async () => {
    assert.equal(Array.isArray(coreChatInject) && coreChatInject.includes('llm'), true, 'core-chat host inject must declare llm')

    const dir = mkdtempSync(join(tmpdir(), 'biu-channels-cordis-'))
    const prevDataHome = process.env.BIU_DATA_HOME
    process.env.BIU_DATA_HOME = dir
    const ctx = new Context()
    const llmCalls: Array<{ apiKey?: string; model?: string }> = []
    const routes = new Map<string, (route: any) => any>()

    ctx.provide('llm', {
      forConfig: (cfg: { apiKey?: string; model?: string }) => {
        llmCalls.push({ apiKey: cfg.apiKey, model: cfg.model })
        return {
          chat: async () => ({ content: '来自真实 llm.forConfig 的回复', toolCalls: [] }),
        }
      },
    })
    ctx.provide('http', {
      route: (method: string, path: string, handler: (route: any) => any) => {
        routes.set(`${method} ${path}`, handler)
      },
      broadcast: () => undefined,
      broadcastAccount: () => undefined,
    })
    ctx.provide('sessions', {
      peekSummary: (id: string) =>
        id === 'ag-real'
          ? { id, title: '青拱星', mascot: { shape: 'drop', color: '#2dd4bf' }, config: {} }
          : null,
    })
    ctx.provide('tools', {
      schemas: () => [],
      invoke: async () => ({ ok: true }),
    })

    // 使用一个未在 Cordis 上声明 inject=['llm'] 的子上下文，验证 registerChannelRoutes 通过 ctx.get('llm') 绝不抛 cannot get property "llm" without inject
    const holder: { service: ChannelService | null } = { service: null }
    const fork = ctx.plugin({
      name: 'test-channel-host',
      inject: ['http', 'sessions', 'tools'],
      apply(subCtx) {
        holder.service = registerChannelRoutes(subCtx, () => ({
          provider: 'deepseek',
          apiKey: 'sk-test-123456',
          model: 'deepseek-chat',
        }))
      },
    })

    try {
      await waitFor(() => holder.service !== null)
      const created = holder.service!.createChannel({ name: '研发', agentIds: ['ag-real'] })
      const sent = holder.service!.sendMessage(created.channel.id, { text: '@青拱星 你好' })
      assert.equal(sent.triggeredRunIds.length, 1)

      await waitFor(() => {
        const msgs = holder.service!.listMessages(created.channel.id)
        return msgs.some((m) => m.senderType === 'agent' && m.text.includes('来自真实 llm.forConfig 的回复'))
      })
      assert.equal(llmCalls.length, 1)
      assert.equal(llmCalls[0]?.apiKey, 'sk-test-123456')
    } finally {
      holder.service?.dispose()
      await fork.dispose()
      if (prevDataHome === undefined) delete process.env.BIU_DATA_HOME
      else process.env.BIU_DATA_HOME = prevDataHome
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('propagates workspace member avatars consistently across DM, members, messages, and agent mascot on system errors', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'biu-channels-avatar-'))
    const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
    const store = new CollabStore(db)
    const alice = store.register('Alice', Date.now(), 'pass123456', 'alice@example.com')
    const bob = store.register('Bob', Date.now(), 'pass123456', 'bob@example.com')
    const ws = store.createWorkspace(alice.id, 'Avatar WS')
    store.addMemberByEmail(alice.id, ws.id, 'bob@example.com')

    const aliceAvatar = 'data:image/svg+xml;utf8,alice-volcanic-avatar'
    const bobAvatar = 'data:image/svg+xml;utf8,bob-silver-avatar'
    runWithAccount(alice.id, () =>
      runWithRequestWorkspace(ws.id, () => {
        store.saveWorkspaceProfile(alice.id, { name: 'lulu@qq.com', avatar: aliceAvatar })
        store.attach(ws.id, '/agents', 'ag-fail', Date.now(), { accessMode: 'private' })
      }),
    )
    runWithAccount(bob.id, () =>
      runWithRequestWorkspace(ws.id, () => {
        store.saveWorkspaceProfile(bob.id, { name: '97', avatar: bobAvatar })
      }),
    )

    const fakeCtx = {
      get: (key: string) => (key === 'account' ? { store } : undefined),
      account: { store },
      sessions: {
        peekSummary: (id: string) =>
          id === 'ag-fail'
            ? { id, title: '青拱星', mascot: { shape: 'capsule', color: '#14b8a6' }, config: {} }
            : null,
      },
      tools: { schemas: () => [], invoke: async () => ({ ok: true }) },
      http: { broadcast: () => undefined, broadcastAccount: () => undefined },
      effect: () => undefined,
    } as unknown as Context

    const svc = new ChannelService(
      fakeCtx,
      () => ({
        chat: async () => {
          throw new Error('upstream boom')
        },
      }),
      { db },
    )
    const asUser = <T>(acc: string, fn: () => T) => runWithAccount(acc, () => runWithRequestWorkspace(ws.id, fn))

    try {
      // workspacePerson 本身必须返回空间头像
      assert.equal(asUser(alice.id, () => store.workspacePerson(alice.id)?.avatar), aliceAvatar)
      assert.equal(asUser(bob.id, () => store.workspacePerson(bob.id)?.avatar), bobAvatar)

      // 1v1 DM 的 peerAvatar、成员列表头像、消息发送者头像必须全部与空间头像一致
      const dm = asUser(alice.id, () => svc.openOrCreateDm(bob.id))
      assert.equal(dm.channel.peerAvatar, bobAvatar)
      assert.equal(dm.members.find((m) => m.memberId === alice.id)?.avatar, aliceAvatar)
      assert.equal(dm.members.find((m) => m.memberId === bob.id)?.avatar, bobAvatar)

      const sentDm = asUser(alice.id, () => svc.sendMessage(dm.channel.id, { text: '你好 97' }))
      assert.equal(sentDm.message.senderAvatar, aliceAvatar)

      // Agent 执行报错的 system ephemeral 消息必须带上 Agent 的 mascot，不能掉成人类默认头像
      const ch = asUser(alice.id, () => svc.createChannel({ name: '研发', agentIds: ['ag-fail'] }))
      asUser(alice.id, () => svc.sendMessage(ch.channel.id, { text: '@青拱星 测试报错' }))
      await waitFor(() => {
        const msgs = asUser(alice.id, () => svc.listMessages(ch.channel.id))
        return msgs.some((m) => m.senderType === 'system' && m.text.includes('upstream boom'))
      })
      const sysErr = asUser(alice.id, () => svc.listMessages(ch.channel.id)).find((m) => m.senderType === 'system')
      assert.deepEqual(sysErr?.senderMascot, { shape: 'capsule', color: '#14b8a6' })
    } finally {
      svc.dispose()
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('defaults channel name to human-first member concatenation and auto-names from conversation content', async () => {
    assert.equal(
      buildDefaultChannelName(['lulu', '97'], ['赤板灵', '紫晶美']),
      'lulu、97、赤板灵、紫晶美',
    )
    assert.equal(
      buildDefaultChannelName(['lulu', '97', 'Bob'], ['赤板灵', '紫晶美']),
      'lulu、97、Bob、赤板灵 等5位',
    )

    const dir = mkdtempSync(join(tmpdir(), 'biu-channels-autoname-'))
    const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
    const store = new CollabStore(db)
    const alice = store.register('Alice', Date.now(), 'pass123456', 'alice@example.com')
    const bob = store.register('Bob', Date.now(), 'pass123456', 'bob@example.com')
    const ws = store.createWorkspace(alice.id, 'Naming WS')
    store.addMemberByEmail(alice.id, ws.id, 'bob@example.com')
    runWithAccount(alice.id, () =>
      runWithRequestWorkspace(ws.id, () => {
        store.attach(ws.id, '/agents', 'ag-red', Date.now(), { accessMode: 'private' })
      }),
    )

    const fakeCtx = {
      get: (key: string) => (key === 'account' ? { store } : undefined),
      account: { store },
      sessions: {
        peekSummary: (id: string) => (id === 'ag-red' ? { id, title: '赤板灵', config: {} } : null),
      },
      tools: { schemas: () => [], invoke: async () => ({ ok: true }) },
      http: { broadcast: () => undefined, broadcastAccount: () => undefined },
      effect: () => undefined,
    } as unknown as Context

    const svc = new ChannelService(
      fakeCtx,
      () => ({
        chat: async () => ({ content: '支付接口排查', toolCalls: [] }),
      }),
      { db },
    )
    const asUser = <T>(acc: string, fn: () => T) => runWithAccount(acc, () => runWithRequestWorkspace(ws.id, fn))

    try {
      // 不传 name 时，默认按「人类成员优先在前 + Agent」拼接
      const created = asUser(alice.id, () =>
        svc.createChannel({ memberAccountIds: [bob.id], agentIds: ['ag-red'] }),
      )
      assert.equal(created.channel.name, 'Alice、Bob、赤板灵')

      // 发两条消息后，默认名聊天自动根据内容取名
      asUser(alice.id, () => svc.sendMessage(created.channel.id, { text: '支付回调今天偶尔 502' }))
      asUser(bob.id, () => svc.sendMessage(created.channel.id, { text: '我查下网关日志定位一下' }))

      await waitFor(() => asUser(alice.id, () => svc.getChannelDetail(created.channel.id).channel.name) === '支付接口排查')

      // 手动命名的聊天不会被自动覆盖
      const manual = asUser(alice.id, () =>
        svc.createChannel({ name: '固定群名', memberAccountIds: [bob.id] }),
      )
      asUser(alice.id, () => svc.sendMessage(manual.channel.id, { text: '第一条' }))
      asUser(bob.id, () => svc.sendMessage(manual.channel.id, { text: '第二条' }))
      await new Promise((r) => setTimeout(r, 80))
      assert.equal(asUser(alice.id, () => svc.getChannelDetail(manual.channel.id).channel.name), '固定群名')

      // 但主动触发 autoNameChannel 仍可根据内容生成标题
      const renamed = await asUser(alice.id, () => svc.autoNameChannel(manual.channel.id))
      assert.equal(renamed.name, '支付接口排查')
    } finally {
      svc.dispose()
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('prunes soft-deleted and hard-deleted agents from channel_members while preserving message history', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'biu-channels-prune-'))
    const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
    const store = new CollabStore(db)
    const alice = store.register('Alice', Date.now(), 'pass123456', 'alice@example.com')
    const bob = store.register('Bob', Date.now(), 'pass123456', 'bob@example.com')
    const ws = store.createWorkspace(alice.id, 'Prune WS')
    store.addMemberByEmail(alice.id, ws.id, 'bob@example.com')

    const agents = new Map<string, { id: string; title: string }>([
      ['ag-soft', { id: 'ag-soft', title: '软删助手' }],
      ['ag-hard', { id: 'ag-hard', title: '硬删助手' }],
      ['ag-keep', { id: 'ag-keep', title: '留存助手' }],
    ])
    for (const id of agents.keys()) {
      runWithAccount(alice.id, () =>
        runWithRequestWorkspace(ws.id, () => store.attach(ws.id, '/agents', id, Date.now(), { accessMode: 'private' })),
      )
    }

    const dbChangeListeners = new Set<() => void>()
    const broadcasts: Array<{ type: string; payload: unknown }> = []
    const httpMock = {
      broadcastAccount: (_acc: string, type: string, payload: unknown) => {
        broadcasts.push({ type, payload })
      },
      broadcast: (type: string, payload: unknown) => {
        broadcasts.push({ type, payload })
      },
    }
    const fakeCtx = {
      get: (key: string) => (key === 'account' ? { store } : undefined),
      on: (event: string, fn: () => void) => {
        if (event === 'database/change') {
          dbChangeListeners.add(fn)
          return () => dbChangeListeners.delete(fn)
        }
        return () => undefined
      },
      sessions: {
        peekSummary: (id: string) => {
          const item = agents.get(id)
          return item ? { id: item.id, title: item.title, config: { systemPrompt: '' } } : null
        },
      },
      http: httpMock,
      effect: () => undefined,
    } as unknown as Context

    const svc = new ChannelService(
      fakeCtx,
      () => ({ chat: async () => ({ content: '收到，历史消息应保留', toolCalls: [] }) }),
      { db },
    )
    const asUser = <T>(acc: string, fn: () => T) => runWithAccount(acc, () => runWithRequestWorkspace(ws.id, fn))

    try {
      const created = asUser(alice.id, () =>
        svc.createChannel({
          name: '清理测试群',
          memberAccountIds: [bob.id],
          agentIds: ['ag-soft', 'ag-hard', 'ag-keep'],
        }),
      )
      // 让 ag-soft 发一条历史消息
      asUser(alice.id, () =>
        svc.sendMessage(created.channel.id, {
          text: '@软删助手 说句话',
          mentions: [{ kind: 'agent', id: 'ag-soft', label: '软删助手' }],
        }),
      )
      await waitFor(() =>
        asUser(alice.id, () =>
          svc.getChannelDetail(created.channel.id).messages.some((m) => m.senderType === 'agent' && m.senderId === 'ag-soft'),
        ),
      )

      // 1. 软删除 ag-soft（移入回收站）并触发 database/change
      db.prepare(`INSERT INTO record_meta (collection, record_id, deleted_at) VALUES ('/agents', ?, ?)`).run('ag-soft', Date.now())
      broadcasts.length = 0
      for (const fn of dbChangeListeners) fn()

      const afterSoft = asUser(alice.id, () => svc.getChannelDetail(created.channel.id))
      const softAgentIds = afterSoft.members.filter((m) => m.memberType === 'agent').map((m) => m.memberId)
      assert.deepEqual(softAgentIds.sort(), ['ag-hard', 'ag-keep'])
      assert.ok(broadcasts.some((b) => b.type === 'channel/members'))
      assert.ok(afterSoft.messages.some((m) => m.senderType === 'agent' && m.senderId === 'ag-soft'))

      // 2. 硬删除 ag-hard（session 被彻底移除），读取成员列表时自动兜底清理
      agents.delete('ag-hard')
      const afterHard = asUser(alice.id, () => svc.getChannelDetail(created.channel.id))
      const hardAgentIds = afterHard.members.filter((m) => m.memberType === 'agent').map((m) => m.memberId)
      assert.deepEqual(hardAgentIds, ['ag-keep'])
    } finally {
      svc.dispose()
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('projects 1v1 project & work summary read-only into channel, tags owner vs member, blocks non-owner mode/sync, and never pollutes 1v1', async () => {
    const summaryText = buildReadonlySessionContextSummary({
      project: { name: 'hello', path: '/workspace/hello' },
      goal: { objective: '定位支付 502', status: 'pursuing' },
      events: [
        { type: 'user/message', text: '排查一下支付回调为什么偶发 502' },
        { type: 'assistant/message', text: '已定位到上游网关超时配置偏短，需调高至 30s。' },
      ],
    })
    assert.ok(summaryText.includes('绑定项目：hello · /workspace/hello'))
    assert.ok(summaryText.includes('已定位到上游网关超时配置偏短'))

    const dir = mkdtempSync(join(tmpdir(), 'biu-channels-projection-'))
    const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
    const store = new CollabStore(db)
    const alice = store.register('Alice', Date.now(), 'pass123456', 'alice@example.com')
    const bob = store.register('Bob', Date.now(), 'pass123456', 'bob@example.com')
    const ws = store.createWorkspace(alice.id, 'Proj WS')
    store.addMemberByEmail(alice.id, ws.id, 'bob@example.com')
    runWithAccount(alice.id, () =>
      runWithRequestWorkspace(ws.id, () => {
        store.attach(ws.id, '/agents', 'ag-diag', Date.now(), { accessMode: 'private' })
      }),
    )

    const appendedTo1v1: Array<{ id: string; body: { type: string; text: string; kind?: string } }> = []
    const capturedPrompts: Array<{ system: string; users: string[] }> = []

    const fakeCtx = {
      get: (key: string) => (key === 'account' ? { store } : undefined),
      account: { store },
      sessions: {
        peekSummary: (id: string) =>
          id === 'ag-diag'
            ? { id, title: '项目问题诊断', project: { name: 'hello', path: '/workspace/hello' }, config: {} }
            : null,
        require: async (id: string) => {
          if (id !== 'ag-diag') throw new Error('not found')
          return {
            id,
            title: '项目问题诊断',
            project: { name: 'hello', path: '/workspace/hello' },
            events: [
              { type: 'user/message', text: '排查支付 502 根因' },
              { type: 'assistant/message', text: '确认是连接池耗尽导致的 502。' },
            ],
          }
        },
        append: async (id: string, body: { type: string; text: string; kind?: string }) => {
          appendedTo1v1.push({ id, body })
        },
      },
      tools: { schemas: () => [], invoke: async () => ({ ok: true }) },
      http: { broadcast: () => undefined, broadcastAccount: () => undefined },
      effect: () => undefined,
    } as unknown as Context

    const svc = new ChannelService(
      fakeCtx,
      () => ({
        chat: async (messages) => {
          const system = String(messages.find((m) => m.role === 'system')?.content ?? '')
          const users = messages.filter((m) => m.role === 'user').map((m) => String(m.content ?? ''))
          capturedPrompts.push({ system, users })
          return { content: '结论：连接池耗尽导致 502，已同步方案。', toolCalls: [] }
        },
      }),
      { db },
    )
    const asUser = <T>(acc: string, fn: () => T) => runWithAccount(acc, () => runWithRequestWorkspace(ws.id, fn))

    try {
      // 默认创建为 summary（单向只读投影）
      const ch = asUser(alice.id, () =>
        svc.createChannel({ name: '排障群', memberAccountIds: [bob.id], agentIds: ['ag-diag'] }),
      )
      assert.equal(ch.members.find((m) => m.memberId === 'ag-diag')?.contextMode, 'summary')

      // Bob（非归属人）在群里 @ Alice 的 Agent
      asUser(bob.id, () => svc.sendMessage(ch.channel.id, { text: '@项目问题诊断 同步一下刚才排查的结论' }))
      await waitFor(() => capturedPrompts.length === 1)

      // 1. 系统提示词单向投影了项目和 1v1 摘要 + 防干扰护栏
      assert.ok(capturedPrompts[0]!.system.includes('【主工作台只读背景'))
      assert.ok(capturedPrompts[0]!.system.includes('绑定项目：hello · /workspace/hello'))
      assert.ok(capturedPrompts[0]!.system.includes('确认是连接池耗尽导致的 502'))
      assert.ok(capturedPrompts[0]!.system.includes('非归属人无权通过群聊指令修改'))
      // 2. 消息明确区分归属人 vs 群成员
      assert.ok(capturedPrompts[0]!.users.some((u) => u.includes('[Bob · 群成员]:')))
      // 3. 严格单向只读：群聊对话绝对不会自动写回 1v1
      assert.equal(appendedTo1v1.length, 0)

      // 4. 非归属人（Bob）不能切换 Alice 的 Agent 的上下文模式，也不能向其 1v1 同步写回
      assert.throws(
        () => asUser(bob.id, () => svc.updateAgentContextMode(ch.channel.id, 'ag-diag', 'isolated')),
        /permission denied/,
      )
      await assert.rejects(
        () => asUser(bob.id, () => svc.syncChannelToAgent(ch.channel.id, 'ag-diag')),
        /permission denied/,
      )

      // 5. 归属人（Alice）切换为 isolated（仅群聊隔离）后，再次 @ 不再注入 1v1 背景
      const updatedMembers = asUser(alice.id, () => svc.updateAgentContextMode(ch.channel.id, 'ag-diag', 'isolated'))
      assert.equal(updatedMembers.find((m) => m.memberId === 'ag-diag')?.contextMode, 'isolated')

      asUser(alice.id, () => svc.sendMessage(ch.channel.id, { text: '@项目问题诊断 现在呢？' }))
      await waitFor(() => capturedPrompts.length === 2)
      assert.equal(capturedPrompts[1]!.system.includes('【主工作台只读背景'), false)
      assert.ok(capturedPrompts[1]!.users.some((u) => u.includes('[Alice · 归属人]:')))
      assert.equal(appendedTo1v1.length, 0)

      // 6. 归属人（Alice）手动同步某条群聊结论回 1v1 主工作台 → 成功写入
      const agentReplyMsg = asUser(alice.id, () => svc.listMessages(ch.channel.id)).find((m) => m.senderType === 'agent')
      assert.ok(agentReplyMsg)
      const syncRes = await asUser(alice.id, () => svc.syncChannelToAgent(ch.channel.id, 'ag-diag', agentReplyMsg.id))
      assert.equal(syncRes.ok, true)
      assert.equal(appendedTo1v1.length, 1)
      assert.equal(appendedTo1v1[0]!.id, 'ag-diag')
      assert.ok(appendedTo1v1[0]!.body.text.includes('来自聊天「#排障群」的同步结论'))
      assert.ok(appendedTo1v1[0]!.body.text.includes('连接池耗尽导致 502'))
    } finally {
      svc.dispose()
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('supports unread/read cursors, @mention notices, attachments, edit/recall permissions, and cursor pagination', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'biu-channels-p0-'))
    const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
    const store = new CollabStore(db)
    const alice = store.register('Alice', Date.now(), 'pass123456', 'alice@example.com')
    const bob = store.register('Bob', Date.now(), 'pass123456', 'bob@example.com')
    const carol = store.register('Carol', Date.now(), 'pass123456', 'carol@example.com')
    const ws = store.createWorkspace(alice.id, 'P0 WS')
    store.addMemberByEmail(alice.id, ws.id, 'bob@example.com')
    store.addMemberByEmail(alice.id, ws.id, 'carol@example.com')

    const pushedNotices: Array<Record<string, unknown>> = []
    const readNoticeSources: string[] = []
    const fakeCtx = {
      get: (key: string) => {
        if (key === 'account') return { store }
        if (key === 'notices') {
          return {
            push: (input: Record<string, unknown>) => {
              pushedNotices.push(input)
              return input
            },
            markSourceRead: (sourceKey: string) => {
              readNoticeSources.push(sourceKey)
              return 1
            },
          }
        }
        return undefined
      },
      account: { store },
      sessions: { peekSummary: () => null },
      tools: { schemas: () => [], invoke: async () => ({ ok: true }) },
      http: { broadcast: () => undefined, broadcastAccount: () => undefined },
      effect: () => undefined,
    } as unknown as Context

    const svc = new ChannelService(
      fakeCtx,
      () => ({ chat: async () => ({ content: 'ok', toolCalls: [] }) }),
      { db },
    )
    const asUser = <T>(acc: string, fn: () => T) => runWithAccount(acc, () => runWithRequestWorkspace(ws.id, fn))

    try {
      const created = asUser(alice.id, () =>
        svc.createChannel({ name: '研发协作', memberAccountIds: [bob.id, carol.id] }),
      )
      const chId = created.channel.id

      // 1. Alice 发消息 @Bob，Bob 收到未读数 + @提及数 + 通知中心推送
      const m1 = asUser(alice.id, () => svc.sendMessage(chId, { text: '你好 @Bob 请看下报错' })).message
      const m2 = asUser(alice.id, () => svc.sendMessage(chId, { text: '第二条跟进消息' })).message

      assert.equal(pushedNotices.length, 1)
      assert.equal(pushedNotices[0]!.accountId, bob.id)
      assert.ok(String(pushedNotices[0]!.href).includes(`/channels/${chId}?msg=${m1.id}`))

      const bobListBefore = asUser(bob.id, () => svc.listChannels())
      assert.equal(bobListBefore[0]!.unreadCount, 2)
      assert.equal(bobListBefore[0]!.mentionCount, 1)

      // Bob 标记已读 → 未读清零并同步清除通知
      const marked = asUser(bob.id, () => svc.markRead(chId))
      assert.equal(marked.lastReadSeq, m2.seq)
      assert.ok(readNoticeSources.includes(`channel-mention:${chId}`))
      const bobListAfter = asUser(bob.id, () => svc.listChannels())
      assert.equal(bobListAfter[0]!.unreadCount, 0)
      assert.equal(bobListAfter[0]!.mentionCount, 0)

      // 2. 上传图片附件并发送纯附件消息
      const pngBytes = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])
      const att = asUser(bob.id, () => svc.saveUpload(chId, { name: 'error.png', mime: 'image/png', data: pngBytes }))
      assert.equal(att.kind, 'image')
      assert.equal(att.size, pngBytes.byteLength)
      const loadedAtt = asUser(alice.id, () => svc.readUpload(chId, att.id))
      assert.ok(loadedAtt)
      assert.equal(loadedAtt.mime, 'image/png')

      const m3 = asUser(bob.id, () => svc.sendMessage(chId, { text: '', attachments: [att] })).message
      assert.equal(m3.attachments?.length, 1)
      assert.equal(m3.attachments?.[0]!.name, 'error.png')

      // 3. 消息编辑与撤回权限
      assert.throws(() => asUser(alice.id, () => svc.editMessage(chId, m3.id, '篡改')), /permission denied/)
      const edited = asUser(alice.id, () => svc.editMessage(chId, m1.id, '你好 @Bob 已补充日志'))
      assert.equal(edited.text, '你好 @Bob 已补充日志')
      assert.ok((edited.editedAt ?? 0) > 0)

      // 普通成员 Carol 不能撤回 Bob 的消息，但群主 Alice 可以，发送者 Bob 也可以
      assert.throws(() => asUser(carol.id, () => svc.recallMessage(chId, m3.id)), /permission denied/)
      const recalled = asUser(bob.id, () => svc.recallMessage(chId, m3.id))
      assert.equal(recalled.text, '')
      assert.ok((recalled.deletedAt ?? 0) > 0)
      assert.equal(recalled.attachments, undefined)
      assert.throws(() => asUser(bob.id, () => svc.editMessage(chId, m3.id, '再改')), /已撤回/)

      // 4. 游标分页（beforeSeq）
      const m4 = asUser(alice.id, () => svc.sendMessage(chId, { text: '第四条' })).message
      const page1 = asUser(alice.id, () => svc.listMessagesPage(chId, alice.id, 2))
      assert.equal(page1.messages.length, 2)
      assert.equal(page1.hasMore, true)
      assert.equal(page1.messages[1]!.id, m4.id)

      const page2 = asUser(alice.id, () => svc.listMessagesPage(chId, alice.id, 2, page1.messages[0]!.seq))
      assert.equal(page2.messages.length, 2)
      assert.equal(page2.hasMore, false)
      assert.equal(page2.messages[0]!.id, m1.id)
    } finally {
      svc.dispose()
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('supports emoji reactions, pin/save messages, cross-channel search, preferences (pin/mute), typing broadcast, and leaving channels', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'biu-channels-p1-'))
    const db = openAndMigrateBiu(join(dir, 'biu.sqlite'))
    const store = new CollabStore(db)
    const alice = store.register('Alice', Date.now(), 'pass123456', 'alice@example.com')
    const bob = store.register('Bob', Date.now(), 'pass123456', 'bob@example.com')
    const ws = store.createWorkspace(alice.id, 'P1 WS')
    store.addMemberByEmail(alice.id, ws.id, 'bob@example.com')

    const broadcasts: Array<{ type: string; payload: unknown }> = []
    const fakeCtx = {
      get: (key: string) => (key === 'account' ? { store } : undefined),
      account: { store },
      sessions: { peekSummary: () => null },
      tools: { schemas: () => [], invoke: async () => ({ ok: true }) },
      http: {
        broadcast: (type: string, payload: unknown) => broadcasts.push({ type, payload }),
        broadcastAccount: (_acc: string, type: string, payload: unknown) => broadcasts.push({ type, payload }),
      },
      effect: () => undefined,
    } as unknown as Context

    const svc = new ChannelService(
      fakeCtx,
      () => ({ chat: async () => ({ content: 'ok', toolCalls: [] }) }),
      { db },
    )
    const asUser = <T>(acc: string, fn: () => T) => runWithAccount(acc, () => runWithRequestWorkspace(ws.id, fn))

    try {
      const ch = asUser(alice.id, () => svc.createChannel({ name: '发布群', memberAccountIds: [bob.id] }))
      const chId = ch.channel.id
      const ch2 = asUser(alice.id, () => svc.createChannel({ name: '私密群' })) // Bob 不在内

      const m1 = asUser(alice.id, () => svc.sendMessage(chId, { text: '版本 v2.1 上线检查清单' })).message
      asUser(alice.id, () => svc.sendMessage(ch2.channel.id, { text: '版本 v2.1 内部机密密码' }))

      // 1. Emoji Reactions 累加与切换
      const r1 = asUser(alice.id, () => svc.toggleReaction(chId, m1.id, '👍'))
      assert.equal(r1.reactions.length, 1)
      assert.equal(r1.reactions[0]!.count, 1)
      const r2 = asUser(bob.id, () => svc.toggleReaction(chId, m1.id, '👍'))
      assert.equal(r2.reactions[0]!.count, 2)
      assert.equal(r2.reactions[0]!.reactedByMe, true)
      const r3 = asUser(bob.id, () => svc.toggleReaction(chId, m1.id, '👍'))
      assert.equal(r3.reactions[0]!.count, 1)

      // 2. 置顶消息与个人收藏
      const pinned = asUser(bob.id, () => svc.togglePinMessage(chId, m1.id))
      assert.ok((pinned.pinnedAt ?? 0) > 0)
      assert.equal(asUser(alice.id, () => svc.listPinnedMessages(chId)).length, 1)

      const saved = asUser(bob.id, () => svc.toggleSaveMessage(chId, m1.id))
      assert.equal(saved.saved, true)
      assert.equal(asUser(bob.id, () => svc.listSavedMessages()).length, 1)
      assert.equal(asUser(alice.id, () => svc.listSavedMessages()).length, 0)

      // 3. 跨聊天搜索（权限隔离：Bob 搜不到不在其中的私密群消息）
      const bobHits = asUser(bob.id, () => svc.searchMessages({ q: 'v2.1' }))
      assert.equal(bobHits.length, 1)
      assert.equal(bobHits[0]!.channelId, chId)
      const aliceHits = asUser(alice.id, () => svc.searchMessages({ q: 'v2.1' }))
      assert.equal(aliceHits.length, 2)

      // 4. 偏好设置（置顶聊天、免打扰）与正在输入广播
      const pref = asUser(bob.id, () => svc.updatePreferences(chId, { pinned: true, muted: true }))
      assert.equal(pref.pinned, true)
      assert.equal(pref.muted, true)

      broadcasts.length = 0
      asUser(alice.id, () => svc.notifyTyping(chId))
      assert.ok(broadcasts.some((b) => b.type === 'channel/typing'))

      // 5. 退群：群主不能退群，普通成员 Bob 可以主动退群
      assert.throws(() => asUser(alice.id, () => svc.leaveChannel(chId)), /群主不能直接退群/)
      const left = asUser(bob.id, () => svc.leaveChannel(chId))
      assert.equal(left.ok, true)
      assert.equal(asUser(bob.id, () => svc.listChannels()).some((c) => c.id === chId), false)
    } finally {
      svc.dispose()
      db.close()
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
