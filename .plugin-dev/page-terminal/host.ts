import { existsSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import * as pty from 'node-pty'
import type { IPty } from 'node-pty'

export const name = 'page-terminal'
export const inject = ['http', 'sandbox']

type Socket = {
  readyState: number
  OPEN: number
  send(data: string): void
  close(code?: number, reason?: string): void
  on(event: 'message' | 'close' | 'error', listener: (data?: unknown) => void): void
}

type TerminalContext = {
  sandbox: {
    wrap(request: { argv: string[] }): { cwd: string; env: NodeJS.ProcessEnv }
  }
  http: {
    ws(path: string, listener: (socket: Socket, request: IncomingMessage) => void): void
  }
  effect(effect: () => void | (() => void), label?: string): void
}

function userShell() {
  const configured = String(process.env.SHELL ?? '').trim()
  if (configured) return configured
  if (process.platform === 'win32') return process.env.COMSPEC || 'cmd.exe'
  if (existsSync('/bin/bash')) return '/bin/bash'
  return '/bin/sh'
}

function messageText(raw: unknown) {
  if (typeof raw === 'string') return raw
  if (Buffer.isBuffer(raw)) return raw.toString('utf8')
  if (Array.isArray(raw)) return Buffer.concat(raw.filter(Buffer.isBuffer)).toString('utf8')
  if (raw instanceof ArrayBuffer) return Buffer.from(raw).toString('utf8')
  return String(raw ?? '')
}

function size(value: unknown, fallback: number, minimum: number) {
  const number = Number(value)
  return Number.isFinite(number) ? Math.max(minimum, Math.min(500, Math.floor(number))) : fallback
}

export function apply(ctx: TerminalContext) {
  const children = new Set<IPty>()

  ctx.effect(() => {
    return () => {
      for (const child of children) {
        try {
          child.kill()
        } catch {
          // The PTY may already have exited.
        }
      }
      children.clear()
    }
  }, 'page-terminal.cleanup')

  ctx.http.ws('/ws/page-terminal', (socket, request) => {
    const url = new URL(request.url ?? '/', 'http://localhost')
    const shell = userShell()
    const wrapped = ctx.sandbox.wrap({ argv: [shell] })
    let child: IPty

    try {
      child = pty.spawn(shell, process.platform === 'win32' ? [] : ['-il'], {
        name: 'xterm-256color',
        cols: size(url.searchParams.get('cols'), 80, 20),
        rows: size(url.searchParams.get('rows'), 24, 8),
        cwd: wrapped.cwd,
        env: {
          ...process.env,
          ...wrapped.env,
          TERM: 'xterm-256color',
          COLORTERM: 'truecolor',
        },
      })
    } catch (error) {
      socket.close(1011, error instanceof Error ? error.message : String(error))
      return
    }

    children.add(child)
    let closed = false
    const output = child.onData((data) => {
      if (socket.readyState === socket.OPEN) socket.send(data)
    })

    const close = () => {
      if (closed) return
      closed = true
      output.dispose()
      children.delete(child)
      try {
        child.kill()
      } catch {
        // The PTY may already have exited.
      }
    }

    child.onExit(() => {
      children.delete(child)
      if (socket.readyState === socket.OPEN) socket.close(1000, 'shell exited')
    })
    socket.on('message', (raw) => {
      try {
        const message = JSON.parse(messageText(raw)) as {
          type?: string
          data?: unknown
          cols?: unknown
          rows?: unknown
        }
        if (message.type === 'input') child.write(String(message.data ?? ''))
        if (message.type === 'resize') child.resize(size(message.cols, 80, 20), size(message.rows, 24, 8))
      } catch {
        // Ignore malformed control messages.
      }
    })
    socket.on('close', close)
    socket.on('error', close)
  })
}
