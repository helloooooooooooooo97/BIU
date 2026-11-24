import { writeStorageString } from '@biu/biu-ui/client-storage'
import { apiFetch } from '@biu/biu-ui/api-client'
import { getWorkspaceProfile } from './data-bridge.ts'

export type ThemeMode = 'light' | 'dark'

let current: ThemeMode | null = null
let themeVersion = 0
const themeListeners = new Set<() => void>()

export function subscribeTheme(listener: () => void) {
  themeListeners.add(listener)
  return () => {
    themeListeners.delete(listener)
  }
}

export function getThemeVersion() {
  return themeVersion
}

export function readTheme(): ThemeMode {
  if (current === 'dark' || current === 'light') return current
  if (typeof document !== 'undefined') {
    if (document.documentElement.classList.contains('dark')) return 'dark'
    if (document.documentElement.classList.contains('light')) return 'light'
  }
  return 'light'
}

export function applyTheme(mode: ThemeMode) {
  current = mode
  themeVersion += 1
  if (typeof document !== 'undefined') {
    try {
      writeStorageString('biu.theme.bootstrap', mode, { area: 'session' })
    } catch {
      /* sessionStorage may be unavailable in embedded/webview contexts */
    }
    const root = document.documentElement
    root.classList.toggle('dark', mode === 'dark')
    root.classList.toggle('light', mode === 'light')
    const meta = document.querySelector('meta[name="color-scheme"]')
    if (meta) meta.setAttribute('content', mode)
  }
  for (const listener of themeListeners) listener()
}

export async function persistTheme(mode: ThemeMode) {
  const res = await apiFetch('/api/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ theme: mode }),
  })
  if (!res.ok) throw new Error(`theme persist failed: ${res.status}`)
  applyTheme(mode)
}

export function applyStoredTheme() {
  applyTheme(readTheme())
}

/** 从 workspace profile 读主题，不经过 localStorage。 */
export async function hydrateTheme() {
  try {
    const data = await getWorkspaceProfile()
    if (!data) {
      applyStoredTheme()
      return readTheme()
    }
    if (data.theme !== 'dark' && data.theme !== 'light') {
      applyStoredTheme()
      return readTheme()
    }
    applyTheme(data.theme)
    return data.theme
  } catch {
    applyStoredTheme()
    return readTheme()
  }
}
