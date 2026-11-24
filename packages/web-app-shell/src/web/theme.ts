import { readStorageString, writeStorageString } from '@biu/biu-ui/client-storage'
import { apiFetch } from '@biu/biu-ui/api-client'
import { getWorkspaceProfile } from './data-bridge.ts'

export type ThemeMode = 'light' | 'dark'
export type ThemeAccent = 'blue' | 'purple' | 'green' | 'orange' | 'pink' | 'red'

export const THEME_ACCENTS: ReadonlyArray<{ id: ThemeAccent; label: string; colorVar: string }> = [
  { id: 'blue', label: '海蓝', colorVar: 'var(--biu-color-ink-blue)' },
  { id: 'purple', label: '紫罗兰', colorVar: 'var(--biu-color-ink-purple)' },
  { id: 'green', label: '翠绿', colorVar: 'var(--biu-color-ink-green)' },
  { id: 'orange', label: '琥珀橙', colorVar: 'var(--biu-color-ink-orange)' },
  { id: 'pink', label: '绯粉', colorVar: 'var(--biu-color-ink-pink)' },
  { id: 'red', label: '朱红', colorVar: 'var(--biu-color-ink-red)' },
]

const ACCENT_SET = new Set<ThemeAccent>(THEME_ACCENTS.map((item) => item.id))

let current: ThemeMode | null = null
let currentAccent: ThemeAccent | null = null
let themeVersion = 0
const themeListeners = new Set<() => void>()

function normalizeAccent(value: unknown): ThemeAccent | null {
  return typeof value === 'string' && ACCENT_SET.has(value as ThemeAccent) ? (value as ThemeAccent) : null
}

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

export function readAccent(): ThemeAccent {
  if (currentAccent) return currentAccent
  if (typeof document !== 'undefined') {
    const attr = normalizeAccent(document.documentElement.getAttribute('data-accent'))
    if (attr) return attr
  }
  try {
    const saved = normalizeAccent(readStorageString('biu.theme.accent', 'session'))
    if (saved) return saved
  } catch {
    /* ignore */
  }
  return 'blue'
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

export function applyAccent(accent: ThemeAccent) {
  const next = normalizeAccent(accent) ?? 'blue'
  currentAccent = next
  themeVersion += 1
  if (typeof document !== 'undefined') {
    try {
      writeStorageString('biu.theme.accent', next, { area: 'session' })
    } catch {
      /* ignore */
    }
    document.documentElement.setAttribute('data-accent', next)
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

export async function persistAccent(accent: ThemeAccent) {
  const next = normalizeAccent(accent) ?? 'blue'
  const res = await apiFetch('/api/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ accent: next }),
  })
  if (!res.ok) throw new Error(`accent persist failed: ${res.status}`)
  applyAccent(next)
}

export function applyStoredTheme() {
  applyTheme(readTheme())
  applyAccent(readAccent())
}

/** 从 workspace profile 读主题，不经过 localStorage。 */
export async function hydrateTheme() {
  try {
    const data = await getWorkspaceProfile()
    if (!data) {
      applyStoredTheme()
      return readTheme()
    }
    const accent = normalizeAccent(data.accent)
    if (accent) applyAccent(accent)
    else applyAccent(readAccent())
    if (data.theme !== 'dark' && data.theme !== 'light') {
      applyTheme(readTheme())
      return readTheme()
    }
    applyTheme(data.theme)
    return data.theme
  } catch {
    applyStoredTheme()
    return readTheme()
  }
}
