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
import { CheckIcon, LockClosedIcon, PlusIcon, Square2StackIcon, UserIcon, UsersIcon } from '@heroicons/react/16/solid'
import { overlayZ } from '@biu/biu-ui/overlay-portal'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { isReadOnlyViewId } from '../catalog-views.ts'
import { moveList } from '../query-logic.ts'
import { DndGrip } from './dnd-grip.tsx'
import { FlyoutEmpty, SearchableFlyout, flyoutQueryMatch } from './flyout-search.tsx'
import { ViewModeGlyph } from './nav-glyphs.tsx'
import { canDeleteSavedView, canEditSavedView, canRemoveCollectionView, type SavedView, type ViewProtection } from './saved-view.ts'

const PROTECTION_OPTIONS: Array<{
  value: ViewProtection
  label: string
  desc: string
  Icon: typeof UsersIcon
}> = [
  { value: 'public', label: '公共视图', desc: '所有成员可修改视图配置', Icon: UsersIcon },
  { value: 'locked', label: '锁定视图', desc: '所有成员都不可修改视图配置', Icon: LockClosedIcon },
  { value: 'personal', label: '个人视图', desc: '仅你自己可见', Icon: UserIcon },
]

function resolveViewProtection(view: SavedView): ViewProtection {
  if (view.ownerTable === 'all') return 'personal'
  if (view.protection === 'public' || view.protection === 'locked' || view.protection === 'personal') {
    return view.protection
  }
  return view.scope === 'personal' ? 'personal' : 'public'
}

