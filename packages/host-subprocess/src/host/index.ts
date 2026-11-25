import { spawn, type ChildProcess } from 'node:child_process'
import { Service, type Context } from 'cordis'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'
export { posixShellArgv, posixShellBin, hostShellKind, describeHostRuntime } from './posix-shell.ts'

export interface SpawnProgress {
  stdout: string
  stderr: string
}

export interface SpawnRequest {
  argv: string[]
  cwd?: string
  env?: NodeJS.ProcessEnv
  stdin?: string
  timeoutMs?: number
  onStdout?: (chunk: string, acc: SpawnProgress) => void
  onStderr?: (chunk: string, acc: SpawnProgress) => void
}

export interface SpawnResult {
  code: number | null
  stdout: string
  stderr: string
}

const KILL_GRACE_MS = 800
const DEFAULT_CLOUD_MAX_CONCURRENCY = 20

export function sandboxMaxConcurrency(): number {
  const raw = Number(process.env.BIU_SANDBOX_MAX_CONCURRENCY)
  if (Number.isInteger(raw) && raw > 0) return raw
  return getRuntimePolicy().enforceTenantQuotas ? DEFAULT_CLOUD_MAX_CONCURRENCY : 0
}

export class ConcurrencyLimiter {
  private active = 0
  private queue: Array<{
    resolve: (release: () => void) => void
    reject: (error: Error) => void
    signal?: AbortSignal
    onAbort?: () => void
  }> = []

  acquire(limit: number, signal?: AbortSignal): Promise<() => void> {
    if (limit <= 0) return Promise.resolve(() => {})
    if (signal?.aborted) return Promise.reject(new Error('aborted while waiting for sandbox slot'))
    if (this.active < limit) {
      this.active += 1
      return Promise.resolve(this.makeRelease(limit))
    }
    return new Promise((resolve, reject) => {
      const entry: (typeof this.queue)[number] = { resolve, reject, signal }
      if (signal) {
        entry.onAbort = () => {
          const idx = this.queue.indexOf(entry)
          if (idx >= 0) this.queue.splice(idx, 1)
          reject(new Error('aborted while waiting for sandbox slot'))
        }
        signal.addEventListener('abort', entry.onAbort, { once: true })
      }
      this.queue.push(entry)
    })
  }

  private makeRelease(limit: number) {
    let released = false
    return () => {
      if (released) return
      released = true
      this.active = Math.max(0, this.active - 1)
      while (this.active < limit && this.queue.length > 0) {
        const next = this.queue.shift()!
        if (next.signal && next.onAbort) next.signal.removeEventListener('abort', next.onAbort)
        if (next.signal?.aborted) continue
        this.active += 1
        next.resolve(this.makeRelease(limit))
        break
      }
    }
  }
}

export class SubprocessService extends Service {
  private limiter = new ConcurrencyLimiter()

  constructor(ctx: Context) {
    super(ctx, 'subprocess')
  }

  async run(req: SpawnRequest, signal?: AbortSignal): Promise<SpawnResult> {
    const wrapped = this.ctx.sandbox.wrap(req)
    const release = await this.limiter.acquire(sandboxMaxConcurrency(), signal)
    return new Promise((resolve, reject) => {
      // Unix：独立进程组，超时才能杀管道子进程。否则只 SIGTERM shell，
      // grep|cat 仍占着 stdout，child.close 永远不来，agent 整回合卡死。
      const child = spawn(wrapped.argv[0]!, wrapped.argv.slice(1), {
        cwd: wrapped.cwd,
        env: wrapped.env,
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      })
      let stdout = ''
      let stderr = ''
      let settled = false
      let killTimer: ReturnType<typeof setTimeout> | undefined
      let forceTimer: ReturnType<typeof setTimeout> | undefined
      child.stdout?.on('data', (chunk) => {
        const text = String(chunk)
        stdout += text
        wrapped.onStdout?.(text, { stdout, stderr })
      })
      child.stderr?.on('data', (chunk) => {
        const text = String(chunk)
        stderr += text
        wrapped.onStderr?.(text, { stdout, stderr })
      })

      const cleanup = () => {
        if (timer) clearTimeout(timer)
        if (killTimer) clearTimeout(killTimer)
        if (forceTimer) clearTimeout(forceTimer)
        signal?.removeEventListener('abort', onAbort)
        release()
      }
      const settle = (fn: () => void) => {
        if (settled) return
        settled = true
        cleanup()
        fn()
      }
      const stop = () => {
        killTree(child, 'SIGTERM')
        killTimer = setTimeout(() => {
          killTree(child, 'SIGKILL')
          child.stdout?.destroy()
          child.stderr?.destroy()
        }, KILL_GRACE_MS)
        forceTimer = setTimeout(() => {
          settle(() => resolve({ code: null, stdout, stderr }))
        }, KILL_GRACE_MS + 500)
      }

      const timer = wrapped.timeoutMs ? setTimeout(stop, wrapped.timeoutMs) : undefined
      const onAbort = () => stop()
      if (signal?.aborted) stop()
      else signal?.addEventListener('abort', onAbort)
      if (wrapped.stdin) child.stdin?.end(wrapped.stdin)
      else child.stdin?.end()
      child.on('error', (error) => {
        settle(() => reject(error))
      })
      child.on('close', (code) => {
        settle(() => resolve({ code, stdout, stderr }))
      })
    })
  }
}

function killTree(child: ChildProcess, sig: NodeJS.Signals) {
  const pid = child.pid
  if (pid == null) return
  if (process.platform === 'win32') {
    spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' }).on('error', () => {
      try {
        child.kill()
      } catch {
        /* already dead */
      }
    })
    return
  }
  try {
    process.kill(-pid, sig)
  } catch {
    try {
      child.kill(sig)
    } catch {
      /* already dead */
    }
  }
}

export const name = 'subprocess'
export const inject = ['sandbox']

export function apply(ctx: Context) {
  new SubprocessService(ctx)
}
