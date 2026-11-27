import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'vitest'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const PACKAGES_DIR = join(REPO_ROOT, 'packages')

function walkSourceFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      walkSourceFiles(join(dir, entry.name), out)
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.includes('.test.') &&
      !entry.name.includes('.spec.') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(join(dir, entry.name))
    }
  }
  return out
}

function packageHasBiuUiDep(pkgDir: string): boolean {
  if (pkgDir === 'biu-ui') return true
  const pkgJson = join(PACKAGES_DIR, pkgDir, 'package.json')
  if (!existsSync(pkgJson)) return false
  const meta = JSON.parse(readFileSync(pkgJson, 'utf8')) as {
    dependencies?: Record<string, string>
    peerDependencies?: Record<string, string>
  }
  return Boolean(meta.dependencies?.['@biu/biu-ui'] || meta.peerDependencies?.['@biu/biu-ui'])
}

/**
 * Pure-function / non-workspace-data / WeakMap / delegated-reset web files explicitly allowed
 * to hold module-level memoization without calling `registerWorkspaceCache` directly.
 */
const WEB_CACHE_REGISTER_ALLOWLIST = new Set([
  // Unified registry implementation itself
  'packages/biu-ui/src/cache.ts',
  // Pure text -> sanitized HTML memo (content-addressed, workspace-independent)
  'packages/core-chat/src/web/markdown-render.ts',
  // Ephemeral UI scroll position keyed by sessionId
  'packages/core-chat/src/web/thread-reveal.ts',
  // WeakMap keyed by ProseMirror node instances (GC'd with editor)
  'packages/core-editor/src/web/block-id.ts',
  'packages/core-editor/src/web/markdown-locus.ts',
  // Pure source string -> compiled React component memo (content-addressed)
  'packages/core-file-system/src/web/column-sandbox-view.tsx',
  // Cleared atomically via view-storage.ts -> registerWorkspaceCache('view-storage', () => clearCrumbCache())
  'packages/core-file-system/src/web/crumb-cache.ts',
  // WeakMap render props memo (GC'd with panel objects)
  'packages/web-app-shell/src/web/inspector-panels.ts',
  // Public marketing site GitHub star count cache (workspace-independent)
  'packages/web-app-shell/src/web/marketing-site/github.ts',
])

const WEB_UNBOUNDED_MAP_ALLOWLIST = new Set([
  // Transient in-flight seed deduplication (deleted in finally)
  'packages/core-editor/src/web/sandbox/page-file.ts::seedInflight',
  // Keyed strictly by registered collection paths (small fixed set) and cleared on workspace switch
  'packages/core-file-system/src/web/view-storage.ts::serverViews',
  // Keyed strictly by active inspector pane IDs and cleared on workspace switch
  'packages/core-file-system/src/web/inspector-db-route.ts::workingViews',
])

