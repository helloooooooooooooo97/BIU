import { ChatBubbleLeftEllipsisIcon, EyeIcon, PencilSquareIcon, ShieldCheckIcon, UserGroupIcon, UserIcon, UsersIcon } from '@heroicons/react/16/solid'
import { accessLabel, normalizeAuthzScope, scopeLabel } from '../shared/authz-labels.ts'

export function scopeText(scope: string) {
  return scopeLabel(scope)
}

export function scopeTone(scope: string) {
  return normalizeAuthzScope(scope) ?? 'personal'
}

export function ScopeIcon({ scope, className = 'size-[14px]' }: { scope: string; className?: string }) {
  const text = scopeLabel(scope)
  if (text === '共享') return <UsersIcon aria-hidden className={className} />
  if (text === '空间') return <UserGroupIcon aria-hidden className={className} />
  return <UserIcon aria-hidden className={className} />
}

export function ScopeMark({ scope }: { scope: string }) {
  const text = scopeLabel(scope)
  return <><ScopeIcon scope={text} />{text}</>
}

/** 胶囊占位。点开后再拉归属链路。 */
export function ShareScopeLabel({ label }: { label: string }) {
  return (
    <span className={`fsdb-scope-tag is-${scopeTone(label)}`}>
      <ScopeMark scope={label} />
    </span>
  )
}

export function accessText(role: string) {
  return accessLabel(role)
}

export function accessTone(text: string) {
  const role = accessText(text)
  if (role === '管理') return 'manage'
  if (role === '编辑') return 'edit'
  if (role === '评论') return 'comment'
  return 'read'
}

export function AccessIcon({ role, className = 'size-[14px]' }: { role: string; className?: string }) {
  const text = accessText(role)
  if (text === '管理') return <ShieldCheckIcon aria-hidden className={className} />
  if (text === '编辑') return <PencilSquareIcon aria-hidden className={className} />
  if (text === '评论') return <ChatBubbleLeftEllipsisIcon aria-hidden className={className} />
  return <EyeIcon aria-hidden className={className} />
}

export function AccessMark({ role }: { role: string }) {
  const text = accessText(role)
  return <><AccessIcon role={text} />{text}</>
}

/** 胶囊占位。点开后再拉权限链路。 */
export function ShareRoleLabel({ label }: { label: string }) {
  return (
    <span className={`fsdb-scope-tag is-${accessTone(label)}`} data-testid="fsdb-role-tag">
      <AccessMark role={label} />
    </span>
  )
}
