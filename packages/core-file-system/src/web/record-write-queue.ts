import type { DbRecord } from '@biu/type-file-system'

/**
 * Per-key FIFO serial async queue with generation tracking and pending counts.
 * Guarantees that rapid mutations to the same record path execute strictly in
 * trigger order, that stale responses can detect newer queued writes via
 * `isLatest(key, gen)`, and that a rejected task never poisons the queue.
 */
export class KeyedSerialQueue {
  private readonly queues = new Map<string, Promise<unknown>>()
  private readonly gens = new Map<string, number>()
  private readonly pending = new Map<string, number>()

  generation(key: string): number {
    return this.gens.get(key) ?? 0
  }

  isLatest(key: string, gen: number): boolean {
    return this.generation(key) === gen
  }

  pendingCount(key: string): number {
    return this.pending.get(key) ?? 0
  }

  hasPending(key: string): boolean {
    return this.pendingCount(key) > 0
  }

  enqueue<T>(key: string, task: (gen: number) => Promise<T>): Promise<T> {
    const gen = this.generation(key) + 1
    this.gens.set(key, gen)
    this.pending.set(key, this.pendingCount(key) + 1)

    const previous = this.queues.get(key) ?? Promise.resolve()
    const run = previous
      .catch(() => undefined)
      .then(() => task(gen))

    const settled = run.finally(() => {
      const remaining = Math.max(0, this.pendingCount(key) - 1)
      if (remaining > 0) this.pending.set(key, remaining)
      else this.pending.delete(key)
      if (this.queues.get(key) === settled) this.queues.delete(key)
    })

    this.queues.set(key, settled)
    return run
  }
}

/**
 * Reference-counted optimistic field patch tracker per record ID.
 * Keeps locally edited fields intact while background reloads arrive,
 * releasing each field only when all in-flight writes to that field settle.
 */
export class PendingFieldPatchTracker {
  private readonly byRecord = new Map<string, Map<string, { value: unknown; count: number }>>()

  track(recordId: string, patch: Record<string, unknown>): () => void {
    const keys = Object.keys(patch)
    if (!recordId || keys.length === 0) return () => {}

    const bag = this.byRecord.get(recordId) ?? new Map<string, { value: unknown; count: number }>()
    for (const key of keys) {
      const prev = bag.get(key)
      bag.set(key, { value: patch[key], count: (prev?.count ?? 0) + 1 })
    }
    this.byRecord.set(recordId, bag)

    let released = false
    return () => {
      if (released) return
      released = true
      const current = this.byRecord.get(recordId)
      if (!current) return
      for (const key of keys) {
        const entry = current.get(key)
        if (!entry) continue
        if (entry.count <= 1) current.delete(key)
        else current.set(key, { ...entry, count: entry.count - 1 })
      }
      if (current.size === 0) this.byRecord.delete(recordId)
    }
  }

  patchFor(recordId: string): Record<string, unknown> | null {
    const bag = this.byRecord.get(recordId)
    if (!bag || bag.size === 0) return null
    const out: Record<string, unknown> = {}
    for (const [key, entry] of bag) out[key] = entry.value
    return out
  }

  overlay<T extends DbRecord>(row: T, merge: (base: T, next: T) => T = (_base, next) => next): T {
    const patch = this.patchFor(row.id)
    if (!patch) return row
    return merge(row, { ...row, ...patch })
  }
}
