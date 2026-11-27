import { readStorageString, writeStorageString } from '@biu/biu-ui/client-storage'
import { apiFetch } from '@biu/biu-ui/api-client'
import { KeyedSingleflight, registerWorkspaceCache } from '@biu/biu-ui/cache'
import { PAGE_PREFS_EVENT } from './fsdb-events.ts'

export type PageWidth = 'max' | 'full'
export type BodyScale = 'sm' | 'md' | 'lg'

export type PagePrefs = {
  wide: boolean
  outlineExpand: boolean
  outlinePin: boolean
  navPin: boolean
  bodySize: BodyScale
  bodyGap: BodyScale
}

const KEY = 'fsdb.pagePrefs'
const LEGACY_WIDTH_KEY = 'fsdb.pageWidth'
const SCALES = new Set<BodyScale>(['sm', 'md', 'lg'])

const DEFAULT_PREFS: PagePrefs = {
  wide: false,
  outlineExpand: true,
  outlinePin: false,
  navPin: false,
  bodySize: 'md',
  bodyGap: 'md',
}

/** 局域网和外部分享页的默认版式，不写入访问者自己的配置。 */
export const SHARE_PAGE_PREFS: PagePrefs = {
  wide: true,
  outlineExpand: true,
  outlinePin: true,
  navPin: true,
  bodySize: 'md',
  bodyGap: 'md',
}

function asScale(value: unknown, fallback: BodyScale): BodyScale {
  return typeof value === 'string' && SCALES.has(value as BodyScale) ? (value as BodyScale) : fallback
}

function asBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

export function parsePagePrefs(value: unknown, fallback: PagePrefs = DEFAULT_PREFS): PagePrefs {
  if (!value || typeof value !== 'object') return { ...fallback }
  const rec = value as Partial<PagePrefs>
  return {
    wide: asBool(rec.wide, fallback.wide),
    outlineExpand: asBool(rec.outlineExpand, fallback.outlineExpand),
    outlinePin: asBool(rec.outlinePin, fallback.outlinePin),
    navPin: asBool(rec.navPin, fallback.navPin),
    bodySize: asScale(rec.bodySize, fallback.bodySize),
    bodyGap: asScale(rec.bodyGap, fallback.bodyGap),
  }
}

function readCachedPagePrefs(): PagePrefs {
  try {
    const raw = readStorageString(KEY, { scope: 'workspace' }) ?? readStorageString(KEY)
    if (raw) return parsePagePrefs(JSON.parse(raw) as unknown)
    const legacy = readStorageString(LEGACY_WIDTH_KEY, { scope: 'workspace' }) ?? readStorageString(LEGACY_WIDTH_KEY)
    return { ...DEFAULT_PREFS, wide: legacy === 'full' }
  } catch {
    return { ...DEFAULT_PREFS }
  }
}

function writeCachedPagePrefs(next: PagePrefs) {
  try {
    writeStorageString(KEY, JSON.stringify(next), { scope: 'workspace' })
    writeStorageString(LEGACY_WIDTH_KEY, next.wide ? 'full' : 'max', { scope: 'workspace' })
  } catch {
    /* ignore */
  }
}

const PROFILE_GET_HOLD_MS = 400
const profileSingleflight = new KeyedSingleflight<string, Record<string, unknown> | null>()

/** One in-flight GET /api/profile for theme, page prefs, and the collection browser. */
export async function getWorkspaceProfile(): Promise<Record<string, unknown> | null> {
  return profileSingleflight.run(
    'profile',
    async () => {
      const res = await apiFetch('/api/profile')
      if (!res.ok) return null
      const data = (await res.json()) as unknown
      return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : null
    },
    {
      holdMs: PROFILE_GET_HOLD_MS,
      shouldHold: (body) => body !== null,
    },
  )
}

export function resetWorkspaceProfileGet() {
  profileSingleflight.clear()
}

registerWorkspaceCache('page-width-profile', resetWorkspaceProfileGet)

async function postPagePrefs(next: PagePrefs) {
  if (typeof fetch === 'undefined') return
  const res = await apiFetch('/api/profile', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pagePrefs: next }),
  })
  if (!res.ok) throw new Error(`pagePrefs persist failed: ${res.status}`)
}

let prefs: PagePrefs = typeof localStorage === 'undefined' ? { ...DEFAULT_PREFS } : readCachedPagePrefs()
let pageWidthVersion = 0
let prefsWriteGen = 0
const listeners = new Set<() => void>()

function emit() {
  pageWidthVersion += 1
  applyPagePrefs(prefs)
  for (const fn of listeners) fn()
}

function commit(next: PagePrefs) {
  if (JSON.stringify(next) === JSON.stringify(prefs)) return
  prefs = next
  writeCachedPagePrefs(next)
  applyPagePrefs(next)
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PAGE_PREFS_EVENT))
  emit()
}

export function getPagePrefs() {
  return prefs
}

export function getPageWidth() {
  return prefs.wide ? 'full' : 'max'
}

export function getPageWidthVersion() {
  return pageWidthVersion
}

export function subscribePageWidth(fn: () => void) {
  listeners.add(fn)
  return () => {
    listeners.delete(fn)
  }
}

export function applyPagePrefs(next = prefs) {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.dataset.widePage = next.wide ? '1' : '0'
  root.dataset.outlineExpand = '1'
  root.dataset.outlinePin = next.outlinePin ? '1' : '0'
  root.dataset.navPin = next.navPin ? '1' : '0'
  root.dataset.bodySize = next.bodySize
  root.dataset.bodyGap = next.bodyGap
}

export async function persistPagePrefs(patch: Partial<PagePrefs>) {
  const next = parsePagePrefs({ ...prefs, ...patch }, prefs)
  if (JSON.stringify(next) === JSON.stringify(prefs)) return prefs
  const previous = prefs
  prefsWriteGen += 1
  const gen = prefsWriteGen
  commit(next)
  try {
    await postPagePrefs(next)
  } catch (error) {
    if (gen === prefsWriteGen) commit(previous)
    throw error
  }
  if (gen !== prefsWriteGen) return getPagePrefs()
  return prefs
}

export function persistPageWidth(next: PageWidth) {
  return persistPagePrefs({ wide: next === 'full' })
}

export async function hydratePagePrefs() {
  const gen = prefsWriteGen
  try {
    const data = await getWorkspaceProfile()
    if (gen !== prefsWriteGen) return getPagePrefs()
    if (!data) return getPagePrefs()
    if (data.pagePrefs && typeof data.pagePrefs === 'object') {
      commit(parsePagePrefs(data.pagePrefs, prefs))
      return prefs
    }
    void postPagePrefs(prefs).catch(() => undefined)
    return prefs
  } catch {
    return getPagePrefs()
  }
}

applyPagePrefs()
