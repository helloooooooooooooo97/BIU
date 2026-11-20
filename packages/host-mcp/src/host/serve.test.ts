import { afterEach, beforeEach, test } from 'vitest'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context, Service } from 'cordis'
import * as tools from '@biu/host-tools'
import * as http from '@biu/host-http'
import * as mcp from './index.ts'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { bearerToken, generateMcpToken, tokensMatch } from './host-token.ts'
import { isLoopbackAddress } from './serve.ts'
import { currentAccountId, currentRequestWorkspaceId } from '@biu/host-plugin-loader/data-dir'
import WebSocket from 'ws'

let dir = ''
let prevHost = ''
let prevToken: string | undefined

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'biu-mcp-host-'))
  process.env.BIU_MCP_CONFIG = join(dir, 'mcp.json')
  prevHost = process.env.BIU_MCP_HOST ?? ''
  process.env.BIU_MCP_HOST = join(dir, 'mcp-host.json')
  prevToken = process.env.BIU_MCP_TOKEN
  delete process.env.BIU_MCP_TOKEN
})

afterEach(() => {
  delete process.env.BIU_MCP_CONFIG
  if (prevHost) process.env.BIU_MCP_HOST = prevHost
  else delete process.env.BIU_MCP_HOST
  if (prevToken === undefined) delete process.env.BIU_MCP_TOKEN
  else process.env.BIU_MCP_TOKEN = prevToken
  rmSync(dir, { recursive: true, force: true })
})

async function boot() {
  const ctx = new Context()
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  await ctx.plugin(http, { port: 0, host: '127.0.0.1', sharePort: 0 })
  await ctx.plugin(tools)
  ctx.tools.register({
    name: 'db_list',
    description: 'list tables',
    parameters: { type: 'object', properties: { path: { type: 'string' } } },
    execute: (args) => ({ path: String(args.path ?? '/'), rows: ['ok'] }),
  })
  ctx.tools.register({
    name: 'bash',
    description: 'should stay hidden from file-mode MCP',
    parameters: { type: 'object', properties: {} },
    execute: () => ({ leaked: true }),
  })
  await ctx.plugin(mcp)
  const port = await ready
  return { ctx, port }
}

async function mcpClient(url: string, token: string) {
  const client = new Client({ name: 'biu-test', version: '0.0.0' }, { capabilities: {} })
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers: { Authorization: `Bearer ${token}` } },
  })
  await client.connect(transport)
  return client
}

test('bearer parser and token compare', () => {
  assert.equal(bearerToken('Bearer abc'), 'abc')
  assert.equal(tokensMatch('a', 'a'), true)
  assert.equal(tokensMatch('a', 'b'), false)
  assert.equal(tokensMatch('', generateMcpToken()), false)
  assert.equal(isLoopbackAddress('127.0.0.1'), true)
  assert.equal(isLoopbackAddress('::ffff:127.0.0.1'), true)
  assert.equal(isLoopbackAddress('192.168.1.2'), false)
})

test('host MCP requires a bearer token and only exposes file-mode db tools', async () => {
  const { ctx, port } = await boot()
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    assert.equal(denied.status, 401)

    const infoRes = await fetch(`http://127.0.0.1:${port}/api/mcp/info`)
    assert.equal(infoRes.status, 200)
    const info = (await infoRes.json()) as {
      url: string
      localUrl?: string
      token: string
      tools: string[]
      clients: { cursor: { mcpServers: { biu: { url: string } } } }
    }
    assert.equal(info.url, `http://127.0.0.1:${port}/api/mcp`)
    assert.equal(info.localUrl, info.url)
    assert.match(info.token, /^biu_mcp_/)
    assert.equal(info.tools.includes('db_list'), true)
    assert.equal(info.clients.cursor.mcpServers.biu.url, info.url)

    const client = await mcpClient(info.url, info.token)
    const listed = await client.listTools()
    const names = listed.tools.map((tool) => tool.name).sort()
    assert.deepEqual(names, ['db_list'])
    const called = await client.callTool({ name: 'db_list', arguments: { path: '/mcp' } })
    const text = (called.content as Array<{ text?: string }>)[0]?.text ?? ''
    assert.match(text, /"path": "\/mcp"/)
    const blockedTool = await client.callTool({ name: 'bash', arguments: {} })
    assert.equal(blockedTool.isError, true)
    await client.close()

    const rotated = await fetch(`http://127.0.0.1:${port}/api/mcp/rotate`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${info.token}` },
    })
    assert.equal(rotated.status, 200)
    const next = (await rotated.json()) as { token: string }
    assert.notEqual(next.token, info.token)
    const stale = await fetch(`http://127.0.0.1:${port}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: `Bearer ${info.token}` },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
    })
    assert.equal(stale.status, 401)

  } finally {
    await ctx.fiber.dispose()
  }
}, 20000)

