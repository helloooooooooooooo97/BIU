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
