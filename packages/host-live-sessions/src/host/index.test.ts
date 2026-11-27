import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as sessionStore from '@biu/host-session-store'
import * as sessions from '@biu/host-sessions'
import * as tools from '@biu/host-tools'
import * as systemPrompt from '@biu/host-agents/system-prompt'
import * as llm from '@biu/host-llm'
import * as agentLoop from '@biu/host-agent-loop'
import * as agents from '@biu/host-agents'
import * as liveSessions from './index.ts'

test('live plugin no longer registers session_* tools', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)
  await ctx.plugin(liveSessions)
  const names = ctx.tools.names()
  assert.equal(names.some((name) => name.startsWith('session_')), false)
})

test('session turn follows tool mode and does not special-case a live type', async () => {
  const ctx = new Context()
  await ctx.plugin(sessionStore, { driver: 'memory' })
  await ctx.plugin(sessions)
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  await ctx.plugin(llm)
  await ctx.plugin(agentLoop)
  await ctx.plugin(agents)
  await ctx.plugin(liveSessions)

  ctx.tools.register({
    name: 'bash',
    description: 'bash',
    parameters: { type: 'object', properties: {} },
    execute: () => 'ok',
  })
  ctx.tools.register({
    name: 'db_action',
    description: 'db action',
    parameters: { type: 'object', properties: {} },
    execute: () => 'ok',
  })
  ctx.tools.setMode('minimal')
  assert.deepEqual(ctx.tools.names().sort(), ['bash'])

  const session = await ctx.sessions.create()
  let seen: string[] = []
  const { AgentLoop } = await import('@biu/host-agent-loop')
  const loop = new AgentLoop(
    ctx,
    {
      async chat(_messages, toolSchemas) {
        seen = (toolSchemas as Array<{ function: { name: string } }>).map((item) => item.function.name).sort()
        return { content: 'ok', toolCalls: [], usage: { inputTokens: 1, outputTokens: 1 } }
      },
    },
    session.id,
    new AbortController().signal,
  )
  await loop.run([{ kind: 'wake', text: 'list sessions' }])
  assert.equal(seen.includes('bash'), true)
  assert.equal(seen.includes('db_action'), true)
  assert.deepEqual(ctx.tools.names().sort(), ['bash'])
})
