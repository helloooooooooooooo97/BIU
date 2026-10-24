import type { InputHTMLAttributes } from 'react'
import { cn } from './cn.ts'

export function ensureInputStyle() {}

export function Input({ className, type = 'text', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      type={type}
      className={cn(
        'biu-input h-[26px] w-full min-w-0 rounded-[6px] border border-dsw-border bg-dsw-input px-2 text-[13px] text-dsw-label outline-none placeholder:text-dsw-placeholder focus:border-dsw-pick disabled:cursor-default disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  )
}
