#!/usr/bin/env node
import { readdirSync, existsSync, unlinkSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const SHADOW_EXTS = ['.js', '.js.map', '.d.ts', '.d.ts.map']
const SOURCE_EXTS = ['.ts', '.tsx']
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', '.git'])

/**
 * Find and optionally delete stale compiled artifacts (.js / .js.map / .d.ts / .d.ts.map)
 * that sit directly alongside a matching .ts or .tsx source file.
 */
export function cleanStaleJsInDir(rootDir, { dryRun = false } = {}) {
  const removed = []
  if (!existsSync(rootDir)) return removed

  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name)) walk(join(dir, entry.name))
        continue
      }
      if (!entry.isFile()) continue
      const matchedExt = SHADOW_EXTS.find((ext) => entry.name.endsWith(ext))
      if (!matchedExt) continue
      const stem = entry.name.slice(0, -matchedExt.length)
      const hasTsSibling = SOURCE_EXTS.some((ext) => existsSync(join(dir, `${stem}${ext}`)))
      if (!hasTsSibling) continue
      const fullPath = join(dir, entry.name)
      if (!dryRun) unlinkSync(fullPath)
      removed.push(fullPath)
    }
  }

  walk(rootDir)
  return removed
}

export function cleanWorkspaceStaleJs(repoRoot, opts) {
  const targets = [resolve(repoRoot, 'packages'), resolve(repoRoot, 'host'), resolve(repoRoot, 'web')]
  return targets.flatMap((dir) => cleanStaleJsInDir(dir, opts))
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)
if (isMain) {
  const dryRun = process.argv.includes('--dry-run')
  const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
  const removed = cleanWorkspaceStaleJs(repoRoot, { dryRun })
  if (removed.length) {
    console.log(`${dryRun ? '[dry-run] Would remove' : 'Removed'} ${removed.length} stale compiled artifact(s) shadowing .ts/.tsx sources.`)
  }
}
