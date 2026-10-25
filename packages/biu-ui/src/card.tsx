import type { HTMLAttributes } from 'react'
import { cn } from './cn.ts'

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'biu-card rounded-[6px] border border-dsw-border bg-dsw-bg p-2.5 text-[13px] text-dsw-label',
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
  return <h3 className={cn('m-0 text-[13px] font-semibold', className)} {...rest} />
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('min-w-0', className)} {...rest} />
}
