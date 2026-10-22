import type { FieldSpec } from '@biu/type-file-system'
import { CellDateTime } from '@biu/database-ui'
import { asStringList, enumDisplayLabel, resolveFieldType } from './fields.ts'
import { LocalText } from './controls.tsx'
import { TokenMultiSelect } from './token-select.tsx'
import { MediaField } from './cell-media-field.tsx'
import { PersonPickPanel } from './person-cell.tsx'
import { ActionCell, BoolCell } from './fsdb-cells.tsx'

export function FieldEditor({
  fieldKey,
  field,
  value,
  onChange,
  options,
  onAction,
  autoOpen = false,
  collectionPath,
  source,
  onCommit,
  compact = false,
}: {
  fieldKey: string
  field: FieldSpec
  value: string
  onChange: (next: string) => void
  options?: string[]
  onAction?: () => void
  autoOpen?: boolean
  collectionPath?: string
  source?: unknown
  onCommit?: (next: unknown) => void
  compact?: boolean
  excludeId?: string
}) {
  const kind = resolveFieldType(field)
  if (kind === 'action') {
    return <ActionCell field={field} fieldKey={fieldKey} onRun={onAction} />
  }
  if (kind === 'select' || kind === 'multi-select') {
    const selected = kind === 'multi-select' ? asStringList(value) : value ? [value] : []
    const values = field.enum?.length ? field.enum : [...new Set([...(options ?? []), ...selected])].filter(Boolean)
    const list = values.map((item) => ({ value: item, label: enumDisplayLabel(field, item) }))
    return (
      <TokenMultiSelect
        values={selected}
        options={list}
        allowCreate={!field.enum?.length}
        multiple={kind === 'multi-select'}
        autoOpen={autoOpen}
        onChange={(next) => onChange(kind === 'multi-select' ? next.join(', ') : (next[0] ?? ''))}
      />
    )
  }
  if (kind === 'boolean') {
    return <BoolCell on={value === 'true'} writable onToggle={() => onChange(value === 'true' ? 'false' : 'true')} />
  }
  if (kind === 'datetime') {
    return (
      <CellDateTime
        value={value}
        onChange={(next) => onChange(next == null ? '' : String(next))}
      />
    )
  }
  if (kind === 'person') {
    return (
      <PersonPickPanel
        value={source ?? value}
        onChange={(next) => {
          if (onCommit) onCommit(next)
          else onChange(JSON.stringify(next))
        }}
      />
    )
  }
  if (kind === 'url' || kind === 'image' || kind === 'attachment') {
    return (
      <MediaField
        kind={kind}
        value={source ?? value}
        collectionPath={collectionPath}
        compact={compact}
        onCommit={(next) => {
          if (onCommit) onCommit(next)
          else onChange(typeof next === 'string' ? next : JSON.stringify(next))
        }}
      />
    )
  }
  return <LocalText className="fsdb-plain-input" value={value} title={value} placeholder="" onCommit={onChange} />
}
