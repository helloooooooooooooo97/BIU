import { ShareIcon, UserIcon, UsersIcon } from '@heroicons/react/16/solid'

export function scopeText(scope: string) {
  if (scope === 'shared') return '共享'
  if (scope === 'workspace') return '空间'
  return '私人'
}

export function ScopeMark({ scope }: { scope: string }) {
  const text = scope === '私人' || scope === '空间' || scope === '共享' ? scope : scopeText(scope)
  const icon = text === '空间'
    ? <UsersIcon aria-hidden className="size-[14px]" />
    : text === '共享'
      ? <ShareIcon aria-hidden className="size-[14px]" />
      : <UserIcon aria-hidden className="size-[14px]" />
  return <>{icon}{text}</>
}

/** 表格里只画归属标签，点开详情再拉协作者。 */
export function ShareScopeLabel({ label }: { label: string }) {
  return (
    <span className="fsdb-scope-chip">
      <ScopeMark scope={label} />
    </span>
  )
}
