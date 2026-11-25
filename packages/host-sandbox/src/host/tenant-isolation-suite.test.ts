import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import { Context } from 'cordis'
import { runWithAccount, runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import * as tools from '@biu/host-tools'
import * as fs from '@biu/host-fs'
import * as sandbox from './index.ts'
import * as subprocess from '@biu/host-subprocess'
import * as terminal from '@biu/host-terminal'
import * as jobs from '@biu/host-subprocess/jobs'
import * as approvals from '@biu/host-approvals'
import * as lsp from '@biu/host-lsp'
import * as mcp from '@biu/host-mcp'

function withTenant<T>(accountId: string, workspaceId: string, fn: () => T): T {
  return runWithAccount(accountId, () => runWithRequestWorkspace(workspaceId, fn))
}

test('TerminalService isolates named/anonymous terminals across tenants', async () => {
  const ctx = new Context()
  const root = mkdtempSync(join(tmpdir(), 'biu-term-mt-'))
  try {
    await ctx.plugin(tools)
    await ctx.plugin(fs, { root })
    await ctx.plugin(sandbox)
    await ctx.plugin(terminal)

    const a = withTenant('acct-a', 'ws-1', () => ctx.terminals.open('shared'))
    const b = withTenant('acct-b', 'ws-1', () => ctx.terminals.open('shared'))
    assert.notEqual(a.id, b.id)
    assert.equal(a.reused, false)
    assert.equal(b.reused, false)

    // Same tenant reuses its own named terminal
    const aAgain = withTenant('acct-a', 'ws-1', () => ctx.terminals.open('shared'))
    assert.equal(aAgain.id, a.id)
    assert.equal(aAgain.reused, true)

    // Cross-tenant read/write/close/get are all rejected
    assert.throws(() => withTenant('acct-b', 'ws-1', () => ctx.terminals.read(a.id)), /unknown terminal/)
    assert.throws(() => withTenant('acct-b', 'ws-1', () => ctx.terminals.write(a.id, 'echo x\n')), /unknown terminal/)
    assert.throws(() => withTenant('acct-b', 'ws-1', () => ctx.terminals.close(a.id)), /unknown terminal/)
    assert.equal(withTenant('acct-b', 'ws-1', () => ctx.terminals.get(a.id)), null)

    // list() only shows current tenant terminals
    const listA = withTenant('acct-a', 'ws-1', () => ctx.terminals.list().terms.map((t) => t.id))
    const listB = withTenant('acct-b', 'ws-1', () => ctx.terminals.list().terms.map((t) => t.id))
    assert.deepEqual(listA, [a.id])
    assert.deepEqual(listB, [b.id])

    withTenant('acct-a', 'ws-1', () => ctx.terminals.close(a.id))
    withTenant('acct-b', 'ws-1', () => ctx.terminals.close(b.id))
  } finally {
    await new Promise((r) => setTimeout(r, 50))
    rmSync(root, { recursive: true, force: true })
  }
})

test('JobsService isolates job_list, job_collect, and job_cancel per tenant', async () => {
  const ctx = new Context()
  const root = mkdtempSync(join(tmpdir(), 'biu-jobs-mt-'))
  try {
    await ctx.plugin(tools)
    await ctx.plugin(fs, { root })
    await ctx.plugin(sandbox)
    await ctx.plugin(subprocess)
    await ctx.plugin(jobs)

    const jobA = await withTenant('acct-a', 'ws-1', () =>
      ctx.jobs.start(subprocess.posixShellArgv('echo secret-a')),
    )
    const listB = withTenant('acct-b', 'ws-1', () => ctx.jobs.list())
    assert.equal(listB.length, 0)
    assert.throws(() => withTenant('acct-b', 'ws-1', () => ctx.jobs.collect(jobA.id)), /unknown job/)
    assert.throws(() => withTenant('acct-b', 'ws-1', () => ctx.jobs.cancel(jobA.id)), /unknown job/)

    // Owner can list & collect
    const listA = withTenant('acct-a', 'ws-1', () => ctx.jobs.list())
    assert.equal(listA.length, 1)
    assert.equal(listA[0]?.id, jobA.id)
    withTenant('acct-a', 'ws-1', () => ctx.jobs.cancel(jobA.id))
  } finally {
    await new Promise((r) => setTimeout(r, 50))
    rmSync(root, { recursive: true, force: true })
  }
})

test('ApprovalsService isolates mode, pending queue, and decide() per tenant', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  await ctx.plugin(approvals)

  ctx.tools.register({
    name: 'bash',
    description: 'shell',
    parameters: { type: 'object', properties: {} },
    execute: async () => 'ran',
  })

  const notified: approvals.ApprovalNotifyPayload[] = []
  ctx.approvals.setNotify((payload) => notified.push(payload))

  // Alice enables hold mode; Bob remains in auto mode
  withTenant('acct-a', 'ws-1', () => {
    ctx.approvals.mode = 'hold'
  })
  assert.equal(withTenant('acct-a', 'ws-1', () => ctx.approvals.mode), 'hold')
  assert.equal(withTenant('acct-b', 'ws-1', () => ctx.approvals.mode), 'auto')

  // Bob runs bash immediately without blocking
  const bobRes = await withTenant('acct-b', 'ws-1', () => ctx.tools.invoke('bash', {}))
  assert.equal(bobRes, 'ran')

  // Alice's bash blocks pending approval
  const alicePending = withTenant('acct-a', 'ws-1', () => ctx.tools.invoke('bash', {}))
  await new Promise((r) => setTimeout(r, 20))

  assert.equal(notified.length, 1)
  assert.equal(notified[0]?.accountId, 'acct-a')
  assert.equal(notified[0]?.workspaceId, 'ws-1')
  const approvalId = notified[0]!.id

  // Bob cannot see or decide Alice's approval
  assert.deepEqual(withTenant('acct-b', 'ws-1', () => ctx.approvals.list()), [])
  assert.throws(() => withTenant('acct-b', 'ws-1', () => ctx.approvals.decide(approvalId, true)), /unknown approval/)

  // Alice approves her own tool call
  withTenant('acct-a', 'ws-1', () => ctx.approvals.decide(approvalId, true))
  assert.equal(await alicePending, 'ran')
})

test('LspService and McpService block host process execution (lsp_start / stdio MCP) in cloud runtime', async () => {
  const prevOnline = process.env.BIU_ONLINE
  const prevHome = process.env.BIU_HOME
  const tempHome = mkdtempSync(join(tmpdir(), 'biu-cloud-block-'))
  process.env.BIU_ONLINE = '1'
  process.env.BIU_HOME = tempHome
  try {
    const ctx = new Context()
    await ctx.plugin(tools)
    await ctx.plugin(fs, { root: tempHome })
    await ctx.plugin(lsp)
    await ctx.plugin(mcp)

    assert.throws(() => ctx.lsp.start('/bin/sh', ['-c', 'echo pwn']), /disabled in cloud runtime/)
    await assert.rejects(() => ctx.mcp.addStdio('evil', '/bin/sh', ['-c', 'echo pwn']), /disabled in cloud runtime/)
    await assert.rejects(
      () => ctx.mcp.upsert({ id: 'evil2', transport: 'stdio', command: '/bin/sh', args: [] }),
      /disabled in cloud runtime/,
    )
  } finally {
    await new Promise((r) => setTimeout(r, 50))
    if (prevOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = prevOnline
    if (prevHome === undefined) delete process.env.BIU_HOME
    else process.env.BIU_HOME = prevHome
    rmSync(tempHome, { recursive: true, force: true })
  }
})
