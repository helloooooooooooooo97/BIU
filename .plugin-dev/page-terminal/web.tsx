import { createPortal } from 'react-dom'
import {
  MYSQL_DEFAULT,
  MYSQL_HELP_LINES,
  MYSQL_SQL_HELP,
  describeProfile,
  packSession,
  parseMysqlProfile,
  parseSession,
  sameSession,
  stripDraft,
  type MysqlProfile,
  type TerminalSession,
} from './shell.ts'
import { makeOverlay, relockAncestors, unlockAncestors, watchZoom } from './zoom.ts'

const React = globalThis.React
const { useEffect, useRef, useState } = React

export const name = 'page-terminal'
export const inject = ['pageEditor']

const MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'
const INK = '#0b0e14'
const PAPER = '#c9d1d9'
const GREEN = '#3fb950'
const ACCENT = '#e3b341'
const ERR = '#ff7b72'
const MAX_LINES = 400
const SQL_CONT = '    ->'

const SAMPLE = {
  cwd: '~',
  prompt: '$',
  lines: ['真 shell 终端（/bin/sh）。输入 `help` 看用法。'],
}

type Line = { kind: 'in' | 'out' | 'err'; text: string }

function parseLines(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map((item) => String(item ?? ''))
  const text = String(raw ?? '')
  return text ? text.split('\n') : []
}

function blockHeight(data: Record<string, unknown>) {
  const n = Number(data.height)
  return Number.isFinite(n) && n >= 120 ? Math.round(n) : 320
}

function Glyph({ shrink }: { shrink?: boolean }) {
  return (
    <svg width={12} height={12} viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      {shrink ? (
        <path d="M6 2h1.6v3.4H11V7H6V2Zm4 12H8.4V10.6H5V9h5v5Z" />
      ) : (
        <path d="M9 2h5v5h-1.5V4.56L8.78 8.28 7.72 7.22 11.44 3.5H9V2ZM2 9h1.5v2.44l3.72-3.72 1.06 1.06L4.56 12.5H7V14H2V9Z" />
      )}
    </svg>
  )
}

/* ---------------- mysql：真连宿主的 mysql 客户端 ---------------- */

type MysqlRun = { ok: boolean; stdout: string; stderr: string; exitCode: number; ms: number; error?: string }

async function runMysql(sql: string, conn: MysqlProfile): Promise<MysqlRun> {
  try {
    const res = await fetch('/api/page-terminal/mysql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sql, conn }),
    })
    const data = (await res.json()) as MysqlRun
    if (!res.ok && data.error) return { ok: false, stdout: '', stderr: data.error, exitCode: -1, ms: 0 }
    return data
  } catch (error) {
    return { ok: false, stdout: '', stderr: `✗ 请求宿主失败：${String(error)}`, exitCode: -1, ms: 0 }
  }
}

/** 从 `mysql` 后面的参数里抠出连接覆盖项和一段 SQL。 */
function parseMysqlArgs(rest: string[], base: MysqlProfile) {
  const conn: MysqlProfile = { ...base }
  let sql = ''
  const strip = (text: string) => text.replace(/^["']|["']$/g, '')
  const take = (inline: string, i: number) => {
    if (inline) return { value: strip(inline), next: i }
    const next = rest[i + 1]
    return next == null ? { value: '', next: i } : { value: strip(String(next)), next: i + 1 }
  }
  for (let i = 0; i < rest.length; i++) {
    const item = rest[i]
    if (item === '-e' || item === '--execute') {
      const got = take('', i)
      sql = got.value
      i = got.next
      continue
    }
    const flag = /^(-[hPuDp])(.*)$/.exec(item)
    if (flag) {
      const got = take(flag[2], i)
      i = got.next
      if (flag[1] === '-h') conn.host = got.value || conn.host
      else if (flag[1] === '-P') conn.port = Number(got.value) || conn.port
      else if (flag[1] === '-u') conn.user = got.value || conn.user
      else if (flag[1] === '-D') conn.database = got.value
      else if (flag[1] === '-p') conn.password = got.value
      continue
    }
    // 没带 -e：剩下的整段都当 SQL
    sql = strip(rest.slice(i).join(' '))
    break
  }
  return { conn, sql }
}

/* ---------------- 真 shell：attach / 写入 / 实时回显 ---------------- */

type ShellAttach = {
  id: string
  name: string
  reused: boolean
  seq: number
  output: string
  cwd: string
  alive: boolean
}

async function shellAttach(name: string): Promise<ShellAttach | null> {
  try {
    const res = await fetch(`/api/page-terminal/shell/${encodeURIComponent(name)}`, { method: 'POST' })
    if (!res.ok) return null
    return (await res.json()) as ShellAttach
  } catch {
    return null
  }
}

async function shellWrite(name: string, data: string) {
  try {
    const res = await fetch(`/api/page-terminal/shell/${encodeURIComponent(name)}/write`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, source: 'page' }),
    })
    return res.ok
  } catch {
    return false
  }
}

