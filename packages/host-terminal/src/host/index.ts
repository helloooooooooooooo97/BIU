import { existsSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import { Service, type Context } from 'cordis'
import { posixShellBin } from '@biu/host-subprocess'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'

function userShell() {
  const fromEnv = String(process.env.SHELL ?? '').trim()
  if (fromEnv) return fromEnv
  if (process.platform !== 'win32' && existsSync('/bin/bash')) return '/bin/bash'
  return posixShellBin()
}

interface Term {
  id: string
  child: IPty
  buffer: string
}

export class TerminalService extends Service {
  private terms = new Map<string, Term>()

  constructor(ctx: Context) {
    super(ctx, 'terminals')
  }

  open(size?: { cols?: number; rows?: number; login?: boolean }) {
    const id = crypto.randomUUID().slice(0, 8)
    const sh = userShell()
    const wrapped = this.ctx.sandbox.wrap({ argv: [sh] })
    const cols = Math.max(20, Number(size?.cols) || 80)
    const rows = Math.max(8, Number(size?.rows) || 24)
    const login = size?.login === true && (process.platform !== 'win32' || !/cmd\.exe$/i.test(sh))
    const child = pty.spawn(sh, login ? ['-il'] : [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd: wrapped.cwd,
      env: {
        ...process.env,
        ...wrapped.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
      },
    })
    const term: Term = { id, child, buffer: '' }
    child.onData((data) => {
      term.buffer += data
      if (term.buffer.length > 32_000) term.buffer = term.buffer.slice(-16_000)
    })
    child.onExit(() => {
      this.terms.delete(id)
    })
    this.terms.set(id, term)
    return { id }
  }

  write(id: string, data: string) {
    const term = this.terms.get(id)
    if (!term) throw new Error(`unknown terminal: ${id}`)
    term.child.write(data)
    return { id, ok: true }
  }

  resize(id: string, cols: number, rows: number) {
    const term = this.terms.get(id)
    if (!term) throw new Error(`unknown terminal: ${id}`)
    term.child.resize(Math.max(20, cols), Math.max(8, rows))
    return { id, ok: true }
  }

  read(id: string) {
    const term = this.terms.get(id)
    if (!term) throw new Error(`unknown terminal: ${id}`)
    return { id, output: term.buffer }
  }

  attach(id: string, send: (data: string) => void) {
    const term = this.terms.get(id)
    if (!term) throw new Error(`unknown terminal: ${id}`)
    return term.child.onData(send)
  }

  close(id: string) {
    const term = this.terms.get(id)
    if (!term) throw new Error(`unknown terminal: ${id}`)
    try {
      term.child.kill()
    } catch {
      /* already gone */
    }
    this.terms.delete(id)
    return { id, closed: true }
  }
}

export const name = 'terminal'
export const inject = ['sandbox', 'tools']

function socketData(raw: unknown) {
  if (typeof raw === 'string') return raw
  if (Buffer.isBuffer(raw)) return raw.toString('utf8')
  if (Array.isArray(raw)) return Buffer.concat(raw.filter((item): item is Buffer => Buffer.isBuffer(item))).toString('utf8')
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8')
  return String(raw ?? '')
}

function isResize(text: string) {
  if (!text.startsWith('{"type":"resize"')) return null
  try {
    const msg = JSON.parse(text) as { type?: string; cols?: number; rows?: number }
    if (msg.type !== 'resize') return null
    return { cols: Number(msg.cols) || 80, rows: Number(msg.rows) || 24 }
  } catch {
    return null
  }
}

export function apply(ctx: Context) {
  const terminals = new TerminalService(ctx)
  ctx.tools.register({
    name: 'terminal_open',
    description: '打开持久 shell',
    parameters: { type: 'object', properties: {} },
    execute: () => terminals.open(),
  })
  ctx.tools.register({
    name: 'terminal_write',
    description: '向持久 shell 写入',
    parameters: {
      type: 'object',
      properties: { id: { type: 'string' }, data: { type: 'string' } },
      required: ['id', 'data'],
    },
    execute: (args) => terminals.write(String(args.id), String(args.data)),
  })
  ctx.tools.register({
    name: 'terminal_read',
    description: '读取持久 shell 缓冲',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: (args) => terminals.read(String(args.id)),
  })
  ctx.tools.register({
    name: 'terminal_close',
    description: '关闭持久 shell',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: (args) => terminals.close(String(args.id)),
  })

  ctx.inject(['http'], (inner) => {
    inner.http.ws('/ws/page-terminal', (socket, request: IncomingMessage) => {
      const url = new URL(request.url ?? '/', 'http://localhost')
      const cols = Number(url.searchParams.get('cols') ?? 80)
      const rows = Number(url.searchParams.get('rows') ?? 24)
      let opened: { id: string }
      try {
        opened = terminals.open({ cols, rows, login: true })
      } catch (error) {
        socket.close(1011, String(error))
        return
      }
      const listen = terminals.attach(opened.id, (data) => {
        if (socket.readyState === socket.OPEN) socket.send(data)
      })
      socket.on('message', (raw) => {
        const text = socketData(raw)
        const size = isResize(text)
        if (size) {
          terminals.resize(opened.id, size.cols, size.rows)
          return
        }
        terminals.write(opened.id, text)
      })
      const hangup = () => {
        listen.dispose()
        try {
          terminals.close(opened.id)
        } catch {
          /* already gone */
        }
      }
      socket.on('close', hangup)
      socket.on('error', hangup)
    })
  })
}
