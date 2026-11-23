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