export const SHELL_HELP_LINES = [
  '这是真 shell（/bin/sh，无 tty），和 agent 的 terminal_write 是同一条会话。',
  '  <任意命令>     直接发给 shell，例：ls -la   git status   npm test',
  '  clear          清屏（只清显示，不发给 shell）',
  '  mysql ...      走 mysql 客户端 batch 模式（见下）',
  '  help           看这份说明',
  '',
  '没有 tty 的三个后果：',
  '  · vim / top / less 这类全屏程序不可用',
  '  · sudo 拿不到密码提示',
  '  · python 等程序的输出会攒着一次性出来，想看实时就 python3 -u',
  '',
  '会话活着：刷新页面、切页都不会杀掉 shell；host 重启才没。',
  '命令记录存在块详情 data.session.history（有上限，长输出会被截），不是宿主本地存储。',
]

/* ---------------- 终端界面（放大时复用同一份） ---------------- */

function TerminalSurface({
  cwd,
  prompt,
  sample,
  session,
  shellName,
  mysql,
  sqlOpen,
  setSqlOpen,
  connRef,
  zoomed,
  onZoom,
  onClose,
  onChange,
  onPersist,
}: {
  cwd: string
  prompt: string
  sample: string[]
  session: TerminalSession
  shellName: string
  mysql: MysqlProfile
  /** 下面三个提到块层，放大/还原时不会丢 SQL 模式与已改过的连接 */
  sqlOpen: boolean
  setSqlOpen: (next: boolean) => void
  connRef: { current: MysqlProfile }
  zoomed: boolean
  onZoom: () => void
  onClose?: () => void
  onChange: () => void
  onPersist: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const busyRef = useRef(false)
  const history = session.history
  const [draft, setDraft] = useState(session.input)
  const [sqlBuffer, setSqlBuffer] = useState<string[]>([])
  const promptLabel = sqlOpen ? (sqlBuffer.length ? SQL_CONT : 'mysql>') : `${session.cwd} ${prompt}`

  // 实时输出：攒一帧再渲染，别让每个 chunk 都触发一轮 React
  const lastSeq = useRef(0)
  const dirty = useRef(false)
  const frameRef = useRef<number | undefined>(undefined)
  const liveness = useRef(true)

  const tick = () => {
    frameRef.current = undefined
    if (!dirty.current) return
    dirty.current = false
    onChange()
  }

  const kick = () => {
    if (frameRef.current != null) return
    frameRef.current = window.requestAnimationFrame(tick)
  }

  /** 追加一段 shell 原始输出：按行落进 history，尾部半行留着。 */
  const feed = (text: string, kind: Line['kind'] = 'out') => {
    if (!text) return
    const chunk = (session.partial ?? '') + text
    const lines = chunk.split('\n')
    const partial = lines.pop() ?? ''
    for (const line of lines) session.history.push({ kind, text: line })
    session.partial = partial
    if (session.history.length > MAX_LINES) session.history = session.history.slice(-MAX_LINES)
    dirty.current = true
    kick()
    onPersist()
  }

  const push = (line: Line) => {
    session.history.push(line)
    if (session.history.length > MAX_LINES) session.history = session.history.slice(-MAX_LINES)
    onChange()
    onPersist()
  }

  const out = (text: string, failed = false) => push({ kind: failed ? 'err' : 'out', text })

  // 挂上：attach 同名会话（不存在就开），把本地还没见过的输出补上
  useEffect(() => {
    if (!shellName || shellName === 'page:terminal') return
    let gone = false
    void shellAttach(shellName).then((state) => {
      if (gone) return
      if (!state) {
        setReady(true)
        return
      }
      const behind = state.seq > lastSeq.current
      if (state.output && (behind || !session.history.length)) {
        const lines = state.output.split('\n')
        const partial = lines.pop() ?? ''
        session.history.splice(0, session.history.length, ...lines.map((text) => ({ kind: 'out' as const, text })))
        session.partial = partial
        onChange()
        onPersist()
      }
      lastSeq.current = state.seq
      if (state.cwd) session.cwd = state.cwd
      liveness.current = state.alive !== false
      setReady(true)
    })
    return () => {
      gone = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellName])

  // 订阅 /ws：host 把 shell 输出广播成 terminal 帧
  useEffect(() => {
    if (typeof WebSocket === 'undefined') return
    const proto = location.protocol === 'https:' ? 'wss' : 'ws'
    let ws: WebSocket | null = null
    let retry: number | undefined
    let closed = false
    const open = () => {
      ws = new WebSocket(`${proto}://${location.host}/ws`)
      ws.onmessage = (event) => {
        let parsed: { type?: string; payload?: Record<string, unknown> }
        try {
          parsed = JSON.parse(String(event.data))
        } catch {
          return
        }
        if (parsed.type !== 'terminal') return
        const payload = parsed.payload ?? {}
        if (payload.id !== shellName) return
        if (payload.kind === 'output') {
          const seq = Number(payload.seq)
          if (!(seq > lastSeq.current)) return
          lastSeq.current = seq
          feed(String(payload.chunk ?? ''))
          return
        }
        if (payload.kind === 'echo') {
          // agent 那边敲的命令：补成命令行显示（否则页面上只有输出、没有命令）
          for (const line of String(payload.chunk ?? '').split('\n')) {
            if (line.trim()) push({ kind: 'in', text: line })
          }
          return
        }
        if (payload.kind === 'exit') {
          liveness.current = false
          out(`— 会话已结束（exit ${payload.code ?? '?'}）—`, true)
        }
      }
      ws.onclose = () => {
        if (closed) return
        retry = window.setTimeout(open, 1500)
      }
    }
    open()
    return () => {
      closed = true
      if (retry) window.clearTimeout(retry)
      if (ws) {
        ws.onclose = null
        ws.close()
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shellName])

  useEffect(() => {
    const box = scrollRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [history.length, zoomed])

  // 按键全部在输入框上以 capture 阶段原生处理。
  //
  // 为什么不能在 JSX 里写 onKeyDown：
  //   ProseMirror 的 keydown 监听挂在 .ProseMirror（输入框的祖先），
  //   React 的 onKeyDown 挂在 React 根容器（更外层）。事件先到 PM、后到 React，
  //   所以 React 里的 stopPropagation 是「太晚了」——PM 已经处理过退格了。
  // 为什么 Enter 也要自己处理：
  //   capture 阶段 stopPropagation 之后 React 的 onKeyDown 也不会再触发。
  // 结果：退格/左右/删除都归输入框，Enter 走我们自己的 run()。
  useEffect(() => {
    const input = inputRef.current
    if (!input) return
    const guard = (event: KeyboardEvent) => {
      event.stopPropagation()
      if (event.key === 'Enter') {
        event.preventDefault()
        runRef.current(input.value)
      }
    }
    input.addEventListener('keydown', guard, true)
    input.addEventListener('keyup', guard, true)
    input.addEventListener('keypress', guard, true)
    return () => {
      input.removeEventListener('keydown', guard, true)
      input.removeEventListener('keyup', guard, true)
      input.removeEventListener('keypress', guard, true)
    }
  }, [])

  // 键盘监听是原生注册的（见上面的 capture 守卫），用 ref 拿到最新的 run
  const runRef = useRef<(raw: string) => void>(() => {})

  const busyWrap = async (body: () => Promise<void>) => {
    busyRef.current = true
    setBusy(true)
    try {
      await body()
    } finally {
      busyRef.current = false
      setBusy(false)
      requestAnimationFrame(() => inputRef.current?.focus())
    }
  }

  const showMysqlRun = async (result: MysqlRun, sql: string) => {
    const text = result.stdout.trimEnd()
    if (text) {
      for (const line of text.split('\n')) {
        out(line)
        await new Promise((resolve) => setTimeout(resolve, 4))
      }
    }
    const err = result.stderr.trim()
    if (err) {
      for (const line of err.split('\n')) out(`✗ ${line}`, true)
    }
    const head = sql.split('\n').join(' ').slice(0, 48)
    out(
      result.ok
        ? `✓ ${head}${sql.length > 48 ? '…' : ''} · ${result.ms} ms`
        : `✗ 执行失败（exit ${result.exitCode}）`,
      !result.ok && !err,
    )
    if (!result.ok) {
      const drop = result.stderr.trim()
      if (/Access denied/i.test(drop)) {
        const masked = describeProfile(connRef.current)
        out('→ 这是认证失败，不是 SQL 写错了。当前凭据：' + masked)
        out('→ 直接在 SQL 模式里敲：mysql -u<用户> -p<密码>   就能换连接（不用先 exit）')
        out('→ 想改长期默认：编辑块围栏里的 mysql 字段（密码会写进文档，自己权衡）')
      } else if (/Can't connect|Connection refused|2003/i.test(drop)) {
        out('→ 连不上服务端：确认 mysql 在跑、端口对（当前 ' + describeProfile(connRef.current) + '）', true)
      } else if (/Unknown database/i.test(drop)) {
        out('→ 库名不存在。先 `SHOW DATABASES;` 看有哪些库', true)
      } else if (/1064|syntax/i.test(drop)) {
        out('→ SQL 语法错在 `' + head + '` 附近；多行语句要等行尾 `;` 才发', true)
      }
    }
  }

  const execSql = async (sql: string) => {
    const result = await runMysql(sql, connRef.current)
    await showMysqlRun(result, sql)
  }

  const runMysqlCommand = async (rest: string[]) => {
    const head = (rest[0] ?? '').toLowerCase()
    if (!rest.length || head === 'shell') {
      connRef.current = { ...mysql }
      setSqlOpen(true)
      out('已连到 ' + describeProfile(connRef.current) + '（mysql 客户端 batch 模式）')
      if (!connRef.current.password) {
        out('提示：当前没有密码。本机 root 若设过密码，这里每条 SQL 都会报 1045；')
        out('      直接在下面敲 `mysql -u root -p<密码>` 即可换连接。')
      }
      out(MYSQL_SQL_HELP)
      out('  例：SHOW DATABASES;   USE mysql;   SELECT VERSION();')
      return
    }
    if (head === 'help' || head === '?') {
      for (const line of MYSQL_HELP_LINES) out(line)
      return
    }
    if (head === 'status' || head === 'config') {
      out('当前连接：' + describeProfile(connRef.current))
      out('参数来源：块详情 data.mysql')
      return
    }
    if (head === 'ping') {
      await execSql('SELECT VERSION() AS version, CURRENT_USER() AS user, @@port AS port, DATABASE() AS db;')
      return
    }
    if (head === 'dbs' || head === 'databases') {
      await execSql('SHOW DATABASES;')
      return
    }
    if (head === 'use') {
      const db = (rest[1] ?? '').replace(/;?$/, '')
      if (!db) {
        out('✗ mysql use: 需要一个库名', true)
        return
      }
      connRef.current = { ...connRef.current, database: db }
      await execSql('SELECT DATABASE() AS db;')
      return
    }
    if (head === 'tables') {
      const db = (rest[1] ?? '').replace(/;?$/, '')
      if (db) connRef.current = { ...connRef.current, database: db }
      if (!connRef.current.database) {
        out('✗ mysql tables: 先 `mysql use <库>` 或 `mysql tables <库>`', true)
        return
      }
      await execSql('SHOW TABLES;')
      return
    }
    const { conn, sql } = parseMysqlArgs(rest, connRef.current)
    connRef.current = conn
    if (!sql) {
      setSqlOpen(true)
      out('已连到 ' + describeProfile(conn) + '（mysql 客户端 batch 模式）')
      out(MYSQL_SQL_HELP)
      return
    }
    await execSql(sql)
  }

  /** 真正发给 shell（只本地记一下 cd，为了提示行好看；真实 cwd 由 shell 自己管） */
  const sendToShell = async (cmd: string) => {
    if (!ready) {
      out('✗ shell 还没连上（等一下再敲，或刷新页面重开）', true)
      return
    }
    const cd = /^cd(\s+.*)?$/.exec(cmd)
    if (cd && !/[*?$`|&;<>]/.test(cd[1] ?? '')) {
      const target = (cd[1] ?? '').trim()
      if (!target || target === '~') session.cwd = '~'
      else {
        session.cwd = target.startsWith('/') ? target : `${session.cwd}/${target}`.replace(/\/\.\//g, '/')
      }
    }
    const ok = await shellWrite(shellName, `${cmd}\n`)
    if (!ok) out('✗ 写入 shell 失败（会话可能已结束，刷新会重开）', true)
  }

  const run = async (raw: string) => {
    if (busyRef.current) return
    const cmd = raw.trim()
    const echo = `${promptLabel}${cmd ? ` ${cmd}` : ''}`
    session.input = ''
    setDraft('')
    // 上一段输出没收尾：补一行，免得和提示行粘在一起
    if (session.partial) feed('\n')
    onChange()

    if (sqlOpen) {
      if (/^(exit|quit|\\q)$/i.test(cmd)) {
        setSqlOpen(false)
        setSqlBuffer([])
        out('已退出 SQL 模式')
        return
      }
      if (cmd === 'help' || cmd === '?') {
        for (const line of MYSQL_HELP_LINES) out(line)
        return
      }
      if (!cmd) {
        push({ kind: 'in', text: echo })
        return
      }
      // SQL 模式下也能换连接：`mysql -u用户 -p密码`（原来的实现直接拒绝，导致
      // 「用默认凭据进了 SQL 模式 → 每条 SQL 都 1045 → 出不去也改不了」是死路）
      if (/^(mysql|connect)(\s|$)/.test(cmd)) {
        push({ kind: 'in', text: echo })
        const { conn, sql } = parseMysqlArgs(cmd.replace(/;\s*$/, '').split(/\s+/).slice(1), connRef.current)
        connRef.current = conn
        out('已换到 ' + describeProfile(conn))
        if (sql) await busyWrap(() => execSql(sql))
        return
      }
      if (/^use\s+\S+;?$/i.test(cmd)) {
        push({ kind: 'in', text: echo })
        const db = cmd.replace(/^use\s+/i, '').replace(/;?$/, '')
        connRef.current = { ...connRef.current, database: db }
        await busyWrap(() => execSql('SELECT DATABASE() AS db;'))
        return
      }
      if (/^(ls|cd|pwd|cat|echo|clear|sh|bash|whoami|export|git|npm|python3?)\b/.test(cmd)) {
        push({ kind: 'in', text: echo })
        out('✗ 现在在 SQL 模式，只认 SQL；敲 `exit` 回终端再跑 shell 命令', true)
        return
      }
      push({ kind: 'in', text: echo })
      const next = [...sqlBuffer, cmd]
      if (!/;\s*$/.test(cmd)) {
        setSqlBuffer(next)
        return
      }
      setSqlBuffer([])
      await busyWrap(async () => {
        await execSql(next.join('\n'))
      })
      return
    }

    if (!cmd) {
      push({ kind: 'in', text: echo })
      return
    }

    if (cmd === 'clear' || cmd === 'cls') {
      session.history = []
      session.partial = ''
      onChange()
      onPersist()
      return
    }
    if (cmd === 'help' || cmd === '?') {
      push({ kind: 'in', text: echo })
      for (const line of SHELL_HELP_LINES) out(line)
      return
    }
    if (/^mysql(\s|$)/.test(cmd)) {
      push({ kind: 'in', text: echo })
      await busyWrap(() => runMysqlCommand(cmd.split(/\s+/).slice(1)))
      return
    }

    // 其余一律真发给 shell
    push({ kind: 'in', text: echo })
    await sendToShell(cmd)
  }

  // 交给原生键盘守卫调用
  runRef.current = (raw: string) => {
    void run(raw)
  }

  const btn: Record<string, unknown> = {
    cursor: 'pointer',
    border: 'none',
    background: 'transparent',
    color: PAPER,
    fontFamily: MONO,
    fontSize: 11,
    fontWeight: 700,
    padding: '4px 9px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: 4,
  }

  const dim = 'rgba(201,209,217,.45)'

  return (
    <div
      data-testid="page-terminal-surface"
      style={{
        position: 'relative',
        flex: 1,
        minHeight: 0,
        width: '100%',
        background: INK,
        border: zoomed ? 'none' : '1px solid rgba(201,209,217,.18)',
        borderRadius: zoomed ? 0 : 8,
        boxSizing: 'border-box',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: MONO,
        fontSize: 12.5,
        lineHeight: 1.6,
        color: PAPER,
        overflow: 'hidden',
      }}
    >
      <div
        data-biu-ignore
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
          padding: '4px 6px 4px 10px',
          borderBottom: '1px solid rgba(201,209,217,.14)',
          background: 'rgba(255,255,255,.02)',
        }}
      >
        <span style={{ color: 'rgba(201,209,217,.55)', fontSize: 10, letterSpacing: '.08em' }}>Terminal</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span data-testid="page-terminal-shell-name" style={{ color: dim, fontSize: 10 }}>
            {ready ? `sh · ${shellName}` : '连接中…'}
          </span>
          <button
            type="button"
            tabIndex={-1}
            title="清屏"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              session.history = []
              session.partial = ''
              onChange()
              onPersist()
            }}
            style={btn}
          >
            clear
          </button>
          {zoomed ? (
            <button
              type="button"
              tabIndex={-1}
              data-testid="page-terminal-shrink"
              title="退出放大"
              aria-label="退出放大"
              onClick={() => onClose?.()}
              style={btn}
            >
              <Glyph shrink />
            </button>
          ) : (
            <button
              type="button"
              tabIndex={-1}
              data-testid="page-terminal-zoom"
              title="放大终端"
              aria-label="放大终端"
              onMouseDown={(event) => event.preventDefault()}
              onClick={onZoom}
              style={btn}
            >
              <Glyph />
            </button>
          )}
        </span>
      </div>

      <div
        ref={scrollRef}
        data-testid="page-terminal-body"
        onClick={() => inputRef.current?.focus()}
        style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: '10px 12px', cursor: 'text' }}
      >
        {/*
          注意：下面四个兄弟节点必须固定顺序 + 稳定 key。
          否则 history/partial/sample 数量一变，React 按位置复用会把
          <input> 整个重建 —— 表现就是「打字打到一半光标跳出去、退格删不掉」。
        */}
        <div key="lines">
          {history.map((line, i) => (
            <div
              key={`${i}-${line.text.slice(0, 10)}`}
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                color: line.kind === 'in' ? ACCENT : line.kind === 'err' ? ERR : PAPER,
                fontWeight: line.kind === 'in' ? 700 : 400,
              }}
            >
              {line.text || ' '}
            </div>
          ))}
        </div>
        <div key="partial" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: PAPER }}>
          {session.partial ?? ''}
        </div>
        <div key="sample" style={{ color: dim }}>
          {sample.length && !history.length && !session.partial ? sample.join('\n') : ''}
        </div>
        <div key="prompt" style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
          <span style={{ color: GREEN, fontWeight: 700, whiteSpace: 'nowrap' }}>{promptLabel}</span>
          <input
            ref={inputRef}
            data-testid="page-terminal-input"
            data-page-block-capture=""
            spellCheck={false}
            value={draft}
            readOnly={busy}
            aria-label="终端输入"
            onChange={(event) => {
              setDraft(event.currentTarget.value)
              session.input = event.currentTarget.value
            }}
            style={{
              flex: 1,
              minWidth: 40,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: '#e6edf3',
              font: 'inherit',
              caretColor: GREEN,
            }}
          />
        </div>
      </div>
    </div>
  )
}

/* ---------------- 页面块 ---------------- */

function TerminalCard({
  data,
  update,
  writable,
}: {
  data: Record<string, unknown>
  update: (patch: Record<string, unknown>) => void
  writable: boolean
}) {
  const cwd = String(data.cwd ?? '~/demo')
  const prompt = String(data.prompt ?? '$')
  const mysql = parseMysqlProfile(data.mysql)
  const sample = parseLines(data.lines)
  const [zoom, setZoom] = useState(false)
  const [hover, setHover] = useState(false)
  const height = blockHeight(data)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [overlayEl, setOverlayEl] = useState<HTMLElement | null>(null)
  // SQL 模式与连接参数放在块层：放大/还原重建 surface 时不会丢
  const [sqlOpen, setSqlOpen] = useState(false)
  const connRef = useRef<MysqlProfile>({ ...parseMysqlProfile(data.mysql) })

  // 会话名 = 块 id（挂在 NodeViewWrapper 的 data-page-block-id 上）：
  // 刷新/切页接回同一条 shell；agent 用同一个名字也能接上。
  const [blockId, setBlockId] = useState('')
  useEffect(() => {
    const host = hostRef.current
    const host2 = host?.closest('[data-page-block-id]')
    setBlockId(host2?.getAttribute('data-page-block-id') ?? '')
  }, [])
  const shellName = `page:${blockId || 'terminal'}`

  const savedKey = JSON.stringify(data.session ?? null)
  const sessionRef = useRef<TerminalSession | null>(null)
  if (!sessionRef.current) {
    const restored = parseSession(data.session)
    restored.cwd = restored.cwd || cwd
    if (!restored.seeded) {
      restored.seeded = true
      if (!restored.history.length && sample.length) {
        restored.history = sample.map((text) => ({ kind: 'out' as const, text }))
      }
    }
    sessionRef.current = restored
  }
  const session = sessionRef.current
  const timer = useRef<number | undefined>(undefined)
  const savedRef = useRef(savedKey)
  const dataRef = useRef(data)
  dataRef.current = data
  const [nonce, setNonce] = useState(0)

  const pack = () => packSession(stripDraft({ ...session, cwd: session.cwd || cwd }))

  const flush = (delay = 350) => {
    if (!writable) return
    window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      const packed = pack()
      if (sameSession(packed, packSession(parseSession(dataRef.current.session)))) return
      update({ session: packed })
    }, delay)
  }

  useEffect(() => {
    if (!writable) return
    const packed = pack()
    if (sameSession(packed, packSession(parseSession(dataRef.current.session)))) return
    update({ session: packed })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (savedKey === savedRef.current) return
    savedRef.current = savedKey
    const next = parseSession(data.session)
    next.cwd = next.cwd || cwd
    if (!next.seeded) next.seeded = true
    sessionRef.current = next
    setNonce((n) => n + 1)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedKey])

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      if (!writable) return
      const packed = pack()
      if (!sameSession(packed, packSession(parseSession(dataRef.current.session)))) update({ session: packed })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  useEffect(() => {
    if (!zoom) {
      setOverlayEl(null)
      return
    }
    const host = hostRef.current
    if (host) unlockAncestors(host)
    const el = makeOverlay('page-terminal-zoom-host', INK)
    setOverlayEl(el)
    const stop = watchZoom(() => setZoom(false), el)
    return () => {
      stop()
      el.remove()
      relockAncestors()
      setOverlayEl(null)
    }
  }, [zoom])

  const surface = (zoomed: boolean) => (
    <TerminalSurface
      key={zoomed ? 'zoom' : 'card'}
      cwd={session.cwd || cwd}
      prompt={prompt}
      sample={sample}
      session={session}
      shellName={shellName}
      mysql={mysql}
      sqlOpen={sqlOpen}
      setSqlOpen={setSqlOpen}
      connRef={connRef}
      zoomed={zoomed}
      onZoom={() => setZoom(true)}
      onClose={() => setZoom(false)}
      onChange={() => {
        setNonce((n) => n + 1)
        flush()
      }}
      onPersist={() => flush(900)}
    />
  )

  return (
    <div
      ref={hostRef}
      data-testid="page-terminal"
      style={{ position: 'relative', width: '100%', height, display: 'flex' }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {surface(false)}
      {hover && !writable ? (
        <span
          data-biu-ignore
          style={{
            position: 'absolute',
            right: 10,
            bottom: 4,
            fontFamily: MONO,
            fontSize: 10,
            color: 'rgba(201,209,217,.4)',
          }}
        >
          help · 真 shell · mysql
        </span>
      ) : null}
      {overlayEl ? createPortal(surface(true), overlayEl) : null}
    </div>
  )
}

export function apply(ctx: {
  pageEditor: {
    registerBlock: (spec: {
      kind: string
      plugin: string
      label: string
      blockType?: string
      blockTypeLabel?: string
      hint?: string
      aliases?: string[]
      defaults?: Record<string, unknown> | (() => Record<string, unknown>)
      View: (props: {
        data: Record<string, unknown>
        update: (patch: Record<string, unknown>) => void
        writable: boolean
      }) => unknown
    }) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'terminal',
    plugin: name,
    label: '终端',
    blockType: 'terminal',
    blockTypeLabel: '终端',
    hint: '真 shell 终端卡片（/bin/sh，与 agent 共用同一条会话）；右上角可放大到全屏',
    aliases: ['terminal', 'shell', '终端', '命令行', 'console', 'cmd', 'bash', 'sh'],
    defaults: () => ({ ...SAMPLE, mysql: { ...MYSQL_DEFAULT } }),
    View: TerminalCard,
  })
}
