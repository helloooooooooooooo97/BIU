import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Context } from 'cordis'
import * as sessionStore from '@biu/host-session-store'
import * as sessions from '@biu/host-sessions'
import * as tools from '@biu/host-tools'
import * as systemPrompt from '@biu/host-agents/system-prompt'
import * as llm from '@biu/host-llm'
import * as agentLoop from '@biu/host-agent-loop'
import * as agents from './index.ts'

test('AgentsService.evictIdle removes stale idle agents without touching active ones', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)

  const a = await ctx.agents.create('sess-stale')
  const b = await ctx.agents.create('sess-fresh')
  const c = await ctx.agents.create('sess-queued')
  c.inject('pending note')

  // Evict with future timestamp beyond TTL for a/b, but keep b fresh via create()
  const now = Date.now()
  assert.equal(ctx.agents.evictIdle(now + 1000, 60_000), 0)

  // Simulate only sess-stale being old by updating b's timestamp via create()
  await ctx.agents.create(b.sessionId)
  const evicted = ctx.agents.evictIdle(now + 120_000, 60_000)
  assert.equal(evicted, 2)
  assert.equal(ctx.agents.get(a.sessionId), undefined)
  assert.equal(ctx.agents.get(b.sessionId), undefined)
  // Agent with queued inbox must NOT be evicted
  assert.ok(ctx.agents.get(c.sessionId))
})
