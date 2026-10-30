import type { ButtonHTMLAttributes, HTMLAttributes } from 'react'
import { Button } from './button.tsx'
import { cn } from './cn.ts'

export function Tabs({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('biu-tabs flex flex-wrap items-center gap-1', className)} {...rest} />
}

export function TabsTrigger({
  active,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return <Button type="button" variant={active ? 'secondary' : 'ghost'} className={className} {...rest} />
}
