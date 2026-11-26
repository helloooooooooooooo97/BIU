import { randomBytes } from 'node:crypto'
import { Service, type Context } from 'cordis'
import type {
  RateLimitCheckResult,
  RealtimeBusPort,
  RealtimeMessage,
  WsTicketRecord,
} from '@biu/host-plugin-loader/ports'

const DEFAULT_WS_TICKET_TTL_MS = 30_000
const MAX_WS_TICKET_TTL_MS = 2 * 60_000
const MAX_PENDING_WS_TICKETS = 4096
const RATE_LIMIT_PRUNE_THRESHOLD = 2000

interface EphemeralEntry {
  value: string
  exp: number
}

interface LockEntry {
  owner: string
  exp: number
}

export class MemoryRealtimeDriver extends Service implements RealtimeBusPort {
  readonly driver = 'memory'
  readonly nodeId: string

  private subscribers = new Map<string, Set<(message: RealtimeMessage<unknown>) => void>>()
  private tickets = new Map<string, WsTicketRecord>()
  private rateBuckets = new Map<string, number[]>()
  private ephemeral = new Map<string, EphemeralEntry>()
  private locks = new Map<string, LockEntry>()

  constructor(ctx: Context, config?: { nodeId?: string }) {
    super(ctx, 'realtime')
    this.nodeId = config?.nodeId?.trim() || `node_${randomBytes(6).toString('hex')}`
  }

  publish<T = unknown>(channel: string, payload: T): void {
    const handlers = this.subscribers.get(channel)
    if (!handlers?.size) return
    const message: RealtimeMessage<T> = {
      channel,
      payload,
      originNodeId: this.nodeId,
      ts: Date.now(),
    }
    for (const handler of [...handlers]) {
      try {
        handler(message as RealtimeMessage<unknown>)
      } catch (error) {
        this.ctx.logger('driver-realtime-memory').error(error)
      }
    }
  }

  subscribe<T = unknown>(channel: string, handler: (message: RealtimeMessage<T>) => void): () => void {
    let set = this.subscribers.get(channel)
    if (!set) {
      set = new Set()
      this.subscribers.set(channel, set)
    }
    const wrapped = handler as (message: RealtimeMessage<unknown>) => void
    set.add(wrapped)
    return () => {
      const current = this.subscribers.get(channel)
      if (!current) return
      current.delete(wrapped)
      if (current.size === 0) this.subscribers.delete(channel)
    }
  }

  issueWsTicket(input: {
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
    this.pruneTickets(now)
    const ttl = Math.max(1_000, Math.min(input.ttlMs ?? DEFAULT_WS_TICKET_TTL_MS, MAX_WS_TICKET_TTL_MS))
    const exp = now + ttl
    const ticket = `biu_wst_${randomBytes(24).toString('base64url')}`
    this.tickets.set(ticket, { accountId, workspaceId, sessionToken, exp })
    return { ticket, exp, workspaceId }
  }

  consumeWsTicket(ticket: string, now = Date.now()): WsTicketRecord | null {
    const key = ticket.trim()
    if (!key) return null
    const entry = this.tickets.get(key)
    if (!entry) return null
    this.tickets.delete(key)
    if (entry.exp <= now) return null
    return entry
  }

  checkRateLimit(
    key: string,
    opts: { windowMs: number; maxAttempts: number; now?: number },
  ): RateLimitCheckResult {
    const limit = opts.maxAttempts
    if (limit <= 0) {
      return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSec: 0 }
    }
    const now = opts.now ?? Date.now()
    const cutoff = now - opts.windowMs
    const prev = this.rateBuckets.get(key)
    const active = prev ? prev.filter((ts) => ts > cutoff) : []
    if (active.length >= limit) {
      this.rateBuckets.set(key, active)
      const oldest = active[0] ?? now
      const retryAfterSec = Math.max(1, Math.ceil((oldest + opts.windowMs - now) / 1000))
      return { allowed: false, remaining: 0, retryAfterSec }
    }
    active.push(now)
    this.rateBuckets.set(key, active)
    if (this.rateBuckets.size > RATE_LIMIT_PRUNE_THRESHOLD) {
      this.pruneRateBuckets(cutoff)
    }
    return { allowed: true, remaining: Math.max(0, limit - active.length), retryAfterSec: 0 }
  }

  setEphemeral(key: string, value: string, ttlMs: number): void {
    const exp = Date.now() + Math.max(1, ttlMs)
    this.ephemeral.set(key, { value, exp })
  }

  getEphemeral(key: string): string | null {
    const entry = this.ephemeral.get(key)
    if (!entry) return null
    if (entry.exp <= Date.now()) {
      this.ephemeral.delete(key)
      return null
    }
    return entry.value
  }

  deleteEphemeral(key: string): void {
    this.ephemeral.delete(key)
  }

  acquireLock(key: string, owner: string, ttlMs: number): boolean {
    const now = Date.now()
    const existing = this.locks.get(key)
    if (existing && existing.exp > now && existing.owner !== owner) {
      return false
    }
    this.locks.set(key, { owner, exp: now + Math.max(1, ttlMs) })
    return true
  }

  releaseLock(key: string, owner: string): boolean {
    const existing = this.locks.get(key)
    if (!existing) return false
    if (existing.owner !== owner) return false
    this.locks.delete(key)
    return true
  }

  private pruneTickets(now: number) {
    for (const [key, entry] of this.tickets) {
      if (entry.exp <= now) this.tickets.delete(key)
    }
    while (this.tickets.size >= MAX_PENDING_WS_TICKETS) {
      const oldest = this.tickets.keys().next().value
      if (oldest === undefined) break
      this.tickets.delete(oldest)
    }
  }

  private pruneRateBuckets(cutoff: number) {
    for (const [key, list] of this.rateBuckets) {
      const kept = list.filter((ts) => ts > cutoff)
      if (kept.length === 0) this.rateBuckets.delete(key)
      else this.rateBuckets.set(key, kept)
    }
  }
}

export const name = 'driver-realtime-memory'
export const inject = [] as const

export function apply(ctx: Context, config?: { nodeId?: string }) {
  new MemoryRealtimeDriver(ctx, config)
}
