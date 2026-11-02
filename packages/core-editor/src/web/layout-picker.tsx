import { useState, type MouseEvent, type ReactNode } from 'react'
import { HeadlessPopover } from '@biu/biu-ui'

export type LayoutPreset<Id extends string = string> = {
  id: Id
  label: string
  /** 横向比例，如 [1,1] 对开、[1.4,1] 主从 */
  columns: number[]
  /** 有值时按行堆叠，如标题 [1,2]、纵叠 [1,1,1] */
  rows?: number[]
}

export function LayoutGlyph({
  columns,
  rows,
  className,
}: {
  columns: number[]
  rows?: number[]
  className?: string
}) {
  const pad = 2
  const gap = 2
  const x0 = pad
  const y0 = pad
  const innerW = 24 - pad * 2
  const innerH = 16 - pad * 2
  const cells =
    rows && rows.length > 1
      ? (() => {
          const total = rows.reduce((sum, item) => sum + item, 0)
          let y = y0
          return rows.map((weight, i) => {
            const h = (innerH - gap * (rows.length - 1)) * (weight / total)
            const el = <rect key={i} x={x0} y={y} width={innerW} height={h} rx="1.5" />
            y += h + gap
            return el
          })
        })()
      : (() => {
          const cols = columns.length ? columns : [1]
          const total = cols.reduce((sum, item) => sum + item, 0)
          let x = x0
          return cols.map((weight, i) => {
            const w = (innerW - gap * (cols.length - 1)) * (weight / total)
            const el = <rect key={i} x={x} y={y0} width={w} height={innerH} rx="1.5" />
            x += w + gap
            return el
          })
        })()
  return (
    <svg viewBox="0 0 24 16" width="24" height="16" className={className} aria-hidden fill="currentColor">
      <rect x="0.75" y="0.75" width="22.5" height="14.5" rx="3" fill="none" stroke="currentColor" strokeWidth="1.25" opacity="0.4" />
      <g opacity="0.78">{cells}</g>
    </svg>
  )
}

function hold(event: MouseEvent) {
  event.preventDefault()
}

/** 通用布局切换：触发器是当前布局的缩略图，浮层是一套同样的缩略图。 */
export function LayoutPicker<Id extends string>({
  value,
  items,
  onChange,
  disabled,
  label = '调整布局',
  side = 'bottom',
  sideOffset = 8,
  alignOffset = 0,
  avoidCollisions = true,
  icon,
}: {
  value: Id
  items: readonly LayoutPreset<Id>[]
  onChange: (id: Id) => void
  disabled?: boolean
  label?: string
  side?: 'top' | 'bottom' | 'left' | 'right'
  sideOffset?: number
  alignOffset?: number
  avoidCollisions?: boolean
  icon?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const current = items.find((item) => item.id === value) ?? items[0]
  if (!current) return null

  return (
    <HeadlessPopover
      open={open}
      onOpenChange={setOpen}
      side={side}
      align="start"
      sideOffset={sideOffset}
      alignOffset={alignOffset}
      avoidCollisions={avoidCollisions}
      trigger={
        <button
          type="button"
          className={`layout-picker-btn${open ? ' is-on' : ''}`}
          disabled={disabled}
          title={label}
          aria-label={label}
          aria-haspopup="menu"
          aria-expanded={open}
          data-testid="layout-picker"
          onMouseDown={hold}
        >
          {icon ?? <LayoutGlyph columns={current.columns} rows={current.rows} className="layout-picker-glyph" />}
        </button>
      }
    >
      <div className="layout-picker-menu" role="menu" data-biu-ignore>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            role="menuitem"
            className={item.id === value ? 'is-on' : ''}
            data-testid={`layout-picker-${item.id}`}
            onMouseDown={hold}
            onClick={() => {
              onChange(item.id)
              setOpen(false)
            }}
          >
            <LayoutGlyph columns={item.columns} rows={item.rows} className="layout-picker-glyph" />
            <span>{item.label}</span>
          </button>
        ))}
      </div>
    </HeadlessPopover>
  )
}
