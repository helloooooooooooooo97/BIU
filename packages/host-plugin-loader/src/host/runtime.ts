import type { Context } from 'cordis'
import { currentRequestWorkspaceId, isOnlineRuntime } from './data-dir.ts'
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
  /** Whether user/store plugins may author, bundle, or load server-side host.js code in the main Node process. */
  allowHostPluginCode: boolean
  /** Whether binding arbitrary host filesystem paths or OS directory pickers is allowed. */
  allowHostPathBinding: boolean
  /** Whether workspaces are isolated into per-workspace directories under dataHome. */
  isolateWorkspaceDirs: boolean
  /** Whether multi-tenant quotas (sandbox concurrency, WS per-account cap, auth rate limit) are enforced. */
  enforceTenantQuotas: boolean
  /** Whether workspace member and guest invitations are supported on this host. */
  allowWorkspaceInvites: boolean
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
      allowHostPluginCode: false,
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
    allowHostPluginCode: true,
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
