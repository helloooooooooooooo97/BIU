import type { InputHTMLAttributes } from 'react'
import { cn } from './cn.ts'

export function ensureInputStyle() {}

export function Input({ className, type = 'text', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        'biu-input h-[26px] w-full min-w-0 rounded-[6px] border border-biu-border bg-biu-input px-2 text-[13px] text-biu-text outline-none placeholder:text-biu-placeholder focus:border-biu-emphasis disabled:cursor-default disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  )
}
