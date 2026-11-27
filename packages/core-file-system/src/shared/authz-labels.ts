export type AuthzRole = 'owner' | 'manager' | 'editor' | 'commenter' | 'viewer'
export type AuthzShareScope = 'personal' | 'workspace' | 'shared'
export type AuthzScopeLabel = '私人' | '空间' | '共享'
export type AuthzAccessLabel = '管理' | '编辑' | '评论' | '查看'

export const ROLE_RANK: Record<AuthzRole, number> = {
  viewer: 1,
  commenter: 2,
  editor: 3,
  manager: 4,
  owner: 5,
}

export const SHARE_SCOPE_LABEL: Record<AuthzShareScope, AuthzScopeLabel> = {
  personal: '私人',
  workspace: '空间',
  shared: '共享',
}

export const SHARE_SCOPE_ENUM: AuthzScopeLabel[] = ['私人', '共享', '空间']

export const SHARE_ROLE_ENUM: AuthzAccessLabel[] = ['管理', '编辑', '评论', '查看']

export function normalizeAuthzScope(value: unknown): AuthzShareScope | undefined {
  if (value === 'personal' || value === 'shared' || value === 'workspace') return value
  if (value === '私人') return 'personal'
  if (value === '共享') return 'shared'
  if (value === '空间') return 'workspace'
  return undefined
}

export function scopeLabel(scope: unknown): AuthzScopeLabel {
  const normalized = normalizeAuthzScope(scope)
  return normalized ? SHARE_SCOPE_LABEL[normalized] : '私人'
}

export function normalizeAuthzRole(value: unknown): AuthzRole | undefined {
  if (value === 'owner' || value === 'manager' || value === 'editor' || value === 'commenter' || value === 'viewer') {
    return value
  }
  if (value === '管理') return 'manager'
  if (value === '编辑') return 'editor'
  if (value === '评论') return 'commenter'
  if (value === '查看' || value === '阅读') return 'viewer'
  return undefined
}

export function accessLabel(role: unknown): AuthzAccessLabel {
  const normalized = normalizeAuthzRole(role)
  if (normalized === 'owner' || normalized === 'manager') return '管理'
  if (normalized === 'editor') return '编辑'
  if (normalized === 'commenter') return '评论'
  return '查看'
}

export function roleActionLabel(role: unknown): string {
  if (role === 'owner') return '创建者'
  const normalized = normalizeAuthzRole(role)
  if (normalized === 'manager') return '可管理'
  if (normalized === 'commenter') return '可评论'
  if (normalized === 'viewer') return '可查看'
  return '可编辑'
}
