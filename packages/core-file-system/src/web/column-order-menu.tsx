import { useState, type ReactNode } from 'react'
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
import { HeadlessPopover } from '@biu/public-ui/headless-popover'
import { tagTextColor, tagTone as schemaTagTone } from '@biu/public-ui/tag-chip'
import { moveList } from '../query-logic.ts'
import { CheckRow } from './controls.tsx'
import { DndGrip } from './dnd-grip.tsx'
import { facetFlatColumnKey, parseFacetFlatColumnKey, resolveFieldType } from './fields.ts'
import { FieldGlyph } from './fsdb-cells.tsx'

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
  const anyOn = pack.fields.some((field) => visibleKeys.has(facetFlatColumnKey(pack.id, field.key)))

  return (
    <HeadlessPopover
      open={open}
      onOpenChange={setOpen}
      side="left"
      align="start"
      sideOffset={6}
      trigger={
        <button
          type="button"
          className={`fsdb-checkrow${anyOn || open ? ' is-on' : ''}`}
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${pack.label}属性`}
        >
          <span className="fsdb-checkrow-label">
            <span className="fsdb-checkrow-icon">
              <FieldGlyph kind="facet" />
            </span>
            <span className="fsdb-col-facet-name" style={tone ? { color: tagTextColor(tone) } : undefined}>
              {pack.label}
            </span>
          </span>
          <span className={`fsdb-col-facet-dot${anyOn ? ' is-on' : ''}`} aria-hidden />
        </button>
      }
    >
      <div className="fsdb-col-facet-flyout" data-fsdb-col-flyout role="menu">
        {pack.fields.length ? (
          pack.fields.map((field) => {
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
  style?: { transform?: string; transition?: string }
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
  onToggle,
  onReorder,
}: {
  columns: Array<{ key: string; kind: FieldType; field: FieldSpec }>
  allColumns: Array<{ key: string; kind: FieldType; field: FieldSpec }>
  labelField?: string
  facetCatalog: CollectionSchemaPack[]
  onToggle: (key: string) => void
  onReorder: (next: string[]) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const visibleKeys = new Set(columns.map((item) => item.key))
  const hidden = allColumns.filter((item) => !parseFacetFlatColumnKey(item.key) && !visibleKeys.has(item.key))
  const menuCols = [
    ...columns.filter((item) => item.key === labelField),
    ...columns.filter((item) => item.key !== labelField),
    ...hidden,
  ]
  const locked = new Set([labelField, 'actions'].filter(Boolean))
  const sortableIds = menuCols.filter((item) => !locked.has(item.key)).map((item) => item.key)
  const active = menuCols.find((item) => item.key === activeId)

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
      {facetCatalog.map((pack) => (
        <ColumnRowShell
          key={pack.id}
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
