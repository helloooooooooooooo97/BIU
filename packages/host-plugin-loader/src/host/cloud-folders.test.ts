import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import {
  CLOUD_VIRTUAL_ROOT,
  cloudUserWorkRoot,
  createCloudFolder,
  listCloudFolders,
  normalizeCloudFolderRel,
  resolveCloudFolderPhysical,
  resolveCloudProjectSync,
} from './cloud-folders.ts'

test('cloudUserWorkRoot isolates per (workspaceId, accountId) and fails closed on missing tenant', () => {
  const home = mkdtempSync(join(tmpdir(), 'biu-cloud-folders-'))
  try {
    assert.throws(() => cloudUserWorkRoot('', 'acct-a', home), /workspace scope is required/)
    assert.throws(() => cloudUserWorkRoot('ws-1', '', home), /account scope is required/)

    const a1 = cloudUserWorkRoot('ws-1', 'acct-a', home)
    const b1 = cloudUserWorkRoot('ws-1', 'acct-b', home)
    const a2 = cloudUserWorkRoot('ws-2', 'acct-a', home)

    assert.notEqual(a1, b1)
    assert.notEqual(a1, a2)
    assert.ok(a1.endsWith(join('workspaces', 'ws-1', 'users', 'acct-a', 'work')))
    assert.ok(b1.endsWith(join('workspaces', 'ws-1', 'users', 'acct-b', 'work')))
  } finally {
    rmSync(home, { recursive: true, force: true })
  }
})

test('normalizeCloudFolderRel rejects host absolute paths and traversal', () => {
  assert.equal(normalizeCloudFolderRel(''), '')
  assert.equal(normalizeCloudFolderRel('/workspace'), '')
  assert.equal(normalizeCloudFolderRel('/workspace/'), '')
  assert.equal(normalizeCloudFolderRel('/workspace/my-app/sub'), 'my-app/sub')
  assert.equal(normalizeCloudFolderRel('my-app'), 'my-app')

  assert.throws(() => normalizeCloudFolderRel('/etc/passwd'), /不支持绑定宿主机路径/)
  assert.throws(() => normalizeCloudFolderRel('/Users/alice/code'), /不支持绑定宿主机路径/)
  assert.throws(() => normalizeCloudFolderRel('C:\\Users\\alice'), /不支持绑定宿主机路径/)
  assert.throws(() => normalizeCloudFolderRel('/workspace/../escape'), /不能越出个人工作区/)
  assert.throws(() => normalizeCloudFolderRel('../../escape'), /不能越出个人工作区/)
})

test('createCloudFolder and listCloudFolders stay scoped to each user and block symlink escapes', async () => {
  const home = mkdtempSync(join(tmpdir(), 'biu-cloud-list-'))
  const outside = mkdtempSync(join(tmpdir(), 'biu-cloud-outside-'))
  try {
    const created = await createCloudFolder('ws-1', 'acct-a', CLOUD_VIRTUAL_ROOT, 'alpha-app', home)
    assert.equal(created.name, 'alpha-app')
    assert.equal(created.path, '/workspace/alpha-app')
    assert.equal(created.hasGit, false)

    const nested = await createCloudFolder('ws-1', 'acct-a', '/workspace/alpha-app', 'packages', home)
    assert.equal(nested.path, '/workspace/alpha-app/packages')

    // Hidden directories and symlinks escaping user root are excluded/blocked
    const rootA = cloudUserWorkRoot('ws-1', 'acct-a', home)
    mkdirSync(join(rootA, 'alpha-app', '.git'), { recursive: true })
    mkdirSync(join(rootA, '.hidden-dir'), { recursive: true })
    symlinkSync(outside, join(rootA, 'evil-link'))

    const listingA = await listCloudFolders('ws-1', 'acct-a', CLOUD_VIRTUAL_ROOT, home)
    assert.equal(listingA.current, '/workspace')
    assert.equal(listingA.parent, null)
    assert.deepEqual(
      listingA.folders.map((f) => ({ name: f.name, path: f.path, hasGit: f.hasGit })),
      [{ name: 'alpha-app', path: '/workspace/alpha-app', hasGit: true }],
    )

    const subListing = await listCloudFolders('ws-1', 'acct-a', '/workspace/alpha-app', home)
    assert.equal(subListing.current, '/workspace/alpha-app')
    assert.equal(subListing.parent, '/workspace')
    assert.equal(subListing.folders.length, 1)
    assert.equal(subListing.folders[0]?.name, 'packages')

    // Another account in the SAME workspace sees an empty personal directory
    const listingB = await listCloudFolders('ws-1', 'acct-b', CLOUD_VIRTUAL_ROOT, home)
    assert.deepEqual(listingB.folders, [])

    // Resolving symlink escape fails closed (both async and sync)
    await assert.rejects(
      () => resolveCloudFolderPhysical(rootA, '/workspace/evil-link'),
      /不能通过软链越出个人工作区/,
    )
    assert.equal(resolveCloudProjectSync(rootA, '/workspace/evil-link'), null)
    assert.ok(resolveCloudProjectSync(rootA, '/workspace/alpha-app')?.endsWith(join('work', 'alpha-app')))

    // Invalid folder names are rejected
    await assert.rejects(() => createCloudFolder('ws-1', 'acct-a', CLOUD_VIRTUAL_ROOT, '../bad', home))
    await assert.rejects(() => createCloudFolder('ws-1', 'acct-a', CLOUD_VIRTUAL_ROOT, '.secret', home))
    await assert.rejects(() => createCloudFolder('ws-1', 'acct-a', CLOUD_VIRTUAL_ROOT, 'a/b', home))
  } finally {
    rmSync(home, { recursive: true, force: true })
    rmSync(outside, { recursive: true, force: true })
  }
})
