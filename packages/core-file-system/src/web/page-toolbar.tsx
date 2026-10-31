import { useEffect, useRef, useState, type ReactNode } from 'react'
import { DocumentTextIcon, ListBulletIcon } from '@heroicons/react/24/outline'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { CheckRow } from './controls.tsx'
import { FlyoutEmpty, SearchableFlyout, flyoutQueryMatch } from './flyout-search.tsx'
import { LayoutPrefsMenu } from './layout-prefs-menu.tsx'
import { UiGlyph } from './nav-glyphs.tsx'
import { ViewOrderMenu } from './view-order-menu.tsx'
import { getPagePrefs } from './page-width.ts'
import {
  newPageViewId,
  PAGE_VIEW_MODES,
  readPageViewState,
  writePageViewState,
  type PageView,
  type PageViewMode,
} from './page-views.ts'
import type { SavedView } from './saved-view.ts'

function asSaved(view: PageView): SavedView {
  return {
    id: view.id,
    name: view.name,
    mode: view.mode,
    sortField: '',
    sortDir: 'asc',
    filters: {},
    columns: [],
  }
}

function ModeIcon({ mode }: { mode: PageViewMode }) {
  if (mode === 'outline') return <ListBulletIcon aria-hidden className="size-4" />
  return <DocumentTextIcon aria-hidden className="size-4" />
}

