import { cn } from './cn.ts'

export function Progress({ value = 0, className }: { value?: number; className?: string }) {
  const pct = Math.max(0, Math.min(100, value * 100))
  return (
    <div className={cn('biu-progress h-2 overflow-hidden rounded-[var(--biu-radius-md)] bg-biu-hover', className)}>
      <i className="block h-full bg-biu-emphasis" style={{ width: `${pct}%` }} />
    </div>
  )
}
