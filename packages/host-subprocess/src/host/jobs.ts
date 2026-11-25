import { Service, type Context } from 'cordis'
import { posixShellArgv } from '@biu/host-subprocess'
import { currentTenantScope } from '@biu/host-plugin-loader/data-dir'
import '@biu/host-plugin-loader/tenant-state'

const JOB_HISTORY_TTL_MS = 10 * 60_000

interface Job {
  id: string
  tenantKey: string
  accountId: string
  workspaceId: string
  argv: string[]
  status: 'running' | 'done' | 'cancelled'
  result?: { code: number | null; stdout: string; stderr: string }
  abort: AbortController
  finishedAt?: number
}

export class JobsService extends Service {
  private jobs = new Map<string, Job>()

  constructor(ctx: Context) {
    super(ctx, 'jobs')
    ctx.effect(() => {
      const disposeMatching = (predicate: (job: Job) => boolean) => {
        for (const [id, job] of [...this.jobs]) {
          if (!predicate(job)) continue
          job.abort.abort()
          this.jobs.delete(id)
        }
      }
      const offRevoked = ctx.on('tenant/revoked', (payload) => {
        disposeMatching(
          (job) =>
            job.accountId === payload.accountId &&
            (!payload.workspaceId || job.workspaceId === payload.workspaceId),
        )
      })
      const offDeleted = ctx.on('workspace/deleted', (payload) => {
        disposeMatching((job) => job.workspaceId === payload.workspaceId)
      })
      return () => {
        offRevoked()
        offDeleted()
      }
    }, 'jobs.tenant-lifecycle')
  }

  private pruneFinished(now = Date.now()) {
    for (const [id, job] of this.jobs) {
      if (job.status !== 'running' && job.finishedAt && now - job.finishedAt >= JOB_HISTORY_TTL_MS) {
        this.jobs.delete(id)
      }
    }
  }

  private ownedJob(id: string): Job | undefined {
    const job = this.jobs.get(id)
    if (!job || job.tenantKey !== currentTenantScope().key) return undefined
    return job
  }

  async start(argv: string[]) {
    this.pruneFinished()
    const id = crypto.randomUUID().slice(0, 8)
    const abort = new AbortController()
    const { accountId, workspaceId, key } = currentTenantScope()
    const job: Job = { id, tenantKey: key, accountId, workspaceId, argv, status: 'running', abort }
    this.jobs.set(id, job)
    void this.ctx.subprocess.run({ argv, timeoutMs: 60_000 }, abort.signal).then((result) => {
      job.status = 'done'
      job.result = result
      job.finishedAt = Date.now()
    }).catch((error) => {
      job.status = 'done'
      job.result = { code: 1, stdout: '', stderr: String(error) }
      job.finishedAt = Date.now()
    })
    return { id, status: job.status }
  }

  list() {
    this.pruneFinished()
    const key = currentTenantScope().key
    return [...this.jobs.values()]
      .filter((job) => job.tenantKey === key)
      .map(({ id, argv, status }) => ({ id, argv, status }))
  }

  collect(id: string) {
    const job = this.ownedJob(id)
    if (!job) throw new Error(`unknown job: ${id}`)
    return { id: job.id, status: job.status, result: job.result }
  }

  cancel(id: string) {
    const job = this.ownedJob(id)
    if (!job) throw new Error(`unknown job: ${id}`)
    job.abort.abort()
    job.status = 'cancelled'
    job.finishedAt = Date.now()
    return { id, status: job.status }
  }
}

export const name = 'jobs'
export const inject = ['subprocess', 'tools']

export function apply(ctx: Context) {
  const jobs = new JobsService(ctx)
  ctx.tools.register({
    name: 'job_start',
    description: '后台启动命令，argv 为参数数组',
    parameters: {
      type: 'object',
      properties: { argv: { type: 'array', items: { type: 'string' } } },
      required: ['argv'],
    },
    execute: (args) =>
      jobs.start(
        Array.isArray(args.argv) ? args.argv.map(String) : posixShellArgv(String(args.command ?? 'true')),
      ),
  })
  ctx.tools.register({
    name: 'job_list',
    description: '列出后台任务',
    parameters: { type: 'object', properties: {} },
    execute: () => jobs.list(),
  })
  ctx.tools.register({
    name: 'job_collect',
    description: '读取后台任务结果',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: (args) => jobs.collect(String(args.id)),
  })
  ctx.tools.register({
    name: 'job_cancel',
    description: '取消后台任务',
    parameters: { type: 'object', properties: { id: { type: 'string' } }, required: ['id'] },
    execute: (args) => jobs.cancel(String(args.id)),
  })
}
