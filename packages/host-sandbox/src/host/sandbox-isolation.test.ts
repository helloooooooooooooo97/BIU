import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'vitest'
import { Context } from 'cordis'
import * as tools from '@biu/host-tools'
import * as fs from '@biu/host-fs'
import * as subprocess from '@biu/host-subprocess'
import * as shell from '@biu/host-subprocess/shell'
import { runWithRequestWorkspace } from '@biu/host-plugin-loader/data-dir'
import * as sandbox from './index.ts'

test('sanitizeSandboxEnv strips host secrets like API keys and admin passwords', () => {
  const prevKey = process.env.DEEPSEEK_API_KEY
  const prevAdmin = process.env.BIU_SUPER_ADMIN_PASSWORD
  process.env.DEEPSEEK_API_KEY = 'sk-host-secret-should-never-leak'
  process.env.BIU_SUPER_ADMIN_PASSWORD = 'super-secret-password'
  try {
    const env = sandbox.sanitizeSandboxEnv('/tmp/ws-a', { CUSTOM_FLAG: '1' })
    assert.equal(env.DEEPSEEK_API_KEY, undefined)
    assert.equal(env.BIU_SUPER_ADMIN_PASSWORD, undefined)
    assert.equal(env.HOME, '/tmp/ws-a')
    assert.equal(env.CORDIS_SANDBOX, '/tmp/ws-a')
    assert.equal(env.CUSTOM_FLAG, '1')
  } finally {
    if (prevKey === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = prevKey
    if (prevAdmin === undefined) delete process.env.BIU_SUPER_ADMIN_PASSWORD
    else process.env.BIU_SUPER_ADMIN_PASSWORD = prevAdmin
  }
})

test('buildBwrapArgv isolates workspace, pid, network, and maps subdirectory cwd', () => {
  const argv = sandbox.buildBwrapArgv(
    {
      root: '/srv/biu/workspaces/ws-1/work',
      cwd: '/srv/biu/workspaces/ws-1/work/sub/dir',
      argv: ['/bin/sh', '-lc', 'echo ok'],
      allowNetwork: false,
    },
    (p) => p === '/usr' || p === '/bin',
  )
  assert.ok(argv.includes('--unshare-pid'))
  assert.ok(argv.includes('--unshare-net'))
  assert.ok(argv.includes('--die-with-parent'))
  assert.ok(argv.includes('--clearenv'))
  assert.ok(argv.includes('--tmpfs'))
  const bindIdx = argv.indexOf('--bind')
  assert.equal(argv[bindIdx + 1], '/srv/biu/workspaces/ws-1/work')
  assert.equal(argv[bindIdx + 2], '/workspace')
  const chdirIdx = argv.indexOf('--chdir')
  assert.equal(argv[chdirIdx + 1], '/workspace/sub/dir')
  assert.deepEqual(argv.slice(-4), ['--', '/bin/sh', '-lc', 'echo ok'])
})

test('buildSeatbeltProfile restricts writes and blocks sibling workspaces and secrets', () => {
  const profile = sandbox.buildSeatbeltProfile({
    root: '/srv/biu/workspaces/ws-1/work',
    cwd: '/srv/biu/workspaces/ws-1/work',
    argv: ['/bin/sh', '-lc', 'ls'],
    allowNetwork: false,
    dataRoot: '/srv/biu',
  })
  assert.match(profile, /\(deny file-write\*\)/)
  assert.match(profile, /\(deny file-read\* \(subpath ".*\/\.biu"\)\)/)
  assert.match(profile, /\(deny file-read\* \(subpath ".*\/workspaces"\)\)/)
  assert.match(profile, /\(allow file-read\* \(subpath ".*\/workspaces\/ws-1\/work"\)\)/)
  assert.match(profile, /\(deny network\*\)/)
})

test('cloud runtime isolates workspaces per workspaceId and strips host secrets in bash', async () => {
  const prevOnline = process.env.BIU_ONLINE
  const prevHome = process.env.BIU_HOME
  const prevDriver = process.env.BIU_SANDBOX_DRIVER
  const prevUnsafe = process.env.BIU_ALLOW_UNSAFE_SANDBOX
  const prevSecret = process.env.DEEPSEEK_API_KEY
  const tempHome = mkdtempSync(join(tmpdir(), 'biu-cloud-sbx-'))
  process.env.BIU_ONLINE = '1'
  process.env.BIU_HOME = tempHome
  // Force env-only in unit test when running inside nested OS sandboxes
  process.env.BIU_SANDBOX_DRIVER = 'env-only'
  process.env.BIU_ALLOW_UNSAFE_SANDBOX = '1'
  process.env.DEEPSEEK_API_KEY = 'sk-must-not-appear-in-bash'
  try {
    const ctx = new Context()
    await ctx.plugin(tools)
    await ctx.plugin(fs, { root: join(tempHome, 'default') })
    await ctx.plugin(sandbox)
    await ctx.plugin(subprocess)
    await ctx.plugin(shell)

    const rootA = runWithRequestWorkspace('ws-alpha', () => ctx.fs.effectiveRoot())
    const rootB = runWithRequestWorkspace('ws-beta', () => ctx.fs.effectiveRoot())
    assert.notEqual(rootA, rootB)
    assert.ok(rootA.endsWith(join('workspaces', 'ws-alpha', 'work')))
    assert.ok(rootB.endsWith(join('workspaces', 'ws-beta', 'work')))

    // Virtual /workspace path maps cleanly into the current workspace
    runWithRequestWorkspace('ws-alpha', () => {
      assert.equal(ctx.fs.resolve('/workspace/hello.txt'), join(rootA, 'hello.txt'))
      assert.throws(() => ctx.fs.resolve('/etc/passwd'), /path escapes workspace/)
    })

    // Write isolated file in ws-alpha and verify bash sees it without leaking host env
    writeFileSync(join(rootA, 'note.txt'), 'alpha-only', 'utf8')
    const res = (await runWithRequestWorkspace('ws-alpha', () =>
      ctx.tools.invoke('bash', { command: 'cat note.txt && echo "|KEY=$DEEPSEEK_API_KEY"' }),
    )) as { code: number | null; stdout: string }
    assert.equal(res.code, 0)
    assert.match(res.stdout, /alpha-only/)
    assert.match(res.stdout, /\|KEY=\s*$/)
  } finally {
    if (prevOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = prevOnline
    if (prevHome === undefined) delete process.env.BIU_HOME
    else process.env.BIU_HOME = prevHome
    if (prevDriver === undefined) delete process.env.BIU_SANDBOX_DRIVER
    else process.env.BIU_SANDBOX_DRIVER = prevDriver
    if (prevUnsafe === undefined) delete process.env.BIU_ALLOW_UNSAFE_SANDBOX
    else process.env.BIU_ALLOW_UNSAFE_SANDBOX = prevUnsafe
    if (prevSecret === undefined) delete process.env.DEEPSEEK_API_KEY
    else process.env.DEEPSEEK_API_KEY = prevSecret
    rmSync(tempHome, { recursive: true, force: true })
  }
})

test('SandboxService.wrap fails closed in cloud mode when driver degrades to env-only or none', async () => {
  const prevOnline = process.env.BIU_ONLINE
  const prevDriver = process.env.BIU_SANDBOX_DRIVER
  const prevUnsafe = process.env.BIU_ALLOW_UNSAFE_SANDBOX
  const tempHome = mkdtempSync(join(tmpdir(), 'biu-cloud-failclosed-'))
  process.env.BIU_ONLINE = '1'
  delete process.env.BIU_ALLOW_UNSAFE_SANDBOX
  try {
    const ctx = new Context()
    await ctx.plugin(tools)
    await ctx.plugin(fs, { root: join(tempHome, 'default') })
    await ctx.plugin(sandbox)

    process.env.BIU_SANDBOX_DRIVER = 'env-only'
    assert.throws(
      () => runWithRequestWorkspace('ws-test', () => ctx.sandbox.wrap({ argv: ['/bin/sh', '-lc', 'echo hi'] })),
      /Cloud runtime requires an OS-level sandbox/,
    )

    process.env.BIU_SANDBOX_DRIVER = 'none'
    assert.throws(
      () => runWithRequestWorkspace('ws-test', () => ctx.sandbox.wrap({ argv: ['/bin/sh', '-lc', 'echo hi'] })),
      /Cloud runtime requires an OS-level sandbox/,
    )

    // Explicit dev opt-in allows env-only
    process.env.BIU_ALLOW_UNSAFE_SANDBOX = '1'
    process.env.BIU_SANDBOX_DRIVER = 'env-only'
    const wrapped = runWithRequestWorkspace('ws-test', () => ctx.sandbox.wrap({ argv: ['/bin/sh', '-lc', 'echo hi'] }))
    assert.equal(wrapped.driver, 'env-only')
  } finally {
    if (prevOnline === undefined) delete process.env.BIU_ONLINE
    else process.env.BIU_ONLINE = prevOnline
    if (prevDriver === undefined) delete process.env.BIU_SANDBOX_DRIVER
    else process.env.BIU_SANDBOX_DRIVER = prevDriver
    if (prevUnsafe === undefined) delete process.env.BIU_ALLOW_UNSAFE_SANDBOX
    else process.env.BIU_ALLOW_UNSAFE_SANDBOX = prevUnsafe
    rmSync(tempHome, { recursive: true, force: true })
  }
})

test('ConcurrencyLimiter caps simultaneous sandbox executions', async () => {
  const limiter = new subprocess.ConcurrencyLimiter()
  let active = 0
  let peak = 0
  const tasks = Array.from({ length: 8 }, async () => {
    const release = await limiter.acquire(3)
    active += 1
    peak = Math.max(peak, active)
    await new Promise((r) => setTimeout(r, 20))
    active -= 1
    release()
  })
  await Promise.all(tasks)
  assert.equal(peak, 3)
  assert.equal(active, 0)
})
