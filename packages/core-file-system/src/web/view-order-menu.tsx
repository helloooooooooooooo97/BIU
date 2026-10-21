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
import { PencilSquareIcon, PlusIcon, Square2StackIcon } from '@heroicons/react/16/solid'
import { overlayZ } from '@biu/public-ui/overlay-portal'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { moveList } from '../query-logic.ts'
import { DndGrip } from './dnd-grip.tsx'
import type { SavedView } from './saved-view.ts'

function ViewRowShell({
  view,
  active,
  onSelect,
  onCopy,
  onRename,
  onDelete,
  onWarm,
  grip,
  rowRef,
  className,
  style,
}: {
  view: SavedView
  active: boolean
  onSelect: (view: SavedView) => void
  onCopy: (view: SavedView) => void
  onRename: (view: SavedView) => void
  onDelete: (view: SavedView) => void
  onWarm?: (view: SavedView) => void
  grip: ReactNode
  rowRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) {
  return (
    <div
      ref={rowRef}
      className={`tasks-viewdd-item${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      style={style}
    >
      {grip}
      <button
        type="button"
        className="tasks-viewdd-item-main"
        onPointerEnter={() => onWarm?.(view)}
        onClick={() => onSelect(view)}
      >
        <span className="tasks-viewdd-item-name">{view.name}</span>
      </button>
      <span className="tasks-viewdd-item-actions">
        <button type="button" className="tasks-viewdd-act" title="拷贝视图" onClick={() => onCopy(view)}>
          <Square2StackIcon aria-hidden className="size-[14px]" />
        </button>
        {view.builtin ? null : (
          <>
            <button type="button" className="tasks-viewdd-act" title="重命名" onClick={() => onRename(view)}>
              <PencilSquareIcon aria-hidden className="size-[14px]" />
            </button>
            <button type="button" className="tasks-viewdd-act is-danger" title="删除" onClick={() => onDelete(view)}>
              <TrashGlyph aria-hidden className="size-[14px]" />
            </button>
          </>
        )}
      </span>
    </div>
  )
}

function SortableViewRow({
  view,
  active,
  onSelect,
  onCopy,
  onRename,
  onDelete,
  onWarm,
}: {
  view: SavedView
  active: boolean
  onSelect: (view: SavedView) => void
  onCopy: (view: SavedView) => void
  onRename: (view: SavedView) => void
  onDelete: (view: SavedView) => void
  onWarm?: (view: SavedView) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: view.id })
  return (
    <ViewRowShell
      view={view}
      active={active}
      onSelect={onSelect}
      onCopy={onCopy}
      onRename={onRename}
      onDelete={onDelete}
      onWarm={onWarm}
      rowRef={setNodeRef}
      className={isDragging ? 'is-drag' : undefined}
      style={{ transform: DndCSS.Transform.toString(transform), transition }}
      grip={
        <button type="button" className="fsdb-query-grip" aria-label="拖动调整视图顺序" {...attributes} {...listeners}>
          <DndGrip />
        </button>
      }
    />
  )
}

export function ViewOrderMenu({
  views,
  activeViewId,
  onSelect,
  onCopy,
  onRename,
  onDelete,
  onReorder,
  onAdd,
  onWarm,
}: {
  views: SavedView[]
  activeViewId: string | null
  onSelect: (view: SavedView) => void
  onCopy: (view: SavedView) => void
  onRename: (view: SavedView) => void
  onDelete: (view: SavedView) => void
  onReorder: (ids: string[]) => void
  onAdd: () => void
  onWarm?: (view: SavedView) => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const ids = views.map((view) => view.id)
  const active = views.find((view) => view.id === activeId)

  return (
    <div className="tasks-viewdd-menu" role="menu">
      <div className="tasks-viewdd-head">视图</div>
      {views.length === 0 ? <div className="tasks-viewdd-empty">还没有已保存的视图</div> : null}
      {views.length ? (
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
            const from = ids.indexOf(String(event.active.id))
            const to = ids.indexOf(String(overId))
            if (from < 0 || to < 0) return
            onReorder(moveList(ids, from, to))
          }}
        >
          <SortableContext items={ids} strategy={verticalListSortingStrategy}>
            {views.map((view) => (
              <SortableViewRow
                key={view.id}
                view={view}
                active={view.id === activeViewId}
                onSelect={onSelect}
                onCopy={onCopy}
                onRename={onRename}
                onDelete={onDelete}
                onWarm={onWarm}
              />
            ))}
          </SortableContext>
          <DragOverlay zIndex={overlayZ(280)}>
            {active ? (
              <div className="fsdb-query-drag-overlay" data-fsdb-sort-overlay>
                <ViewRowShell
                  view={active}
                  active={active.id === activeViewId}
                  onSelect={() => undefined}
                  onCopy={() => undefined}
                  onRename={() => undefined}
                  onDelete={() => undefined}
                  grip={
                    <button type="button" className="fsdb-query-grip" tabIndex={-1}>
                      <DndGrip />
                    </button>
                  }
                />
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      ) : null}
      <div className="tasks-viewdd-foot">
        <button type="button" className="tasks-viewdd-saveas" onClick={onAdd}>
          <PlusIcon aria-hidden className="size-[14px]" />
          添加视图
        </button>
      </div>
    </div>
  )
}
