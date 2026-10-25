import type { SelectHTMLAttributes } from 'react'
import { cn } from './cn.ts'

export function Select({ className, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        'biu-select h-[26px] min-w-0 rounded-[6px] border border-dsw-border bg-dsw-input px-2 text-[13px] text-dsw-label outline-none focus:border-dsw-pick disabled:cursor-default disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  )
}
