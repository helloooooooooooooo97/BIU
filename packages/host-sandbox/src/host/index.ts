import { existsSync, realpathSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { homedir, tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { Service, type Context } from 'cordis'
import type { SpawnRequest } from '@biu/host-subprocess'
import { dataHome } from '@biu/host-plugin-loader/data-dir'
import { assertSandboxDriverAllowed, getRuntimePolicy, type SandboxDriverKind } from '@biu/host-plugin-loader/runtime'

export type SandboxDriver = SandboxDriverKind

export interface WrappedSpawn extends SpawnRequest {
  argv: string[]
  cwd: string
  env: NodeJS.ProcessEnv
  driver: SandboxDriver
}

export interface SandboxBuildOptions {
  root: string
  cwd: string
  argv: string[]
  env?: NodeJS.ProcessEnv
  allowNetwork?: boolean
  dataRoot?: string
}

const VIRTUAL_WORKSPACE = '/workspace'
const DEFAULT_SAFE_PATH = '/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin'
const BWRAP_RO_BINDS = [
  '/usr',
  '/bin',
  '/sbin',
  '/lib',
  '/lib64',
  '/etc/alternatives',
  '/etc/ssl',
  '/etc/ca-certificates',
]
const BWRAP_NET_RO_BINDS = ['/etc/resolv.conf', '/etc/hosts']

let cachedBwrapBin: string | null | undefined
let cachedSeatbeltBin: string | null | undefined

function findBinary(name: string, candidates: string[]): string | null {
  for (const p of candidates) {
    if (existsSync(p)) return p
  }
  if (process.platform === 'win32') return null
  try {
    const out = execFileSync('which', [name], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' }).trim()
    return out || null
  } catch {
    return null
  }
}

function bwrapBinary(): string | null {
  if (cachedBwrapBin === undefined) {
    cachedBwrapBin = process.platform === 'linux' ? findBinary('bwrap', ['/usr/bin/bwrap', '/bin/bwrap']) : null
  }
  return cachedBwrapBin
}

function seatbeltBinary(): string | null {
  if (cachedSeatbeltBin === undefined) {
    cachedSeatbeltBin = process.platform === 'darwin' ? findBinary('sandbox-exec', ['/usr/bin/sandbox-exec']) : null
  }
  return cachedSeatbeltBin
}

function sandboxAllowNetwork(): boolean {
  return process.env.BIU_SANDBOX_NET === '1'
}

function resolveSandboxDriver(sandboxRequired = getRuntimePolicy().sandboxPolicy === 'required'): SandboxDriver {
  const configured = (process.env.BIU_SANDBOX_DRIVER || '').trim().toLowerCase()
  if (configured === 'none' || configured === 'env-only' || configured === 'bwrap' || configured === 'sandbox-exec') {
    if (configured === 'bwrap' && !bwrapBinary()) return 'env-only'
    if (configured === 'sandbox-exec' && !seatbeltBinary()) return 'env-only'
    return configured
  }
  if (!sandboxRequired) return 'none'
  if (process.platform === 'linux' && bwrapBinary()) return 'bwrap'
  if (process.platform === 'darwin' && seatbeltBinary()) return 'sandbox-exec'
  return 'env-only'
}

/** 清空宿主机敏感环境变量（如 API Keys / 超管密码），只保留运行命令所需最小集合。 */
export function sanitizeSandboxEnv(
  root: string,
  extraEnv?: NodeJS.ProcessEnv,
  opts?: { virtualWorkspace?: boolean; tmpDir?: string },
): NodeJS.ProcessEnv {
  const home = opts?.virtualWorkspace ? VIRTUAL_WORKSPACE : root
  const tmp = opts?.tmpDir ?? (opts?.virtualWorkspace ? '/tmp' : tmpdir())
  const base: NodeJS.ProcessEnv = {
    PATH: process.env.PATH || DEFAULT_SAFE_PATH,
    HOME: home,
    TMPDIR: tmp,
    LANG: process.env.LANG || 'C.UTF-8',
    LC_ALL: process.env.LC_ALL || 'C.UTF-8',
    TERM: process.env.TERM || 'xterm-256color',
    CORDIS_SANDBOX: home,
  }
  if (extraEnv) {
    for (const [k, v] of Object.entries(extraEnv)) {
      if (v !== undefined) base[k] = v
    }
  }
  return base
}

export function buildBwrapArgv(opts: SandboxBuildOptions, roBindExists: (p: string) => boolean = existsSync): string[] {
  const root = resolve(opts.root)
  const cwd = resolve(opts.cwd)
  const rel = relative(root, cwd)
  const virtualCwd = rel && rel !== '.' ? `${VIRTUAL_WORKSPACE}/${rel.split('\\').join('/')}` : VIRTUAL_WORKSPACE
  const args: string[] = [
    '--unshare-pid',
    '--unshare-ipc',
    '--unshare-uts',
    '--die-with-parent',
    '--new-session',
  ]
  if (!opts.allowNetwork) args.push('--unshare-net')
  args.push('--clearenv')
  for (const dir of BWRAP_RO_BINDS) {
    if (roBindExists(dir)) args.push('--ro-bind', dir, dir)
  }
  if (opts.allowNetwork) {
    for (const file of BWRAP_NET_RO_BINDS) {
      if (roBindExists(file)) args.push('--ro-bind', file, file)
    }
  }
  args.push('--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp')
  args.push('--bind', root, VIRTUAL_WORKSPACE)
  args.push('--chdir', virtualCwd)
  const env = sanitizeSandboxEnv(root, opts.env, { virtualWorkspace: true })
  for (const [k, v] of Object.entries(env)) {
    if (v !== undefined) args.push('--setenv', k, v)
  }
  args.push('--', ...opts.argv)
  return args
}

function escapeSeatbeltPath(p: string) {
  return p.replace(/\\/g, '\\\\').replace(/"/g, '\\"')
}

function uniqueRealPaths(paths: string[]): string[] {
  const set = new Set<string>()
  for (const p of paths) {
    if (!p) continue
    const abs = resolve(p)
    set.add(abs)
    try {
      set.add(realpathSync(abs))
    } catch {
      /* path may not exist yet */
    }
  }
  return [...set]
}

/** macOS Seatbelt 轻量化沙箱：仅允许写入当前工作区与临时目录，禁止读取宿主机敏感数据与其他空间。 */
export function buildSeatbeltProfile(opts: SandboxBuildOptions): string {
  const rootPaths = uniqueRealPaths([opts.root])
  const dataRootPaths = uniqueRealPaths(opts.dataRoot ? [opts.dataRoot] : [dataHome()])
  const cwdRepoPaths = uniqueRealPaths([process.cwd()])
  const home = homedir()
  const sensitiveHomeDirs = uniqueRealPaths([
    join(home, '.ssh'),
    join(home, '.aws'),
    join(home, '.gnupg'),
    join(home, '.kube'),
  ])

  const lines: string[] = [
    '(version 1)',
    '(allow default)',
    // 禁止写入工作区与临时目录之外的任何位置
    '(deny file-write*)',
    '(allow file-write* (literal "/dev/null") (literal "/dev/zero") (literal "/dev/tty") (subpath "/dev/fd"))',
    '(allow file-write* (subpath "/tmp") (subpath "/private/tmp") (subpath "/var/folders") (subpath "/private/var/folders"))',
  ]
  for (const rp of rootPaths) {
    lines.push(`(allow file-write* (subpath "${escapeSeatbeltPath(rp)}"))`)
  }

  // 禁止读取宿主机 .env、.biu 数据库/密钥目录、其他云端空间与个人凭证目录
  for (const dr of dataRootPaths) {
    lines.push(`(deny file-read* (subpath "${escapeSeatbeltPath(join(dr, '.biu'))}"))`)
    lines.push(`(deny file-read* (subpath "${escapeSeatbeltPath(join(dr, 'workspaces'))}"))`)
    lines.push(`(deny file-read* (literal "${escapeSeatbeltPath(join(dr, '.env'))}"))`)
  }
  for (const repo of cwdRepoPaths) {
    lines.push(`(deny file-read* (literal "${escapeSeatbeltPath(join(repo, '.env'))}"))`)
    lines.push(`(deny file-read* (subpath "${escapeSeatbeltPath(join(repo, '.cloud-data'))}"))`)
    lines.push(`(deny file-read* (subpath "${escapeSeatbeltPath(join(repo, '.local-data'))}"))`)
  }
  for (const sh of sensitiveHomeDirs) {
    lines.push(`(deny file-read* (subpath "${escapeSeatbeltPath(sh)}"))`)
  }
  // 重新放行当前工作区自身读取（Seatbelt 同级规则后写优先）
  for (const rp of rootPaths) {
    lines.push(`(allow file-read* (subpath "${escapeSeatbeltPath(rp)}"))`)
  }

  if (!opts.allowNetwork) {
    lines.push('(deny network*)')
  }
  return lines.join('\n')
}

export class SandboxService extends Service {
  constructor(ctx: Context) {
    super(ctx, 'sandbox')
  }

  private root() {
    return this.ctx.fs.effectiveRoot()
  }

  private resolveCwd(root: string, requested?: string) {
    if (!requested) return root
    const mapped =
      requested === VIRTUAL_WORKSPACE
        ? root
        : requested.startsWith(`${VIRTUAL_WORKSPACE}/`)
          ? resolve(root, requested.slice(VIRTUAL_WORKSPACE.length + 1))
          : resolve(root, requested)
    if (relative(root, mapped).startsWith('..')) throw new Error('cwd outside sandbox')
    return mapped
  }

  wrap(req: SpawnRequest): WrappedSpawn {
    const root = this.root()
    const cwd = this.resolveCwd(root, req.cwd)
    const driver = resolveSandboxDriver()
    assertSandboxDriverAllowed(driver)
    const allowNetwork = sandboxAllowNetwork()

    if (driver === 'bwrap') {
      const bin = bwrapBinary()!
      const bwrapArgv = buildBwrapArgv({
        root,
        cwd,
        argv: req.argv,
        env: req.env,
        allowNetwork,
      })
      const hostEnv = sanitizeSandboxEnv(root, req.env, { virtualWorkspace: true })
      this.ctx.emit('sandbox/wrap', { argv: req.argv, cwd })
      return { ...req, argv: [bin, ...bwrapArgv], cwd, env: hostEnv, driver }
    }

    if (driver === 'sandbox-exec') {
      const bin = seatbeltBinary()!
      const profile = buildSeatbeltProfile({
        root,
        cwd,
        argv: req.argv,
        env: req.env,
        allowNetwork,
        dataRoot: dataHome(),
      })
      const env = sanitizeSandboxEnv(root, req.env)
      this.ctx.emit('sandbox/wrap', { argv: req.argv, cwd })
      return { ...req, argv: [bin, '-p', profile, '--', ...req.argv], cwd, env, driver }
    }

    if (driver === 'env-only') {
      const env = sanitizeSandboxEnv(root, req.env)
      this.ctx.emit('sandbox/wrap', { argv: req.argv, cwd })
      return { ...req, argv: req.argv, cwd, env, driver }
    }

    const env = { ...process.env, ...req.env, CORDIS_SANDBOX: root }
    this.ctx.emit('sandbox/wrap', { argv: req.argv, cwd })
    return { ...req, argv: req.argv, cwd, env, driver }
  }
}

export const name = 'sandbox'
export const inject = ['fs']

export function apply(ctx: Context) {
  new SandboxService(ctx)
}
