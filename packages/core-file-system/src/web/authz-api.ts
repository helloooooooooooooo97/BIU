import { useEffect, useState } from 'react'
import { apiFetch } from '@biu/biu-ui/api-client'
import { onAppEvents } from '@biu/biu-ui/app-events'
import type { AccessExplanation } from '../access-explanation.ts'
import { readJson } from './db-client.ts'
import { registerWorkspaceCache } from './workspace-client-store.ts'

export type ViewerIdentity = {
  accountId: string
  name: string
  avatar: string
  isAdmin: boolean
  hostOnline: boolean
}

const EMPTY_VIEWER: ViewerIdentity = {
  accountId: '',
  name: '',
  avatar: '',
  isAdmin: false,
  hostOnline: false,
}

let cachedViewerIdentity: ViewerIdentity | null = null
let viewerIdentityPromise: Promise<ViewerIdentity> | null = null
let viewerIdentityGen = 0

export function invalidateViewerIdentityCache() {
  viewerIdentityGen += 1
  cachedViewerIdentity = null
  viewerIdentityPromise = null
}

registerWorkspaceCache('authz-viewer-identity', invalidateViewerIdentityCache)

export async function loadViewerIdentity(opts: { fresh?: boolean } = {}): Promise<ViewerIdentity> {
  if (!opts.fresh && cachedViewerIdentity) return cachedViewerIdentity
  if (!opts.fresh && viewerIdentityPromise) return viewerIdentityPromise
  const gen = viewerIdentityGen
  const req = Promise.all([
    apiFetch('/api/account/me').then((res) => (res.ok ? res.json() : null)).catch(() => null),
    apiFetch('/api/account/workspace-profile').then((res) => (res.ok ? res.json() : null)).catch(() => null),
  ])
    .then(([me, wp]) => {
      const meObj = me as {
        id?: string
        name?: string
        avatar?: string
        online?: boolean
        account?: { id?: string } | null
        workspace?: { role?: string } | null
      } | null
      const wpObj = wp as {
        accountId?: string
        name?: string
        fallbackName?: string
        avatar?: string
      } | null
      const role = String(meObj?.workspace?.role ?? '')
      const next: ViewerIdentity = {
        accountId: String(wpObj?.accountId ?? meObj?.id ?? meObj?.account?.id ?? '').trim(),
        name: String(wpObj?.name || wpObj?.fallbackName || meObj?.name || '').trim(),
        avatar: wpObj ? String(wpObj.avatar ?? '').trim() : String(meObj?.avatar ?? '').trim(),
        isAdmin: role === 'owner' || role === 'admin',
        hostOnline: meObj?.online === true,
      }
      if (viewerIdentityGen === gen) cachedViewerIdentity = next
      return next
    })
    .catch(() => EMPTY_VIEWER)
    .finally(() => {
      if (viewerIdentityPromise === req) viewerIdentityPromise = null
    })
  viewerIdentityPromise = req
  return req
}

export function useViewerIdentity(enabled = true): ViewerIdentity {
  const [identity, setIdentity] = useState<ViewerIdentity>(() => cachedViewerIdentity ?? EMPTY_VIEWER)

  useEffect(() => {
    if (!enabled) return
    let alive = true
    const sync = (fresh = false) => {
      void loadViewerIdentity({ fresh }).then((next) => {
        if (alive) setIdentity(next)
      })
    }
    sync(false)
    const off = onAppEvents(['biu:account-token', 'biu:workspace-profile'], () => {
      invalidateViewerIdentityCache()
      sync(true)
    })
    return () => {
      alive = false
      off()
    }
  }, [enabled])

  return identity
}

export type MemberViewSummary = {
  id: string
  name: string
  isLocked: boolean
  memberCount: number
  grantCount?: number
}

export function fetchRecordShare<T>(collection: string, recordId: string, opts?: { fresh?: boolean }): Promise<T> {
  const params = new URLSearchParams({ kind: 'record', collection, recordId })
  return readJson<T>(`/api/db/shares?${params.toString()}`, undefined, opts)
}

export function saveRecordShare<T>(payload: {
  collection: string
  recordId: string
  password?: string | null
  enabled?: boolean
  sharePlugins?: boolean
  allowCopy?: boolean
}): Promise<T> {
  return readJson<T>('/api/db/shares', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'record', ...payload }),
  })
}

export function fetchRecordAccess<T>(collection: string, recordId: string): Promise<T> {
  const params = new URLSearchParams({ collection, recordId })
  return readJson<T>(`/api/account/access?${params.toString()}`)
}

export function grantRecordAccess(payload: {
  collection: string
  recordId: string
  role: string
  collaboratorKind?: 'internal' | 'external'
  email?: string
  memberViewId?: string
}) {
  return readJson('/api/account/access', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function patchRecordAccess(payload: {
  collection: string
  recordId: string
  accessMode?: 'private' | 'members'
  memberDefaultRole?: 'viewer' | 'editor'
  inheritanceMode?: 'inherit' | 'custom'
}) {
  return readJson('/api/account/access', {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function revokeRecordAccess(payload: {
  collection: string
  recordId: string
  subjectType: 'account' | 'member_view'
  subjectId: string
}) {
  return readJson('/api/account/access', {
    method: 'DELETE',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function createGuestInvite(payload: {
  collection: string
  recordId: string
  role: 'viewer' | 'editor'
  expiresInHours: number
}) {
  return readJson<{ path: string; url?: string }>('/api/account/access/guest-invite', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function fetchAccessExplanation(params: {
  collection: string
  recordId: string
  tableLabel?: string
  roleHint?: string
}): Promise<AccessExplanation> {
  const search = new URLSearchParams({
    collection: params.collection,
    recordId: params.recordId,
    ...(params.tableLabel ? { tableLabel: params.tableLabel } : {}),
    ...(params.roleHint ? { role: params.roleHint } : {}),
  })
  return readJson<AccessExplanation>(`/api/db/access-explain?${search.toString()}`, undefined, { fresh: true })
}

export function fetchMemberViews(): Promise<{ views?: MemberViewSummary[] }> {
  return readJson<{ views?: MemberViewSummary[] }>('/api/db/member-views')
}

export function resolveMemberView<T = { id: string; name?: string; email?: string; avatar?: string }>(
  viewId: string,
): Promise<{ members?: T[] }> {
  return readJson<{ members?: T[] }>(`/api/db/member-views/${encodeURIComponent(viewId)}/resolve`)
}

export async function releaseMemberView(viewId: string, action: 'unlock' | 'delete', mode: string): Promise<boolean> {
  const res = await apiFetch(`/api/db/member-views/${encodeURIComponent(viewId)}/release`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ action, mode }),
  })
  return res.ok
}

export function previewBatchPermissions(payloadJson: string): Promise<{
  totalCount?: number
  manageableCount?: number
  skippedCount?: number
}> {
  return readJson('/api/db/batch-permissions/preview', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: payloadJson,
  })
}

export function applyBatchPermissions(payload: Record<string, unknown>): Promise<{
  error?: string
  updatedCount?: number
  skippedCount?: number
}> {
  return readJson('/api/db/batch-permissions/apply', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(payload),
  })
}
