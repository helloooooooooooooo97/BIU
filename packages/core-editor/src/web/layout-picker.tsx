import { useState, type MouseEvent } from 'react'
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
  const gap = 1.6
  if (rows && rows.length > 1) {
    const total = rows.reduce((sum, item) => sum + item, 0)
    let y = 1
    const inner = 18 - gap * (rows.length - 1)
    return (
      <svg viewBox="0 0 28 20" width="28" height="20" className={className} aria-hidden>
        {rows.map((weight, i) => {
          const h = (inner * weight) / total
          const el = <rect key={i} x="1" y={y} width="26" height={h} rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
          y += h + gap
          return el
        })}
      </svg>
    )
  }
  const cols = columns.length ? columns : [1]
  const total = cols.reduce((sum, item) => sum + item, 0)
  let x = 1
  const inner = 26 - gap * (cols.length - 1)
  return (
    <svg viewBox="0 0 28 20" width="28" height="20" className={className} aria-hidden>
      {cols.map((weight, i) => {
        const w = (inner * weight) / total
        const el = <rect key={i} x={x} y="1" width={w} height="18" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.4" />
        x += w + gap
        return el
      })}
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
}: {
  value: Id
  items: readonly LayoutPreset<Id>[]
  onChange: (id: Id) => void
  disabled?: boolean
  label?: string
}) {
  const [open, setOpen] = useState(false)
  const current = items.find((item) => item.id === value) ?? items[0]
  if (!current) return null

  return (
    <HeadlessPopover
      open={open}
      onOpenChange={setOpen}
      side="bottom"
      align="start"
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
          <LayoutGlyph columns={current.columns} rows={current.rows} className="layout-picker-glyph" />
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
