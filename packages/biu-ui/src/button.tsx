import { cva, type VariantProps } from 'class-variance-authority'
import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react'
import { cn } from './cn.ts'

const buttonVariants = cva(
  'biu-btn inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-[6px] border border-transparent h-[26px] px-2.5 text-[13px] font-semibold leading-[24px] transition-colors focus-visible:outline-none focus-visible:border-dsw-pick disabled:pointer-events-none disabled:opacity-50 disabled:cursor-default',
  {
    variants: {
      variant: {
        default: 'bg-dsw-hover text-dsw-label border-dsw-border hover:bg-dsw-input',
        secondary: 'bg-transparent text-dsw-label border-dsw-border hover:bg-dsw-hover',
        outline: 'bg-transparent text-dsw-label border-dsw-border hover:bg-dsw-hover',
        ghost: 'bg-transparent text-dsw-label-3 hover:bg-dsw-hover hover:text-dsw-label',
        destructive:
          'is-danger bg-dsw-danger-soft text-dsw-danger border-dsw-border hover:bg-dsw-danger-soft',
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