test('cache hygiene: no hand-rolled HOLD_MS + setTimeout caches outside @biu/biu-ui/cache', () => {
  const violations: string[] = []
  for (const dir of readdirSync(PACKAGES_DIR)) {
    for (const file of walkSourceFiles(join(PACKAGES_DIR, dir, 'src'))) {
      const rel = relative(REPO_ROOT, file)
      if (rel === 'packages/biu-ui/src/cache.ts') continue
      const src = readFileSync(file, 'utf8')
      if (/setTimeout\s*\([\s\S]{0,220}?HOLD_MS\b/.test(src)) {
        violations.push(rel)
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Found hand-rolled HOLD_MS setTimeout caches (use KeyedSingleflight from @biu/biu-ui/cache):\n${violations.join('\n')}`,
  )
})

test('cache hygiene: no hand-rolled LRU Map eviction (.keys().next().value) when @biu/biu-ui is available', () => {
  const violations: string[] = []
  for (const dir of readdirSync(PACKAGES_DIR)) {
    if (!packageHasBiuUiDep(dir)) continue
    for (const file of walkSourceFiles(join(PACKAGES_DIR, dir, 'src'))) {
      const rel = relative(REPO_ROOT, file)
      if (rel === 'packages/biu-ui/src/cache.ts') continue
      const src = readFileSync(file, 'utf8')
      if (/\.keys\(\)\.next\(\)\.value/.test(src)) {
        violations.push(rel)
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Found hand-rolled LRU Map eviction (use BoundedMap from @biu/biu-ui/cache):\n${violations.join('\n')}`,
  )
})

test('cache hygiene: no hand-rolled SQLite prepared statement Proxy outside sqlite-pool.ts', () => {
  const violations: string[] = []
  for (const dir of readdirSync(PACKAGES_DIR)) {
    for (const file of walkSourceFiles(join(PACKAGES_DIR, dir, 'src', 'host'))) {
      const rel = relative(REPO_ROOT, file)
      if (rel === 'packages/host-plugin-loader/src/host/sqlite-pool.ts') continue
      const src = readFileSync(file, 'utf8')
      if (/prop\s*===\s*['"]prepare['"]/.test(src)) {
        violations.push(rel)
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Found hand-rolled SQLite prepare Proxy (use wrapPreparedStmtCache from @biu/host-plugin-loader/data-dir):\n${violations.join('\n')}`,
  )
})

test('cache hygiene: all frontend module-level caches must register with registerWorkspaceCache', () => {
  const violations: string[] = []
  for (const dir of readdirSync(PACKAGES_DIR)) {
    const roots = dir === 'biu-ui' ? [join(PACKAGES_DIR, dir, 'src')] : [join(PACKAGES_DIR, dir, 'src', 'web')]
    for (const rootDir of roots) {
      for (const file of walkSourceFiles(rootDir)) {
        const rel = relative(REPO_ROOT, file)
        if (WEB_CACHE_REGISTER_ALLOWLIST.has(rel)) continue
        const src = readFileSync(file, 'utf8')
        const hasModuleCache =
          /\bnew\s+BoundedMap\b/.test(src) ||
          /\bnew\s+KeyedSingleflight\b/.test(src) ||
          /^(?:export\s+)?(?:const|let)\s+[A-Za-z0-9_]*(?:Cache|Inflight|TTL_MS)\b/m.test(src) ||
          /^(?:export\s+)?const\s+[A-Za-z0-9_]*HOLD_MS\b/m.test(src)
        if (!hasModuleCache) continue
        // `BUSY_HOLD_MS` in web-session-view is an exported timing constant, not a cache;
        // web-session-view still registers via registerWorkspaceCache so it passes cleanly.
        if (!/\bregisterWorkspaceCache\s*\(/.test(src)) {
          violations.push(rel)
        }
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Found frontend module-level caches not registered with registerWorkspaceCache (add registerWorkspaceCache or document in WEB_CACHE_REGISTER_ALLOWLIST):\n${violations.join('\n')}`,
  )
})

test('cache hygiene: no live for-of mutation (.set) on BoundedMap without snapshotting entries/keys', () => {
  const violations: string[] = []
  const declRe = /(?:const|let|private(?:\s+readonly)?)\s+([A-Za-z0-9_]+)\s*=\s*new\s+BoundedMap\b/g
  for (const dir of readdirSync(PACKAGES_DIR)) {
    for (const file of walkSourceFiles(join(PACKAGES_DIR, dir, 'src'))) {
      const src = readFileSync(file, 'utf8')
      if (!src.includes('BoundedMap')) continue
      const names = new Set<string>()
      let m: RegExpExecArray | null
      declRe.lastIndex = 0
      while ((m = declRe.exec(src))) {
        if (m[1]) names.add(m[1])
      }
      for (const name of names) {
        const loopRe = new RegExp(`for\\s*\\([^)]*\\bof\\s+(?:this\\.)?${name}(?:\\.(?:entries|keys|values)\\(\\))?\\s*\\)\\s*\\{`, 'g')
        let hit: RegExpExecArray | null
        while ((hit = loopRe.exec(src))) {
          // Walk matching braces to inspect the loop body
          let depth = 1
          let i = hit.index + hit[0].length
          while (i < src.length && depth > 0) {
            if (src[i] === '{') depth += 1
            else if (src[i] === '}') depth -= 1
            i += 1
          }
          const body = src.slice(hit.index + hit[0].length, i)
          if (new RegExp(`\\b(?:this\\.)?${name}\\.set\\s*\\(`).test(body)) {
            violations.push(`${relative(REPO_ROOT, file)} :: ${name}`)
          }
        }
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Found BoundedMap.set() inside live for-of iteration (causes infinite LRU loop; snapshot via [...map.entries()] first):\n${violations.join('\n')}`,
  )
})

test('cache hygiene: no new unbounded module-level cache Maps in frontend web/ modules', () => {
  const violations: string[] = []
  const mapRe = /^(?:export\s+)?const\s+([A-Za-z0-9_]*(?:cache|Cache|store|Store|inflight|Inflight|Records|Views|Meta|Titles)[A-Za-z0-9_]*)\s*=\s*new\s+Map</gm
  for (const dir of readdirSync(PACKAGES_DIR)) {
    for (const file of walkSourceFiles(join(PACKAGES_DIR, dir, 'src', 'web'))) {
      const rel = relative(REPO_ROOT, file)
      const src = readFileSync(file, 'utf8')
      let m: RegExpExecArray | null
      mapRe.lastIndex = 0
      while ((m = mapRe.exec(src))) {
        const id = `${rel}::${m[1]}`
        if (!WEB_UNBOUNDED_MAP_ALLOWLIST.has(id)) {
          violations.push(id)
        }
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Found unbounded module-level cache Map in web/ (use BoundedMap or KeyedSingleflight):\n${violations.join('\n')}`,
  )
})
