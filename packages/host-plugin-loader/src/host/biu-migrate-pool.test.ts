import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import {
  closeAllSharedBiuConnections,
  openAndMigrateBiu,
  sharedBiuPoolStats,
} from './biu-migrate.ts'

test('openAndMigrateBiu shares one pooled connection per file+fk, caches statements, and ref-counts close()', () => {
  closeAllSharedBiuConnections()
  const dir = mkdtempSync(join(tmpdir(), 'biu-pool-'))
  const file = join(dir, 'biu.sqlite')
  try {
    const h1 = openAndMigrateBiu(file)
    const h2 = openAndMigrateBiu(file)
    assert.deepEqual(sharedBiuPoolStats(), { connections: 1, totalRefs: 2 })

    // Shared statement cache returns identical compiled StatementSync
    const s1 = h1.prepare('SELECT 1 AS ok')
    const s2 = h2.prepare('SELECT 1 AS ok')
    assert.equal(s1, s2)
    assert.equal((s1.get() as { ok: number }).ok, 1)

    // Closing h1 decrements refCount without closing h2 (and is idempotent)
    h1.close()
    h1.close()
    assert.deepEqual(sharedBiuPoolStats(), { connections: 1, totalRefs: 1 })
    assert.equal((h2.prepare('SELECT 2 AS ok').get() as { ok: number }).ok, 2)

    // Different foreignKeys mode gets its own pool slot without breaking h2
    const h3 = openAndMigrateBiu(file, { foreignKeys: false })
    assert.deepEqual(sharedBiuPoolStats(), { connections: 2, totalRefs: 2 })
    h3.close()
    assert.deepEqual(sharedBiuPoolStats(), { connections: 1, totalRefs: 1 })

    // Closing last handle releases underlying SQLite connection
    h2.close()
    assert.deepEqual(sharedBiuPoolStats(), { connections: 0, totalRefs: 0 })

    // :memory: databases are never pooled
    const m1 = openAndMigrateBiu(':memory:')
    const m2 = openAndMigrateBiu(':memory:')
    assert.deepEqual(sharedBiuPoolStats(), { connections: 0, totalRefs: 0 })
    m1.close()
    m2.close()
  } finally {
    closeAllSharedBiuConnections()
    rmSync(dir, { recursive: true, force: true })
  }
})
