import { existsSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'

export const name = 'global-terminal'
export const inject = ['http', 'sandbox']

type Socket = {
  readyState: number
  OPEN: number
  send(data: string): void
  close(code?: number, reason?: string): void
  on(event: 'message' | 'close' | 'error', listener: (data?: unknown) => void): void
}

type Ctx = {
  sandbox: { wrap(request: { argv: string[] }): { cwd: string; env: NodeJS.ProcessEnv } }
  http: { ws(path: string, listener: (socket: Socket, request: IncomingMessage) => void): void }
  effect(effect: () => void | (() => void), label?: string): void
}

/** 用户登录 shell：优先 $SHELL，其次 macOS 默认 zsh。 */
function loginShell() {
  const configured = String(process.env.SHELL ?? '').trim()
  if (configured && existsSync(configured)) return configured
  for (const candidate of ['/bin/zsh', '/bin/bash', '/bin/sh']) {
    if (existsSync(candidate)) return candidate
  }
  return '/bin/sh'
}

function text(raw: unknown) {
  if (typeof raw === 'string') return raw
  if (Buffer.isBuffer(raw)) return raw.toString('utf8')
  if (Array.isArray(raw)) return Buffer.concat(raw.filter(Buffer.isBuffer)).toString('utf8')
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8')
  return String(raw ?? '')
}

function dim(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value)
  return Number.isFinite(n) ? Math.max(min, Math.min(max, Math.floor(n))) : fallback
}

export function apply(ctx: Ctx) {
  const sessions = new Set<IPty>()

  ctx.effect(() => () => {
    for (const s of sessions) {
      try {
        s.kill()
      } catch {
        // 已退出。
      }
    }
    sessions.clear()
  }, 'global-terminal.cleanup')

  ctx.http.ws('/ws/global-terminal', (socket, request) => {
    const q = new URL(request.url ?? '/', 'http://localhost').searchParams
    const shell = loginShell()
    const sandbox = ctx.sandbox.wrap({ argv: [shell] })
    let session: IPty

    try {
      session = pty.spawn(shell, ['-il'], {
        name: 'xterm-256color',
        cols: dim(q.get('cols'), 100, 20, 500),
        rows: dim(q.get('rows'), 30, 8, 400),
        cwd: sandbox.cwd,
        env: {
          ...process.env,
          ...sandbox.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
          LANG: process.env.LANG ?? 'en_US.UTF-8',
        },
      })
    } catch (error) {
      socket.close(1011, error instanceof Error ? error.message : String(error))
      return
    }

    sessions.add(session)
    let alive = true

    const stream = session.onData((chunk) => {
      if (socket.readyState === socket.OPEN) socket.send(chunk)
    })

    const dispose = () => {
      if (!alive) return
      alive = false
      stream.dispose()
      sessions.delete(session)
      try {
        session.kill()
      } catch {
        // 已退出。
      }
    }

    session.onExit(() => {
      sessions.delete(session)
      if (socket.readyState === socket.OPEN) socket.close(1000, 'shell exited')
    })

    socket.on('message', (raw) => {
      let msg: { type?: string; data?: unknown; cols?: unknown; rows?: unknown }
      try {
        msg = JSON.parse(text(raw))
      } catch {
        return
      }
      if (msg.type === 'input') session.write(String(msg.data ?? ''))
      if (msg.type === 'resize') {
        session.resize(dim(msg.cols, 100, 20, 500), dim(msg.rows, 30, 8, 400))
      }
    })

    socket.on('close', dispose)
    socket.on('error', dispose)
  })
}
