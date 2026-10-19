import { ShareIcon, UserIcon, UsersIcon } from '@heroicons/react/16/solid'

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
  const icon = text === '空间'
    ? <UsersIcon aria-hidden className="size-[14px]" />
    : text === '共享'
      ? <ShareIcon aria-hidden className="size-[14px]" />
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