test('online MCP enforces workspace credentials, tool allowlists, viewer writes, and audit', async () => {
  const previous = process.env.BIU_ONLINE
  process.env.BIU_ONLINE = '1'
  const ctx = new Context()
  const audits: Array<{ toolName: string; success: boolean }> = []
  class FakeAccount extends Service {
    store = {
      accountByToken: (token: string) => token === 'web-token' ? { id: 'bob' } : null,
      isMember: (accountId: string, workspaceId: string) => accountId === 'bob' && workspaceId === 'ws-a',
      resolveMcpCredential: (token: string) =>
        token === 'viewer-token' || token === 'limited-token'
          ? {
              credentialId: token === 'viewer-token' ? 'mcp-1' : 'mcp-2',
              accountId: 'bob',
              workspaceId: 'ws-a',
              role: token === 'viewer-token' ? 'viewer' : 'owner',
              allowedTools: token === 'viewer-token' ? ['db_list', 'db_update'] : ['db_list'],
            }
          : null,
      auditMcp: (_tenant: unknown, toolName: string, success: boolean) => audits.push({ toolName, success }),
    }
    constructor(inner: Context) {
      super(inner, 'account')
    }
  }
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  await ctx.plugin(FakeAccount)
  await ctx.plugin(http, { port: 0, host: '127.0.0.1', sharePort: 0 })
  await ctx.plugin(tools)
  ctx.tools.register({
    name: 'db_list',
    description: 'list',
    parameters: { type: 'object', properties: {} },
    execution: 'parallel',
    execute: () => ({ ok: true }),
  })
  ctx.tools.register({
    name: 'db_update',
    description: 'update',
    parameters: { type: 'object', properties: {} },
    execute: () => ({ changed: true }),
  })
  await ctx.plugin(mcp)
  const port = await ready
  try {
    const safeInfo = await fetch(`http://127.0.0.1:${port}/api/mcp/info`, {
      headers: { Authorization: 'Bearer web-token', 'X-Biu-Workspace-Id': 'ws-a' },
    })
    assert.equal(safeInfo.status, 200)
    assert.equal(((await safeInfo.json()) as { token?: string }).token, '')
    const denied = await fetch(`http://127.0.0.1:${port}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer wrong' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    assert.equal(denied.status, 401)
    const client = await mcpClient(`http://127.0.0.1:${port}/api/mcp`, 'viewer-token')
    assert.deepEqual((await client.listTools()).tools.map((tool) => tool.name).sort(), ['db_list', 'db_update'])
    assert.equal((await client.callTool({ name: 'db_list', arguments: {} })).isError, undefined)
    assert.equal((await client.callTool({ name: 'db_update', arguments: {} })).isError, true)
    await client.close()
    const limited = await mcpClient(`http://127.0.0.1:${port}/api/mcp`, 'limited-token')
    assert.deepEqual((await limited.listTools()).tools.map((tool) => tool.name), ['db_list'])
    assert.equal((await limited.callTool({ name: 'db_update', arguments: {} })).isError, true)
    await limited.close()
    assert.deepEqual(audits, [
      { toolName: 'db_list', success: true },
      { toolName: 'db_update', success: false },
      { toolName: 'db_update', success: false },
    ])
  } finally {
    await ctx.fiber.dispose()
    if (previous === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = previous
  }
}, 20000)

test('share listener exposes token-gated MCP on the LAN port, not the workstation', async () => {
  const ctx = new Context()
  const localP = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  await ctx.plugin(http, { port: 0, host: '127.0.0.1', sharePort: 0 })
  await ctx.plugin(tools)
  ctx.tools.register({
    name: 'db_list',
    description: 'list',
    parameters: { type: 'object', properties: {} },
    execution: 'parallel',
    execute: () => ({ ok: true }),
  })
  await ctx.plugin(mcp)
  const localPort = await localP
  try {
    const info = (await (await fetch(`http://127.0.0.1:${localPort}/api/mcp/info`)).json()) as {
      url: string
      localUrl: string
      bind: string
      token: string
    }
    assert.equal(info.localUrl, `http://127.0.0.1:${localPort}/api/mcp`)
    assert.equal(info.url, info.localUrl)
    assert.equal(info.bind, '127.0.0.1')

    const denied = await fetch(`http://127.0.0.1:${localPort}/api/mcp`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: {} }),
    })
    assert.equal(denied.status, 401)

    const client = await mcpClient(info.url, info.token)
    const listed = await client.listTools()
    assert.deepEqual(listed.tools.map((tool) => tool.name), ['db_list'])
    await client.close()
  } finally {
    await ctx.fiber.dispose()
  }
}, 20000)

