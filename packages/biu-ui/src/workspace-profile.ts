import { readStorageString } from './client-storage.ts'
import { apiFetch } from './api-client.ts'
import { KeyedSingleflight, registerWorkspaceCache } from './cache.ts'
export type WorkspaceProfile = {
  name: string
  avatar: string
  accountId?: string
  email?: string
  fallbackName?: string
  hydrated?: boolean
}

const EVENT = 'biu:workspace-profile'
const EMPTY: WorkspaceProfile = { name: '', avatar: '', accountId: '', email: '', fallbackName: '', hydrated: false }
let cached: WorkspaceProfile = EMPTY

function sameProfile(a: WorkspaceProfile, b: WorkspaceProfile) {
  return (
    a.name === b.name &&
    a.avatar === b.avatar &&
    (a.accountId ?? '') === (b.accountId ?? '') &&
    (a.email ?? '') === (b.email ?? '') &&
    (a.fallbackName ?? '') === (b.fallbackName ?? '') &&
    Boolean(a.hydrated) === Boolean(b.hydrated)
  )
}

function parse(raw: unknown, hydrated = false): WorkspaceProfile {
  const rec = raw && typeof raw === 'object' ? (raw as Partial<WorkspaceProfile>) : {}
  return {
    name: String(rec.name ?? '').trim().slice(0, 40),
    avatar: String(rec.avatar ?? '').trim(),
    accountId: String(rec.accountId ?? '').trim(),
    email: String(rec.email ?? '').trim(),
    fallbackName: String(rec.fallbackName ?? '').trim().slice(0, 40),
    hydrated,
  }
}

function remember(next: WorkspaceProfile) {
  if (sameProfile(cached, next)) return cached
  cached = next
  return cached
}

export function readWorkspaceProfile(): WorkspaceProfile {
  return cached
}

export function writeWorkspaceProfile(next: WorkspaceProfile) {
  const saved = remember({
    name: next.name.trim().slice(0, 40),
    avatar: next.avatar.trim(),
    accountId: next.accountId !== undefined ? next.accountId.trim() : (cached.accountId ?? ''),
    email: next.email !== undefined ? next.email.trim() : (cached.email ?? ''),
    fallbackName: next.fallbackName !== undefined ? next.fallbackName.trim().slice(0, 40) : (cached.fallbackName ?? ''),
    hydrated: next.hydrated !== undefined ? next.hydrated : cached.hydrated,
  })
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(EVENT))
  return saved
}

export function subscribeWorkspaceProfile(onStore: () => void) {
  if (typeof window === 'undefined') return () => {}
  const onChange = () => onStore()
  window.addEventListener(EVENT, onChange)
  return () => {
    window.removeEventListener(EVENT, onChange)
  }
}

export function profileDisplayName(profile = readWorkspaceProfile()) {
  return profile.name.trim() || profile.fallbackName?.trim() || '用户'
}

function accountToken() {
  if (typeof localStorage === 'undefined') return ''
  return readStorageString('biu.account.token') ?? ''
}

const PROFILE_GET_HOLD_MS = 400
const profileSingleflight = new KeyedSingleflight<string, WorkspaceProfile>()
let profileGen = 0

export function resetWorkspaceProfileHydrate() {
  profileGen += 1
  profileSingleflight.clear()
}

registerWorkspaceCache('workspace-profile', () => {
  resetWorkspaceProfileHydrate()
})

export async function hydrateWorkspaceProfile() {
  const token = accountToken()
  if (!token) return writeWorkspaceProfile(EMPTY)
  return profileSingleflight.run(
    token,
    async () => {
      const startGen = profileGen
      try {
        const res = await apiFetch('/api/account/workspace-profile', {
          headers: { authorization: `Bearer ${token}` },
        })
        if (!res.ok || profileGen !== startGen) return readWorkspaceProfile()
        const data = (await res.json()) as Partial<WorkspaceProfile>
        if (profileGen !== startGen) return readWorkspaceProfile()
        const next = parse(data, true)
        const current = readWorkspaceProfile()
        if (sameProfile(current, next)) return current
        return writeWorkspaceProfile(next)
      } catch {
        return readWorkspaceProfile()
      }
    },
    { holdMs: PROFILE_GET_HOLD_MS },
  )
}

export async function persistWorkspaceProfile(next: WorkspaceProfile) {
  const saved = writeWorkspaceProfile(next)
  const token = accountToken()
  if (!token) return saved
  try {
    await apiFetch('/api/account/workspace-profile', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(saved),
    })
  } catch {
    /* memory copy is enough for this session */
  }
  return saved
}
