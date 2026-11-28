import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as tools from '@biu/host-tools'
import * as approvals from './index.ts'

async function setup() {
  const ctx = new Context()
  await ctx.plugin(tools)
  await ctx.plugin(approvals)
  ctx.tools.register({
    name: 'bash',
    description: 'bash',
    parameters: { type: 'object', properties: { command: { type: 'string' } } },
    execute: () => 'ran',
  })
  ctx.tools.register({
    name: 'echo',
    description: 'echo',
    parameters: { type: 'object', properties: {} },
    execute: () => 'ok',
  })
  return ctx
}

test('hold mode denies sensitive tool until decide(allow)', async () => {
  const ctx = await setup()
  ctx.approvals.mode = 'hold'
  const invoke = ctx.tools.invoke('bash', { command: 'echo' })
  await new Promise((resolve) => setTimeout(resolve, 20))
  const pending = ctx.approvals.list()
  assert.equal(pending.length, 1)
  assert.equal(pending[0]?.name, 'bash')
  ctx.approvals.decide(pending[0]!.id, true)
  assert.equal(await invoke, 'ran')
})

test('hold mode deny blocks sensitive tool', async () => {
  const ctx = await setup()
  ctx.approvals.mode = 'hold'
  const invoke = ctx.tools.invoke('bash', { command: 'echo' })
  await new Promise((resolve) => setTimeout(resolve, 20))
  const [item] = ctx.approvals.list()
  assert.ok(item)
  ctx.approvals.decide(item.id, false)
  await assert.rejects(() => invoke, /denied: bash/)
})

test('hold timeout defaults to deny', async () => {
  const ctx = await setup()
  ctx.approvals.mode = 'hold'
  ctx.approvals.holdTimeoutMs = 30
  await assert.rejects(() => ctx.tools.invoke('bash', { command: 'x' }), /denied: bash/)
})

test('non-sensitive tools skip hold', async () => {
  const ctx = await setup()
  ctx.approvals.mode = 'hold'
  assert.equal(await ctx.tools.invoke('echo'), 'ok')
  assert.equal(ctx.approvals.list().length, 0)
})

test('db_delete waits for approval even in auto mode', async () => {
  const ctx = await setup()
  ctx.tools.register({
    name: 'db_delete',
    description: 'delete',
    parameters: { type: 'object', properties: {} },
    execute: () => 'deleted',
  })
  ctx.approvals.mode = 'auto'
  const invoke = ctx.tools.invoke('db_delete', { path: '/tasks', ids: ['t1'] })
  await new Promise((resolve) => setTimeout(resolve, 20))
  const pending = ctx.approvals.list()
  assert.equal(pending.length, 1)
  assert.equal(pending[0]?.name, 'db_delete')
  ctx.approvals.decide(pending[0]!.id, true)
  assert.equal(await invoke, 'deleted')
})

test('db_delete deny in auto mode blocks the tool', async () => {
  const ctx = await setup()
  ctx.tools.register({
    name: 'db_delete',
    description: 'delete',
    parameters: { type: 'object', properties: {} },
    execute: () => 'deleted',
  })
  ctx.approvals.mode = 'auto'
  const invoke = ctx.tools.invoke('db_delete', { path: '/tasks', ids: ['t1'] })
  await new Promise((resolve) => setTimeout(resolve, 20))
  const [item] = ctx.approvals.list()
  assert.ok(item)
  ctx.approvals.decide(item.id, false)
  await assert.rejects(() => invoke, /denied: db_delete/)
})

test('approvals do not push inbox notices', async () => {
  const { readFileSync } = await import('node:fs')
  const { resolve } = await import('node:path')
  const src = readFileSync(resolve(import.meta.dirname, './index.ts'), 'utf8')
  assert.doesNotMatch(src, /需要审批/)
  assert.doesNotMatch(src, /notices\?\.push/)
})

test('db_action /channels/<id> send runs directly in auto mode and waits for approval in hold mode', async () => {
  const ctx = await setup()
  ctx.tools.register({
    name: 'db_action',
    description: 'action',
    parameters: {
      type: 'object',
      properties: {
        path: { type: 'string' },
        action: { type: 'string' },
        args: { type: 'object' },
      },
      required: ['path', 'action'],
    },
    execute: (args) => ({ ok: true, action: args.action, path: args.path }),
  })

  // auto 模式下可直接向群聊发消息
  ctx.approvals.mode = 'auto'
  const autoRes = await ctx.tools.invoke('db_action', {
    path: '/channels/ch-1',
    action: 'send',
    args: { text: '大家好' },
  })
  assert.deepEqual(autoRes, { ok: true, action: 'send', path: '/channels/ch-1' })
  assert.equal(ctx.approvals.list().length, 0)

  // hold 模式下只读动作（messages/search）不需审批
  ctx.approvals.mode = 'hold'
  const readRes = await ctx.tools.invoke('db_action', {
    path: '/channels/ch-1',
    action: 'messages',
    args: { limit: 10 },
  })
  assert.deepEqual(readRes, { ok: true, action: 'messages', path: '/channels/ch-1' })

  // hold 模式下 send 需要用户确认
  const holdInvoke = ctx.tools.invoke('db_action', {
    path: '/channels/ch-1',
    action: 'send',
    args: { text: '需要确认的消息' },
  })
  await new Promise((resolve) => setTimeout(resolve, 20))
  const pending = ctx.approvals.list()
  assert.equal(pending.length, 1)
  assert.equal(pending[0]?.name, 'db_action')
  ctx.approvals.decide(pending[0]!.id, true)
  assert.deepEqual(await holdInvoke, { ok: true, action: 'send', path: '/channels/ch-1' })

  // hold 模式下拒绝则拦截发送
  const deniedInvoke = ctx.tools.invoke('db_action', {
    path: '/channels/ch-1',
    action: 'send',
    args: { text: '被拒绝的消息' },
  })
  await new Promise((resolve) => setTimeout(resolve, 20))
  const [deniedItem] = ctx.approvals.list()
  assert.ok(deniedItem)
  ctx.approvals.decide(deniedItem.id, false)
  await assert.rejects(() => deniedInvoke, /denied: db_action/)
})
