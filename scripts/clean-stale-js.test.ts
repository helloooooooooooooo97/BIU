import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { cleanStaleJsInDir } from './clean-stale-js.mjs'

test('cleanStaleJsInDir removes .js/.js.map/.d.ts shadowing .ts/.tsx while keeping standalone .js', () => {
  const root = mkdtempSync(join(tmpdir(), 'biu-clean-stale-js-'))
  try {
    const src = join(root, 'src')
    const dist = join(root, 'dist')
    mkdirSync(src, { recursive: true })
    mkdirSync(dist, { recursive: true })

    // Shadowing artifacts alongside .ts / .tsx -> should be removed
    writeFileSync(join(src, 'index.ts'), 'export const a = 1\n')
    writeFileSync(join(src, 'index.js'), 'export const a = 0\n')
    writeFileSync(join(src, 'index.js.map'), '{}\n')
    writeFileSync(join(src, 'index.d.ts'), 'export declare const a: number\n')
    writeFileSync(join(src, 'view.tsx'), 'export const V = () => null\n')
    writeFileSync(join(src, 'view.js'), 'export const V = () => null\n')

    // Standalone .js without .ts/.tsx sibling -> must stay
    writeFileSync(join(src, 'legacy.js'), 'export const b = 2\n')
    // dist/ directory -> must be skipped
    writeFileSync(join(dist, 'index.ts'), '')
    writeFileSync(join(dist, 'index.js'), '')

    const dry = cleanStaleJsInDir(root, { dryRun: true })
    assert.equal(dry.length, 4)
    assert.equal(existsSync(join(src, 'index.js')), true)

    const removed = cleanStaleJsInDir(root)
    assert.equal(removed.length, 4)
    assert.equal(existsSync(join(src, 'index.js')), false)
    assert.equal(existsSync(join(src, 'index.js.map')), false)
    assert.equal(existsSync(join(src, 'index.d.ts')), false)
    assert.equal(existsSync(join(src, 'view.js')), false)
    assert.equal(existsSync(join(src, 'index.ts')), true)
    assert.equal(existsSync(join(src, 'view.tsx')), true)
    assert.equal(existsSync(join(src, 'legacy.js')), true)
    assert.equal(existsSync(join(dist, 'index.js')), true)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
