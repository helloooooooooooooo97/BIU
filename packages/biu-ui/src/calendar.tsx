/** ReUI / shadcn 拷贝源日历（reui.io），宿主 `@biu/biu-ui` 导出。 */
import { cva } from 'class-variance-authority'
import { useMemo, useState, type HTMLAttributes } from 'react'
import { Button } from './button.tsx'
import { cn } from './cn.ts'

const WEEKDAYS = ['一', '二', '三', '四', '五', '六', '日']

export function startOfDay(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate())
}

export function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
}

function monthTitle(value: Date) {
  return `${value.getFullYear()}年${value.getMonth() + 1}月`
}

function monthHead(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1)
}

function monthGrid(view: Date) {
  const first = monthHead(view)
  const weekday = first.getDay()
  const mondayOffset = weekday === 0 ? 6 : weekday - 1
  const start = new Date(first)
  start.setDate(first.getDate() - mondayOffset)
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(start)
    day.setDate(start.getDate() + index)
    return startOfDay(day)
  })
}

function dayKey(day: Date) {
  return `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`
}

const calendarDayVariants = cva(
  'biu-calendar-day inline-flex h-[26px] w-[26px] items-center justify-center rounded-[6px] border text-[13px] font-medium leading-none',
  {
    variants: {
      tone: {
        idle: 'border-transparent text-dsw-label hover:bg-dsw-hover',
        outside: 'border-transparent text-dsw-label-3 hover:bg-dsw-hover hover:text-dsw-label',
        today: 'border-dsw-border bg-dsw-hover text-dsw-label',
        selected: 'border-dsw-label bg-dsw-label text-dsw-bg hover:bg-dsw-label',
        disabled: 'cursor-default border-transparent text-dsw-label-3 opacity-40',
      },
    },
    defaultVariants: { tone: 'idle' },
  },
)

export { calendarDayVariants }

function NavMark({ dir }: { dir: 'prev' | 'next' }) {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6">
      {dir === 'prev' ? <path d="M10 3 5 8l5 5" /> : <path d="M6 3l5 5-5 5" />}
    </svg>
  )
}

export function Calendar({
  value,
  defaultValue,
  onChange,
  month,
  defaultMonth,
  onMonthChange,
  disabledDate,
  className,
  ...rest
}: {
  value?: Date | null
  defaultValue?: Date | null
  onChange?: (next: Date) => void
  month?: Date
  defaultMonth?: Date
  onMonthChange?: (next: Date) => void
  disabledDate?: (day: Date) => boolean
  className?: string
} & Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'defaultValue'>) {
  const selected = value === undefined ? defaultValue ?? null : value
  const monthControlled = month !== undefined && typeof onMonthChange === 'function'
  const [innerMonth, setInnerMonth] = useState(() => monthHead(month ?? defaultMonth ?? selected ?? new Date()))
  const view = monthHead(monthControlled ? month! : innerMonth)
  const today = startOfDay(new Date())
  const days = useMemo(() => monthGrid(view), [view])

  function showMonth(next: Date) {
    const head = monthHead(next)
    if (!monthControlled) setInnerMonth(head)
    onMonthChange?.(head)
  }

  function dayTone(day: Date, outside: boolean, disabled: boolean, isToday: boolean, isSelected: boolean) {
    if (disabled) return 'disabled' as const
    if (isSelected) return 'selected' as const
    if (isToday) return 'today' as const
    if (outside) return 'outside' as const
    return 'idle' as const
  }

  return (
    <div
      className={cn(
        'biu-calendar w-[252px] rounded-[6px] border border-dsw-border bg-dsw-bg p-2.5 text-[13px] text-dsw-label',
        className,
      )}
      {...rest}
    >
      <div className="mb-2 flex items-center justify-between gap-1">
        <Button
          variant="ghost"
          className="h-[26px] w-[26px] px-0"
          aria-label="上个月"
          onClick={() => showMonth(new Date(view.getFullYear(), view.getMonth() - 1, 1))}
        >
          <NavMark dir="prev" />
        </Button>
        <div className="min-w-0 flex-1 text-center text-[13px] font-semibold tracking-tight">{monthTitle(view)}</div>
        <Button
          variant="ghost"
          className="h-[26px] w-[26px] px-0"
          aria-label="下个月"
          onClick={() => showMonth(new Date(view.getFullYear(), view.getMonth() + 1, 1))}
        >
          <NavMark dir="next" />
        </Button>
      </div>
      <div className="mb-1 grid grid-cols-7 text-center text-[11px] font-medium text-dsw-label-3">
        {WEEKDAYS.map((label) => (
          <span key={label} className="h-[22px] leading-[22px]">
            {label}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-7 justify-items-center gap-y-0.5">
        {days.map((day) => {
          const outside = day.getMonth() !== view.getMonth()
          const disabled = Boolean(disabledDate?.(day))
          const isToday = sameDay(day, today)
          const isSelected = Boolean(selected && sameDay(day, selected))
          return (
            <button
              key={dayKey(day)}
              type="button"
              disabled={disabled}
              aria-current={isToday ? 'date' : undefined}
              aria-pressed={isSelected}
              aria-label={dayKey(day)}
              className={calendarDayVariants({
                tone: dayTone(day, outside, disabled, isToday, isSelected),
              })}
              onClick={() => {
                if (disabled) return
                if (outside) showMonth(day)
                onChange?.(day)
              }}
            >
              {day.getDate()}
            </button>
          )
        })}
      </div>
    </div>
  )
}
