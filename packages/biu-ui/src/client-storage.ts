/**
 * Unified frontend client storage singleton wrapping `localStorage` and `sessionStorage`.
 * Provides:
 * - safe access under SSR / private browsing / quota exceeded
 * - typed JSON serialization/deserialization
 * - workspace-scoped key tracking so switching workspace or logging out can clear scoped keys atomically
 */
export type StorageArea = 'local' | 'session'
export type StorageScope = 'global' | 'workspace'

const scopedKeys = new Map<string, StorageArea>()

function getStorage(area: StorageArea): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return area === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

export function readStorageString(key: string, area: StorageArea = 'local'): string | null {
  const storage = getStorage(area)
  if (!storage) return null
  try {
    return storage.getItem(key)
  } catch {
    return null
  }
}

export function writeStorageString(
  key: string,
  value: string,
  opts?: { area?: StorageArea; scope?: StorageScope },
): boolean {
  const area = opts?.area ?? 'local'
  const storage = getStorage(area)
  if (!storage) return false
  try {
    storage.setItem(key, value)
    if (opts?.scope === 'workspace') scopedKeys.set(key, area)
    return true
  } catch {
    return false
  }
}

export function removeStorageKey(key: string, area: StorageArea = 'local'): boolean {
  const storage = getStorage(area)
  if (!storage) return false
  try {
    storage.removeItem(key)
    scopedKeys.delete(key)
    return true
  } catch {
    return false
  }
}

export function readStorageJson<T>(
  key: string,
  fallback: T,
  area: StorageArea = 'local',
): T {
  const raw = readStorageString(key, area)
  if (raw == null || raw === '') return fallback
  try {
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export function writeStorageJson(
  key: string,
  value: unknown,
  opts?: { area?: StorageArea; scope?: StorageScope },
): boolean {
  try {
    return writeStorageString(key, JSON.stringify(value), opts)
  } catch {
    return false
  }
}

/**
 * Clear all keys registered with `scope: 'workspace'`.
 */
export function clearScopedStorage(): string[] {
  const cleared: string[] = []
  for (const [key, area] of [...scopedKeys.entries()]) {
    removeStorageKey(key, area)
    cleared.push(key)
  }
  return cleared
}

export function getTrackedScopedStorageKeys(): string[] {
  return [...scopedKeys.keys()]
}
