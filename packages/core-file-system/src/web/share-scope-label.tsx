import { ChatBubbleLeftEllipsisIcon, EyeIcon, PencilSquareIcon, ShieldCheckIcon, UserGroupIcon, UserIcon, UsersIcon } from '@heroicons/react/16/solid'

export function scopeText(scope: string) {
  if (scope === 'shared') return '共享'
  if (scope === 'workspace') return '空间'
  return '私人'
}

export function scopeTone(scope: string) {
  const text = scope === '私人' || scope === '空间' || scope === '共享' ? scope : scopeText(scope)
  if (text === '共享') return 'shared'
  if (text === '空间') return 'workspace'
  return 'personal'
}

export function ScopeMark({ scope }: { scope: string }) {
  const text = scope === '私人' || scope === '空间' || scope === '共享' ? scope : scopeText(scope)
  const icon = text === '共享'
    ? <UsersIcon aria-hidden className="size-[14px]" />
    : text === '空间'
      ? <UserGroupIcon aria-hidden className="size-[14px]" />
      : <UserIcon aria-hidden className="size-[14px]" />
  return <>{icon}{text}</>
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
  if (role === '管理' || role === '编辑' || role === '评论' || role === '查看') return role
  if (role === '阅读') return '查看'
  if (role === 'owner' || role === 'manager') return '管理'
  if (role === 'editor') return '编辑'
  if (role === 'commenter') return '评论'
  return '查看'
}

export function accessTone(text: string) {
  const role = accessText(text)
  if (role === '管理') return 'manage'
  if (role === '编辑') return 'edit'
  if (role === '评论') return 'comment'
  return 'read'
}

export function AccessMark({ role }: { role: string }) {
  const text = accessText(role)
  const icon = text === '管理'
    ? <ShieldCheckIcon aria-hidden className="size-[14px]" />
    : text === '编辑'
      ? <PencilSquareIcon aria-hidden className="size-[14px]" />
      : text === '评论'
        ? <ChatBubbleLeftEllipsisIcon aria-hidden className="size-[14px]" />
        : <EyeIcon aria-hidden className="size-[14px]" />
  return <>{icon}{text}</>
}

/** 胶囊占位。点开后再拉权限链路。 */
export function ShareRoleLabel({ label }: { label: string }) {
  return (
    <span className={`fsdb-scope-tag is-${accessTone(label)}`} data-testid="fsdb-role-tag">
      <AccessMark role={label} />
    </span>
  )
}
