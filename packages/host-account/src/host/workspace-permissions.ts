export type CollectionPermissionSetting = {
  /** 是否允许对外分享（公开外链 / 外部协作者 / 临时访客） */
  allowExternalShare: boolean
  /** 仅 /agents：是否允许分享为可编辑（改名 / 改配置，不能直接对话） */
  allowEditShare?: boolean
  /** 仅 /agents：是否允许分享为可管理（直接接管代理对话与执行，高风险） */
  allowManageShare?: boolean
}

export type WorkspacePermissionPolicy = {
  /** 空间总开关：是否允许分享到外部（公开外链 / 外部协作者 / 临时访客） */
  allowExternalShare: boolean
  /** 空间总开关：是否允许将代理（/agents）分享为「可管理」权限（高风险，默认关闭） */
  allowAgentManagerShare: boolean
  /** 每种数据类型的详细权限开关 */
  collections: Record<string, CollectionPermissionSetting>
}

export const PERMISSION_MANAGED_COLLECTIONS = [
  '/pages',
  '/agents',
  '/tags',
  '/plugins',
  '/skills',
  '/mcp',
] as const

function normalizeCollectionKey(raw: string): string {
  const trimmed = String(raw ?? '').trim()
  if (!trimmed) return ''
  const withSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`
  return withSlash.replace(/\/+$/, '') || '/'
}

export function defaultWorkspacePermissionPolicy(): WorkspacePermissionPolicy {
  return {
    allowExternalShare: true,
    allowAgentManagerShare: false,
    collections: {
      '/pages': { allowExternalShare: true },
      '/agents': { allowExternalShare: true, allowEditShare: true, allowManageShare: false },
      '/tags': { allowExternalShare: true },
      '/plugins': { allowExternalShare: true },
      '/skills': { allowExternalShare: true },
      '/mcp': { allowExternalShare: true },
    },
  }
}

export function normalizeWorkspacePermissionPolicy(
  raw: unknown,
  base: WorkspacePermissionPolicy = defaultWorkspacePermissionPolicy(),
): WorkspacePermissionPolicy {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  const collections: Record<string, CollectionPermissionSetting> = {}
  for (const path of PERMISSION_MANAGED_COLLECTIONS) {
    const prev = base.collections[path] ?? { allowExternalShare: true }
    collections[path] = {
      allowExternalShare: prev.allowExternalShare !== false,
      ...(path === '/agents'
        ? {
            allowEditShare: prev.allowEditShare !== false,
            allowManageShare: Boolean(prev.allowManageShare),
          }
        : {}),
    }
  }
  const rawCols =
    input.collections && typeof input.collections === 'object' && !Array.isArray(input.collections)
      ? (input.collections as Record<string, unknown>)
      : null
  let agentManagePatched: boolean | undefined
  if (rawCols) {
    for (const [key, val] of Object.entries(rawCols)) {
      const path = normalizeCollectionKey(key)
      if (!path || !val || typeof val !== 'object' || Array.isArray(val)) continue
      const item = val as Record<string, unknown>
      const prev = collections[path] ?? { allowExternalShare: true }
      const next: CollectionPermissionSetting = {
        allowExternalShare:
          typeof item.allowExternalShare === 'boolean' ? item.allowExternalShare : prev.allowExternalShare,
      }
      if (path === '/agents') {
        next.allowEditShare =
          typeof item.allowEditShare === 'boolean' ? item.allowEditShare : prev.allowEditShare !== false
        if (typeof item.allowManageShare === 'boolean') {
          next.allowManageShare = item.allowManageShare
          agentManagePatched = item.allowManageShare
        } else {
          next.allowManageShare = Boolean(prev.allowManageShare)
        }
      }
      collections[path] = next
    }
  }
  const allowExternalShare =
    typeof input.allowExternalShare === 'boolean' ? input.allowExternalShare : base.allowExternalShare
  const allowAgentManagerShare =
    typeof input.allowAgentManagerShare === 'boolean'
      ? input.allowAgentManagerShare
      : agentManagePatched !== undefined
        ? agentManagePatched
        : base.allowAgentManagerShare
  collections['/agents'] = {
    allowExternalShare: collections['/agents']?.allowExternalShare !== false,
    allowEditShare: collections['/agents']?.allowEditShare !== false,
    allowManageShare: allowAgentManagerShare,
  }
  return {
    allowExternalShare,
    allowAgentManagerShare,
    collections,
  }
}

export function isPolicyExternalShareAllowed(policy: WorkspacePermissionPolicy, collection: string): boolean {
  if (!policy.allowExternalShare) return false
  const key = normalizeCollectionKey(collection)
  if (!key) return true
  const setting = policy.collections[key]
  return setting ? setting.allowExternalShare !== false : true
}

export function isPolicyAgentEditShareAllowed(policy: WorkspacePermissionPolicy): boolean {
  return policy.collections['/agents']?.allowEditShare !== false
}

export function isPolicyAgentManagerShareAllowed(policy: WorkspacePermissionPolicy): boolean {
  return Boolean(policy.allowAgentManagerShare && policy.collections['/agents']?.allowManageShare !== false)
}

export function agentShareRoleCeiling(policy: WorkspacePermissionPolicy): 'viewer' | 'editor' | 'manager' {
  if (isPolicyAgentManagerShareAllowed(policy)) return 'manager'
  if (isPolicyAgentEditShareAllowed(policy)) return 'editor'
  return 'viewer'
}
