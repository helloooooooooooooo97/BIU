import assert from 'node:assert/strict'
import { afterEach, test } from 'vitest'
import { Context, Service } from 'cordis'
import { runWithRequestWorkspace } from './data-dir.ts'
import {
  assertSandboxDriverAllowed,
  getRuntimePolicy,
  resolveRemoteCloudTarget,
  resolveScopedWorkspaceId,
  resolveWorkspaceTarget,
} from './runtime.ts'

const savedEnv = {
  BIU_ONLINE: process.env.BIU_ONLINE,
  BIU_ALLOW_UNSAFE_SANDBOX: process.env.BIU_ALLOW_UNSAFE_SANDBOX,
}

afterEach(() => {
  if (savedEnv.BIU_ONLINE === undefined) delete process.env.BIU_ONLINE
  else process.env.BIU_ONLINE = savedEnv.BIU_ONLINE
  if (savedEnv.BIU_ALLOW_UNSAFE_SANDBOX === undefined) delete process.env.BIU_ALLOW_UNSAFE_SANDBOX
  else process.env.BIU_ALLOW_UNSAFE_SANDBOX = savedEnv.BIU_ALLOW_UNSAFE_SANDBOX
})

test('getRuntimePolicy derives consistent host capabilities for cloud and desktop modes', () => {
  const cloud = getRuntimePolicy(true)
  assert.equal(cloud.hostMode, 'cloud')
  assert.equal(cloud.authzMode, 'rbac')
  assert.equal(cloud.acceptsUserApiKeys, true)
  assert.equal(cloud.encryptSecretsAtRest, true)
  assert.equal(cloud.allowCloudLinking, false)
  assert.equal(cloud.sandboxPolicy, 'required')
  assert.equal(cloud.allowImplicitActiveWorkspace, false)
  assert.equal(cloud.allowHostProcess, false)
  assert.equal(cloud.allowHostPathBinding, false)
  assert.equal(cloud.isolateWorkspaceDirs, true)
  assert.equal(cloud.enforceTenantQuotas, true)
  assert.equal(cloud.allowWorkspaceInvites, true)

  const desktop = getRuntimePolicy(false)
  assert.equal(desktop.hostMode, 'desktop')
  assert.equal(desktop.authzMode, 'local-allow-all')
  assert.equal(desktop.acceptsUserApiKeys, true)
  assert.equal(desktop.encryptSecretsAtRest, false)
  assert.equal(desktop.allowCloudLinking, true)
  assert.equal(desktop.sandboxPolicy, 'off')
  assert.equal(desktop.allowImplicitActiveWorkspace, true)
  assert.equal(desktop.allowHostProcess, true)
  assert.equal(desktop.allowHostPathBinding, true)
  assert.equal(desktop.isolateWorkspaceDirs, false)
  assert.equal(desktop.enforceTenantQuotas, false)
  assert.equal(desktop.allowWorkspaceInvites, false)
})

test('resolveScopedWorkspaceId refuses implicit activeWorkspaceId fallback in cloud mode', async () => {
  const ctx = new Context()
  class FakeAccount extends Service {
    store = { activeWorkspaceId: () => 'ws-implicit' }
    constructor(inner: Context) {
      super(inner, 'account')
    }
  }
  await ctx.plugin(FakeAccount)

  process.env.BIU_ONLINE = '1'
  assert.equal(resolveScopedWorkspaceId(ctx), '')
  assert.equal(
    runWithRequestWorkspace('ws-req', () => resolveScopedWorkspaceId(ctx)),
    'ws-req',
  )
  assert.equal(resolveScopedWorkspaceId(ctx, 'ws-explicit'), 'ws-explicit')

  process.env.BIU_ONLINE = '0'
  assert.equal(resolveScopedWorkspaceId(ctx), 'ws-implicit')
})

test('resolveWorkspaceTarget distinguishes local vs remote workspaces on desktop', async () => {
  const ctx = new Context()
  class FakeAccount extends Service {
    store = { activeWorkspaceId: () => 'ws-cloud' }
    workspaceLocation(id: string) {
      return id === 'ws-cloud' ? ('cloud' as const) : ('device' as const)
    }
    cloudConnection(accountId: string) {
      return accountId === 'local-1' ? { origin: 'https://cloud.example.com/', token: 'tok-1' } : null
    }
    constructor(inner: Context) {
      super(inner, 'account')
    }
  }
  await ctx.plugin(FakeAccount)

  process.env.BIU_ONLINE = '0'
  assert.deepEqual(resolveWorkspaceTarget(ctx, 'ws-local', 'local-1'), { kind: 'local', workspaceId: 'ws-local' })
  assert.deepEqual(resolveWorkspaceTarget(ctx, 'ws-cloud', 'local-1'), {
    kind: 'remote',
    workspaceId: 'ws-cloud',
    origin: 'https://cloud.example.com',
    token: 'tok-1',
  })
  assert.equal(resolveWorkspaceTarget(ctx, 'ws-cloud', 'unlinked'), null)
  assert.equal(resolveRemoteCloudTarget(ctx, 'ws-local', 'local-1'), null)

  process.env.BIU_ONLINE = '1'
  assert.deepEqual(resolveWorkspaceTarget(ctx, 'ws-cloud', 'local-1'), { kind: 'local', workspaceId: 'ws-cloud' })
  assert.equal(resolveRemoteCloudTarget(ctx, 'ws-cloud', 'local-1'), null)
})

test('assertSandboxDriverAllowed fails closed in cloud mode unless explicitly overridden', () => {
  const cloud = getRuntimePolicy(true)
  const desktop = getRuntimePolicy(false)

  assert.doesNotThrow(() => assertSandboxDriverAllowed('none', desktop))
  assert.doesNotThrow(() => assertSandboxDriverAllowed('env-only', desktop))
  assert.doesNotThrow(() => assertSandboxDriverAllowed('bwrap', cloud))
  assert.doesNotThrow(() => assertSandboxDriverAllowed('sandbox-exec', cloud))

  delete process.env.BIU_ALLOW_UNSAFE_SANDBOX
  assert.throws(() => assertSandboxDriverAllowed('env-only', cloud), /requires an OS-level sandbox/)
  assert.throws(() => assertSandboxDriverAllowed('none', cloud), /requires an OS-level sandbox/)

  process.env.BIU_ALLOW_UNSAFE_SANDBOX = '1'
  assert.doesNotThrow(() => assertSandboxDriverAllowed('env-only', cloud))
})
