/**
 * Unified frontend client storage singleton wrapping `localStorage` and `sessionStorage`.
 * Provides:
 * - safe access under SSR / private browsing / quota exceeded
 * - typed JSON serialization/deserialization
 * - workspace-scoped key tracking so switching workspace or logging out can clear scoped keys atomically
 */
export type StorageArea = 'local' | 'session'
export type StorageScope = 'global' | 'workspace'
export type StorageReadOptions = StorageArea | { area?: StorageArea; scope?: StorageScope }

const scopedKeys = new Map<string, StorageArea>()

function getStorage(area: StorageArea): Storage | null {
  try {
    if (typeof window === 'undefined') return null
    return area === 'session' ? window.sessionStorage : window.localStorage
  } catch {
    return null
  }
}

/**
 * Returns the active workspace ID from sessionStorage (per-tab) or localStorage.
 * Returns empty string when no workspace is selected (e.g. login page or unit tests).
 */
export function currentStorageWorkspaceId(): string {
  try {
    if (typeof window === 'undefined') return ''
    const sessionWs = window.sessionStorage?.getItem('biu.workspaceId')?.trim()
    if (sessionWs) return sessionWs
    return window.localStorage?.getItem('biu.workspaceId')?.trim() ?? ''
  } catch {
    return ''
  }
}

/**
 * Namespaces a logical storage key by the active workspace ID so switching between
 * local and cloud workspaces (or multiple cloud workspaces) never leaks cached state.
 */
function workspaceScopedKey(key: string): string {
  const ws = currentStorageWorkspaceId()
  return ws ? `${key}::ws:${ws}` : key
}

function normalizeReadOpts(areaOrOpts?: StorageReadOptions): { area: StorageArea; scope: StorageScope } {
  if (!areaOrOpts) return { area: 'local', scope: 'global' }
  if (typeof areaOrOpts === 'string') return { area: areaOrOpts, scope: 'global' }
  return { area: areaOrOpts.area ?? 'local', scope: areaOrOpts.scope ?? 'global' }
}

export function readStorageString(key: string, areaOrOpts: StorageReadOptions = 'local'): string | null {
  const { area, scope } = normalizeReadOpts(areaOrOpts)
  const storage = getStorage(area)
  if (!storage) return null
  const physicalKey = scope === 'workspace' ? workspaceScopedKey(key) : key
  try {
    return storage.getItem(physicalKey)
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
  const scope = opts?.scope ?? 'global'
  const storage = getStorage(area)
  if (!storage) return false
  const physicalKey = scope === 'workspace' ? workspaceScopedKey(key) : key
  try {
    storage.setItem(physicalKey, value)
    if (scope === 'workspace') scopedKeys.set(physicalKey, area)
    return true
  } catch {
    return false
  }
}

export function removeStorageKey(key: string, areaOrOpts: StorageReadOptions = 'local'): boolean {
  const { area, scope } = normalizeReadOpts(areaOrOpts)
  const storage = getStorage(area)
  if (!storage) return false
  const physicalKey = scope === 'workspace' ? workspaceScopedKey(key) : key
  try {
    storage.removeItem(physicalKey)
    scopedKeys.delete(physicalKey)
    return true
  } catch {
    return false
  }
}

export function readStorageJson<T>(
  key: string,
  fallback: T,
  areaOrOpts: StorageReadOptions = 'local',
): T {
  const raw = readStorageString(key, areaOrOpts)
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
