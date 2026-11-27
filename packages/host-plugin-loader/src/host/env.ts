import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export const DEFAULT_SUPER_ADMIN_EMAIL = '97@biu.com'
export const DEFAULT_SUPER_ADMIN_PASSWORD = '123456'

function stripQuotes(value: string) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1)
  }
  return value
}

function applyEnvFile(file: string) {
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    if (!key || process.env[key] !== undefined) continue
    process.env[key] = stripQuotes(line.slice(eq + 1).trim())
  }
}

/** 读仓库根 `.env`，不覆盖已经在进程里的变量（脚本 / CI 优先）。 */
export function loadBiuEnv(from = process.cwd()) {
  let dir = from
  for (let i = 0; i < 8; i++) {
    const file = join(dir, '.env')
    if (existsSync(file)) {
      applyEnvFile(file)
      return file
    }
    const parent = dirname(dir)
    if (parent === dir) break
    dir = parent
  }
  return null
}

export function superAdminEmail() {
  return (process.env.BIU_SUPER_ADMIN_EMAIL || DEFAULT_SUPER_ADMIN_EMAIL).trim().toLowerCase()
}

export function superAdminPassword() {
  const value = process.env.BIU_SUPER_ADMIN_PASSWORD
  return (value == null || value === '' ? DEFAULT_SUPER_ADMIN_PASSWORD : value)
}

export function isSuperAdminEmail(email: string | null | undefined) {
  return String(email ?? '').trim().toLowerCase() === superAdminEmail()
}

// ── Unified typed host environment accessors ────────────────────────────────

function hostEnvString(key: string, fallback = ''): string {
  const raw = process.env[key]
  if (raw == null || raw === '') return fallback
  return raw
}

function hostEnvUrl(key: string): string {
  const raw = process.env[key]?.trim()
  return raw ? raw.replace(/\/+$/, '') : ''
}

function hostEnvNumber(key: string, fallback: number): number {
  const raw = process.env[key]
  if (raw == null || raw === '') return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

export function hostRemoteOrigin(): string {
  return hostEnvUrl('BIU_REMOTE_ORIGIN')
}

export function hostPort(override?: number | string): number {
  if (override !== undefined && override !== '') {
    const n = Number(override)
    if (Number.isFinite(n)) return n
  }
  return hostEnvNumber('PORT', 3141)
}

export function hostSharePort(): string | undefined {
  return process.env.SHARE_PORT
}

export function hostShareProxyUi(): string {
  return hostEnvUrl('SHARE_PROXY_UI')
}

export function hostSharePublicUrl(): string {
  return hostEnvUrl('SHARE_PUBLIC_URL')
}

export function hostCtxBudget(): number {
  return hostEnvNumber('CTX_BUDGET', 1_000_000)
}

export function hostPluginDir(cwd = process.cwd()): string {
  return hostEnvString('BIU_PLUGIN_DIR', join(cwd, '.plugin'))
}

export function hostPluginDevDir(cwd = process.cwd()): string {
  return hostEnvString('BIU_PLUGIN_DEV_DIR', join(cwd, '.plugin-dev'))
}
