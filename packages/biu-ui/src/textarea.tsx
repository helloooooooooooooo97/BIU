import type { TextareaHTMLAttributes } from 'react'
import { cn } from './cn.ts'

export function Textarea({ className, ...rest }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        'biu-textarea min-h-[62px] w-full min-w-0 resize-y rounded-[var(--biu-radius-md)] border border-biu-border bg-biu-input px-2 py-2 text-[length:var(--biu-font-size-3)] leading-[1.55] text-biu-text outline-none placeholder:text-biu-placeholder focus:border-biu-emphasis disabled:cursor-default disabled:opacity-50',
        className,
      )}
      {...rest}
    />
  )
}
