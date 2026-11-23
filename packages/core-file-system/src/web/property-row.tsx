import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { FieldSpec } from '@biu/type-file-system'
import { ChevronRightIcon, InformationCircleIcon } from '@heroicons/react/16/solid'
import { HeadlessPopover } from '@biu/biu-ui/headless-popover'
import { resolveFieldType } from './fields.ts'
import { FieldGlyph } from './fsdb-cells.tsx'

export function PropertyDescriptionPop({
  label,
  description,
  className,
}: {
  label?: string
  description?: string
  className?: string
}) {
  const [hovered, setHovered] = useState(false)
  const [pinned, setPinned] = useState(false)
  const closeTimerRef = useRef<number | null>(null)
  const desc = String(description ?? '').trim()

  const cancelClose = () => {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current)
      closeTimerRef.current = null
    }
  }

  const scheduleClose = () => {
    cancelClose()
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null
      setHovered(false)
    }, 120)
  }

  useEffect(() => cancelClose, [])

  if (!desc) return null
  const open = pinned || hovered
  const ariaLabel = label ? `${label} 属性说明` : '属性说明'
  return (
    <HeadlessPopover
      open={open}
      onOpenChange={(next) => {
        cancelClose()
        if (!next) {
          setPinned(false)
          setHovered(false)
        } else {
          setPinned(true)
        }
      }}
      side="top"
      align="center"
      sideOffset={6}
      trigger={
        <button
          type="button"
          className={`fsdb-prop-desc-btn${pinned ? ' is-on' : ''}${className ? ` ${className}` : ''}`}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-pressed={pinned}
          onPointerEnter={() => {
            cancelClose()
            setHovered(true)
          }}
          onPointerLeave={() => {
            if (!pinned) scheduleClose()
          }}
          onClick={(event) => {
            event.stopPropagation()
            event.preventDefault()
            cancelClose()
            if (pinned) {
              setPinned(false)
              setHovered(false)
            } else {
              setPinned(true)
            }
          }}
        >
          <InformationCircleIcon aria-hidden className="size-3.5" />
        </button>
      }
    >
      <div
        className="fsdb-prop-desc-pop"
        role="dialog"
        aria-label={ariaLabel}
        onPointerEnter={cancelClose}
        onPointerLeave={() => {
          if (!pinned) scheduleClose()
        }}
      >
        {desc}
      </div>
    </HeadlessPopover>
  )
}

export function PropertyRow({
  field,
  fieldKey,
  stacked,
  collapsible,
  expanded,
  onToggle,
  children,
  pick,
  table,
}: {
  field: FieldSpec
  fieldKey?: string
  stacked?: boolean
  collapsible?: boolean
  expanded?: boolean
  onToggle?: () => void
  children: ReactNode
  pick?: Record<string, string>
  table?: boolean
}) {
  const kind = resolveFieldType(field)
  const label = field.label ?? fieldKey ?? ''
  const desc = String(field.description ?? '').trim()
  const name = (
    <span className="fsdb-proprow-k">
      {collapsible ? (
        <button
          type="button"
          className="fsdb-proprow-fold"
          aria-expanded={Boolean(expanded)}
          aria-label={expanded ? `收起${label || '属性'}` : `展开${label || '属性'}`}
          onClick={onToggle}
        >
          <span className="fsdb-proprow-glyph" aria-hidden>
            <FieldGlyph kind={kind} />
          </span>
          <span className="fsdb-proprow-chevron" aria-hidden>
            <ChevronRightIcon className={`size-[14px] sidebar-chevron${expanded ? ' is-open' : ''}`} />
          </span>
        </button>
      ) : (
        <FieldGlyph kind={kind} />
      )}
      <span className="fsdb-proprow-label" title={label}>{label}</span>
      {desc ? <PropertyDescriptionPop label={label} description={desc} /> : null}
    </span>
  )
  const value = <span className="fsdb-proprow-v">{children}</span>
  const cls = `${table ? 'fsdb-prop-tr' : 'fsdb-proprow'}${stacked ? ' is-stack' : ''}${collapsible ? ' is-tag-fold' : ''}${expanded ? ' is-open' : ''}`
  if (table) {
    return (
      <tr className={cls} {...pick}>
        <td>{name}</td>
        <td>{value}</td>
      </tr>
    )
  }
  return (
    <div className={cls} {...pick}>
      {name}
      {value}
    </div>
  )
}
