import type { HTMLAttributes } from 'react'
import { cn } from './cn.ts'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'biu-card rounded-[var(--biu-radius-md)] border border-biu-border bg-biu-bg p-2.5 text-[length:var(--biu-font-size-3)] text-biu-text',
        className,
      )}
      {...rest}
    />
  )
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-2 flex flex-wrap items-center gap-2', className)} {...rest} />
}

export function CardTitle({ className, ...rest }: HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('m-0 text-[length:var(--biu-font-size-3)] font-semibold', className)} {...rest} />
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-w-0', className)} {...rest} />
}
