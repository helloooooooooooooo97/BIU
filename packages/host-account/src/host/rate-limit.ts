import type { IncomingMessage } from 'node:http'
import { getRuntimePolicy } from '@biu/host-plugin-loader/runtime'

const DEFAULT_WINDOW_MS = 60_000
const DEFAULT_MAX_ATTEMPTS = 20
const PRUNE_THRESHOLD = 2000

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

export class SlidingWindowLimiter {
  private buckets = new Map<string, number[]>()

  constructor(
    private readonly windowMs = DEFAULT_WINDOW_MS,
    private readonly maxAttempts = DEFAULT_MAX_ATTEMPTS,
  ) {}

  check(key: string, now = Date.now(), limit = this.maxAttempts): RateLimitResult {
    if (limit <= 0) return { allowed: true, remaining: Number.POSITIVE_INFINITY, retryAfterSec: 0 }
    const cutoff = now - this.windowMs
    const prev = this.buckets.get(key)
    const active = prev ? prev.filter((ts) => ts > cutoff) : []
    if (active.length >= limit) {
      this.buckets.set(key, active)
      const oldest = active[0] ?? now
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000))
      return { allowed: false, remaining: 0, retryAfterSec }
    }
    active.push(now)
    this.buckets.set(key, active)
    if (this.buckets.size > PRUNE_THRESHOLD) this.prune(cutoff)
    return { allowed: true, remaining: Math.max(0, limit - active.length), retryAfterSec: 0 }
  }

  private prune(cutoff: number) {
    for (const [key, list] of this.buckets) {
      const kept = list.filter((ts) => ts > cutoff)
      if (kept.length === 0) this.buckets.delete(key)
      else this.buckets.set(key, kept)
    }
  }
}

export function clientIp(req: IncomingMessage): string {
  const forwarded = String(req.headers['x-forwarded-for'] ?? '').split(',')[0]?.trim()
  if (forwarded) return forwarded
  return req.socket?.remoteAddress || 'unknown'
}

export function authRateLimitMax(): number {
  const raw = process.env.BIU_AUTH_RATE_LIMIT
  if (raw !== undefined && raw !== '') {
    const parsed = Number(raw)
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : DEFAULT_MAX_ATTEMPTS
  }
  if (process.env.VITEST) return 0
  return getRuntimePolicy().enforceTenantQuotas ? DEFAULT_MAX_ATTEMPTS : 0
}
