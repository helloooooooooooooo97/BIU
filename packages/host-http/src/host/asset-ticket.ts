import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

export const DEFAULT_ASSET_TICKET_TTL_MS = 15 * 60 * 1000
const MAX_ASSET_TICKET_TTL_MS = 60 * 60 * 1000

export type AssetTicket = {
  uid: string
  ws: string
  exp: number
  sig: string
}

let fallbackProcessSecret: Buffer | null = null

function signingSecret(): Buffer {
  const configured = String(process.env.BIU_ASSET_SIGN_SECRET ?? '').trim()
  if (configured) return Buffer.from(configured, 'utf8')
  if (!fallbackProcessSecret) fallbackProcessSecret = randomBytes(32)
  return fallbackProcessSecret
}

function computeSignature(uid: string, ws: string, exp: number): string {
  return createHmac('sha256', signingSecret())
    .update(`biu-asset-v1\n${uid}\n${ws}\n${exp}`)
    .digest('base64url')
}

export function signAssetTicket(input: {
  accountId: string
  workspaceId: string
  ttlMs?: number
  now?: number
}): AssetTicket {
  const uid = input.accountId.trim()
  const ws = input.workspaceId.trim()
  if (!uid || !ws) throw new Error('accountId and workspaceId are required to sign asset ticket')
  const now = input.now ?? Date.now()
  const ttl = Math.max(1_000, Math.min(input.ttlMs ?? DEFAULT_ASSET_TICKET_TTL_MS, MAX_ASSET_TICKET_TTL_MS))
  const exp = now + ttl
  const sig = computeSignature(uid, ws, exp)
  return { uid, ws, exp, sig }
}

export function verifyAssetTicket(
  query: URLSearchParams,
  now = Date.now(),
): { accountId: string; workspaceId: string } | null {
  const uid = String(query.get('uid') ?? '').trim()
  const ws = String(query.get('ws') ?? '').trim()
  const expRaw = String(query.get('exp') ?? '').trim()
  const sig = String(query.get('sig') ?? '').trim()
  if (!uid || !ws || !expRaw || !sig) return null
  const exp = Number(expRaw)
  if (!Number.isFinite(exp) || exp <= now) return null
  const expected = computeSignature(uid, ws, exp)
  const a = Buffer.from(sig, 'utf8')
  const b = Buffer.from(expected, 'utf8')
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null
  return { accountId: uid, workspaceId: ws }
}

const AGENT_ARTIFACT_RE = /^\/api\/agents\/[^/]+\/artifacts\/[^/]+$/
const CHANNEL_UPLOAD_RE = /^\/api\/channels\/[^/]+\/uploads\/[^/]+$/

/**
 * Only read-only binary/media download routes accept short-lived HMAC asset tickets.
 * General API routes still require full Bearer / session authentication.
 */
export function isAssetTicketEligiblePath(method: string, pathname: string): boolean {
  if (method.toUpperCase() !== 'GET') return false
  return (
    pathname.startsWith('/api/db/file/') ||
    pathname.startsWith('/api/page/file/') ||
    pathname.startsWith('/api/doc/file/') ||
    AGENT_ARTIFACT_RE.test(pathname) ||
    CHANNEL_UPLOAD_RE.test(pathname)
  )
}
