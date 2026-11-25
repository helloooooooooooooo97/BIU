import type { Context } from 'cordis'
import { currentTenantScope, type TenantScope } from './data-dir.ts'

export interface TenantRevokedEvent {
  accountId: string
  workspaceId?: string
}

export interface WorkspaceDeletedEvent {
  workspaceId: string
}

declare module 'cordis' {
  interface Events {
    'tenant/revoked'(payload: TenantRevokedEvent): void
    'workspace/deleted'(payload: WorkspaceDeletedEvent): void
  }
}

export type TenantScopeGranularity = 'tenant' | 'account'

export interface TenantStateMapOptions<T> {
  /** 'tenant' = (accountId, workspaceId) pair; 'account' = accountId only. */
  granularity?: TenantScopeGranularity
  onDispose?: (value: T, scope: TenantScope) => void
}

interface StoredEntry<T> {
  scope: TenantScope
  value: T
}

/**
 * 统一的租户生命周期状态容器：
 * - 按当前请求/任务租户自动读写，避免各服务手写重复 Map 与 key 拼接；
 * - 监听 `tenant/revoked` / `workspace/deleted`，在吊销或删除时自动触发 `onDispose` 回收内存与子进程。
 */
export class TenantStateMap<T> {
  private entriesMap = new Map<string, StoredEntry<T>>()
  private readonly granularity: TenantScopeGranularity
  private readonly onDispose?: (value: T, scope: TenantScope) => void

  constructor(ctx: Context, options: TenantStateMapOptions<T> = {}) {
    this.granularity = options.granularity ?? 'tenant'
    this.onDispose = options.onDispose

    ctx.effect(() => {
      const offRevoked = ctx.on('tenant/revoked', (payload) => {
        this.disposeMatching((scope) => {
          if (scope.accountId !== payload.accountId) return false
          if (this.granularity === 'account') return !payload.workspaceId
          return !payload.workspaceId || scope.workspaceId === payload.workspaceId
        })
      })
      const offDeleted = ctx.on('workspace/deleted', (payload) => {
        if (this.granularity === 'account') return
        this.disposeMatching((scope) => scope.workspaceId === payload.workspaceId)
      })
      return () => {
        offRevoked()
        offDeleted()
        this.clear()
      }
    }, 'tenant-state-map')
  }

  private resolveKey(scope: TenantScope): string {
    return this.granularity === 'account' ? scope.accountId : scope.key
  }

  get(scope = currentTenantScope()): T | undefined {
    return this.entriesMap.get(this.resolveKey(scope))?.value
  }

  set(value: T, scope = currentTenantScope()): void {
    this.entriesMap.set(this.resolveKey(scope), { scope, value })
  }

  getOrCreate(factory: (scope: TenantScope) => T, scope = currentTenantScope()): T {
    const key = this.resolveKey(scope)
    const hit = this.entriesMap.get(key)
    if (hit) return hit.value
    const value = factory(scope)
    this.entriesMap.set(key, { scope, value })
    return value
  }

  delete(scope = currentTenantScope()): boolean {
    const key = this.resolveKey(scope)
    const hit = this.entriesMap.get(key)
    if (!hit) return false
    this.entriesMap.delete(key)
    this.safeDispose(hit)
    return true
  }

  disposeMatching(predicate: (scope: TenantScope, value: T) => boolean): number {
    let count = 0
    for (const [key, entry] of [...this.entriesMap]) {
      if (!predicate(entry.scope, entry.value)) continue
      this.entriesMap.delete(key)
      this.safeDispose(entry)
      count += 1
    }
    return count
  }

  clear(): void {
    for (const entry of [...this.entriesMap.values()]) {
      this.safeDispose(entry)
    }
    this.entriesMap.clear()
  }

  get size(): number {
    return this.entriesMap.size
  }

  private safeDispose(entry: StoredEntry<T>) {
    try {
      this.onDispose?.(entry.value, entry.scope)
    } catch {
      /* ignore dispose errors during tenant teardown */
    }
  }
}

/** 触发租户吊销事件（用于会话注销、成员被移出空间等场景，联动回收各服务内存状态与子进程）。 */
export function emitTenantRevoked(ctx: Context, payload: TenantRevokedEvent) {
  if (!payload.accountId) return
  ctx.emit('tenant/revoked', payload)
}

/** 触发空间删除事件，联动回收该空间下所有租户内存状态与子进程。 */
export function emitWorkspaceDeleted(ctx: Context, workspaceId: string) {
  if (!workspaceId) return
  ctx.emit('workspace/deleted', { workspaceId })
}
