import { cn } from './cn.ts'

export function Separator({ className, orientation = 'horizontal' }: { className?: string; orientation?: 'horizontal' | 'vertical' }) {
  return (
    <div
      role="separator"
      className={cn(
        'biu-separator bg-biu-border',
        orientation === 'vertical' ? 'mx-1 h-auto w-px self-stretch' : 'my-2 h-px w-full',
        className,
      )}
    />
  )
}
