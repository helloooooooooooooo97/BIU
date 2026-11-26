import { lazy, memo, Suspense, type ComponentProps, type RefObject } from 'react'
import { EllipsisHorizontalIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import type { CollectionSchema, DbRecord } from '@biu/type-file-system'
import { CrumbTrail } from './crumb-trail.tsx'
import type { Crumb, CrumbTarget } from './sidebar-nav.ts'
import type { QueryField } from './query-menus.tsx'
import type { SavedView } from './saved-view.ts'
import {
  PLUGINS_COLLECTION_PATH,
  isIndexCollection,
  isSystemCollection,
} from './database-path.ts'
import { EXPAND_SHELL_SIDEBAR_EVENT, INSPECTOR_TOGGLE_EVENT } from './fsdb-events.ts'
import { UiGlyph } from './nav-glyphs.tsx'
import type { PagePrefs } from './page-width.ts'
import {
  getStarredViews,
  persistStarredViews,
  toggleStarredView,
} from './view-storage.ts'

const LazyShareButton = lazy(() => import('./share-popover.tsx').then((m) => ({ default: m.ShareButton })))
const LazyAccessRulesButton = lazy(() => import('./access-rules-drawer.tsx').then((m) => ({ default: m.AccessRulesButton })))
const LayoutPrefsMenu = lazy(() => import('./layout-prefs-menu.tsx').then((m) => ({ default: m.LayoutPrefsMenu })))

function ShareButton(props: ComponentProps<typeof LazyShareButton>) {
  return (
    <Suspense fallback={null}>
      <LazyShareButton {...props} />
    </Suspense>
  )
}

function AccessRulesButton(props: ComponentProps<typeof LazyAccessRulesButton>) {
  return (
    <Suspense fallback={null}>
      <LazyAccessRulesButton {...props} />
    </Suspense>
  )
}

export const BrowserHeader = memo(function BrowserHeader({
  sidebarGone,
  crumbs,
  canCreate,
  collectionPath,
  views,
  activeViewId,
  activeView,
  selected,
  detailId,
  detailRow,
  title,
  nested,
  localData,
  hideAccessRules,
  schema,
  filterFields,
  filterValueOptions,
  viewStarred,
  layoutOpen,
  layoutRef,
  inspectorOpen,
  pagePrefs,
  crumbRef,
  onCreateRecord,
  onAddEmptyView,
  onSelectView,
  onCrumbTarget,
  onToggleLayout,
  onCloseLayout,
}: {
  sidebarGone: boolean
  crumbs: Crumb[]
  canCreate: boolean
  collectionPath: string
  views: SavedView[]
  activeViewId: string | null
  activeView?: SavedView
  selected: DbRecord | null
  detailId: string | null
  detailRow: DbRecord | null
  title: string
  nested: boolean
  localData: boolean
  hideAccessRules?: boolean
  schema?: CollectionSchema
  filterFields?: QueryField[]
  filterValueOptions?: (field: QueryField) => Array<{ value: string; label: string }>
  viewStarred: boolean
  layoutOpen: boolean
  layoutRef: RefObject<HTMLDivElement | null>
  inspectorOpen: boolean
  pagePrefs: PagePrefs
  crumbRef: RefObject<HTMLElement | null>
  onCreateRecord: () => void
  onAddEmptyView: () => void
  onSelectView: (view: SavedView) => void
  onCrumbTarget?: (target: CrumbTarget) => void
  onToggleLayout: () => void
  onCloseLayout: () => void
}) {
  return (
    <header className="chat-view-header" data-biu-ignore>
      <div className="chat-view-header-left">
        {sidebarGone ? (
          <button
            type="button"
            className="chat-view-header-expand"
            title="展开左侧边栏"
            aria-label="展开左侧边栏"
            data-testid="header-sidebar-expand"
            onClick={() => window.dispatchEvent(new Event(EXPAND_SHELL_SIDEBAR_EVENT))}
          >
            <UiGlyph icon="chevron-double-right" />
          </button>
        ) : null}
        <CrumbTrail
          crumbs={crumbs}
          canCreateView
          canCreateRecord={canCreate}
          onCreate={(kind) => {
            if (kind === 'record') onCreateRecord()
            else onAddEmptyView()
          }}
          onPick={(target) => {
            if (target.kind === 'view' && target.collection === collectionPath) {
              const view = views.find((item) => item.id === target.viewId)
              if (view) onSelectView(view)
              return
            }
            onCrumbTarget?.(target)
          }}
          navRef={crumbRef}
        />
      </div>
      <div className="chat-view-header-right">
        {activeViewId && !selected ? (
          <button
            type="button"
            className={`chat-view-header-expand${viewStarred ? ' is-starred' : ''}`}
            title={viewStarred ? '取消收藏视图' : '收藏视图'}
            aria-label={viewStarred ? '取消收藏视图' : '收藏视图'}
            aria-pressed={viewStarred}
            onClick={() => persistStarredViews(toggleStarredView(getStarredViews(), collectionPath, activeViewId, activeView?.name))}
          >
            <UiGlyph icon="star" />
          </button>
        ) : null}
        {isSystemCollection(collectionPath) || isIndexCollection(collectionPath) || (collectionPath === PLUGINS_COLLECTION_PATH && detailRow?.builtin === true) ? null : detailId ? (
          <ShareButton
            localOnly={localData}
            target={{
              kind: 'record' as const,
              collection: collectionPath,
              viewId: activeViewId ?? undefined,
              recordId: detailId,
              title: String(detailRow?.title ?? title),
            }}
          />
        ) : !nested && !localData && !hideAccessRules ? (
          <AccessRulesButton
            collectionPath={collectionPath}
            activeView={activeView}
            schema={schema}
            filterFields={filterFields ?? []}
            filterValueOptions={filterValueOptions ?? (() => [])}
            localOnly={localData}
          />
        ) : null}
        <div className="fsdb-layout-wrap" ref={layoutRef}>
          <button
            type="button"
            className={`chat-view-header-expand${layoutOpen ? ' is-active' : ''}`}
            title="配置"
            aria-label="配置"
            aria-haspopup="menu"
            aria-expanded={layoutOpen}
            data-testid="fsdb-layout-toggle"
            onClick={onToggleLayout}
          >
            <EllipsisHorizontalIcon aria-hidden className="size-4" />
          </button>
          {layoutOpen ? (
            <HeadlessDismiss onDismiss={onCloseLayout} insideRef={layoutRef}>
              <Suspense fallback={null}>
                <LayoutPrefsMenu prefs={pagePrefs} />
              </Suspense>
            </HeadlessDismiss>
          ) : null}
        </div>
        <button
          type="button"
          className={`chat-view-header-expand${inspectorOpen ? ' is-active' : ''}`}
          title={inspectorOpen ? '收起检查器' : '打开检查器'}
          aria-label={inspectorOpen ? '收起检查器' : '打开检查器'}
          aria-pressed={inspectorOpen}
          data-testid="fsdb-inspector-toggle"
          onClick={() => window.dispatchEvent(new Event(INSPECTOR_TOGGLE_EVENT))}
        >
          <UiGlyph icon={inspectorOpen ? 'chevron-double-right' : 'chevron-double-left'} />
        </button>
      </div>
    </header>
  )
})
