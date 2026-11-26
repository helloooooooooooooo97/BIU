import { createHash, randomBytes, scryptSync, timingSafeEqual } from 'node:crypto'
import type { WorkspaceRole } from './authorization.ts'

export const PRESENCE_STALE_MS = 30_000
export const DEFAULT_LOCK_MS = 60_000
export const DEFAULT_SESSION_MS = 30 * 24 * 60 * 60 * 1000
export const DEFAULT_MCP_CREDENTIAL_MS = 90 * 24 * 60 * 60 * 1000

const builtinPluginLookups = new Set<(pluginId: string) => boolean>()

/** 内置插件由插件商店登记。成员不需要再在设置里授权。 */
export function registerBuiltinPluginLookup(lookup: (pluginId: string) => boolean) {
  builtinPluginLookups.add(lookup)
  return () => {
    builtinPluginLookups.delete(lookup)
  }
}

export function isRegisteredBuiltinPlugin(pluginId: string) {
  for (const lookup of builtinPluginLookups) {
    if (lookup(pluginId)) return true
  }
  return false
}

export type PluginAssignmentSubject =
  | { type: 'account'; id: string }
  | { type: 'group'; id: string }

export type PluginPackageInput = {
  id: string
  version: string
  packageHash: string
  packagePath: string
  sourceKind: string
  trustState: string
  tenantMode: string
  hasWeb: boolean
  hasHost: boolean
  manifest: unknown
}

export class CollabError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'CollabError'
  }
}

export type Account = {
  id: string
  name: string
  email: string
  avatar?: string
  createdAt: number
  mustChangePassword?: boolean
}

export type Workspace = {
  id: string
  name: string
  ownerId: string
  role: WorkspaceRole
  createdAt: number
}

export type RecordHead = {
  workspaceId: string
  collection: string
  recordId: string
  ownerId: string
  version: number
  updatedAt: number
}

export type SyncOp = {
  id: number
  workspaceId: string
  collection: string
  recordId: string
  field: string
  value: unknown
  version: number
  authorId: string
  createdAt: number
}

export type EditLock = {
  workspaceId: string
  collection: string
  recordId: string
  accountId: string
  expiresAt: number
}

export type PresenceRow = {
  workspaceId: string
  accountId: string
  name: string
  collection: string
  recordId: string
  seenAt: number
}

export type AccessRuleSubjectType = 'account' | 'workspace' | 'group'

export type AccessRuleScope = 'workspace' | 'personal'

export type WorkspaceGroupKind = 'static' | 'dynamic'

export type AccessRuleRole = 'viewer' | 'editor' | 'manager'

export type AccessRuleDisplaySnapshot = {
  mode?: string
  sorts?: unknown[]
  groupBy?: string
  groupConfig?: Record<string, unknown>
}

export type AccessRuleGrantRecord = {
  id: string
  ruleId: string
  workspaceId: string
  subjectType: AccessRuleSubjectType
  subjectId: string
  role: AccessRuleRole
  createdAt: number
  subjectName?: string
  subjectEmail?: string
  subjectAvatar?: string
}

export type AccessRuleRecord = {
  id: string
  workspaceId: string
  collection: string
  name: string
  createdBy: string
  createdByName?: string
  ownerTable: string
  scope: AccessRuleScope
  filterTree: Record<string, unknown>
  columns: string[] | null
  visibleViews?: string[] | null
  displaySnapshot: AccessRuleDisplaySnapshot | null
  enabled: boolean
  canManage?: boolean
  createdAt: number
  updatedAt: number
  grants: AccessRuleGrantRecord[]
}

export type AccessRuleGrantInput = {
  subjectType: AccessRuleSubjectType
  subjectId: string
  role: AccessRuleRole
}

export type CreateAccessRuleInput = {
  collection: string
  name: string
  scope?: AccessRuleScope
  ownerTable?: string
  filterTree?: Record<string, unknown>
  columns?: string[] | null
  visibleViews?: string[] | null
  displaySnapshot?: AccessRuleDisplaySnapshot | null
  enabled?: boolean
  grants?: AccessRuleGrantInput[]
}

export type UpdateAccessRuleInput = {
  name?: string
  scope?: AccessRuleScope
  ownerTable?: string
  filterTree?: Record<string, unknown>
  columns?: string[] | null
  visibleViews?: string[] | null
  displaySnapshot?: AccessRuleDisplaySnapshot | null
  enabled?: boolean
  grants?: AccessRuleGrantInput[]
}

export function id(prefix: string) {
  return `${prefix}_${randomBytes(8).toString('hex')}`
}

export function tokenHash(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function inviteToken() {
  return randomBytes(24).toString('base64url')
}

export function hashPassword(password: string) {
  const salt = randomBytes(16)
  const hash = scryptSync(password, salt, 32)
  return `scrypt:${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifyPassword(password: string, stored: string) {
  const [kind, saltHex, hashHex] = stored.split(':')
  if (kind !== 'scrypt' || !saltHex || !hashHex) return false
  const actual = scryptSync(password, Buffer.from(saltHex, 'hex'), 32)
  const expected = Buffer.from(hashHex, 'hex')
  if (actual.length !== expected.length) return false
  return timingSafeEqual(actual, expected)
}
