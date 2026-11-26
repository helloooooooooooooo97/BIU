import { randomBytes } from 'node:crypto'
import { Service, type Context } from 'cordis'
import type {
  DispatchedTask,
  TaskDispatchPort,
  TaskLease,
  TaskWorkerHandler,
} from '@biu/host-plugin-loader/ports'

export class LocalTaskDispatchDriver extends Service implements TaskDispatchPort {
  readonly driver = 'local-in-process'
  private workers = new Map<string, TaskWorkerHandler>()
  private activeTasks = new Set<string>()
  private cancelledTasks = new Set<string>()
  private leases = new Map<string, TaskLease>()

  constructor(ctx: Context) {
    super(ctx, 'taskDispatch')
  }

  registerWorker(kind: string, handler: TaskWorkerHandler): () => void {
    this.workers.set(kind, handler)
    return () => {
      if (this.workers.get(kind) === handler) {
        this.workers.delete(kind)
      }
    }
  }

  async dispatch(
    input: Omit<DispatchedTask, 'id' | 'createdAt'> & { id?: string },
  ): Promise<{ taskId: string; accepted: boolean }> {
    const taskId = input.id?.trim() || `task_${randomBytes(8).toString('hex')}`
    const handler = this.workers.get(input.kind)
    if (!handler) {
      return { taskId, accepted: false }
    }
    const task: DispatchedTask = {
      id: taskId,
      kind: input.kind,
      workspaceId: input.workspaceId,
      accountId: input.accountId,
      sessionId: input.sessionId,
      payload: input.payload,
      createdAt: Date.now(),
    }
    this.activeTasks.add(taskId)
    queueMicrotask(async () => {
      try {
        if (this.cancelledTasks.has(taskId)) return
        await handler(task)
      } catch (error) {
        this.ctx.logger('driver-exec-local').error(error)
      } finally {
        this.activeTasks.delete(taskId)
        this.cancelledTasks.delete(taskId)
      }
    })
    return { taskId, accepted: true }
  }

  async cancel(taskId: string): Promise<boolean> {
    if (!this.activeTasks.has(taskId)) return false
    this.cancelledTasks.add(taskId)
    return true
  }

  async acquireLease(sessionId: string, ownerId: string, ttlMs: number): Promise<TaskLease | null> {
    const now = Date.now()
    const existing = this.leases.get(sessionId)
    if (existing && existing.expiresAt > now && existing.ownerId !== ownerId) {
      return null
    }
    const lease: TaskLease = {
      sessionId,
      ownerId,
      expiresAt: now + Math.max(1_000, ttlMs),
    }
    this.leases.set(sessionId, lease)
    return lease
  }

  async renewLease(sessionId: string, ownerId: string, ttlMs: number): Promise<boolean> {
    const existing = this.leases.get(sessionId)
    if (!existing || existing.ownerId !== ownerId) return false
    existing.expiresAt = Date.now() + Math.max(1_000, ttlMs)
    return true
  }

  async releaseLease(sessionId: string, ownerId: string): Promise<boolean> {
    const existing = this.leases.get(sessionId)
    if (!existing || existing.ownerId !== ownerId) return false
    this.leases.delete(sessionId)
    return true
  }
}

export const name = 'driver-exec-local'
export const inject = [] as const

export function apply(ctx: Context) {
  new LocalTaskDispatchDriver(ctx)
}
