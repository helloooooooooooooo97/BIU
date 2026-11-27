import { onAppEvent } from './app-events.ts'

/**
 * Drop-in bounded LRU Map that prevents long-lived caches from growing without limit.
 * Accessing or updating a key refreshes its recency; inserting past `maxSize` evicts
 * the least-recently-used entry.
 */
export class BoundedMap<K, V> extends Map<K, V> {
  readonly maxSize: number

  constructor(maxSize: number) {
    super()
    this.maxSize = Math.max(1, Math.floor(maxSize))
  }

  override get(key: K): V | undefined {
    if (!super.has(key)) return undefined
    const value = super.get(key)!
    super.delete(key)
    super.set(key, value)
    return value
  }

  override set(key: K, value: V): this {
    if (super.has(key)) {
      super.delete(key)
    } else if (super.size >= this.maxSize) {
      const oldest = super.keys().next().value
      if (oldest !== undefined) super.delete(oldest)
    }
    super.set(key, value)
    return this
  }
}

export interface SingleflightRunOptions<V = unknown> {
  /** Bypass any post-completion hold cache and start a fresh request. */
  fresh?: boolean
  /**
   * Optional brief hold (ms) after resolution to absorb React StrictMode / immediate remount
   * bursts. Defaults to 0 (pure in-flight deduplication).
   */
  holdMs?: number
  /**
   * When true alongside `fresh: true`, still shares an already-in-flight request for the same
   * key (preventing grouped reload fan-out) while bypassing completed held results.
   */
  shareInflightWhenFresh?: boolean
  /** Optional predicate deciding whether a resolved value should be held for `holdMs`. */
  shouldHold?: (value: V) => boolean
}

/**
 * Keyed singleflight (in-flight request coalescing + optional brief post-completion hold)
 * with epoch-based invalidation so writes or workspace switches never reuse stale results.
 */
export class KeyedSingleflight<K, V> {
  private readonly entries = new Map<K, Promise<V>>()
  private readonly active = new Set<Promise<V>>()
  private epoch = 0

  run(key: K, loader: () => Promise<V>, opts?: SingleflightRunOptions<V>): Promise<V> {
    const fresh = Boolean(opts?.fresh)
    const holdMs = Math.max(0, opts?.holdMs ?? 0)
    const shareWhenFresh = Boolean(opts?.shareInflightWhenFresh)

    if (fresh && !shareWhenFresh) {
      return loader()
    }

    const existing = this.entries.get(key)
    if (existing && (!fresh || this.active.has(existing))) {
      return existing
    }

    const startEpoch = this.epoch
    let request: Promise<V>
    request = loader().then(
      (value) => {
        this.active.delete(request)
        const canHold = !fresh && holdMs > 0 && this.epoch === startEpoch && (opts?.shouldHold ? opts.shouldHold(value) : true)
        if (!canHold) {
          if (this.entries.get(key) === request) this.entries.delete(key)
        } else {
          setTimeout(() => {
            if (this.entries.get(key) === request) this.entries.delete(key)
          }, holdMs)
        }
        return value
      },
      (error) => {
        this.active.delete(request)
        if (this.entries.get(key) === request) this.entries.delete(key)
        throw error
      },
    )

    this.active.add(request)
    this.entries.set(key, request)
    return request
  }

  delete(key: K): void {
    const existing = this.entries.get(key)
    if (existing) this.active.delete(existing)
    this.entries.delete(key)
  }

  clear(): void {
    this.epoch += 1
    this.entries.clear()
    this.active.clear()
  }

  get size(): number {
    return this.entries.size
  }
}

/**
 * Unified workspace-scoped client cache registry shared across all frontend packages
 * (`biu-ui`, `core-file-system`, `core-editor`, etc.) so switching workspaces/accounts
 * or isolating tests atomically wipes every registered cache in one call.
 */
const cacheResetters = new Map<string, () => void>()
const scopeListeners = new Set<(workspaceId: string) => void>()
let activeWorkspaceScope = ''

export function registerWorkspaceCache(name: string, clear: () => void): () => void {
  const key = String(name ?? '').trim()
  if (!key) return () => {}
  cacheResetters.set(key, clear)
  return () => {
    if (cacheResetters.get(key) === clear) cacheResetters.delete(key)
  }
}

export function getRegisteredWorkspaceCaches(): string[] {
  return [...cacheResetters.keys()]
}

export function resetWorkspaceClientCaches(): string[] {
  const cleared: string[] = []
  for (const [name, clear] of cacheResetters) {
    try {
      clear()
      cleared.push(name)
    } catch (error) {
      console.warn('[workspace-cache] failed to clear cache', name, error)
    }
  }
  return cleared
}

/**
 * Switch the active workspace scope. When the workspace ID changes, automatically clears
 * all registered workspace-scoped caches to prevent cross-workspace data leakage.
 */
export function setActiveWorkspaceScope(workspaceId: string): boolean {
  const next = String(workspaceId ?? '').trim()
  if (next === activeWorkspaceScope) return false
  activeWorkspaceScope = next
  resetWorkspaceClientCaches()
  for (const listener of scopeListeners) listener(next)
  return true
}

export function getActiveWorkspaceScope(): string {
  return activeWorkspaceScope
}

// Auto-reset all registered workspace caches whenever the active account/workspace token changes.
onAppEvent('biu:account-token', () => {
  resetWorkspaceClientCaches()
})
