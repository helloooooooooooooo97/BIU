import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { Context } from 'cordis'
import { WebSocket } from 'ws'
import * as tools from '@biu/host-tools'
import * as fs from '@biu/host-fs'
import * as sandbox from '@biu/host-sandbox'
import * as subprocess from '@biu/host-subprocess'
import * as http from '@biu/host-http'
import * as terminal from './index.ts'

async function freePort() {
  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address()
      if (!addr || typeof addr === 'string') {
        reject(new Error('no port'))
        return
      }
      const port = addr.port
      server.close((error) => (error ? reject(error) : resolve(port)))
    })
    server.on('error', reject)
  })
}

test('persistent terminal open/write/read/close', async () => {
  const ctx = new Context()
  await ctx.plugin(tools)
  const root = await mkdtemp(join(tmpdir(), 'cordis-term-'))
  await ctx.plugin(fs, { root })
  await ctx.plugin(sandbox)
  await ctx.plugin(subprocess)
  await ctx.plugin(terminal)
  const opened = (await ctx.tools.invoke('terminal_open')) as { id: string }
  await ctx.tools.invoke('terminal_write', { id: opened.id, data: 'echo term-ok\n' })
  const deadline = Date.now() + 2000
  let output = ''
  while (Date.now() < deadline) {
    output = ((await ctx.tools.invoke('terminal_read', { id: opened.id })) as { output: string }).output
    if (output.includes('term-ok')) break
    await new Promise((resolve) => setTimeout(resolve, 30))
  }
  const closed = (await ctx.tools.invoke('terminal_close', { id: opened.id })) as { closed: boolean }
  assert.equal(closed.closed, true)
  assert.match(output, /term-ok/)
})

test('page-terminal websocket is a real PTY and leaves hub /ws alone', async () => {
  const base = await mkdtemp(join(tmpdir(), 'cordis-pty-ws-'))
  const publicDir = join(base, 'public')
  await mkdir(publicDir, { recursive: true })
  await writeFile(join(publicDir, 'index.html'), '<html></html>')
  const port = await freePort()
  const ctx = new Context()
  const ready = new Promise<void>((resolve) => {
    ctx.on('http/ready', () => resolve())
  })
  await ctx.plugin(tools)
  await ctx.plugin(fs, { root: base })
  await ctx.plugin(sandbox)
  await ctx.plugin(subprocess)
  const httpFiber = await ctx.plugin(http, { port, host: '127.0.0.1', publicDir })
  await ctx.plugin(terminal)
  await ready
  try {
    const hello = await new Promise<string>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`)
      ws.on('message', (raw) => {
        resolve(String(raw))
        ws.close()
      })
      ws.on('error', reject)
    })
    assert.match(hello, /"type":"hello"/)

    const pty = new WebSocket(`ws://127.0.0.1:${port}/ws/page-terminal?cols=80&rows=24`)
    let out = ''
    pty.on('message', (raw) => {
      out += String(raw)
    })
    await new Promise<void>((resolve, reject) => {
      pty.on('open', () => resolve())
      pty.on('error', reject)
    })
    await new Promise((r) => setTimeout(r, 250))
    pty.send('cd /tmp && pwd && echo native-ok\n')
    const deadline = Date.now() + 4000
    while (Date.now() < deadline) {
      if (out.includes('native-ok') && out.includes('/tmp')) break
      await new Promise((r) => setTimeout(r, 40))
    }
    pty.close()
    assert.match(out, /native-ok/)
    assert.match(out, /\/tmp/)
  } finally {
    await httpFiber.dispose()
  }
})
