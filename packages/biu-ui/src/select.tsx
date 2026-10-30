import type { SelectHTMLAttributes } from 'react'
import { cn } from './cn.ts'

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'biu-select h-[var(--biu-size-control-md)] min-w-0 rounded-[var(--biu-radius-md)] border border-biu-border bg-biu-input px-2 text-[length:var(--biu-font-size-3)] text-biu-text outline-none focus:border-biu-emphasis disabled:cursor-default disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  )
}
