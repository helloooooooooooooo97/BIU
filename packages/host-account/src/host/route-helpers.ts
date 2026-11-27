import type { RouteContext } from '@biu/types/http'
import { CollabError } from './store.ts'
import type { AccountService } from './index.ts'

export function bearer(route: RouteContext): string {
  const header = String(route.req.headers.authorization ?? '')
  const match = /^Bearer\s+(\S+)$/i.exec(header)
  if (match?.[1]) return match[1]
  const cookie = String(route.req.headers.cookie ?? '')
  const parts = cookie.split(';').map((part) => part.trim())
  const primary = parts.find((part) => part.startsWith('biu_account='))
  if (primary) return decodeURIComponent(primary.slice('biu_account='.length))
  const legacy = parts.find((part) => part.startsWith('biu_legacy_account='))
  return legacy ? decodeURIComponent(legacy.slice('biu_legacy_account='.length)) : ''
}

export function fail(route: RouteContext, error: unknown): void {
  if (error instanceof CollabError) {
    route.send(error.status, { error: error.message })
    return
  }
  route.send(500, { error: String(error instanceof Error ? error.message : error) })
}

export function cacheWorkspaceList(account: AccountService, accountId: string, payload: Record<string, unknown>): void {
  const workspaces = Array.isArray(payload.workspaces) ? payload.workspaces : []
  for (const item of workspaces) {
    if (!item || typeof item !== 'object') continue
    const row = item as { id?: string; name?: string; ownerId?: string; role?: string; createdAt?: number }
    if (!row.id) continue
    account.store.upsertPulledWorkspace({
      accountId,
      id: String(row.id),
      name: String(row.name ?? ''),
      ownerId: row.ownerId,
      role: row.role,
      createdAt: row.createdAt,
    })
    account.markCloudWorkspace(String(row.id))
  }
}
