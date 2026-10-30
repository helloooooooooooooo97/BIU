import { useState } from 'react'
import { Button, Calendar, HeadlessPopover, Input } from '@biu/biu-ui'
import { ensureDbSearchStyle } from './search-menu.tsx'

function asStamp(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) && n > 0 ? n : 0
}

export function formatDateTimeLabel(value: unknown) {
  const n = asStamp(value)
  if (!n) return ''
  const d = new Date(n)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function timeValue(stamp: number) {
  if (!stamp) return '00:00'
  const d = new Date(stamp)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function mergeStamp(day: Date, time: string, fallback: number) {
  const [hours, minutes] = time.split(':').map((part) => Number(part))
  const base = fallback ? new Date(fallback) : new Date()
  const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Number.isFinite(hours) ? hours : base.getHours(), Number.isFinite(minutes) ? minutes : base.getMinutes(), 0, 0)
  return next.getTime()
}

export function CellDateTime({
  value,
  onChange,
  empty = '',
  overdue = false,
  writable = true,
}: {
  value: unknown
  onChange: (next: number | null) => void
  empty?: string
  overdue?: boolean
  writable?: boolean
}) {
  ensureDbSearchStyle()
  const stamp = asStamp(value)
  const [open, setOpen] = useState(false)
  const [time, setTime] = useState(() => timeValue(stamp))
  const selected = stamp ? new Date(stamp) : null
  const label = formatDateTimeLabel(stamp) || empty

  if (!writable) {
    return (
      <div className={`db-datetime${overdue ? ' is-overdue' : ''} is-ro`}>
        <span className="db-datetime-label">{label}</span>
      </div>
    )
  }

  return (
    <div
      className={`db-datetime${overdue ? ' is-overdue' : ''}`}
      onClick={(event) => event.stopPropagation()}
      onMouseDown={(event) => event.stopPropagation()}
    >
      <HeadlessPopover
        open={open}
        onOpenChange={setOpen}
        autoFocus
        trigger={
          <button type="button" className="db-datetime-trigger">
            {label || empty}
          </button>
        }
      >
        <div className="flex flex-col gap-2 rounded-[var(--biu-radius-md)] border border-biu-border bg-biu-bg p-2 shadow-none">
          <Calendar
            value={selected}
            defaultMonth={selected ?? undefined}
            onChange={(day) => {
              const next = mergeStamp(day, time, stamp)
              setTime(timeValue(next))
              onChange(next)
            }}
          />
          <div className="flex items-center gap-2">
            <Input
              aria-label="时间"
              type="time"
              value={time}
              onChange={(event) => {
                const nextTime = event.currentTarget.value || '00:00'
                setTime(nextTime)
                if (!stamp) return
                onChange(mergeStamp(new Date(stamp), nextTime, stamp))
              }}
            />
            {stamp ? (
              <Button
                variant="ghost"
                onClick={() => {
                  setTime('00:00')
                  onChange(null)
                  setOpen(false)
                }}
              >
                清除
              </Button>
            ) : null}
          </div>
        </div>
      </HeadlessPopover>
    </div>
  )
}
