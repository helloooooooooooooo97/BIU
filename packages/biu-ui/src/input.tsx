import type { InputHTMLAttributes } from 'react'
import { cn } from './cn.ts'

export function ensureInputStyle() {}

export function Input({ className, type = 'text', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        'biu-input h-[var(--biu-size-control-md)] w-full min-w-0 rounded-[var(--biu-radius-md)] border border-biu-border bg-biu-input px-2 text-[length:var(--biu-font-size-3)] text-biu-text outline-none placeholder:text-biu-placeholder focus:border-biu-emphasis disabled:cursor-default disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  )
}