export function PageContentToolbar({
  path,
  share,
}: {
  path: string
  share?: ReactNode
}) {
  const [state, setState] = useState(() => readPageViewState(path))
  const [menu, setMenu] = useState<'view' | 'mode' | 'search' | 'filter' | 'sort' | 'config' | null>(null)
  const [renameId, setRenameId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const viewRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLDivElement>(null)
  const searchInputRef = useRef<HTMLInputElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const configRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setState(readPageViewState(path))
    setMenu(null)
  }, [path])

  const persist = (next: typeof state) => {
    setState(next)
    writePageViewState(path, next)
  }

  const active = state.views.find((view) => view.id === state.activeId) ?? state.views[0]!
  const patchActive = (patch: Partial<PageView>) => {
    persist({
      ...state,
      views: state.views.map((view) => (view.id === active.id ? { ...view, ...patch } : view)),
    })
  }

  const toggle = (next: typeof menu) => setMenu((cur) => (cur === next ? null : next))
  const searchOpen = menu === 'search' || Boolean(active.query)
  useEffect(() => {
    if (menu === 'search') searchInputRef.current?.focus()
  }, [menu])

  return (
    <div className="tasks-toolbar page-content-toolbar" data-testid="page-content-toolbar" data-biu-ignore>
      <div className="tasks-toolbar-left">
        <div className="tasks-viewdd-wrap" ref={viewRef}>
          <div className="tasks-viewtabs">
            <button
              type="button"
              className={`tasks-viewdd-btn tasks-viewtab is-active${menu === 'view' ? ' is-menu' : ''}`}
              data-testid="page-view-tab"
              aria-haspopup="menu"
              aria-expanded={menu === 'view'}
              onClick={() => toggle('view')}
            >
              <ModeIcon mode={active.mode} />
              <span className="tasks-viewdd-name">{active.name}</span>
            </button>
          </div>
          {menu === 'view' ? (
            <HeadlessDismiss onDismiss={() => setMenu(null)} insideRef={viewRef}>
              <ViewOrderMenu
                views={state.views.map(asSaved)}
                activeViewId={active.id}
                onSelect={(view) => {
                  persist({ ...state, activeId: view.id })
                  setMenu(null)
                }}
                onCopy={(view) => {
                  const source = state.views.find((item) => item.id === view.id)
                  if (!source) return
                  const copy: PageView = {
                    ...source,
                    id: newPageViewId(),
                    name: `${source.name} 副本`,
                  }
                  persist({ views: [...state.views, copy], activeId: copy.id })
                  setMenu(null)
                }}
                onRename={(view) => {
                  const source = state.views.find((item) => item.id === view.id)
                  if (!source) return
                  setRenameId(source.id)
                  setRenameDraft(source.name)
                }}
                onDelete={(view) => {
                  if (state.views.length <= 1) return
                  const views = state.views.filter((item) => item.id !== view.id)
                  persist({ views, activeId: views[0]!.id })
                }}
                onReorder={(ids) => {
                  const views = ids
                    .map((id) => state.views.find((item) => item.id === id))
                    .filter((item): item is PageView => Boolean(item))
                  persist({ ...state, views })
                }}
                onAdd={() => {
                  const next: PageView = {
                    id: newPageViewId(),
                    name: `视图 ${state.views.length + 1}`,
                    mode: 'document',
                    sort: 'doc',
                    filterLevels: [1, 2, 3],
                  }
                  persist({ views: [...state.views, next], activeId: next.id })
                  setMenu(null)
                }}
              />
            </HeadlessDismiss>
          ) : null}
        </div>
        {renameId ? (
          <form
            className="page-view-rename"
            onSubmit={(event) => {
              event.preventDefault()
              const name = renameDraft.trim()
              if (name) {
                persist({
                  ...state,
                  views: state.views.map((view) => (view.id === renameId ? { ...view, name } : view)),
                })
              }
              setRenameId(null)
            }}
          >
            <input
              className="tasks-search"
              value={renameDraft}
              aria-label="重命名视图"
              autoFocus
              onChange={(event) => setRenameDraft(event.target.value)}
              onBlur={() => setRenameId(null)}
            />
          </form>
        ) : null}
      </div>
      <div className="tasks-toolbar-right">
        <HeadlessDismiss
          enabled={menu === 'search'}
          onDismiss={() => {
            if (!active.query) setMenu(null)
          }}
        >
          <div className={`tasks-search-wrap${searchOpen ? ' is-open' : ''}`} ref={searchRef}>
            <button
              type="button"
              className={`tasks-sort-btn${searchOpen ? ' is-active' : ''}`}
              aria-label="搜索"
              title="搜索"
              onClick={() => toggle('search')}
            >
              <UiGlyph icon="search" />
            </button>
            {searchOpen ? (
              <input
                ref={searchInputRef}
                className="tasks-search"
                value={active.query ?? ''}
                placeholder="搜索页面"
                aria-label="搜索页面"
                data-testid="page-toolbar-search"
                onChange={(event) => patchActive({ query: event.target.value })}
                onKeyDown={(event) => {
                  if (event.key !== 'Escape') return
                  if (!active.query) setMenu(null)
                }}
              />
            ) : null}
          </div>
        </HeadlessDismiss>
        <div className="tasks-sort-wrap" ref={modeRef}>
          <button
            type="button"
            className={`tasks-sort-btn${menu === 'mode' ? ' is-active' : ''}`}
            aria-label="呈现方式"
            title={`呈现：${PAGE_VIEW_MODES.find((item) => item.id === active.mode)?.label ?? active.mode}`}
            onClick={() => toggle('mode')}
          >
            <ModeIcon mode={active.mode} />
          </button>
          {menu === 'mode' ? (
            <HeadlessDismiss onDismiss={() => setMenu(null)} insideRef={modeRef}>
              <SearchableFlyout className="tasks-sort-menu">
                {(q) => {
                  const hits = PAGE_VIEW_MODES.filter((item) => flyoutQueryMatch(item.label, q))
                  return (
                    <>
                      {hits.map((item) => (
                        <CheckRow
                          key={item.id}
                          icon={<ModeIcon mode={item.id} />}
                          label={item.label}
                          on={active.mode === item.id}
                          onToggle={() => {
                            patchActive({ mode: item.id })
                            setMenu(null)
                          }}
                        />
                      ))}
                      {q.trim() && !hits.length ? <FlyoutEmpty /> : null}
                      <button
                        type="button"
                        className="fsdb-mode-plus"
                        onClick={() => {
                          const next: PageView = {
                            id: newPageViewId(),
                            name: '大纲',
                            mode: 'outline',
                            sort: 'doc',
                            filterLevels: [1, 2, 3],
                          }
                          persist({ views: [...state.views, next], activeId: next.id })
                          setMenu(null)
                        }}
                      >
                        添加大纲呈现
                      </button>
                    </>
                  )
                }}
              </SearchableFlyout>
            </HeadlessDismiss>
          ) : null}
        </div>
        <div className="tasks-sort-wrap" ref={sortRef}>
          <button
            type="button"
            className={`tasks-sort-btn${menu === 'sort' ? ' is-active' : ''}${active.sort === 'title' ? ' is-custom' : ''}`}
            aria-label="排序"
            title="排序"
            onClick={() => toggle('sort')}
          >
            <UiGlyph icon="sort" />
            {active.sort === 'title' ? <span className="tasks-sort-dot" aria-hidden /> : null}
          </button>
          {menu === 'sort' ? (
            <HeadlessDismiss onDismiss={() => setMenu(null)} insideRef={sortRef}>
              <SearchableFlyout className="tasks-sort-menu">
                {(q) => {
                  const doc = flyoutQueryMatch('正文顺序', q)
                  const title = flyoutQueryMatch('按标题', q)
                  return (
                    <>
                      {doc ? (
                        <CheckRow
                          label="正文顺序"
                          on={active.sort !== 'title'}
                          onToggle={() => {
                            patchActive({ sort: 'doc' })
                            setMenu(null)
                          }}
                        />
                      ) : null}
                      {title ? (
                        <CheckRow
                          label="按标题"
                          on={active.sort === 'title'}
                          onToggle={() => {
                            patchActive({ sort: 'title' })
                            setMenu(null)
                          }}
                        />
                      ) : null}
                      {q.trim() && !doc && !title ? <FlyoutEmpty /> : null}
                    </>
                  )
                }}
              </SearchableFlyout>
            </HeadlessDismiss>
          ) : null}
        </div>
        <div className="tasks-filter-btn-wrap" ref={filterRef}>
          <button
            type="button"
            className={`tasks-refresh tasks-rbar-btn${menu === 'filter' || (active.filterLevels?.length ?? 3) < 3 ? ' is-active' : ''}`}
            aria-label="筛选"
            title="筛选"
            onClick={() => toggle('filter')}
          >
            <UiGlyph icon="filter" />
            {(active.filterLevels?.length ?? 3) < 3 ? <span className="tasks-filter-dot" aria-hidden /> : null}
          </button>
          {menu === 'filter' ? (
            <HeadlessDismiss onDismiss={() => setMenu(null)} insideRef={filterRef}>
              <SearchableFlyout className="tasks-filter-menu">
                {(q) => {
                  const rows = ([1, 2, 3] as const)
                    .map((level) => ({ level, label: `标题 ${level}` }))
                    .filter((item) => flyoutQueryMatch(item.label, q))
                  const levels = new Set(active.filterLevels ?? [1, 2, 3])
                  return (
                    <>
                      {rows.map((item) => (
                        <CheckRow
                          key={item.level}
                          label={item.label}
                          on={levels.has(item.level)}
                          onToggle={() => {
                            const next = new Set(levels)
                            if (next.has(item.level)) next.delete(item.level)
                            else next.add(item.level)
                            patchActive({ filterLevels: ([1, 2, 3] as const).filter((level) => next.has(level)) })
                          }}
                        />
                      ))}
                      {q.trim() && !rows.length ? <FlyoutEmpty /> : null}
                    </>
                  )
                }}
              </SearchableFlyout>
            </HeadlessDismiss>
          ) : null}
        </div>
        <div className="tasks-filter-btn-wrap" ref={configRef}>
          <button
            type="button"
            className={`tasks-refresh tasks-rbar-btn${menu === 'config' ? ' is-active' : ''}`}
            aria-label="页面配置"
            title="页面配置"
            data-testid="page-toolbar-config"
            onClick={() => toggle('config')}
          >
            <UiGlyph icon="sliders" />
          </button>
          {menu === 'config' ? (
            <HeadlessDismiss onDismiss={() => setMenu(null)} insideRef={configRef}>
              <LayoutPrefsMenu prefs={getPagePrefs()} testPrefix="page-toolbar-layout" className="tasks-filter-menu" />
            </HeadlessDismiss>
          ) : null}
        </div>
        {share}
      </div>
    </div>
  )
}

export function usePageViewState(path: string) {
  const [state, setState] = useState(() => readPageViewState(path))
  useEffect(() => {
    const sync = () => setState(readPageViewState(path))
    sync()
    window.addEventListener('storage', sync)
    const tick = window.setInterval(sync, 400)
    return () => {
      window.removeEventListener('storage', sync)
      window.clearInterval(tick)
    }
  }, [path])
  return state
}
