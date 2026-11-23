/**
 * Drop-in bounded LRU Map that prevents long-lived module-level caches from growing without limit.
 * Accessing a key refreshes its recency; inserting past `maxSize` evicts the least-recently-used entry.
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
