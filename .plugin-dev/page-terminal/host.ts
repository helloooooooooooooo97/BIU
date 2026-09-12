import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { Context } from 'cordis'

/**
 * 页面终端卡片的宿主服务。
 *
 * 两条能力：
 * 1) `mysql` —— 真调本机 mysql 客户端（非交互、batch 模式），走 /api/page-terminal/mysql。
 * 2) 真 shell —— 复用内核的 terminals 服务（packages/host-terminal），页面按块 id 命名会话，
 *    和 agent 的 terminal_write 是**同一条会话**；输出通过 internal/terminal/output 事件
 *    转发到 /ws，前端实时回显。
 *
 * 安全边界（见 docs / 记录页）：这条 shell 不受沙箱约束，等价于你自己开一个终端。
 * 边界在「谁能访问这个 HTTP API」，不在 shell 本身。当前 API 无鉴权，见记录页「风险」。
 */

export const name = 'page-terminal'
export const inject = ['http', 'terminals']

const DEFAULT_TIMEOUT = 15000
const MAX_TIMEOUT = 60000
const MAX_SQL = 20000

/** WS 广播合批：终端输出是高频流，40ms 一帧、单帧上限 32KB，避免打满前端。 */
const FLUSH_MS = 40
const MAX_FRAME = 32_000

interface TerminalsLike {
  open(name?: string): { id: string; name: string; reused: boolean }
  write(id: string, data: string): unknown
  read(id: string, since?: number): { id: string; name: string; seq: number; output: string; cwd: string; alive: boolean }
  list(): { terms: Array<Record<string, unknown>> }
  get(idOrName: string): Record<string, unknown> | null
  close(id: string): unknown
}

/** 找本机的 mysql 客户端：先环境变量，再常见安装位置，最后交给 PATH。 */
function candidates() {
  return [
    process.env.BIU_MYSQL_BIN,
    '/opt/homebrew/opt/mysql-client/bin/mysql',
    '/opt/homebrew/opt/mysql@8.0/bin/mysql',
    '/opt/homebrew/bin/mysql',
    '/usr/local/bin/mysql',
    '/usr/bin/mysql',
  ].filter((item): item is string => Boolean(item))
}

let binCache: string | null = null

function mysqlBin() {
  if (binCache) return binCache
  for (const path of candidates()) {
    if (existsSync(path)) {
      binCache = path
      return binCache
    }
  }
  return 'mysql'
}

export interface MysqlConn {
  host?: string
  port?: number
  user?: string
  password?: string
  database?: string
}

export interface RunResult {
  ok: boolean
  stdout: string
  stderr: string
  exitCode: number
  ms: number
  bin?: string
}

function str(value: unknown, fallback = '') {
  return typeof value === 'string' && value.trim() ? value.trim() : fallback
}

function num(value: unknown, fallback: number) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 && n < 65536 ? Math.round(n) : fallback
}

/** SQL 里出现这些就等于拿到了 shell，直接拒。 */
function unsafeSql(sql: string) {
  return /(^|\n)\s*\\[!.]/.test(sql) || /(^|\n)\s*system\b/i.test(sql) || /(^|\n)\s*source\b/i.test(sql)
}

export function buildArgs(sql: string, conn: Required<Pick<MysqlConn, 'host' | 'port' | 'user'>> & MysqlConn) {
  const args = [
    '-h',
    conn.host,
    '-P',
    String(conn.port),
    '-u',
    conn.user,
    '--connect-timeout=8',
    '--batch',
    '--raw',
    '--default-character-set=utf8mb4',
  ]
  if (conn.database) args.push('-D', conn.database)
  args.push('-e', sql)
  return args
}

function runMysql(sql: string, conn: MysqlConn, timeoutMs: number): Promise<RunResult> {
  const host = str(conn.host, '127.0.0.1')
  const port = num(conn.port, 3306)
  const user = str(conn.user, 'root')
  const database = str(conn.database)
  const bin = mysqlBin()
  const started = Date.now()
  return new Promise((resolve) => {
    const child = spawn(bin, buildArgs(sql, { host, port, user, database }), {
      env: {
        ...process.env,
        ...(typeof conn.password === 'string' && conn.password ? { MYSQL_PWD: conn.password } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    let done = false
    const finish = (exitCode: number) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ ok: exitCode === 0, stdout, stderr, exitCode, ms: Date.now() - started, bin })
    }
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      finish(-2)
    }, timeoutMs)
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', (error) => {
      stderr += String(error)
      finish(-1)
    })
    child.on('close', (code) => finish(code ?? 0))
  })
}

