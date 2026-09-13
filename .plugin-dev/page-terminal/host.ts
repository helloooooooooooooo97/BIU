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

type Ctx = {
  sandbox: { wrap(request: { argv: string[] }): { cwd: string; env: NodeJS.ProcessEnv } }
  http: { ws(path: string, listener: (socket: Socket, request: IncomingMessage) => void): void }
  effect(effect: () => void | (() => void), label?: string): void
}

/** 最多在后台保留多少个终端会话（LRU 淘汰）。 */
const MAX_SESSIONS = 50
/** 每个会话最多缓存多少字节的输出，用于重连回放。 */
const MAX_BUFFER_BYTES = 512 * 1024
/** 回放时最多保留多少行，防止把屏幕刷爆。 */
const MAX_REPLAY_LINES = 200

type PooledSession = {
  key: string
  pty: IPty
  /** 最近的原始输出字节，用于重连回放。 */
  buffer: string
  /** 当前挂着的连接（同一时刻最多一个）。 */
  socket: Socket | null
  /** 最后一次有连接的时间，用于 LRU。 */
  lastSeen: number
}

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

/** 从缓冲尾部按行截取，最多 maxLines 行；同时避免把 ANSI 序列从中间截断。 */
function tailLines(buffer: string, maxLines: number) {
  const lines = buffer.split('\n')
  if (lines.length <= maxLines) return buffer
  const sliced = lines.slice(lines.length - maxLines).join('\n')
  // 如果起点附近有未闭合的 ESC 序列，往后找下一个 ESC 重新开始，避免残缺控制码。
  const escAt = sliced.indexOf('\x1b')
  if (escAt > 0 && sliced.lastIndexOf('\x1b', escAt) === escAt) {
    const next = sliced.indexOf('\x1b', escAt + 1)
    if (next > 0) return sliced.slice(next)
  }
  return sliced
}

export function apply(ctx: Ctx) {
  const pool = new Map<string, PooledSession>()
  let seq = 0

  const kill = (session: PooledSession) => {
    pool.delete(session.key)
    try {
      session.pty.kill()
    } catch {
      // 已退出。
    }
  }

  const killAll = () => {
    for (const session of [...pool.values()]) kill(session)
    pool.clear()
  }

  ctx.effect(() => () => killAll(), 'page-terminal.cleanup')

  /** 超出容量时淘汰最久没被连接的会话。 */
  const evictIfNeeded = () => {
    while (pool.size > MAX_SESSIONS) {
      let oldest: PooledSession | null = null
      for (const session of pool.values()) {
        if (!oldest || session.lastSeen < oldest.lastSeen) oldest = session
      }
      if (!oldest) break
      kill(oldest)
    }
  }

  ctx.http.ws('/ws/page-terminal', (socket, request) => {
    const q = new URL(request.url ?? '/', 'http://localhost').searchParams
    const cols = dim(q.get('cols'), 80, 20, 500)
    const rows = dim(q.get('rows'), 20, 5, 400)
    // 块的 id 作为会话键：同一块刷新/切页/重开都能连回同一个 shell。
    const key = String(q.get('session') ?? '').trim() || `anon-${++seq}`

    let session = pool.get(key)
    // 已有会话：尺寸可能因重新布局而不同，按新尺寸对齐(并触发 shell 重绘)。
    if (session) {
      try {
        session.pty.resize(cols, rows)
      } catch {
        // 会话可能刚好退出。
      }
    } else {
      const shell = loginShell()
      const sandbox = ctx.sandbox.wrap({ argv: [shell] })
      try {
        const child = pty.spawn(shell, ['-il'], {
          name: 'xterm-256color',
          cols,
          rows,
          cwd: sandbox.cwd,
          env: {
            ...process.env,
            ...sandbox.env,
            TERM: 'xterm-256color',
            COLORTERM: 'truecolor',
            LANG: process.env.LANG ?? 'en_US.UTF-8',
          },
        })
        session = { key, pty: child, buffer: '', socket: null, lastSeen: Date.now() }
        pool.set(key, session)
        child.onData((chunk) => {
          const current = pool.get(key)
          if (!current || current.pty !== child) return
          current.buffer += chunk
          if (current.buffer.length > MAX_BUFFER_BYTES) {
            // 超上限只留尾部，避免无限增长。
            current.buffer = tailLines(current.buffer.slice(-MAX_BUFFER_BYTES), MAX_REPLAY_LINES)
          }
          if (current.socket?.readyState === current.socket?.OPEN) current.socket.send(chunk)
        })
        child.onExit(() => {
          const current = pool.get(key)
          if (current && current.socket?.readyState === current.socket.OPEN) {
            current.socket.close(1000, 'shell exited')
          }
          pool.delete(key)
        })
      } catch (error) {
        socket.close(1011, error instanceof Error ? error.message : String(error))
        return
      }
    }

    // 旧连接让位（同一会话同时只服务一个前端）。
    if (session.socket && session.socket !== socket) {
      try {
        session.socket.close(1000, 'superseded')
      } catch {
        // 忽略。
      }
    }
    session.socket = socket
    session.lastSeen = Date.now()

    // 回放历史：先清屏，再把这之前的输出重放一遍，接上就是完整画面。
    if (session.buffer) {
      const replay = tailLines(session.buffer, MAX_REPLAY_LINES)
      try {
        socket.send('\x1b[2J\x1b[3J\x1b[H')
        socket.send(replay)
      } catch {
        // 连接可能已断。
      }
    }

    socket.on('message', (raw) => {
      const current = pool.get(key)
      if (!current) return
      let msg: { type?: string; data?: unknown; cols?: unknown; rows?: unknown; kill?: unknown }
      try {
        msg = JSON.parse(text(raw))
      } catch {
        return
      }
      if (msg.type === 'input') current.pty.write(String(msg.data ?? ''))
      if (msg.type === 'resize') {
        current.pty.resize(dim(msg.cols, 80, 20, 500), dim(msg.rows, 20, 5, 400))
      }
      // 前端明确要求结束该会话（例如插件停用）。
      if (msg.type === 'kill') kill(current)
    })

    const detach = () => {
      const current = pool.get(key)
      if (!current) return
      // 只断开连接，**不杀进程** —— 前端关了不代表后端要死。
      if (current.socket === socket) current.socket = null
      current.lastSeen = Date.now()
      evictIfNeeded()
    }

    socket.on('close', detach)
    socket.on('error', detach)

    evictIfNeeded()
  })
}
