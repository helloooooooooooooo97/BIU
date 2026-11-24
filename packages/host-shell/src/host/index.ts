import { Service, type Context } from 'cordis'
import type { SpawnResult } from '@biu/host-subprocess'
import { posixShellArgv, describeHostRuntime, hostShellKind } from '@biu/host-subprocess'
import { currentSessionId } from '@biu/host-sessions/scope'
import { dataHome } from '@biu/host-plugin-loader/data-dir'
import {
  extractImagePathCandidates,
  findRecentImageFiles,
  ingestSessionImages,
} from '@biu/host-sessions/artifacts'

export type ShellRunOptions = {
  cwd?: string
  timeoutMs?: number
}

/** Capability seam 定义：换沙箱/远程 shell 只换 runner，不改 tool 名与 loop。 */
export type ShellRunner = (command: string, signal?: AbortSignal, options?: ShellRunOptions) => Promise<SpawnResult>

function truncateMiddle(text: string, maxChars: number) {
  if (maxChars <= 0 || text.length <= maxChars) return text
  const head = Math.floor(maxChars * 0.6)
  const tail = Math.max(0, maxChars - head)
  const omitted = text.length - head - tail
  return `${text.slice(0, head)}\n... [truncated ${omitted} chars] ...\n${tail > 0 ? text.slice(text.length - tail) : ''}`
}

export class ShellService extends Service {
  private runner: ShellRunner

  constructor(ctx: Context) {
    super(ctx, 'shell')
    this.runner = (command, signal, options) =>
      ctx.subprocess.run(
        {
          argv: posixShellArgv(command),
          ...(options?.cwd ? { cwd: options.cwd } : {}),
          timeoutMs: options?.timeoutMs ?? 15_000,
          onStdout: (_chunk, acc) => ctx.tools.report({ code: null, stdout: acc.stdout, stderr: acc.stderr }),
          onStderr: (_chunk, acc) => ctx.tools.report({ code: null, stdout: acc.stdout, stderr: acc.stderr }),
        },
        signal,
      )
  }

  setRunner(runner: ShellRunner) {
    this.runner = runner
  }

  run(command: string, signal?: AbortSignal, options?: ShellRunOptions) {
    return this.runner(command, signal, options)
  }
}

export const name = 'shell'
export const inject = ['subprocess', 'tools', 'fs']

export function apply(ctx: Context) {
  const shell = new ShellService(ctx)
  ctx.tools.register({
    name: 'bash',
    description:
      hostShellKind() === 'cmd'
        ? '在沙箱工作区执行命令（当前为 Windows cmd.exe /c）。用 dir/type/del，不要用 ls/cat。支持 cwd / timeout_ms / max_output_chars 控制目录、超时与输出长度。图片路径会尽量收录到代理 artifacts。'
        : '在沙箱工作区执行命令（当前为 POSIX shell）。支持 cwd / timeout_ms / max_output_chars 控制目录、超时与输出长度。截图/图片文件会尽量收录到代理 artifacts，并在对话里展示（命令或输出中带图片路径，或工作区内新写入的图片）。',
    parameters: {
      type: 'object',
      properties: {
        command: { type: 'string' },
        cwd: { type: 'string', description: '可选：命令执行目录（相对工作区或绝对路径）' },
        timeout_ms: { type: 'integer', description: '可选：超时毫秒数，默认 15000' },
        max_output_chars: {
          type: 'integer',
          description: '可选：stdout/stderr 最大返回字符数，超长时保留头尾并折叠中间部分以省 token',
        },
      },
      required: ['command'],
    },
    execute: async (args, signal) => {
      const command = String(args.command)
      const cwd = typeof args.cwd === 'string' && args.cwd.trim() ? args.cwd.trim() : undefined
      const timeoutMs = typeof args.timeout_ms === 'number' && args.timeout_ms > 0 ? args.timeout_ms : undefined
      const maxChars = typeof args.max_output_chars === 'number' && args.max_output_chars > 0 ? args.max_output_chars : 0
      const startedAt = Date.now() - 1500
      const result = await shell.run(command, signal, cwd || timeoutMs ? { cwd, timeoutMs } : undefined)
      const base = {
        code: result.code,
        stdout: maxChars ? truncateMiddle(result.stdout, maxChars) : result.stdout,
        stderr: maxChars ? truncateMiddle(result.stderr, maxChars) : result.stderr,
      }
      const sessionId = currentSessionId()
      if (!sessionId) return base

      const workspaceRoot = ctx.fs.effectiveRoot()
      const mapVirtualPath = (p: string) =>
        p === '/workspace' ? workspaceRoot : p.startsWith('/workspace/') ? p.slice('/workspace/'.length) : p
      const candidates = [
        ...extractImagePathCandidates(`${result.stdout}\n${result.stderr}`),
        ...extractImagePathCandidates(command),
      ].map(mapVirtualPath)
      try {
        const recent = await findRecentImageFiles(workspaceRoot, startedAt)
        candidates.push(...recent)
      } catch {
        /* ignore scan failures */
      }
      if (candidates.length === 0) return base

      try {
        const artifacts = await ingestSessionImages({
          sessionId,
          candidates,
          workspaceRoot,
          baseDir: dataHome(),
        })
        if (artifacts.length === 0) return base
        return { ...base, artifacts }
      } catch {
        return base
      }
    },
  })
  ctx.inject(['systemPrompt'], (inner) => {
    inner.systemPrompt.register('host.runtime', () => describeHostRuntime())
  })
}
