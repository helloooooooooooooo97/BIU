import { randomBytes } from 'node:crypto'

export const DEFAULT_WS_TICKET_TTL_MS = 30_000
const MAX_WS_TICKET_TTL_MS = 2 * 60_000
const MAX_PENDING_WS_TICKETS = 4096

export type WsTicketEntry = {
  accountId: string
  workspaceId: string
  sessionToken: string
  exp: number
}

const pendingTickets = new Map<string, WsTicketEntry>()

function pruneExpired(now: number) {
  for (const [key, entry] of pendingTickets) {
    if (entry.exp <= now) pendingTickets.delete(key)
  }
  while (pendingTickets.size >= MAX_PENDING_WS_TICKETS) {
    const oldest = pendingTickets.keys().next().value
    if (oldest === undefined) break
    pendingTickets.delete(oldest)
  }
}

/**
 * Issue a short-lived, single-use opaque WebSocket handshake ticket.
 * Keeps long-lived Bearer session tokens out of WebSocket URL query strings and proxy logs.
 */
export function issueWsTicket(input: {
  accountId: string
  workspaceId: string
  sessionToken: string
  ttlMs?: number
  now?: number
}): { ticket: string; exp: number; workspaceId: string } {
  const accountId = input.accountId.trim()
  const workspaceId = input.workspaceId.trim()
  const sessionToken = input.sessionToken.trim()
  if (!accountId || !workspaceId) {
    throw new Error('accountId and workspaceId are required to issue ws ticket')
  }
  const now = input.now ?? Date.now()
  pruneExpired(now)
  const ttl = Math.max(1_000, Math.min(input.ttlMs ?? DEFAULT_WS_TICKET_TTL_MS, MAX_WS_TICKET_TTL_MS))
  const exp = now + ttl
  const ticket = `biu_wst_${randomBytes(24).toString('base64url')}`
  pendingTickets.set(ticket, { accountId, workspaceId, sessionToken, exp })
  return { ticket, exp, workspaceId }
}

/**
 * Atomically consume a single-use WebSocket ticket.
 * Any replay attempt returns `null`, even before expiration.
 */
export function consumeWsTicket(ticket: string, now = Date.now()): WsTicketEntry | null {
  const key = ticket.trim()
  if (!key) return null
  const entry = pendingTickets.get(key)
  if (!entry) return null
  pendingTickets.delete(key)
  if (entry.exp <= now) return null
  return entry
}

export function clearWsTicketsForTest() {
  pendingTickets.clear()
}

/**
 * Resolve CORS `Access-Control-Allow-Origin` header against `BIU_CORS_ORIGINS`.
 * - Unset/empty: defaults to `*` for zero-config local/LAN dev compatibility.
 * - Configured (comma-separated origins, e.g. `https://app.biu.dev,http://localhost:5174`):
 *   allows only exact matching origins (or `*` if explicitly listed); returns `null` for disallowed origins.
 */
export function resolveCorsOrigin(
  requestOrigin: string | undefined,
  configured = process.env.BIU_CORS_ORIGINS,
): { allowOrigin: string | null; varyOrigin: boolean } {
  const raw = String(configured ?? '').trim()
  if (!raw) return { allowOrigin: '*', varyOrigin: false }
  const allowed = raw
    .split(',')
    .map((item) => item.trim().replace(/\/+$/, ''))
    .filter(Boolean)
  if (!allowed.length) return { allowOrigin: '*', varyOrigin: false }
  if (allowed.includes('*')) return { allowOrigin: '*', varyOrigin: false }
  const reqOrigin = String(requestOrigin ?? '').trim().replace(/\/+$/, '')
  if (!reqOrigin) return { allowOrigin: null, varyOrigin: true }
  if (allowed.includes(reqOrigin)) return { allowOrigin: reqOrigin, varyOrigin: true }
  return { allowOrigin: null, varyOrigin: true }
}
