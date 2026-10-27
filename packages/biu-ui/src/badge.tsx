import { cva, type VariantProps } from 'class-variance-authority'
import type { HTMLAttributes, ReactNode } from 'react'
import { cn } from './cn.ts'

const badgeVariants = cva(
  'biu-badge inline-flex items-center rounded-[var(--biu-radius-md)] border border-biu-border px-1.5 py-px text-[length:var(--biu-font-size-1)] font-semibold leading-4 whitespace-nowrap',
  {
    variants: {
      variant: {
        default: 'bg-biu-hover text-biu-text-subtle',
        on: 'bg-biu-input text-biu-text',
        destructive: 'bg-biu-danger-soft text-biu-danger',
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
