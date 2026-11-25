import assert from 'node:assert/strict'
import { test } from 'vitest'
import { SlidingWindowLimiter } from './rate-limit.ts'

test('SlidingWindowLimiter blocks bursts and recovers after window expires', () => {
  const limiter = new SlidingWindowLimiter(10_000, 3)
  assert.equal(limiter.check('login:1.2.3.4', 1000).allowed, true)
  assert.equal(limiter.check('login:1.2.3.4', 2000).allowed, true)
  assert.equal(limiter.check('login:1.2.3.4', 3000).allowed, true)

  const blocked = limiter.check('login:1.2.3.4', 4000)
  assert.equal(blocked.allowed, false)
  assert.equal(blocked.remaining, 0)
  assert.equal(blocked.retryAfterSec, 7)

  // Different IP is unaffected
  assert.equal(limiter.check('login:5.6.7.8', 4000).allowed, true)

  // After oldest attempt (1000) expires at >11000, slot opens again
  const recovered = limiter.check('login:1.2.3.4', 11_001)
  assert.equal(recovered.allowed, true)
})
