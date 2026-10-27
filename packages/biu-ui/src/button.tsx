import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from './cn.ts'

const buttonVariants = cva(
  'biu-btn inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-[var(--biu-radius-md)] border border-transparent h-[var(--biu-size-control-md)] px-2.5 text-[length:var(--biu-font-size-3)] font-semibold leading-[calc(var(--biu-size-control-md)-2px)] transition-colors focus-visible:outline-none focus-visible:border-biu-emphasis disabled:pointer-events-none disabled:opacity-50 disabled:cursor-default',
  {
    variants: {
      variant: {
        default: 'bg-biu-hover text-biu-text border-biu-border hover:bg-biu-input',
        secondary: 'bg-transparent text-biu-text border-biu-border hover:bg-biu-hover',
        outline: 'bg-transparent text-biu-text border-biu-border hover:bg-biu-hover',
        ghost: 'bg-transparent text-biu-text-subtle hover:bg-biu-hover hover:text-biu-text',
        destructive:
          'is-danger bg-biu-danger-soft text-biu-danger border-biu-border hover:bg-biu-danger-soft',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export { buttonVariants }

export function ensureButtonStyle() {}

export function Button({
  className,
  variant,
  danger = false,
  type = 'button',
  children,
  ref,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    danger?: boolean
    children?: ReactNode
    ref?: Ref<HTMLButtonElement>
  }) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant: danger ? 'destructive' : variant }), className)}
      {...rest}
    >
      {children}
    </button>
  )
}