function ViewRowShell({
  view,
  active,
  onSelect,
  onCopy,
  onDelete,
  onChangeProtection,
  protectionMenuOpen,
  onToggleProtectionMenu,
  canRemove,
  grip,
  rowRef,
  className,
  style,
}: {
  view: SavedView
  active: boolean
  onSelect: (view: SavedView) => void
  onCopy: (view: SavedView) => void
  onDelete: (view: SavedView) => void
  onChangeProtection?: (view: SavedView, protection: ViewProtection) => void
  protectionMenuOpen?: boolean
  onToggleProtectionMenu?: () => void
  canRemove: boolean
  grip: ReactNode
  rowRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) {
  const isBuiltin = Boolean(view.builtin) || isReadOnlyViewId(view.id)
  const protection = resolveViewProtection(view)
  const meta = PROTECTION_OPTIONS.find((item) => item.value === protection) ?? PROTECTION_OPTIONS[0]!
  const ProtectionIcon = meta.Icon
  const canSwitchProtection = Boolean(
    !isBuiltin &&
      view.ownerTable !== 'all' &&
      onChangeProtection &&
      (canEditSavedView(view) || canDeleteSavedView(view)),
  )
  return (
    <div ref={rowRef} style={style}>
      <div
        className={`tasks-viewdd-item${active ? ' is-active' : ''}${className ? ` ${className}` : ''}`}
      >
        {grip}
        <button
          type="button"
          className="tasks-viewdd-item-main fsdb-tool-row"
          onClick={() => onSelect(view)}
        >
          <ViewModeGlyph mode={view.mode} className="tasks-viewdd-item-ico" />
          <span className="tasks-viewdd-item-name font-medium">{view.name}</span>
        </button>
        <span className="tasks-viewdd-item-actions">
          {!isBuiltin ? (
            <button
              type="button"
              className="tasks-viewdd-act"
              data-testid={`view-protection-btn-${view.id}`}
              title={
                view.ownerTable === 'all'
                  ? '个人视图（跨表汇总仅你自己可见）'
                  : `${meta.label}：${meta.desc}`
              }
              style={{
                opacity: protection === 'public' ? 0.65 : 1,
                color: protection === 'locked' ? 'var(--biu-color-emphasis)' : undefined,
                cursor: canSwitchProtection ? 'pointer' : 'default',
              }}
              onClick={(event) => {
                event.stopPropagation()
                if (canSwitchProtection) onToggleProtectionMenu?.()
              }}
            >
              <ProtectionIcon aria-hidden className="size-[14px]" />
            </button>
          ) : null}
          <button type="button" className="tasks-viewdd-act" title="拷贝视图" onClick={() => onCopy(view)}>
            <Square2StackIcon aria-hidden className="size-[14px]" />
          </button>
          {canRemove && !isBuiltin ? (
            <button type="button" className="tasks-viewdd-act is-danger" title="删除" onClick={() => onDelete(view)}>
              <TrashGlyph aria-hidden className="size-[14px]" />
            </button>
          ) : null}
        </span>
      </div>
      {protectionMenuOpen && canSwitchProtection ? (
        <div
          data-testid={`view-protection-menu-${view.id}`}
          style={{
            margin: '4px 6px 6px 26px',
            padding: 4,
            borderRadius: 8,
            background: 'var(--biu-color-bg-input)',
            border: 'var(--biu-stroke-width) solid var(--biu-color-border)',
            display: 'flex',
            flexDirection: 'column',
            gap: 2,
          }}
        >
          {PROTECTION_OPTIONS.map((opt) => {
            const Icon = opt.Icon
            const selected = protection === opt.value
            return (
              <button
                key={opt.value}
                type="button"
                data-testid={`view-protection-opt-${opt.value}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onChangeProtection?.(view, opt.value)
                  onToggleProtectionMenu?.()
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '6px 8px',
                  borderRadius: 6,
                  border: 'none',
                  background: selected ? 'var(--biu-color-bg-hover)' : 'transparent',
                  color: 'var(--biu-color-text)',
                  textAlign: 'left',
                  cursor: 'pointer',
                  width: '100%',
                }}
              >
                <Icon aria-hidden className="size-[15px] shrink-0" style={{ opacity: 0.85 }} />
                <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 1 }}>
                  <span style={{ fontSize: 12.5, fontWeight: 500, lineHeight: 1.25 }}>{opt.label}</span>
                  <span style={{ fontSize: 11, color: 'var(--biu-color-text-muted)', lineHeight: 1.25 }}>{opt.desc}</span>
                </span>
                {selected ? (
                  <CheckIcon aria-hidden className="size-[14px] shrink-0" style={{ color: 'var(--biu-color-emphasis)' }} />
                ) : null}
              </button>
            )
          })}
        </div>
      ) : null}
    </div>
  )
}

function SortableViewRow({
  view,
  active,
  onSelect,
  onCopy,
  onDelete,
  onChangeProtection,
  protectionMenuOpen,
  onToggleProtectionMenu,
  canRemove,
}: {
  view: SavedView
  active: boolean
  onSelect: (view: SavedView) => void
  onCopy: (view: SavedView) => void
  onDelete: (view: SavedView) => void
  onChangeProtection?: (view: SavedView, protection: ViewProtection) => void
  protectionMenuOpen?: boolean
  onToggleProtectionMenu?: () => void
  canRemove: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: view.id })
  return (
    <ViewRowShell
      view={view}
      active={active}
      onSelect={onSelect}
      onCopy={onCopy}
      onDelete={onDelete}
      onChangeProtection={onChangeProtection}
      protectionMenuOpen={protectionMenuOpen}
      onToggleProtectionMenu={onToggleProtectionMenu}
      canRemove={canRemove}
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
  onDelete,
  onChangeProtection,
  onReorder,
  onAdd,
}: {
  views: SavedView[]
  activeViewId: string | null
  onSelect: (view: SavedView) => void
  onCopy: (view: SavedView) => void
  onDelete: (view: SavedView) => void
  onChangeProtection?: (view: SavedView, protection: ViewProtection) => void
  onReorder: (ids: string[]) => void
  onAdd: () => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [protectionOpenId, setProtectionOpenId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))
  const ids = views.map((view) => view.id)
  const canRemove = canRemoveCollectionView(views)
  const active = views.find((view) => view.id === activeId)
  const foot = (
    <div className="tasks-viewdd-foot">
      <button type="button" className="tasks-viewdd-saveas fsdb-tool-row font-medium" onClick={onAdd}>
        <PlusIcon aria-hidden className="size-[14px]" />
        添加视图
      </button>
    </div>
  )

  return (
    <SearchableFlyout className="tasks-viewdd-menu">
      {(q) => {
        const hits = views.filter((view) => flyoutQueryMatch(view.name, q))
        const searching = Boolean(q.trim())
        if (!views.length) {
          return (
            <>
              <div className="tasks-viewdd-empty">还没有已保存的视图</div>
              {foot}
            </>
          )
        }
        if (searching) {
          return (
            <>
              {hits.length ? (
                hits.map((view) => (
                  <ViewRowShell
                    key={view.id}
                    view={view}
                    active={view.id === activeViewId}
                    onSelect={onSelect}
                    onCopy={onCopy}
                    onDelete={onDelete}
                    onChangeProtection={onChangeProtection}
                    protectionMenuOpen={protectionOpenId === view.id}
                    onToggleProtectionMenu={() =>
                      setProtectionOpenId((prev) => (prev === view.id ? null : view.id))
                    }
                    canRemove={canRemove && canDeleteSavedView(view)}
                    grip={
                      <span className="fsdb-query-grip is-locked" aria-hidden>
                        <DndGrip />
                      </span>
                    }
                  />
                ))
              ) : (
                <FlyoutEmpty />
              )}
              {foot}
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
                    onDelete={onDelete}
                    onChangeProtection={onChangeProtection}
                    protectionMenuOpen={protectionOpenId === view.id}
                    onToggleProtectionMenu={() =>
                      setProtectionOpenId((prev) => (prev === view.id ? null : view.id))
                    }
                    canRemove={canRemove && canDeleteSavedView(view)}
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
                      onDelete={() => undefined}
                      canRemove={canRemove}
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
            {foot}
          </>
        )
      }}
    </SearchableFlyout>
  )
}
