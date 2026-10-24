import type { TextareaHTMLAttributes } from 'react'
import { cn } from './cn.ts'

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'biu-textarea min-h-[62px] w-full min-w-0 resize-y rounded-[6px] border border-dsw-border bg-dsw-input px-2 py-2 text-[13px] leading-[1.55] text-dsw-label outline-none placeholder:text-dsw-placeholder focus:border-dsw-pick disabled:cursor-default disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  )
}
