import { create } from 'zustand'
import { persist, createJSONStorage, type StateStorage } from 'zustand/middleware'
import { getSidebarPersist, setSidebarPersist, takeLegacyFavCollapsed } from './sidebar-persist.ts'

const DATA_SECTION_FAV = 'fsdb.section.fav'

export const SIDEBAR_PROJECT_COLLAPSE_KEY = 'cordis.sidebar.projectCollapsed'

export type SidebarCollapseState = {
  collapsed: Record<string, boolean>
  toggle: (key: string) => void
  expand: (key: string) => void
}

/** 兼容旧版扁平 `{ [key]: boolean }` 与 zustand persist 包装格式。 */
export function parseSidebarCollapsePersisted(raw: string | null): string | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && 'state' in (parsed as object)) {
      return raw
    }
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return JSON.stringify({ state: { collapsed: parsed }, version: 0 })
    }
  } catch {
    return null
  }
  return null
}

function mergeFavLegacy(raw: string | null, collapsedFav: boolean | null): string | null {
  if (collapsedFav == null) return raw
  let envelope: { state: { collapsed: Record<string, boolean> }; version: number }
  if (raw) {
    try {
      envelope = JSON.parse(raw) as { state: { collapsed: Record<string, boolean> }; version: number }
    } catch {
      envelope = { state: { collapsed: {} }, version: 0 }
    }
  } else {
    envelope = { state: { collapsed: {} }, version: 0 }
  }
  if (typeof envelope.state?.collapsed !== 'object' || !envelope.state.collapsed) {
    envelope = { state: { collapsed: {} }, version: 0 }
  }
  if (envelope.state.collapsed[DATA_SECTION_FAV] === undefined) {
    envelope.state.collapsed[DATA_SECTION_FAV] = collapsedFav
  }
  return JSON.stringify(envelope)
}

export function createSidebarCollapseStorage(base?: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): StateStorage {
  if (!base) {
    return {
      getItem: (name) => {
        const next = mergeFavLegacy(parseSidebarCollapsePersisted(getSidebarPersist(name)), takeLegacyFavCollapsed())
        if (next && next !== getSidebarPersist(name)) setSidebarPersist(name, next)
        return next
      },
      setItem: (name, value) => setSidebarPersist(name, value),
      removeItem: () => undefined,
    }
  }
  let timer: ReturnType<typeof setTimeout> | null = null
  let pending: { name: string; value: string } | null = null
  return {
    getItem: (name) => parseSidebarCollapsePersisted(base.getItem(name)),
    setItem: (name, value) => {
      pending = { name, value }
      if (timer) clearTimeout(timer)
      timer = setTimeout(() => {
        timer = null
        if (!pending) return
        base.setItem(pending.name, pending.value)
        pending = null
      }, 120)
    },
    removeItem: (name) => {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      pending = null
      base.removeItem(name)
    },
  }
}

export const useSidebarCollapseStore = create<SidebarCollapseState>()(
  persist(
    (set) => ({
      collapsed: {},
      toggle: (key) =>
        set((state) => ({
          collapsed: { ...state.collapsed, [key]: !state.collapsed[key] },
        })),
      expand: (key) =>
        set((state) => {
          if (!state.collapsed[key]) return state
          return { collapsed: { ...state.collapsed, [key]: false } }
        }),
    }),
    {
      name: SIDEBAR_PROJECT_COLLAPSE_KEY,
      storage: createJSONStorage(() => createSidebarCollapseStorage()),
      partialize: (state) => ({ collapsed: state.collapsed }),
    },
  ),
)
