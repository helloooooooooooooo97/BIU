import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn.ts'

const badgeVariants = cva(
  'biu-badge inline-flex items-center rounded-[6px] border border-dsw-border px-1.5 py-px text-[11px] font-semibold leading-4 whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-dsw-hover text-dsw-label-3',
        on: 'bg-dsw-input text-dsw-label',
        destructive: 'bg-dsw-danger-soft text-dsw-danger',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export { badgeVariants }

export function Badge({
  className,
  variant,
  children,
  ...rest
}: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants> & { children?: ReactNode }) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...rest}>
      {children}
    </span>
  )
}
