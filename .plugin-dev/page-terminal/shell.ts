/**
 * 命令记录存在页面块 data.session 里（不是 localStorage）。
 * 真正执行走 host `/api/page-terminal/run`（工作区 POSIX shell / Node）。
 */

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
    chars -= history[head]!.text.length
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
  return (
    a.input === b.input &&
    a.cwd === b.cwd &&
    a.history.length === b.history.length &&
    a.history.every((line, i) => {
      const other = b.history[i]
      return other != null && other.kind === line.kind && other.text === line.text
    }) &&
    a.seeded === b.seeded
  )
}

export async function runHostCommand(command: string) {
  const res = await fetch('/api/page-terminal/run', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ command }),
  })
  const body = (await res.json().catch(() => ({}))) as {
    code?: number | null
    stdout?: string
    stderr?: string
    error?: string
  }
  if (!res.ok) throw new Error(body.error || res.statusText)
  return {
    code: body.code ?? null,
    stdout: String(body.stdout ?? ''),
    stderr: String(body.stderr ?? ''),
  }
}
