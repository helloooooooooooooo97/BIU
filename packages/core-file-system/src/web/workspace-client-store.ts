/**
 * Unified workspace-scoped client cache registry.
 * Registers all module-level frontend caches (`memoryViews`, `listCache`, `previewCache`,
 * `recordViewCatalog`, etc.) so switching workspaces/accounts or isolating tests can atomically
 * wipe every cache in a single call instead of chasing scattered global Maps.
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
      console.warn('[workspace-store] failed to clear cache', name, error)
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

export function subscribeWorkspaceScope(listener: (workspaceId: string) => void): () => void {
  scopeListeners.add(listener)
  return () => {
    scopeListeners.delete(listener)
  }
}
