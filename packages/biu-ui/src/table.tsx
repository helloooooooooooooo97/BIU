import type { HTMLAttributes, TdHTMLAttributes, ThHTMLAttributes } from 'react'
import { cn } from './cn.ts'

export function Table({ className, ...rest }: HTMLAttributes<HTMLTableElement>) {
  return (
    <div className="w-full overflow-x-auto">
      <table className={cn('biu-table w-full border-collapse text-[length:var(--biu-font-size-3)]', className)} {...rest} />
    </div>
  )
}

export function TableHeader({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <thead className={cn('text-biu-text-subtle', className)} {...rest} />
}

export function TableBody({ className, ...rest }: HTMLAttributes<HTMLTableSectionElement>) {
  return <tbody className={className} {...rest} />
}

export function TableRow({ className, ...rest }: HTMLAttributes<HTMLTableRowElement>) {
  return <tr className={cn('border-t border-biu-border', className)} {...rest} />
}

export function TableHead({ className, ...rest }: ThHTMLAttributes<HTMLTableCellElement>) {
  return <th className={cn('px-2 py-1 text-left font-semibold', className)} {...rest} />
}

export function TableCell({ className, ...rest }: TdHTMLAttributes<HTMLTableCellElement>) {
  return <td className={cn('px-2 py-1.5 align-top', className)} {...rest} />
}
