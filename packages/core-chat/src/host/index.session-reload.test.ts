/** @vitest-environment node */
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as sessionStore from '@biu/host-session-store'
import * as sessions from '@biu/host-sessions'
import { openSessionHttpPayload } from './index.ts'

test('a sent message is still readable after refresh, even if another session denies access', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'biu-session-reload-'))
  const path = join(dir, 'biu.sqlite')
  const boot = async () => {
    const ctx = new Context()
    const store = await ctx.plugin(sessionStore, { driver: 'sqlite', path })
    const live = await ctx.plugin(sessions)
    return { ctx, stop: async () => { await live.dispose(); await store.dispose() } }
  }
  try {
    const first = await boot()
    const record = await first.ctx.sessions.create('刚说的一句')
    await first.ctx.sessions.append(record.id, { type: 'turn/start', turn: 1 })
    await first.ctx.sessions.append(record.id, { type: 'user/message', text: '你好', kind: 'wake' })
    const other = await first.ctx.sessions.create('别人的')
    await first.ctx.sessions.append(other.id, { type: 'user/message', text: '秘密', kind: 'wake' })
    await first.stop()

    const reloaded = await boot()
    const originalRequire = reloaded.ctx.sessions.require.bind(reloaded.ctx.sessions)
    reloaded.ctx.sessions.require = async (id: string) => {
      if (id === other.id) throw new Error('没有权限')
      return originalRequire(id)
    }
    ;(reloaded.ctx as { tasks?: { list: () => never } }).tasks = {
      list() {
        throw new Error('没有权限')
      },
    }
    const opened = await openSessionHttpPayload(reloaded.ctx, record.id, 100)
    assert.equal(opened.status, 200)
    const events = opened.body.events as Array<{ type: string; text?: string }>
    assert.equal(events.some((event) => event.type === 'user/message' && event.text === '你好'), true)
    await reloaded.stop()
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test('opening a session does not read every other session log', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'biu-session-open-'))
  const path = join(dir, 'biu.sqlite')
  const ctx = new Context()
  const store = await ctx.plugin(sessionStore, { driver: 'sqlite', path })
  const live = await ctx.plugin(sessions)
  try {
    const target = await ctx.sessions.create('当前')
    const others: string[] = []
    for (let i = 0; i < 20; i += 1) {
      const created = await ctx.sessions.create(`其他 ${i}`)
      others.push(created.id)
      for (let n = 0; n < 30; n += 1) {
        await ctx.sessions.append(created.id, { type: 'user/message', text: `日志 ${n}`, kind: 'wake' })
      }
    }
    const required: string[] = []
    const original = ctx.sessions.require.bind(ctx.sessions)
    ctx.sessions.require = async (id: string) => {
      required.push(id)
      return original(id)
    }
    const started = performance.now()
    const opened = await openSessionHttpPayload(ctx, target.id, 20)
    const elapsed = performance.now() - started
    assert.equal(opened.status, 200)
    assert.deepEqual(required.filter((id) => id !== target.id), [])
    assert.ok(elapsed < 400, `打开会话用了 ${Math.round(elapsed)}ms`)
  } finally {
    await live.dispose()
    await store.dispose()
    await rm(dir, { recursive: true, force: true })
  }
})
