import type { Context } from 'cordis'
import { currentAccountId, currentRequestWorkspaceId, isOnlineRuntime } from './data-dir.ts'
import { getAccountPort, type AccountServicePort } from './ports.ts'

export type HostMode = 'cloud' | 'desktop'
export type AuthzMode = 'rbac' | 'local-allow-all'
export type SandboxPolicy = 'required' | 'off'

export interface RuntimePolicy {
  hostMode: HostMode
  /** Whether RBAC / workspace membership / builtin plugin guards are enforced. */
  authzMode: AuthzMode
  /** Whether users may submit/store their own LLM API keys on this host. */
  acceptsUserApiKeys: boolean
  /** Whether persisted user secrets (LLM API keys) must be encrypted at rest. */
  encryptSecretsAtRest: boolean
  /** Whether this host can link to an external cloud host. */
  allowCloudLinking: boolean
  /** Sandbox requirement for shell/subprocess execution. */
  sandboxPolicy: SandboxPolicy
  /** Whether background handlers may fall back to account activeWorkspaceId(). */
  allowImplicitActiveWorkspace: boolean
  /** Whether spawning arbitrary host processes outside sandbox (lsp_start, stdio MCP) is allowed. */
  allowHostProcess: boolean
  /** Whether binding arbitrary host filesystem paths or OS directory pickers is allowed. */
  allowHostPathBinding: boolean
  /** Whether workspaces are isolated into per-workspace directories under dataHome. */
  isolateWorkspaceDirs: boolean
  /** Whether multi-tenant quotas (sandbox concurrency, WS per-account cap, auth rate limit) are enforced. */
  enforceTenantQuotas: boolean
  /** Whether workspace member and guest invitations are supported on this host. */
  allowWorkspaceInvites: boolean
}

export type WorkspaceTarget =
  | { kind: 'local'; workspaceId: string }
  | { kind: 'remote'; workspaceId: string; origin: string; token: string }

export interface RemoteCloudTarget {
  origin: string
  token: string
  workspaceId: string
}

/**
 * Unified runtime policy derived from the host deployment mode.
 * Business plugins should query capabilities here instead of branching on BIU_ONLINE directly.
 */
export function getRuntimePolicy(online = isOnlineRuntime()): RuntimePolicy {
  if (online) {
    return {
      hostMode: 'cloud',
      authzMode: 'rbac',
      acceptsUserApiKeys: true,
      encryptSecretsAtRest: true,
      allowCloudLinking: false,
      sandboxPolicy: 'required',
      allowImplicitActiveWorkspace: false,
      allowHostProcess: false,
      allowHostPathBinding: false,
      isolateWorkspaceDirs: true,
      enforceTenantQuotas: true,
      allowWorkspaceInvites: true,
    }
  }
  return {
    hostMode: 'desktop',
    authzMode: 'local-allow-all',
    acceptsUserApiKeys: true,
    encryptSecretsAtRest: false,
    allowCloudLinking: true,
    sandboxPolicy: 'off',
    allowImplicitActiveWorkspace: true,
    allowHostProcess: true,
    allowHostPathBinding: true,
    isolateWorkspaceDirs: false,
    enforceTenantQuotas: false,
    allowWorkspaceInvites: false,
  }
}

function accountServiceOf(ctx: Context): AccountServicePort | undefined {
  return getAccountPort(ctx)
}

/**
 * Resolve the effective workspaceId for the current execution scope.
 * In cloud mode, never falls back to activeWorkspaceId() outside an explicit request scope.
 */
export function resolveScopedWorkspaceId(ctx: Context, explicitWorkspaceId = ''): string {
  const explicit = explicitWorkspaceId.trim()
  if (explicit) return explicit
  const fromRequest = currentRequestWorkspaceId().trim()
  if (fromRequest) return fromRequest
  if (!getRuntimePolicy().allowImplicitActiveWorkspace) return ''
  return String(accountServiceOf(ctx)?.store?.activeWorkspaceId?.() ?? '').trim()
}

/**
 * Resolve whether the target workspace is handled locally by this host or remotely on a linked cloud host.
 * Returns null if the workspace is remote but no cloud connection is available.
 */
export function resolveWorkspaceTarget(
  ctx: Context,
  workspaceId = '',
  localAccountId = currentAccountId(),
): WorkspaceTarget | null {
  const policy = getRuntimePolicy()
  const resolvedId = resolveScopedWorkspaceId(ctx, workspaceId)
  if (policy.hostMode === 'cloud') {
    return { kind: 'local', workspaceId: resolvedId }
  }
  const account = accountServiceOf(ctx)
  if (!resolvedId || account?.workspaceLocation?.(resolvedId) !== 'cloud') {
    return { kind: 'local', workspaceId: resolvedId }
  }
  const remote = resolveRemoteCloudTarget(ctx, resolvedId, localAccountId)
  if (!remote) return null
  return { kind: 'remote', ...remote }
}

/**
 * Resolve the remote cloud host connection for a desktop cloud workspace.
 * Returns null on cloud servers, in device workspaces, or when not logged into a cloud account.
 */
export function resolveRemoteCloudTarget(
  ctx: Context,
  workspaceId = '',
  localAccountId = currentAccountId(),
): RemoteCloudTarget | null {
  if (getRuntimePolicy().hostMode === 'cloud') return null
  const account = accountServiceOf(ctx)
  if (!account) return null
  if (typeof account.resolveCloudTarget === 'function') {
    return account.resolveCloudTarget(workspaceId, localAccountId)
  }
  const targetWorkspace = workspaceId || resolveScopedWorkspaceId(ctx)
  if (!targetWorkspace || account.workspaceLocation?.(targetWorkspace) !== 'cloud') return null
  const connection =
    (localAccountId ? account.cloudConnection?.(localAccountId) : null) ??
    account.linkedCloud?.(localAccountId || undefined)
  if (!connection?.origin || !connection.token) return null
  return {
    origin: connection.origin.replace(/\/+$/, ''),
    token: connection.token,
    workspaceId: targetWorkspace,
  }
}

export type SandboxDriverKind = 'bwrap' | 'sandbox-exec' | 'env-only' | 'none'

/**
 * Fail-closed guard for cloud multi-tenant sandbox execution.
 * In cloud mode (sandboxPolicy === 'required'), refuses 'none' or 'env-only' unless
 * BIU_ALLOW_UNSAFE_SANDBOX=1 is explicitly set for local development.
 */
export function assertSandboxDriverAllowed(
  driver: SandboxDriverKind,
  policy: RuntimePolicy = getRuntimePolicy(),
): void {
  if (policy.sandboxPolicy !== 'required') return
  if (driver === 'bwrap' || driver === 'sandbox-exec') return
  if (process.env.BIU_ALLOW_UNSAFE_SANDBOX === '1') return
  throw new Error(
    `Cloud runtime requires an OS-level sandbox (bwrap on Linux or sandbox-exec on macOS), got "${driver}". ` +
      'Install bwrap or set BIU_ALLOW_UNSAFE_SANDBOX=1 for local development only.',
  )
}
