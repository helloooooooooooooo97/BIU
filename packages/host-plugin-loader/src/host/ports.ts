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
  accountActiveWorkspace?(accountId: string): string | null
  activeLocalActor?(requestedWorkspaceId?: string): { accountId: string; workspaceId: string } | null
  tenantForRecord?(collection: string, recordId: string): { workspaceId: string; accountId: string } | null
  resolveMcpCredential?(token: string): McpTenant | null
  auditMcp?(tenant: McpTenant, toolName: string, success: boolean): void
  workspacePrefs?(actorId: string, workspaceId?: string): {
    starredViews: unknown[]
    starredRecords: unknown[]
    pinnedAgents: string[]
    viewOrder?: Record<string, string[]>
    theme?: string
    accent?: string
    pagePrefs?: Record<string, unknown>
  }
  collectionRecordOwners?(workspaceId: string, collection: string): Map<string, string>
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

// ============================================================================
// Backend Infrastructure Ports (Single-node Local vs Multi-node Distributed)
// ============================================================================

export interface RealtimeMessage<T = unknown> {
  channel: string
  payload: T
  originNodeId?: string
  ts: number
}

export interface WsTicketRecord {
  accountId: string
  workspaceId: string
  sessionToken: string
  exp: number
}

export interface RateLimitCheckResult {
  allowed: boolean
  remaining: number
  retryAfterSec: number
}

export interface RealtimeBusPort {
  readonly driver: string
  readonly nodeId: string
  publish<T = unknown>(channel: string, payload: T): Promise<void> | void
  subscribe<T = unknown>(channel: string, handler: (message: RealtimeMessage<T>) => void): () => void
  issueWsTicket(input: {
    accountId: string
    workspaceId: string
    sessionToken: string
    ttlMs?: number
    now?: number
  }): Promise<{ ticket: string; exp: number; workspaceId: string }> | { ticket: string; exp: number; workspaceId: string }
  consumeWsTicket(ticket: string, now?: number): Promise<WsTicketRecord | null> | WsTicketRecord | null
  checkRateLimit(
    key: string,
    opts: { windowMs: number; maxAttempts: number; now?: number },
  ): Promise<RateLimitCheckResult> | RateLimitCheckResult
  setEphemeral(key: string, value: string, ttlMs: number): Promise<void> | void
  getEphemeral(key: string): Promise<string | null> | string | null
  deleteEphemeral(key: string): Promise<void> | void
  acquireLock(key: string, owner: string, ttlMs: number): Promise<boolean> | boolean
  releaseLock(key: string, owner: string): Promise<boolean> | boolean
}

export interface BlobObjectMeta {
  key: string
  size: number
  contentType?: string
  etag?: string
  updatedAt?: number
}

export interface BlobSignedTicket {
  uid: string
  ws: string
  exp: number
  sig: string
}

export interface BlobStorePort {
  readonly driver: string
  put(key: string, data: Buffer | Uint8Array | string, opts?: { contentType?: string; rootDir?: string }): Promise<BlobObjectMeta>
  get(key: string, opts?: { rootDir?: string }): Promise<Buffer | null>
  head(key: string, opts?: { rootDir?: string }): Promise<BlobObjectMeta | null>
  delete(key: string, opts?: { rootDir?: string }): Promise<boolean>
  list(prefix?: string, opts?: { rootDir?: string }): Promise<string[]>
  putCas(data: Buffer | Uint8Array, opts?: { ext?: string; rootDir?: string }): Promise<{ hash: string; name: string; size: number }>
  getCas(name: string, opts?: { rootDir?: string }): Promise<Buffer | null>
  signAssetTicket(input: { accountId: string; workspaceId: string; ttlMs?: number; now?: number }): BlobSignedTicket
  verifyAssetTicket(query: URLSearchParams, now?: number): { accountId: string; workspaceId: string } | null
  resolveDownloadUrl(name: string, ticket?: BlobSignedTicket): string
}

export type StorageDialect = 'sqlite' | 'postgres'

export interface SqlRunResult {
  changes: number
  lastInsertRowid?: number | bigint
}

export interface SqlExecutor {
  readonly dialect: StorageDialect
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T[]>
  get<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<T | null>
  exec(sql: string, params?: unknown[]): Promise<SqlRunResult>
  transaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>
  close(): Promise<void>
}

export interface StoragePort {
  readonly driver: string
  readonly dialect: StorageDialect
  openMain(workspaceRoot?: string): Promise<SqlExecutor>
  openEvents(workspaceRoot?: string): Promise<SqlExecutor>
  closeAll(): Promise<void>
}

export interface DispatchedTask {
  id: string
  kind: string
  workspaceId: string
  accountId: string
  sessionId?: string
  payload: Record<string, unknown>
  createdAt: number
}

export interface TaskLease {
  sessionId: string
  ownerId: string
  expiresAt: number
}

export type TaskWorkerHandler = (task: DispatchedTask) => Promise<unknown> | unknown

export interface TaskDispatchPort {
  readonly driver: string
  dispatch(input: Omit<DispatchedTask, 'id' | 'createdAt'> & { id?: string }): Promise<{ taskId: string; accepted: boolean }>
  cancel(taskId: string): Promise<boolean>
  registerWorker(kind: string, handler: TaskWorkerHandler): () => void
  acquireLease(sessionId: string, ownerId: string, ttlMs: number): Promise<TaskLease | null>
  renewLease(sessionId: string, ownerId: string, ttlMs: number): Promise<boolean>
  releaseLease(sessionId: string, ownerId: string): Promise<boolean>
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

export function getRealtimePort(ctx: Context): RealtimeBusPort | undefined {
  return safeGet<RealtimeBusPort>(ctx, 'realtime')
}

export function getBlobPort(ctx: Context): BlobStorePort | undefined {
  return safeGet<BlobStorePort>(ctx, 'blob')
}

export function getStoragePort(ctx: Context): StoragePort | undefined {
  return safeGet<StoragePort>(ctx, 'storage')
}

export function getTaskDispatchPort(ctx: Context): TaskDispatchPort | undefined {
  return safeGet<TaskDispatchPort>(ctx, 'taskDispatch')
}
