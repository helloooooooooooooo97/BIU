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
import {
  LockClosedIcon,
  LockOpenIcon,
  PlusIcon,
  Square2StackIcon,
  UserGroupIcon,
  UserIcon,
  UsersIcon,
} from '@heroicons/react/16/solid'
import { overlayZ } from '@biu/biu-ui/overlay-portal'
import { TrashGlyph } from '@biu/web-session-view/trash-glyph'
import { moveList } from '../query-logic.ts'
import { DndGrip } from './dnd-grip.tsx'
import { FlyoutEmpty, SearchableFlyout, flyoutQueryMatch } from './flyout-search.tsx'
import { ViewModeGlyph } from './nav-glyphs.tsx'
import {
  canDeleteSavedView,
  canManageSavedView,
  canRemoveCollectionView,
  type SavedView,
  type ViewShareScope,
} from './saved-view.ts'

export function viewScopeMeta(
  view: Pick<SavedView, 'shareScope' | 'locked' | 'ephemeral'>,
  opts?: { isMembersCollection?: boolean },
) {
  const scope: ViewShareScope = view.shareScope ?? 'workspace'
  const ScopeIcon = scope === 'personal' ? UserIcon : scope === 'shared' ? UsersIcon : UserGroupIcon
  const scopeLabel =
    scope === 'personal'
      ? '私人视图'
      : scope === 'shared'
        ? '共享视图'
        : '空间视图'
  const scopeDesc =
    scope === 'personal'
      ? '私人视图 · 仅自己可见'
      : scope === 'shared'
        ? '共享视图 · 指定成员可见'
        : '空间视图 · 全员可见'
  const lockSuffix = view.locked
    ? opts?.isMembersCollection
      ? ' · 动态成员组（管理员锁定）'
      : ' · 已锁定配置'
    : ''
  return {
    scope,
    ScopeIcon,
    scopeLabel,
    title: `${scopeDesc}${lockSuffix}`,
  }
}

export function ViewStatusBadge({
  view,
  isCloud = true,
  isMembersCollection = false,
  className,
}: {
  view: Pick<SavedView, 'shareScope' | 'locked' | 'ephemeral'>
  isCloud?: boolean
  isMembersCollection?: boolean
  className?: string
}) {
  const { scope, ScopeIcon, scopeLabel, title } = viewScopeMeta(view, { isMembersCollection })
  if (!isCloud && !view.locked) return null
  return (
    <span
      className={['tasks-viewdd-protection', `is-${scope}`, view.locked ? 'is-locked' : '', className].filter(Boolean).join(' ')}
      data-testid="fsdb-view-tab-status"
      data-scope={scope}
      data-locked={view.locked ? '1' : '0'}
      title={title}
      aria-label={scopeLabel}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
    >
      {view.locked ? (
        <LockClosedIcon aria-hidden className="size-[14px]" style={{ color: 'var(--biu-color-emphasis)' }} />
      ) : null}
      {isCloud ? <ScopeIcon aria-hidden className="size-[14px]" /> : null}
    </span>
  )
}

