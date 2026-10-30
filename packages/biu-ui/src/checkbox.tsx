import type { InputHTMLAttributes } from 'react'
import { cn } from './cn.ts'

export function Checkbox({ className, ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className={cn('biu-checkbox h-3.5 w-3.5 accent-[var(--biu-color-emphasis)]', className)} {...rest} />
}
