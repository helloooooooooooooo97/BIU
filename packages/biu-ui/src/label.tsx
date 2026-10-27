import type { LabelHTMLAttributes, ReactNode } from 'react'
import { cn } from './cn.ts'

export function Label({
  className,
  children,
  ...rest
}: LabelHTMLAttributes<HTMLLabelElement> & { children?: ReactNode }) {
  return (
    <label className={cn('biu-label text-xs font-semibold text-biu-text-subtle', className)} {...rest}>
      {children}
    </label>
  )
}
