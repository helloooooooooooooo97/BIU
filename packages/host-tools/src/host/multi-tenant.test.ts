import assert from 'node:assert/strict'
import { test } from 'vitest'
import { Context } from 'cordis'
import { runWithAccount } from '@biu/host-plugin-loader/data-dir'
import * as tools from './index.ts'

test('ToolsService isolates agent mode and pinnedExtras per account', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)

  ctx.tools.register({
    name: 'bash',
    description: 'shell',
    parameters: { type: 'object', properties: {} },
    execute: async () => 'ok',
  })
  ctx.tools.register({
    name: 'db_list',
    description: 'list db',
    parameters: { type: 'object', properties: {} },
    execute: async () => 'ok',
  })
  ctx.tools.register({
    name: 'custom_search',
    description: 'search',
    parameters: { type: 'object', properties: {} },
    execute: async () => 'ok',
  })

  runWithAccount('acct-alice', () => {
    ctx.tools.setMode('file')
  })
  runWithAccount('acct-bob', () => {
    ctx.tools.setMode('minimal')
    ctx.tools.setPinnedExtras(['custom_search'])
  })

  // Alice only sees db_* tools; Bob sees bash + custom_search; Carol defaults to standard
  const aliceNames = runWithAccount('acct-alice', () => ctx.tools.names())
  const bobNames = runWithAccount('acct-bob', () => ctx.tools.names())
  const carolNames = runWithAccount('acct-carol', () => ctx.tools.names())

  assert.deepEqual(aliceNames, ['db_list'])
  assert.ok(bobNames.includes('bash'))
  assert.ok(bobNames.includes('custom_search'))
  assert.equal(bobNames.includes('db_list'), false)
  assert.equal(carolNames.length, 3)
})
