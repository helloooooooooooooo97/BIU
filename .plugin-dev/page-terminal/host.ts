import { existsSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'

export const name = 'page-terminal'
export const inject = ['http', 'sandbox']

function userShell() {
  const fromEnv = String(process.env.SHELL ?? '').trim()
  if (fromEnv) return fromEnv
  if (process.platform !== 'win32' && existsSync('/bin/bash')) return '/bin/bash'
  return '/bin/sh'
}

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

type Socket = {
  readyState: number
  OPEN: number
  send: (data: string) => void
  close: (code?: number, reason?: string) => void
  on: (event: 'message' | 'close' | 'error', fn: (...args: unknown[]) => void) => void
}

export function apply(ctx: {
  sandbox: { wrap: (req: { argv: string[] }) => { cwd: string; env: NodeJS.ProcessEnv } }
  http: { ws: (path: string, handler: (socket: Socket, request: IncomingMessage) => void) => void }
}) {
  const terms = new Map<string, IPty>()

  const open = (cols: number, rows: number) => {
    const id = crypto.randomUUID().slice(0, 8)
    const sh = userShell()
    const wrapped = ctx.sandbox.wrap({ argv: [sh] })
    const login = process.platform !== 'win32' || !/cmd\.exe$/i.test(sh)
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
    terms.set(id, child)
    child.onExit(() => terms.delete(id))
    return { id, child }
  }

  ctx.http.ws('/ws/page-terminal', (socket, request) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const cols = Number(url.searchParams.get('cols') ?? 80)
    const rows = Number(url.searchParams.get('rows') ?? 24)
    let opened: { id: string; child: IPty }
    try {
      opened = open(Math.max(20, cols), Math.max(8, rows))
    } catch (error) {
      socket.close(1011, String(error))
      return
    }
    const listen = opened.child.onData((data) => {
      if (socket.readyState === socket.OPEN) socket.send(data)
    })
    socket.on('message', (raw) => {
      const text = socketData(raw)
      const size = isResize(text)
      if (size) {
        opened.child.resize(Math.max(20, size.cols), Math.max(8, size.rows))
        return
      }
      opened.child.write(text)
    })
    const hangup = () => {
      listen.dispose()
      try {
        opened.child.kill()
      } catch {
        /* already gone */
      }
      terms.delete(opened.id)
    }
    socket.on('close', hangup)
    socket.on('error', hangup)
  })
}