export function apply(base: Context) {
  const ctx = base as Context & { terminals: TerminalsLike; http: Context['http'] }
  const terminals = ctx.terminals

  // ---- 终端输出 → /ws（合批后广播）--------------------------------------
  const pending = new Map<string, { name: string; seq: number; text: string }>()
  let timer: ReturnType<typeof setTimeout> | null = null

  const flush = () => {
    timer = null
    for (const [, item] of pending) {
      ctx.http.broadcast('terminal', { kind: 'output', id: item.name || '', seq: item.seq, chunk: item.text })
    }
    pending.clear()
  }

  const schedule = () => {
    if (timer) return
    timer = setTimeout(flush, FLUSH_MS)
  }

  ctx.on('internal/terminal/output', (payload: { id: string; name: string; seq: number; chunk: string }) => {
    const key = payload.id
    const item = pending.get(key)
    if (item) {
      item.text += payload.chunk
      item.seq = payload.seq
      // 单帧别太大：超了就立刻冲一帧
      if (item.text.length >= MAX_FRAME) flush()
      else schedule()
      return
    }
    pending.set(key, { name: payload.name, seq: payload.seq, text: payload.chunk })
    schedule()
  })

  ctx.on('internal/terminal/exit', (payload: { id: string; name: string; code: number | null }) => {
    flush()
    ctx.http.broadcast('terminal', { kind: 'exit', id: payload.name || '', code: payload.code })
  })

  ctx.effect(
    () => () => {
      if (timer) clearTimeout(timer)
      pending.clear()
    },
    'page-terminal.flush-timer',
  )

  // ---- 真 shell 路由 ----------------------------------------------------
  const termOf = (name: string) => terminals.open(name)

  // 列出活着的会话（排查孤儿 shell 用）
  ctx.http.route('GET', '/api/page-terminal/shell', async (route) => {
    route.send(200, terminals.list())
  })

  // 幂等 attach：同名会话不存在就开、存在就接回来（刷新页面不丢 shell）
  ctx.http.route('POST', '/api/page-terminal/shell/:name', async (route) => {
    const name = String(route.params.name ?? '').trim()
    if (!name || name.length > 64) {
      route.send(400, { error: 'name required (<=64 chars)' })
      return
    }
    try {
      const opened = termOf(name)
      const state = terminals.read(opened.id)
      route.send(200, { id: opened.id, name, reused: opened.reused, ...state })
    } catch (error) {
      route.send(500, { error: String(error) })
    }
  })

  ctx.http.route('POST', '/api/page-terminal/shell/:name/write', async (route) => {
    const name = String(route.params.name ?? '').trim()
    const body = await route.json<{ data?: unknown; source?: unknown }>()
    const data = String(body.data ?? '')
    // 页面自己写的时候，它在本地已经 push 过命令行，不需要我们补；
    // agent 通过 API 写的时候（非 tty 的 shell 不会自己回显），替它广播一行，
    // 页面就能看到「agent 敲了什么」，而不是只有输出。
    const fromPage = String(body.source ?? '') === 'page'
    if (!data) {
      route.send(400, { error: 'empty data' })
      return
    }
    if (data.length > 8000) {
      route.send(413, { error: 'data too long' })
      return
    }
    try {
      const opened = termOf(name)
      terminals.write(opened.id, data)
      if (!fromPage) ctx.http.broadcast('terminal', { kind: 'echo', id: name, chunk: data })
      route.send(200, { ok: true, id: opened.id })
    } catch (error) {
      route.send(500, { error: String(error) })
    }
  })

  ctx.http.route('POST', '/api/page-terminal/shell/:name/close', async (route) => {
    const name = String(route.params.name ?? '').trim()
    try {
      const found = terminals.get(name)
      if (found) terminals.close(String(found.id))
      route.send(200, { ok: true })
    } catch (error) {
      route.send(500, { error: String(error) })
    }
  })

  // ---- mysql（非交互 batch，和 shell 独立）------------------------------
  ctx.http.route('POST', '/api/page-terminal/mysql', async (route) => {
    const body = await route.json<{ sql?: unknown; conn?: MysqlConn; timeoutMs?: unknown }>()
    const raw = body.conn && typeof body.conn === 'object' ? body.conn : {}
    const conn: MysqlConn = {
      host: str(raw.host, '127.0.0.1'),
      port: num(raw.port, 3306),
      user: str(raw.user, 'root'),
      password: typeof raw.password === 'string' ? raw.password : '',
      database: str(raw.database),
    }
    const sql = String(body.sql ?? '').trim()
    if (!sql) {
      route.send(400, { ok: false, error: 'empty sql' })
      return
    }
    if (sql.length > MAX_SQL) {
      route.send(413, { ok: false, error: 'sql too long' })
      return
    }
    if (unsafeSql(sql)) {
      route.send(400, { ok: false, error: '这个终端只转 mysql 客户端，不执行 \\! / system / source' })
      return
    }
    const timeoutMs = Math.min(MAX_TIMEOUT, Number(body.timeoutMs) || DEFAULT_TIMEOUT)
    try {
      const result = await runMysql(sql, conn, timeoutMs)
      route.send(200, {
        ...result,
        conn: { host: conn.host, port: conn.port, user: conn.user, database: conn.database },
      })
    } catch (error) {
      route.send(500, { ok: false, error: String(error) })
    }
  })

  // 自查：本机到底有没有 mysql 客户端
  ctx.http.route('GET', '/api/page-terminal/mysql/bin', async (route) => {
    const bin = mysqlBin()
    const version = await new Promise<string>((resolve) => {
      const child = spawn(bin, ['--version'], { stdio: ['ignore', 'pipe', 'pipe'] })
      let out = ''
      child.stdout.on('data', (chunk) => {
        out += chunk.toString()
      })
      child.on('error', () => resolve(''))
      child.on('close', () => resolve(out.trim()))
    })
    route.send(200, { bin, available: Boolean(version), version })
  })
}
