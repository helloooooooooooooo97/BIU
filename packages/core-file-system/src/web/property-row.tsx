import { type ReactNode } from 'react'
import type { FieldSpec } from '@biu/type-file-system'
import { ChevronDownIcon, ChevronRightIcon } from '@heroicons/react/16/solid'
import { resolveFieldType } from './fields.ts'
import { FieldGlyph } from './fsdb-cells.tsx'

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
  const name = (
    <span className="fsdb-proprow-k" title={label}>
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
            {expanded ? <ChevronDownIcon className="size-[14px]" /> : <ChevronRightIcon className="size-[14px]" />}
          </span>
        </button>
      ) : (
        <FieldGlyph kind={kind} />
      )}
      <span className="fsdb-proprow-label">{label}</span>
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
