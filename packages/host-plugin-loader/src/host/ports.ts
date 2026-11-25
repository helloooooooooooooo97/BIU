import type { Context } from 'cordis'
import type { McpTenant } from './data-dir.ts'

export interface RemoteCloudTargetPort {
  origin: string
  token: string
  workspaceId: string
}

export interface AccountStorePort {
  accountByToken?(token: string): { id: string } | null
  isMember?(accountId: string, workspaceId: string): boolean
  isSuperAdmin?(accountId: string): boolean
  canAccessPlugin?(accountId: string, workspaceId: string, pluginId: string): boolean
  canReadRecord?(collection: string, recordId: string): boolean
  activeWorkspaceId?(): string | null
  tenantForRecord?(collection: string, recordId: string): { workspaceId: string; accountId: string } | null
  resolveMcpCredential?(token: string): McpTenant | null
}

export interface AccountServicePort {
  store?: AccountStorePort
  workspaceLocation?(workspaceId: string): 'device' | 'cloud'
  cloudConnection?(localAccountId: string): { origin: string; token: string } | null
  linkedCloud?(localAccountId?: string): { origin: string; token: string } | null
  resolveCloudTarget?(workspaceId?: string, localAccountId?: string): RemoteCloudTargetPort | null
}

export interface ChatEffectivePort {
  effective: {
    agentMode?: string
    extraTools?: string[]
  }
}

export interface ChatServicePort {
  resolveLlm?<T = unknown>(sessionId?: string | null): T
  resolveEffective?(sessionId?: string | null): ChatEffectivePort
  contextWindowFor?(sessionId: string): string
}

export interface NoticesServicePort {
  markSourceRead?(key: string): void
}

function safeGet<T>(ctx: Context, name: string): T | undefined {
  try {
    return ctx.get(name as never) as T | undefined
  } catch {
    return undefined
  }
}

export function getAccountPort(ctx: Context): AccountServicePort | undefined {
  return safeGet<AccountServicePort>(ctx, 'account')
}

export function getChatPort(ctx: Context): ChatServicePort | undefined {
  return safeGet<ChatServicePort>(ctx, 'chat')
}

export function getNoticesPort(ctx: Context): NoticesServicePort | undefined {
  return safeGet<NoticesServicePort>(ctx, 'notices')
}
