import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { restrictToVerticalAxis } from '@dnd-kit/modifiers'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS as DndCSS } from '@dnd-kit/utilities'
import type { CollectionSchemaPack, FieldSpec, FieldType } from '@biu/type-file-system'
import { HEADLESS_DISMISS_IGNORE } from '@biu/biu-ui/headless-dismiss'
import { HeadlessPopover } from '@biu/biu-ui/headless-popover'
import { overlayZ } from '@biu/biu-ui/overlay-portal'
import { tagTone as schemaTagTone } from '@biu/biu-ui/tag-chip'
import { moveList } from '../query-logic.ts'
import { CheckRow } from './controls.tsx'
import { DndGrip } from './dnd-grip.tsx'
import { FlyoutEmpty, flyoutQueryMatch } from './flyout-search.tsx'
import { facetFlatColumnKey, parseFacetFlatColumnKey, resolveFieldType } from './fields.ts'
import { FieldGlyph } from './fsdb-cells.tsx'
import { facetChipIcon } from './schema-field.tsx'

function FacetColumnPackRow({
  pack,
  visibleKeys,
  onToggle,
}: {
  pack: CollectionSchemaPack
  visibleKeys: Set<string>
  onToggle: (key: string) => void
}) {
  const [open, setOpen] = useState(false)
  const tone = schemaTagTone(pack.id)
  const fields = pack.fields.filter((field) => !field.deleted)
  const anyOn = fields.some((field) => visibleKeys.has(facetFlatColumnKey(pack.id, field.key)))

  return (
    <HeadlessPopover
      open={open}
      onOpenChange={setOpen}
      side="left"
      align="start"
      sideOffset={6}
      ignoreSelector={`${HEADLESS_DISMISS_IGNORE}, [data-fsdb-col-facet-trigger]`}
      trigger={
        <button
          type="button"
          className={`fsdb-checkrow fsdb-tool-row${anyOn || open ? ' is-on' : ''}`}
          style={{ ['--biu-tag' as string]: tone }}
          data-fsdb-col-facet-trigger
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${pack.label}属性`}
        >
          <span className="fsdb-checkrow-label">
            <span className="fsdb-checkrow-icon fsdb-col-facet-ico" style={{ color: tone }}>
              {facetChipIcon(pack.id)}
            </span>
            <span className="fsdb-col-facet-name" style={{ color: tone }}>
              {pack.label}
            </span>
          </span>
          <span className="fsdb-col-facet-count">{fields.length}</span>
        </button>
      }
    >
      <div
        className="fsdb-page fsdb-col-facet-flyout fsdb-tool-flyout"
        data-fsdb-col-flyout
        role="menu"
        style={{ zIndex: overlayZ(280) }}
      >
        {pack.fields.some((field) => !field.deleted) ? (
          pack.fields.filter((field) => !field.deleted).map((field) => {
            const key = facetFlatColumnKey(pack.id, field.key)
            return (
              <CheckRow
                key={field.key}
                icon={<FieldGlyph kind={resolveFieldType(field)} />}
                label={field.label ?? field.key}
                on={visibleKeys.has(key)}
                onToggle={() => onToggle(key)}
              />
            )
          })
        ) : (
          <div className="tasks-viewdd-empty">还没有属性</div>
        )}
      </div>
    </HeadlessPopover>
  )
}

function ColumnMenuCheck({
  col,
  on,
  locked,
  onToggle,
}: {
  col: { key: string; kind: FieldType; field: FieldSpec }
  on: boolean
  locked?: boolean
  onToggle: () => void
}) {
  return (
    <CheckRow
      icon={<FieldGlyph kind={col.kind} />}
      label={col.field.label ?? col.key}
      on={on}
      locked={locked}
      onToggle={onToggle}
    />
  )
}

function ColumnRowShell({
  grip,
  children,
  className,
  rowRef,
  style,
}: {
  grip: ReactNode
  children: ReactNode
  className?: string
  rowRef?: (node: HTMLElement | null) => void
  style?: CSSProperties
}) {
  return (
    <div ref={rowRef} className={`fsdb-col-drag-row${className ? ` ${className}` : ''}`} style={style}>
      {grip}
      {children}
    </div>
  )
}

function ColumnDragRow({
  col,
  on,
  onToggle,
}: {
  col: { key: string; kind: FieldType; field: FieldSpec }
  on: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: col.key })
  return (
    <ColumnRowShell
      rowRef={setNodeRef}
      className={isDragging ? 'is-drag' : undefined}
      style={{ transform: DndCSS.Transform.toString(transform), transition }}
      grip={
        <button type="button" className="fsdb-query-grip" aria-label="拖动调整列顺序" {...attributes} {...listeners}>
          <DndGrip />
        </button>
      }
    >
      <ColumnMenuCheck col={col} on={on} onToggle={onToggle} />
    </ColumnRowShell>
  )
}

export function ColumnOrderMenu({
  columns,
  allColumns,
  labelField,
  facetCatalog,
  query = '',
  onToggle,
  onReorder,
}: {
  columns: Array<{ key: string; kind: FieldType; field: FieldSpec }>
  allColumns: Array<{ key: string; kind: FieldType; field: FieldSpec }>
  labelField?: string
  facetCatalog: CollectionSchemaPack[]
  query?: string
  onToggle: (key: string) => void
  onReorder: (next: string[]) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const visibleKeys = new Set(columns.map((item) => item.key))
  const hidden = allColumns.filter((item) => !parseFacetFlatColumnKey(item.key) && !visibleKeys.has(item.key))
  const queryText = query ?? ''
  const menuCols = [
    ...columns.filter((item) => item.key === labelField),
    ...columns.filter((item) => item.key !== labelField),
    ...hidden,
  ].filter((item) => {
    if (!flyoutQueryMatch(item.field.label ?? item.key, queryText)) return false
    const flat = parseFacetFlatColumnKey(item.key)
    if (!flat || !queryText.trim()) return true
    const pack = facetCatalog.find((entry) => entry.id === flat.packId)
    const field = pack?.fields.find((entry) => entry.key === flat.fieldKey)
    return Boolean(field && !field.deleted)
  })
  const packs = facetCatalog.filter((pack) => {
    const liveFields = pack.fields.filter((field) => !field.deleted)
    if (queryText.trim() && pack.fields.length > 0 && !liveFields.length) return false
    return (
      flyoutQueryMatch(pack.label, queryText) ||
      liveFields.some((field) => flyoutQueryMatch(field.label ?? field.key, queryText))
    )
  })
  const locked = new Set([labelField, 'actions'].filter(Boolean))
  const sortableIds = menuCols.filter((item) => !locked.has(item.key)).map((item) => item.key)
  const active = menuCols.find((item) => item.key === activeId)
  const searching = Boolean(query.trim())

  if (searching) {
    if (!menuCols.length && !packs.length) return <FlyoutEmpty />
    return (
      <>
        {menuCols.map((item) => (
          <ColumnMenuCheck
            key={item.key}
            col={item}
            on={visibleKeys.has(item.key) || locked.has(item.key)}
            locked={locked.has(item.key)}
            onToggle={() => onToggle(item.key)}
          />
        ))}
        {packs.map((pack) => (
          <FacetColumnPackRow key={pack.id} pack={pack} visibleKeys={visibleKeys} onToggle={onToggle} />
        ))}
      </>
    )
  }

  return (
    <>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis]}
        onDragStart={(event: DragStartEvent) => setActiveId(String(event.active.id))}
        onDragCancel={() => setActiveId(null)}
        onDragEnd={(event: DragEndEvent) => {
          const overId = event.over?.id
          setActiveId(null)
          if (overId == null || event.active.id === overId) return
          const from = sortableIds.indexOf(String(event.active.id))
          const to = sortableIds.indexOf(String(overId))
          if (from < 0 || to < 0) return
          const next = moveList(sortableIds, from, to)
          const visible = next.filter((key) => visibleKeys.has(key) && key !== labelField && key !== 'actions')
          const head = [labelField, visibleKeys.has('actions') ? 'actions' : ''].filter(Boolean) as string[]
          onReorder([...head, ...visible])
        }}
      >
        {menuCols
          .filter((item) => item.key === labelField || item.key === 'actions')
          .map((item) => (
            <ColumnRowShell
              key={item.key}
              grip={
                <span className="fsdb-query-grip is-locked" aria-hidden>
                  <DndGrip />
                </span>
              }
            >
              <ColumnMenuCheck col={item} on locked onToggle={() => onToggle(item.key)} />
            </ColumnRowShell>
          ))}
        <SortableContext items={sortableIds} strategy={verticalListSortingStrategy}>
          {menuCols
            .filter((item) => item.key !== labelField && item.key !== 'actions')
            .map((item) => (
              <ColumnDragRow
                key={item.key}
                col={item}
                on={visibleKeys.has(item.key)}
                onToggle={() => onToggle(item.key)}
              />
            ))}
        </SortableContext>
        <DragOverlay zIndex={280}>
          {active ? (
            <div className="fsdb-query-drag-overlay" data-fsdb-sort-overlay>
              <div className="fsdb-col-drag-row">
                <button type="button" className="fsdb-query-grip" tabIndex={-1}>
                  <DndGrip />
                </button>
                <ColumnMenuCheck col={active} on={visibleKeys.has(active.key)} onToggle={() => {}} />
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
      {packs.map((pack) => (
        <ColumnRowShell
          key={pack.id}
          className="is-facet"
          style={{ ['--biu-tag' as string]: schemaTagTone(pack.id) }}
          grip={
            <span className="fsdb-query-grip is-locked" aria-hidden>
              <DndGrip />
            </span>
          }
        >
          <FacetColumnPackRow pack={pack} visibleKeys={visibleKeys} onToggle={onToggle} />
        </ColumnRowShell>
      ))}
    </>
  )
}
