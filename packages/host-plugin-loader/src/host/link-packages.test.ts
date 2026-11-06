import { mkdirSync, mkdtempSync, readFileSync, readlinkSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import assert from 'node:assert/strict'
import { linkConfiguredPackages } from './index.ts'

function fakeRepo() {
  const root = mkdtempSync(join(tmpdir(), 'biu-link-'))
  const pkgDir = join(root, 'packages', 'host-tools')
  mkdirSync(join(pkgDir, 'src', 'host'), { recursive: true })
  writeFileSync(join(pkgDir, 'package.json'), JSON.stringify({ name: '@biu/host-tools' }))
  writeFileSync(join(pkgDir, 'src', 'host', 'tool-name.ts'), 'export const ok = 1\n')
  writeFileSync(
    join(root, 'cordis.plugins.json'),
    JSON.stringify({ host: [{ id: 'tools', package: '@biu/host-tools', enabled: true }] }),
  )
  return { root, pkgDir }
}

test('linkConfiguredPackages keeps a correct symlink instead of deleting it', () => {
  const { root, pkgDir } = fakeRepo()
  const linkPath = join(root, 'node_modules', '@biu', 'host-tools')
  mkdirSync(join(root, 'node_modules', '@biu'), { recursive: true })
  symlinkSync(pkgDir, linkPath, 'dir')
  const before = readlinkSync(linkPath)
  linkConfiguredPackages(root)
  assert.equal(readlinkSync(linkPath), before)
  assert.equal(readFileSync(join(linkPath, 'src', 'host', 'tool-name.ts'), 'utf8'), 'export const ok = 1\n')
})

test('linkConfiguredPackages replaces a symlink that points at the wrong package', () => {
  const { root, pkgDir } = fakeRepo()
  const other = join(root, 'packages', 'other')
  mkdirSync(other)
  const linkPath = join(root, 'node_modules', '@biu', 'host-tools')
  mkdirSync(join(root, 'node_modules', '@biu'), { recursive: true })
  symlinkSync(other, linkPath, 'dir')
  linkConfiguredPackages(root)
  assert.equal(readFileSync(join(linkPath, 'package.json'), 'utf8'), JSON.stringify({ name: '@biu/host-tools' }))
  assert.ok(readlinkSync(linkPath).includes('host-tools') || readlinkSync(linkPath) === pkgDir)
})
