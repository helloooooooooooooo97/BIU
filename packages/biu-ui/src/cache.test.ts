import assert from 'node:assert/strict'
import { describe, it } from 'vitest'
import {
  BoundedMap,
  KeyedSingleflight,
  getActiveWorkspaceScope,
  getRegisteredWorkspaceCaches,
  registerWorkspaceCache,
  resetWorkspaceClientCaches,
  setActiveWorkspaceScope,
} from './cache.ts'

describe('@biu/biu-ui/cache primitives', () => {
  it('BoundedMap evicts least-recently-used entries and refreshes recency on get/set', () => {
    const map = new BoundedMap<string, number>(2)
    map.set('a', 1)
    map.set('b', 2)
    assert.equal(map.get('a'), 1) // refreshes 'a', so 'b' is oldest
    map.set('c', 3)
    assert.equal(map.has('b'), false)
    assert.equal(map.get('a'), 1)
    assert.equal(map.get('c'), 3)
    assert.equal(map.size, 2)
  })

  it('KeyedSingleflight coalesces concurrent calls, respects holdMs, and invalidates on clear()', async () => {
    const sf = new KeyedSingleflight<string, number>()
    let calls = 0
    const loader = async () => {
      calls += 1
      await new Promise((r) => setTimeout(r, 15))
      return calls
    }

    // Coalesce concurrent requests
    const [a, b] = await Promise.all([
      sf.run('k', loader, { holdMs: 200 }),
      sf.run('k', loader, { holdMs: 200 }),
    ])
    assert.equal(calls, 1)
    assert.equal(a, 1)
    assert.equal(b, 1)

    // Within hold window, reuses result
    const c = await sf.run('k', loader, { holdMs: 200 })
    assert.equal(calls, 1)
    assert.equal(c, 1)

    // clear() drops hold immediately
    sf.clear()
    const d = await sf.run('k', loader, { holdMs: 200 })
    assert.equal(calls, 2)
    assert.equal(d, 2)

    // fresh + shareInflightWhenFresh bypasses completed hold but still coalesces concurrent fresh calls
    const [e, f] = await Promise.all([
      sf.run('k', loader, { fresh: true, shareInflightWhenFresh: true }),
      sf.run('k', loader, { fresh: true, shareInflightWhenFresh: true }),
    ])
    assert.equal(calls, 3)
    assert.equal(e, 3)
    assert.equal(f, 3)
    assert.equal(sf.size, 0)
  })

  it('KeyedSingleflight does not hold resolved result if clear() ran while request was in flight', async () => {
    const sf = new KeyedSingleflight<string, string>()
    let release!: (val: string) => void
    let calls = 0
    const first = sf.run(
      'race',
      () => {
        calls += 1
        return new Promise<string>((resolve) => {
          release = resolve
        })
      },
      { holdMs: 500 },
    )
    sf.clear()
    release('stale')
    assert.equal(await first, 'stale')
    const second = await sf.run('race', async () => {
      calls += 1
      return 'fresh'
    })
    assert.equal(calls, 2)
    assert.equal(second, 'fresh')
  })

  it('workspace cache registry clears all registered caches on reset and scope change', () => {
    let count = 0
    const off = registerWorkspaceCache('cache-unit-test', () => {
      count += 1
    })
    try {
      assert.ok(getRegisteredWorkspaceCaches().includes('cache-unit-test'))
      resetWorkspaceClientCaches()
      assert.equal(count, 1)
      const prev = getActiveWorkspaceScope()
      const next = prev === 'ws-unit-a' ? 'ws-unit-b' : 'ws-unit-a'
      assert.equal(setActiveWorkspaceScope(next), true)
      assert.equal(count, 2)
      assert.equal(setActiveWorkspaceScope(next), false)
      assert.equal(count, 2)
    } finally {
      off()
    }
  })
})