test('local host-token MCP runs under active local account, updates on account switch, and broadcasts writes to same-workspace WS clients only', async () => {
  const ctx = new Context()
  let activeActor = { accountId: 'acc-ada', workspaceId: 'ws-a' }
  const seenActors: Array<{ accountId: string; workspaceId: string }> = []
  class FakeAccount extends Service {
    store = {
      accountByToken: (token: string) =>
        token === 'ada-web' ? { id: 'acc-ada' } : token === 'bob-web' ? { id: 'acc-bob' } : null,
      activeWorkspaceId: () => (currentAccountId() === 'acc-bob' ? 'ws-b' : 'ws-a'),
      isMember: (accountId: string, workspaceId: string) =>
        (accountId === 'acc-ada' && workspaceId === 'ws-a') ||
        (accountId === 'acc-bob' && workspaceId === 'ws-b'),
      activeLocalActor: () => activeActor,
    }
    constructor(inner: Context) {
      super(inner, 'account')
    }
  }
  const ready = new Promise<number>((resolve) => ctx.on('http/ready', ({ port }) => resolve(port)))
  await ctx.plugin(FakeAccount)
  await ctx.plugin(http, { port: 0, host: '127.0.0.1', sharePort: 0 })
  await ctx.plugin(tools)
  ctx.tools.register({
    name: 'db_create',
    description: 'create',
    parameters: { type: 'object', properties: { fail: { type: 'boolean' } } },
    execute: (args) => {
      const actor = { accountId: currentAccountId(), workspaceId: currentRequestWorkspaceId() }
      seenActors.push(actor)
      if (args.fail) throw new Error('write failed')
      ctx.http.broadcast('database', { scope: 'records', ts: Date.now() })
      return { ok: true, actor }
    },
  })
  await ctx.plugin(mcp)
  const port = await ready

  const connectWs = (token: string, wsId: string) =>
    new Promise<{ ws: WebSocket; msgs: Array<{ type: string; payload?: Record<string, unknown> }> }>((resolve, reject) => {
      const msgs: Array<{ type: string; payload?: Record<string, unknown> }> = []
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, {
        headers: { Cookie: `biu_account=${token}`, 'X-Biu-Workspace-Id': wsId },
      })
      ws.on('message', (raw) => {
        try {
          msgs.push(JSON.parse(String(raw)) as { type: string; payload?: Record<string, unknown> })
        } catch {
          /* ignore */
        }
      })
      ws.once('open', () => resolve({ ws, msgs }))
      ws.once('error', reject)
    })

  const adaSocket = await connectWs('ada-web', 'ws-a')
  const bobSocket = await connectWs('bob-web', 'ws-b')
  try {
    const info = (await (await fetch(`http://127.0.0.1:${port}/api/mcp/info`)).json()) as { url: string; token: string }
    const client = await mcpClient(info.url, info.token)

    // 1. Write as Ada (ws-a) -> attributed to acc-ada/ws-a, broadcast hits Ada's WS only, no reveal
    const res1 = await client.callTool({ name: 'db_create', arguments: {} })
    assert.equal(res1.isError, undefined)
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.deepEqual(seenActors[0], { accountId: 'acc-ada', workspaceId: 'ws-a' })
    const adaDb1 = adaSocket.msgs.filter((m) => m.type === 'database')
    const bobDb1 = bobSocket.msgs.filter((m) => m.type === 'database')
    assert.equal(adaDb1.length, 1)
    assert.equal(adaDb1[0]?.payload?.scope, 'records')
    assert.equal(adaDb1[0]?.payload?.reveal, undefined)
    assert.equal(bobDb1.length, 0)

    // 2. Failed write -> no broadcast
    const resFail = await client.callTool({ name: 'db_create', arguments: { fail: true } })
    assert.equal(resFail.isError, true)
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.equal(adaSocket.msgs.filter((m) => m.type === 'database').length, 1)
    assert.equal(bobSocket.msgs.filter((m) => m.type === 'database').length, 0)

    // 3. Switch active account to Bob (ws-b) -> next MCP call runs as acc-bob/ws-b and broadcasts to Bob only
    activeActor = { accountId: 'acc-bob', workspaceId: 'ws-b' }
    const res2 = await client.callTool({ name: 'db_create', arguments: {} })
    assert.equal(res2.isError, undefined)
    await new Promise((resolve) => setTimeout(resolve, 40))
    assert.deepEqual(seenActors[2], { accountId: 'acc-bob', workspaceId: 'ws-b' })
    assert.equal(adaSocket.msgs.filter((m) => m.type === 'database').length, 1)
    assert.equal(bobSocket.msgs.filter((m) => m.type === 'database').length, 1)

    await client.close()
  } finally {
    adaSocket.ws.close()
    bobSocket.ws.close()
    await ctx.fiber.dispose()
  }
}, 20000)

