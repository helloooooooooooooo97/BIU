import { useCallback, useState } from 'react'

const WRITE_MS = 120
let timer: ReturnType<typeof setTimeout> | null = null
const pending = new Map<string, string>()

export const SIDEBAR_PERSIST = {
  collapsed: 'cordis.sidebar.collapsed',
  width: 'cordis.sidebar.width',
  inspectorOpen: 'cordis.inspector.open',
  inspectorWidth: 'cordis.inspector.width',
  viewsOpen: (id: string) => `cordis.sidebar.viewsOpen:${id}`,
} as const

const VIEWS_OPEN_PREFIX = 'cordis.sidebar.viewsOpen:'
const LEGACY_FAV_OPEN = 'fsdb.favOpen'

function storage(): Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> | null {
  try {
    if (typeof localStorage === 'undefined') return null
    return localStorage
  } catch {
    return null
  }
}

/** 侧栏持久化的唯一 localStorage 入口；带写合并与旧 key 迁移。 */
export function getSidebarPersist(key: string): string | null {
  const store = storage()
  if (!store) return null
  const queued = pending.get(key)
  if (queued !== undefined) return queued
  const live = store.getItem(key)
  if (live != null) return live
  if (key.startsWith(VIEWS_OPEN_PREFIX)) {
    const old = store.getItem(`fsdb.viewsOpen:${key.slice(VIEWS_OPEN_PREFIX.length)}`)
    if (old != null) {
      setSidebarPersist(key, old)
      return old
    }
  }
  return null
}

export function setSidebarPersist(key: string, value: string) {
  pending.set(key, value)
  const store = storage()
  if (!store) return
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => {
    timer = null
    for (const [name, next] of pending) {
      try {
        store.setItem(name, next)
      } catch {
        /* ignore quota */
      }
    }
    pending.clear()
  }, WRITE_MS)
}

/** 旧 `fsdb.favOpen`：`'0'` 表示收起。读一次后删掉，交给折叠 store。 */
export function takeLegacyFavCollapsed(): boolean | null {
  const store = storage()
  if (!store) return null
  const old = store.getItem(LEGACY_FAV_OPEN)
  if (old == null) return null
  try {
    store.removeItem(LEGACY_FAV_OPEN)
  } catch {
    /* ignore */
  }
  return old === '0'
}

export function useSidebarPersistedState(key: string, fallback: string) {
  const [value, setValue] = useState(() => getSidebarPersist(key) ?? fallback)
  const set = useCallback(
    (next: string) => {
      setValue(next)
      setSidebarPersist(key, next)
    },
    [key],
  )
  return [value, set] as const
}
