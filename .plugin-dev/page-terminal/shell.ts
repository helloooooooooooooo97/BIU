/**
 * 演示终端的内置命令表：纯前端模拟，不碰宿主的真 shell。
 * 想接真 shell 的话，可以把这里换成 host 侧服务。
 *
 * 另含「会话 <-> 块 data.session」的序列化：命令记录存在页面块详情里，
 * 刷新/换设备也在，格式对人可读（data.session.history）。
 */

export type TerminalResult = {
  /** 输出文本；clear 时忽略 */
  output: string
  /** 非零退出：输出按错误色显示 */
  failed?: boolean
  type?: 'clear'
}

const FILES: Record<string, string> = {
  'readme.md': '# Demo workspace\n\nA tiny fake file system for the terminal card.\n',
  'notes.txt': 'buy milk\nwrite the deck\nship it\n',
  'src/index.ts': "export const hello = () => 'hi'\n",
}

const TREE = `demo/
├── readme.md
├── notes.txt
└── src/
    └── index.ts`

const HELP = `可用命令
  help            显示这份帮助
  demo            逐条演示常见命令
  ls [path]       列目录
  cat <file>      看文件
  echo <text>     原样输出
  pwd             当前目录
  date            当前时间
  whoami          当前用户
  tree            目录树
  neofetch        系统信息
  open <url>      在新标签打开链接
  clear           清屏

未识别的命令会返回 command not found。`

function nowText() {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
}

function normalizeUrl(raw: string) {
  const text = raw.trim()
  if (!text) return ''
  if (/^https?:\/\//i.test(text)) return text
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(text)) return `https://${text}`
  return ''
}

export function runTerminalCommand(raw: string): TerminalResult {
  const line = raw.trim()
  if (!line) return { output: '' }
  const [head, ...rest] = line.split(/\s+/)
  const cmd = head.toLowerCase()
  const arg = rest.join(' ')
  switch (cmd) {
    case 'help':
    case '?':
      return { output: HELP }
    case 'demo':
      return { output: '试试：ls → cat readme.md → tree → open example.com' }
    case 'ls': {
      const names = Object.keys(FILES).sort()
      return { output: names.join('\n') }
    }
    case 'cat': {
      if (!arg) return { output: '✗ cat: 需要一个文件名', failed: true }
      const hit = FILES[arg]
      if (hit == null) return { output: `✗ cat: ${arg}: No such file`, failed: true }
      return { output: hit }
    }
    case 'echo':
      return { output: arg }
    case 'pwd':
      return { output: '/home/demo' }
    case 'date':
      return { output: nowText() }
    case 'whoami':
      return { output: 'demo' }
    case 'tree':
      return { output: TREE }
    case 'neofetch':
      return {
        output: [
          'demo@biu',
          '-------',
          'OS: 页面终端卡片',
          'Shell: page-terminal',
          'Runtime: 宿主浏览器',
          `Time: ${nowText()}`,
        ].join('\n'),
      }
    case 'open': {
      const url = normalizeUrl(arg)
      if (!url) return { output: '✗ open: 需要 http(s) 链接', failed: true }
      if (typeof window !== 'undefined') window.open(url, '_blank', 'noopener')
      return { output: `→ 已打开 ${url}` }
    }
    case 'clear':
      return { output: '', type: 'clear' }
    case 'sudo':
      return { output: '✗ 这里是演示终端，没有真 shell 可以提权', failed: true }
    default:
      return { output: `✗ command not found: ${head}（输入 help 看命令）`, failed: true }
  }
}

/* ---------------- 会话持久化（写进页面块 data，不是宿主本地存储） ---------------- */

export type SavedLine = { kind: 'in' | 'out' | 'err'; text: string }

export type TerminalSession = {
  input: string
  cwd: string
  history: SavedLine[]
  /** 开过一次终端就为 true，配合记录里的 lines 判断种子只灌一次 */
  seeded?: boolean
}

export const SESSION_MAX_LINES = 200
export const SESSION_MAX_CHARS = 4000
export const SESSION_LINE_MAX = 600

export function createSession(): TerminalSession {
  return { input: '', cwd: '', history: [], seeded: false }
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
    seeded: src.seeded === true,
  }
}

/** 草稿（还没回车的输入）不落盘：省体积，也避免半截命令进文档。 */
export function stripDraft(session: TerminalSession): TerminalSession {
  return { input: '', cwd: session.cwd, history: session.history, seeded: session.seeded }
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