test('isMcpWriteCall delegates to tools.executionMode for read-only vs write classification', async () => {
  const { isMcpWriteCall } = await import('./serve.ts')
  const ctx = new Context()
  await ctx.plugin(tools)
  ctx.tools.register({ name: 'db_list', description: 'list', parameters: { type: 'object', properties: {} }, execution: 'parallel', execute: () => ({}) })
  ctx.tools.register({ name: 'db_read', description: 'read', parameters: { type: 'object', properties: {} }, execution: 'parallel', execute: () => ({}) })
  ctx.tools.register({ name: 'db_update', description: 'update', parameters: { type: 'object', properties: {} }, execute: () => ({}) })
  ctx.tools.register({
    name: 'db_content',
    description: 'content',
    parameters: { type: 'object', properties: { path: { type: 'string' }, command: { type: 'string' }, value: { type: 'string' } } },
    execution: (args) => (String(args.command ?? (args.value !== undefined ? 'write' : 'view')) === 'view' ? 'parallel' : 'exclusive'),
    execute: () => ({}),
  })
  assert.equal(isMcpWriteCall(ctx.tools, 'db_list', {}), false)
  assert.equal(isMcpWriteCall(ctx.tools, 'db_read', {}), false)
  assert.equal(isMcpWriteCall(ctx.tools, 'db_content', { path: '/pages/p1', command: 'view' }), false)
  assert.equal(isMcpWriteCall(ctx.tools, 'db_content', { path: '/pages/p1' }), false)
  assert.equal(isMcpWriteCall(ctx.tools, 'db_content', { path: '/pages/p1', command: 'write', value: '# hi' }), true)
  assert.equal(isMcpWriteCall(ctx.tools, 'db_content', { path: '/pages/p1', value: '# hi' }), true)
  assert.equal(isMcpWriteCall(ctx.tools, 'db_content', { path: '/pages/p1', command: 'str_replace', old_str: 'a', new_str: 'b' }), true)
  assert.equal(isMcpWriteCall(ctx.tools, 'db_update', { path: '/pages/p1' }), true)
})
