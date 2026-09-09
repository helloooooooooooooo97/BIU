import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import * as tools from '@biu/host-tools'
import * as systemPrompt from './index.ts'

test('system prompt sections assemble in id order', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  ctx.systemPrompt.register('z-tail', '尾部')
  ctx.systemPrompt.register('a-head', '头部')
  const text = ctx.systemPrompt.assemble()
  assert.match(text, /头部[\s\S]*尾部/)
  assert.match(text, /可用工具/)
})

test('assemble appends live ui context', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  await ctx.plugin(systemPrompt)
  const text = ctx.systemPrompt.assemble({
    sessionId: 's1',
    sessionTitle: '配图',
    route: '/database/pages/record/p002',
    focusTitle: '爱乐之城',
    focusPath: '/pages/p002',
  })
  assert.match(text, /当前界面/)
  assert.match(text, /主会话：配图 id=s1/)
  assert.match(text, /爱乐之城 \/pages\/p002/)
})
