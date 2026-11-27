export type ClientLogLevel = 'info' | 'warn' | 'error'

export type ClientLogEntry = {
  ts: number
  level: ClientLogLevel
  scope: string
  message: string
}

const MAX = 200
let entries: ClientLogEntry[] = []

export function clientLogSnapshot() {
  return entries
}

export function resetClientLogs() {
  entries = []
}

export function clientLogErrorText(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  return String(error)
}

/** 浏览器侧诊断。设置 → 事件能回看，控制台同时打出原因，不再只剩一个状态码。 */
export function clientLog(level: ClientLogLevel, scope: string, message: string, detail?: unknown) {
  const entry: ClientLogEntry = { ts: Date.now(), level, scope, message }
  entries = [entry, ...entries].slice(0, MAX)
  const line = `[biu:${scope}] ${message}`
  const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.info
  if (detail !== undefined) sink(line, detail)
  else sink(line)
}
