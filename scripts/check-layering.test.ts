import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'

const REPO_ROOT = resolve(import.meta.dirname, '..')
const PACKAGES_DIR = join(REPO_ROOT, 'packages')

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      walkTsFiles(join(dir, entry.name), out)
    } else if (
      entry.isFile() &&
      (entry.name.endsWith('.ts') || entry.name.endsWith('.tsx')) &&
      !entry.name.includes('.test.') &&
      !entry.name.endsWith('.d.ts')
    ) {
      out.push(join(dir, entry.name))
    }
  }
  return out
}

test('monorepo layering: host/ never imports ../web/ and web/ never imports ../host/', () => {
  const violations: string[] = []
  for (const pkg of readdirSync(PACKAGES_DIR)) {
    const hostDir = join(PACKAGES_DIR, pkg, 'src', 'host')
    for (const file of walkTsFiles(hostDir)) {
      const text = readFileSync(file, 'utf8')
      const matches = text.match(/from\s+['"][^'"]*\/web\/[^'"]*['"]/g)
      if (matches?.length) {
        violations.push(`${relative(REPO_ROOT, file)}: ${matches.join(', ')}`)
      }
    }
    const webDir = join(PACKAGES_DIR, pkg, 'src', 'web')
    for (const file of walkTsFiles(webDir)) {
      const text = readFileSync(file, 'utf8')
      const matches = text.match(/from\s+['"][^'"]*\/host\/[^'"]*['"]/g)
      if (matches?.length) {
        violations.push(`${relative(REPO_ROOT, file)}: ${matches.join(', ')}`)
      }
    }
  }
  assert.deepEqual(
    violations,
    [],
    `Found cross-layer host <-> web imports (move isomorphic logic to src/shared/):\n${violations.join('\n')}`,
  )
})

const IMPORT_SPEC_RE = /(?:from|import)\s+['"]([^'"]+)['"]/g

function loadPackageNameMap() {
  const nameToDir = new Map<string, string>()
  const dirToName = new Map<string, string>()
  for (const dir of readdirSync(PACKAGES_DIR)) {
    const pkgJson = join(PACKAGES_DIR, dir, 'package.json')
    if (!existsSync(pkgJson)) continue
    const meta = JSON.parse(readFileSync(pkgJson, 'utf8')) as { name?: string }
    const name = meta.name || dir
    nameToDir.set(name, dir)
    dirToName.set(dir, name)
  }
  return { nameToDir, dirToName }
}

test('unified entrypoints: no relative imports escaping package root', () => {
  const escapes: string[] = []
  for (const dir of readdirSync(PACKAGES_DIR)) {
    const pkgRoot = resolve(PACKAGES_DIR, dir)
    const srcDir = join(pkgRoot, 'src')
    for (const file of walkTsFiles(srcDir)) {
      const text = readFileSync(file, 'utf8')
      let match: RegExpExecArray | null
      IMPORT_SPEC_RE.lastIndex = 0
      while ((match = IMPORT_SPEC_RE.exec(text))) {
        const spec = match[1]
        if (!spec.startsWith('.')) continue
        const target = resolve(file, '..', spec)
        if (!target.startsWith(pkgRoot + '/') && target !== pkgRoot) {
          escapes.push(`${relative(REPO_ROOT, file)} -> ${spec}`)
        }
      }
    }
  }
  assert.deepEqual(
    escapes,
    [],
    `Found relative imports escaping package boundary (use package exports instead):\n${escapes.join('\n')}`,
  )
})

test('unidirectional dependencies: package source import graph is acyclic (DAG)', () => {
  const { nameToDir, dirToName } = loadPackageNameMap()
  const graph = new Map<string, string[]>()
  for (const [dir, pkgName] of dirToName) {
    const deps = new Set<string>()
    for (const file of walkTsFiles(join(PACKAGES_DIR, dir, 'src'))) {
      const text = readFileSync(file, 'utf8')
      let match: RegExpExecArray | null
      IMPORT_SPEC_RE.lastIndex = 0
      while ((match = IMPORT_SPEC_RE.exec(text))) {
        const spec = match[1]
        if (!spec.startsWith('@biu/')) continue
        const targetPkg = spec.split('/').slice(0, 2).join('/')
        if (targetPkg !== pkgName && nameToDir.has(targetPkg)) deps.add(targetPkg)
      }
    }
    graph.set(pkgName, [...deps])
  }
  const cycles: string[][] = []
  const visited = new Set<string>()
  const stack = new Set<string>()
  const dfs = (u: string, trail: string[]) => {
    visited.add(u)
    stack.add(u)
    for (const v of graph.get(u) ?? []) {
      if (stack.has(v)) cycles.push([...trail.slice(trail.indexOf(v)), v])
      else if (!visited.has(v)) dfs(v, [...trail, v])
    }
    stack.delete(u)
  }
  for (const node of graph.keys()) {
    if (!visited.has(node)) dfs(node, [node])
  }
  assert.deepEqual(
    cycles,
    [],
    `Found package-level dependency cycles:\n${cycles.map((c) => c.join(' -> ')).join('\n')}`,
  )
})

test('global singletons: no hidden globalThis __biuPendingPageBlockEnables channel', () => {
  const hits: string[] = []
  for (const dir of readdirSync(PACKAGES_DIR)) {
    for (const file of walkTsFiles(join(PACKAGES_DIR, dir, 'src'))) {
      const text = readFileSync(file, 'utf8')
      if (text.includes('__biuPendingPageBlockEnables')) {
        hits.push(relative(REPO_ROOT, file))
      }
    }
  }
  assert.deepEqual(hits, [], `Found hidden globalThis state channel:\n${hits.join('\n')}`)
})

test('unified entrypoints: no raw fetch("/api/...") outside api-client.ts', () => {
  const hits: string[] = []
  for (const dir of readdirSync(PACKAGES_DIR)) {
    for (const file of walkTsFiles(join(PACKAGES_DIR, dir, 'src'))) {
      if (file.endsWith('biu-ui/src/api-client.ts') || file.includes('/marketing-site/')) continue
      const text = readFileSync(file, 'utf8')
      if (/(?<![.\w$])fetch\s*\(\s*[`'"]\/api\//.test(text)) {
        hits.push(relative(REPO_ROOT, file))
      }
    }
  }
  assert.deepEqual(
    hits,
    [],
    `Found raw fetch("/api/...") calls (use apiFetch from @biu/biu-ui/api-client):\n${hits.join('\n')}`,
  )
})

test('unified entrypoints: no raw localStorage/sessionStorage outside client-storage.ts', () => {
  const hits: string[] = []
  for (const dir of readdirSync(PACKAGES_DIR)) {
    for (const file of walkTsFiles(join(PACKAGES_DIR, dir, 'src'))) {
      if (file.endsWith('biu-ui/src/client-storage.ts') || file.includes('/marketing-site/')) continue
      const text = readFileSync(file, 'utf8')
      if (/\b(?:localStorage|sessionStorage)\.(?:getItem|setItem|removeItem)\b/.test(text)) {
        hits.push(relative(REPO_ROOT, file))
      }
    }
  }
  assert.deepEqual(
    hits,
    [],
    `Found raw localStorage/sessionStorage calls (use @biu/biu-ui/client-storage):\n${hits.join('\n')}`,
  )
})

test('dependency hygiene: every imported @biu/* package is declared in package.json (no phantom deps)', () => {
  const { nameToDir, dirToName } = loadPackageNameMap()
  const missing: string[] = []
  for (const [dir, selfName] of dirToName) {
    const pkg = JSON.parse(readFileSync(join(PACKAGES_DIR, dir, 'package.json'), 'utf8')) as {
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
      optionalDependencies?: Record<string, string>
    }
    const declared = new Set([
      ...Object.keys(pkg.dependencies ?? {}),
      ...Object.keys(pkg.peerDependencies ?? {}),
      ...Object.keys(pkg.optionalDependencies ?? {}),
    ])
    for (const file of walkTsFiles(join(PACKAGES_DIR, dir, 'src'))) {
      const text = readFileSync(file, 'utf8')
      let match: RegExpExecArray | null
      IMPORT_SPEC_RE.lastIndex = 0
      while ((match = IMPORT_SPEC_RE.exec(text))) {
        const spec = match[1]
        if (!spec.startsWith('@biu/')) continue
        const targetPkg = spec.split('/').slice(0, 2).join('/')
        if (targetPkg !== selfName && nameToDir.has(targetPkg) && !declared.has(targetPkg)) {
          missing.push(`${dir} missing ${targetPkg} (imported in ${relative(REPO_ROOT, file)})`)
        }
      }
    }
  }
  assert.deepEqual(missing, [], `Found undeclared phantom @biu/* dependencies:\n${missing.join('\n')}`)
})
