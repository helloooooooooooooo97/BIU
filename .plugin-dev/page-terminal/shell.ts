/**
 * 页面终端的数据层：会话序列化 + mysql 连接参数。
 *
 * 命令本身不再有「内置命令表」——除了 mysql 走客户端 batch 模式，
 * 其余一律发给宿主侧的真 shell（见 host.ts / packages/host-terminal）。
 *
 * 会话 <-> 块 data.session 的序列化：记录存在页面块详情里，刷新/换设备也在。
 */

/* ---------------- mysql 连接参数 ---------------- */

export type MysqlProfile = {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export const MYSQL_DEFAULT: MysqlProfile = {
  host: '127.0.0.1',
  port: 3306,
  user: 'root',
  password: '',
  database: '',
}

/** 连接参数写在块详情 data.mysql 里（围栏 JSON 的 mysql 字段），坏数据一律忽略。 */
export function parseMysqlProfile(raw: unknown): MysqlProfile {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...MYSQL_DEFAULT }
  const src = raw as Record<string, unknown>
  const port = Number(src.port)
  return {
    host: String(src.host ?? '').trim() || MYSQL_DEFAULT.host,
    port: Number.isFinite(port) && port > 0 && port < 65536 ? Math.round(port) : MYSQL_DEFAULT.port,
    user: String(src.user ?? '').trim() || MYSQL_DEFAULT.user,
    password: typeof src.password === 'string' ? src.password : '',
    database: String(src.database ?? '').trim(),
  }
}

/** 打印用：密码只显示打码，不进终端历史里的明文。 */
export function describeProfile(profile: MysqlProfile) {
  const auth = profile.password ? `${profile.user}:***` : profile.user
  const db = profile.database ? ` 库=${profile.database}` : ''
  return `${auth}@${profile.host}:${profile.port}${db}`
}

export const MYSQL_SQL_HELP = '  SQL 模式下：一行或多行 SQL，行尾 ; 执行；`use 库名` 切库；exit / \\q 退出；help 看命令表'

export const MYSQL_HELP_LINES = [
  'mysql —— 真连本机 mysql 客户端（不是模拟）',
  '（SQL 模式下也能直接用 `use 库名` 切库，不必退出来）',
  '  mysql                    进入 SQL 模式，之后每行 SQL 以 ; 结束执行，exit 退出',
  '  mysql -e "<SQL>"         直接执行一条 SQL',
  '  mysql ping               测连接：版本 / 当前用户 / 端口 / 当前库',
  '  mysql dbs                列出数据库（SHOW DATABASES）',
  '  mysql tables [库]        列出表（先 use 一个库，或直接带上库名）',
  '  mysql use <库>           切库（只影响本会话）',
  '  mysql status             看当前连接参数（密码打码）',
  '  mysql -h 主机 -P 端口 -u 用户 -p密码 -D 库   覆盖连接参数，可只给一部分',
  '',
  '连接参数的默认值来自块详情 data.mysql（围栏 JSON 的 mysql 字段）。',
  '在终端里用 -h/-u/-p 改的只对本次会话有效，不会写进文档（避免密码落到 markdown 里）。',
  '想换默认值：编辑围栏里 mysql 字段，例如',
  '  "mysql": { "host": "127.0.0.1", "port": 3306, "user": "root", "password": "***", "database": "mysql" }',
  '',
  '写操作（INSERT/UPDATE/DELETE/DDL）会真的执行，请自己确认库和环境。',
  '安全边界：这个终端只能跑 mysql 客户端，不是通用 shell；\\! / system / source 会被拒绝。',
]

/* ---------------- 会话持久化（写进页面块 data，不是宿主本地存储） ---------------- */

export type SavedLine = { kind: 'in' | 'out' | 'err'; text: string }

export type TerminalSession = {
  input: string
  cwd: string
  history: SavedLine[]
  /** 还没换行的最后半行输出（不落盘；重挂时由服务端缓冲对齐） */
  partial?: string
  /** 开过一次终端就为 true，配合记录里的 lines 判断种子只灌一次 */
  seeded?: boolean
}

export const SESSION_MAX_LINES = 200
export const SESSION_MAX_CHARS = 4000
export const SESSION_LINE_MAX = 600

export function createSession(): TerminalSession {
  return { input: '', cwd: '', history: [], partial: '', seeded: false }
}

function asKind(raw: unknown): SavedLine['kind'] {
  return raw === 'in' || raw === 'err' || raw === 'out' ? raw : 'out'
}

/** 从块 data 还原，坏数据一律忽略，绝不让块因为脏 data 崩掉。 */
export function parseSession(raw: unknown): TerminalSession {
  const base = createSession()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return base
  const src = raw as Record<string, unknown>
  const history: SavedLine[] = Array.isArray(src.history)
    ? src.history
        .slice(-SESSION_MAX_LINES)
        .map((item) => {
          if (!item || typeof item !== 'object') return null
          const row = item as Record<string, unknown>
          return { kind: asKind(row.kind), text: String(row.text ?? '') }
        })
        .filter((item): item is SavedLine => item != null && item.text.length > 0)
    : []
  return {
    input: String(src.input ?? ''),
    cwd: String(src.cwd ?? ''),
    history,
    partial: '',
    seeded: src.seeded === true,
  }
}

/** 草稿（还没回车的输入）不落盘：省体积，也避免半截命令进文档。 */
export function stripDraft(session: TerminalSession): TerminalSession {
  return { input: '', cwd: session.cwd, history: session.history, partial: '', seeded: session.seeded }
}

/** 写回前收口：限行数、限总字长（只从头部丢最老的），避免把文档撑爆。 */
export function packSession(session: TerminalSession): TerminalSession {
  let history = session.history
    .slice(-SESSION_MAX_LINES)
    .map((line) => (line.text.length > SESSION_LINE_MAX ? { kind: line.kind, text: line.text.slice(0, SESSION_LINE_MAX) } : line))
  let chars = history.reduce((n, line) => n + line.text.length, 0)
  let head = 0
  while (chars > SESSION_MAX_CHARS && head < history.length - 1) {
    chars -= history[head].text.length
    head += 1
  }
  if (head > 0) history = history.slice(head)
  return {
    input: session.input.slice(0, 400),
    cwd: session.cwd,
    history,
    seeded: session.seeded === true,
  }
}

/** 内容一样就别写，省得每次回车都触发文档更新。 */
export function sameSession(a: TerminalSession, b: TerminalSession) {
  return a.input === b.input && a.cwd === b.cwd && a.history.length === b.history.length && a.history.every((line, i) => {
    const other = b.history[i]
    return other != null && other.kind === line.kind && other.text === line.text
  }) && a.seeded === b.seeded
}