function ViewRowShell({
  view,
  active,
  isCloud,
  isMembersCollection,
  onSelect,
  onCopy,
  onDelete,
  onToggleLock,
  onOpenShare,
  canRemove,
  grip,
  rowRef,
  className,
  style,
}: {
  view: SavedView
  active: boolean
  isCloud?: boolean
  isMembersCollection?: boolean
  onSelect: (view: SavedView) => void
  onCopy: (view: SavedView) => void
  onDelete: (view: SavedView) => void
  onToggleLock?: (view: SavedView) => void
  onOpenShare?: (view: SavedView) => void
  canRemove: boolean
  grip: ReactNode
  rowRef?: (node: HTMLElement | null) => void
  className?: string
  style?: CSSProperties
}) {
  const { scope, ScopeIcon, scopeLabel, title: scopeTitle } = viewScopeMeta(view, { isMembersCollection })
  const canLock = Boolean(!view.ephemeral && onToggleLock && canManageSavedView(view))
  const lockTitle = view.locked
    ? isMembersCollection
      ? '已锁定 · 动态成员组（点击解锁）'
      : '已锁定配置（点击解锁）'
    : isMembersCollection
      ? '锁定为管理员动态成员组'
      : '锁定视图配置（防误改）'

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
          {canLock || view.locked ? (
            <button
              type="button"
              className={`tasks-viewdd-act${view.locked ? ' is-locked' : ''}`}
              data-testid={`view-lock-btn-${view.id}`}
              data-locked={view.locked ? '1' : '0'}
              title={lockTitle}
              aria-label={view.locked ? '解锁视图' : '锁定视图'}
              disabled={!canLock}
              style={{
                color: view.locked ? 'var(--biu-color-emphasis)' : undefined,
                cursor: canLock ? 'pointer' : 'default',
              }}
              onClick={(event) => {
                event.stopPropagation()
                if (canLock) onToggleLock?.(view)
              }}
            >
              {view.locked ? <LockClosedIcon aria-hidden className="size-[14px]" /> : <LockOpenIcon aria-hidden className="size-[14px]" />}
            </button>
          ) : null}
          {isCloud && !view.ephemeral ? (
            <button
              type="button"
              className="tasks-viewdd-act"
              data-testid={`view-scope-btn-${view.id}`}
              data-scope={scope}
              title={onOpenShare ? `${scopeTitle}（点击管理分享）` : scopeTitle}
              aria-label={scopeLabel}
              style={{ cursor: onOpenShare ? 'pointer' : 'default' }}
              onClick={(event) => {
                event.stopPropagation()
                onOpenShare?.(view)
              }}
            >
              <ScopeIcon aria-hidden className="size-[14px]" />
            </button>
          ) : null}
          <button type="button" className="tasks-viewdd-act" title="拷贝视图" onClick={() => onCopy(view)}>
            <Square2StackIcon aria-hidden className="size-[14px]" />
          </button>
          {canRemove && !view.ephemeral ? (
            <button type="button" className="tasks-viewdd-act is-danger" title="删除" onClick={() => onDelete(view)}>
              <TrashGlyph aria-hidden className="size-[14px]" />
            </button>
          ) : null}
        </span>
      </div>
    </div>
  )
}

function SortableViewRow({
  view,
  active,
  isCloud,
  isMembersCollection,
  onSelect,
  onCopy,
  onDelete,
  onToggleLock,
  onOpenShare,
  canRemove,
}: {
  view: SavedView
  active: boolean
  isCloud?: boolean
  isMembersCollection?: boolean
  onSelect: (view: SavedView) => void
  onCopy: (view: SavedView) => void
  onDelete: (view: SavedView) => void
  onToggleLock?: (view: SavedView) => void
  onOpenShare?: (view: SavedView) => void
  canRemove: boolean
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: view.id })
  return (
    <ViewRowShell
      view={view}
      active={active}
      isCloud={isCloud}
      isMembersCollection={isMembersCollection}
      onSelect={onSelect}
      onCopy={onCopy}
      onDelete={onDelete}
      onToggleLock={onToggleLock}
      onOpenShare={onOpenShare}
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
  isCloud = true,
  isMembersCollection = false,
  onSelect,
  onCopy,
  onDelete,
  onToggleLock,
  onOpenShare,
  onReorder,
  onAdd,
}: {
  views: SavedView[]
  activeViewId: string | null
  isCloud?: boolean
  isMembersCollection?: boolean
  onSelect: (view: SavedView) => void
  onCopy: (view: SavedView) => void
  onDelete: (view: SavedView) => void
  onToggleLock?: (view: SavedView) => void
  onOpenShare?: (view: SavedView) => void
  onReorder: (ids: string[]) => void
  onAdd: () => void
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
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
                    isCloud={isCloud}
                    isMembersCollection={isMembersCollection}
                    onSelect={onSelect}
                    onCopy={onCopy}
                    onDelete={onDelete}
                    onToggleLock={onToggleLock}
                    onOpenShare={onOpenShare}
                    canRemove={canRemove && canDeleteSavedView(view) && canRemoveCollectionView(views, view)}
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
                    isCloud={isCloud}
                    isMembersCollection={isMembersCollection}
                    onSelect={onSelect}
                    onCopy={onCopy}
                    onDelete={onDelete}
                    onToggleLock={onToggleLock}
                    onOpenShare={onOpenShare}
                    canRemove={canRemove && canDeleteSavedView(view) && canRemoveCollectionView(views, view)}
                  />
                ))}
              </SortableContext>
              <DragOverlay zIndex={overlayZ(280)}>
                {active ? (
                  <div className="fsdb-query-drag-overlay" data-fsdb-sort-overlay>
                    <ViewRowShell
                      view={active}
                      active={active.id === activeViewId}
                      isCloud={isCloud}
                      isMembersCollection={isMembersCollection}
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
