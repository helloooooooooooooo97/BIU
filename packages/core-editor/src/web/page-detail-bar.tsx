import { useEffect, useRef, useState } from 'react'
import { HeadlessDismiss } from '@biu/biu-ui'
import type { FsDetailBarProps } from '@biu/type-file-system/ui'
import {
  ArrowPathIcon,
  CodeBracketIcon,
  DocumentTextIcon,
  EyeIcon,
  FunnelIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  TableCellsIcon,
  AdjustmentsHorizontalIcon,
  UserIcon,
  UsersIcon,
  GlobeAltIcon,
} from '@heroicons/react/16/solid'
import { setPagePresentMode, usePagePresentMode } from './source-mode.ts'
import { kindLabel } from './block-id.ts'
import {
  PAGE_FIND_OPEN_EVENT,
  PAGE_INSERT_EVENT,
  pageFilterActive,
  patchPageViewState,
  usePageViewState,
  type PageSort,
} from './page-view-state.ts'
import { useStickyToolbar } from './sticky-toolbar.ts'

const MODES = [
  { id: 'doc' as const, label: '文档', Icon: DocumentTextIcon },
  { id: 'outline' as const, label: '大纲', Icon: ListBulletIcon },
  { id: 'table' as const, label: '表格', Icon: TableCellsIcon },
  { id: 'source' as const, label: '源码', Icon: CodeBracketIcon },
]

const KINDS = ['paragraph', 'heading', 'bulletList', 'orderedList', 'blockquote', 'codeBlock', 'table', 'pageBlock', 'slide', 'blockMath', 'image']

const SORTS: { id: PageSort; label: string }[] = [
  { id: 'doc', label: '原文顺序' },
  { id: 'title-asc', label: '按标题 A→Z' },
  { id: 'title-desc', label: '按标题 Z→A' },
  { id: 'kind', label: '按块类型' },
]

function Row({
  label,
  on,
  onToggle,
}: {
  label: string
  on: boolean
  onToggle: () => void
}) {
  return (
    <button type="button" role="menuitemcheckbox" aria-checked={on} className={`fsdb-checkrow fsdb-tool-row${on ? ' is-on' : ''}`} onClick={onToggle}>
      <span className="fsdb-checkrow-label">{label}</span>
    </button>
  )
}

export function PageDetailBar({
  record,
  schema,
  collectionPath,
  hiddenPropertyKeys = [],
  onHiddenPropertyKeys,
  visiblePropertyKeys,
  onVisiblePropertyKeys,
  onRetry,
  configMenu,
}: FsDetailBarProps) {
  const present = usePagePresentMode(record.id)
  const view = usePageViewState(record.id)
  const [open, setOpen] = useState<string | null>(null)
  const [scopeOpen, setScopeOpen] = useState(false)
  const [scope, setScope] = useState<'personal' | 'workspace' | 'shared'>('personal')
  const [creating, setCreating] = useState(false)
  const viewRef = useRef<HTMLDivElement>(null)
  const modeRef = useRef<HTMLDivElement>(null)
  const sortRef = useRef<HTMLDivElement>(null)
  const filterRef = useRef<HTMLDivElement>(null)
  const columnRef = useRef<HTMLDivElement>(null)
  const configRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  useStickyToolbar(toolbarRef)
  const current = MODES.find((item) => item.id === present) ?? MODES[0]
  const CurrentIcon = current.Icon
  const filterOn = pageFilterActive(view)
  const sortOn = view.sort !== 'doc'
  const props = Object.entries(schema?.fields ?? {})
    .filter(([key, field]) => key !== 'emoji' && key !== schema?.labelField && field.type !== 'file')
    .map(([key, field]) => ({ key, label: field.label ?? key }))
  const visibleKeys = visiblePropertyKeys ?? props.map((item) => item.key).filter((key) => !hiddenPropertyKeys.includes(key))

  useEffect(() => {
    setOpen(null)
  }, [record.id])

  const toggle = (next: string) => setOpen((prev) => (prev === next ? null : next))

  const createPage = async () => {
    if (creating) return
    setCreating(true)
    try {
      const res = await fetch('/api/db/create', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ path: collectionPath || '/pages', records: [{}], scope }),
      })
      const data = (await res.json()) as { items?: Array<{ value?: { id?: string } }> }
      const id = data.items?.[0]?.value?.id
      if (id) window.dispatchEvent(new CustomEvent('fsdb:change'))
    } finally {
      setCreating(false)
      setScopeOpen(false)
    }
  }

  return (
    <div
      className="tasks-toolbar"
      ref={toolbarRef}
      data-testid="fsdb-page-detail-bar"
      data-biu-ignore
      onMouseDown={(event) => {
        if ((event.target as HTMLElement).closest('button,input,textarea,[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"]')) {
          event.preventDefault()
        }
      }}
    >
      <div className="tasks-toolbar-left">
        <div className="tasks-viewdd-wrap" ref={viewRef}>
          <div className="tasks-viewtabs">
            <button
              type="button"
              className={`tasks-viewdd-btn tasks-viewtab is-active${open === 'view' ? ' is-menu' : ''}`}
              aria-haspopup="menu"
              aria-expanded={open === 'view'}
              onClick={() => toggle('view')}
            >
              <CurrentIcon aria-hidden className="size-[14px]" />
              <span className="tasks-viewdd-name">{current.label}</span>
            </button>
          </div>
          {open === 'view' ? (
            <HeadlessDismiss onDismiss={() => setOpen(null)} insideRef={viewRef}>
              <div className="tasks-viewdd" role="menu">
                {MODES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={item.id === current.id}
                    className={`tasks-viewdd-item-main${item.id === current.id ? ' is-active' : ''}`}
                    onClick={() => {
                      setPagePresentMode(record.id, item.id)
                      setOpen(null)
                    }}
                  >
                    <item.Icon aria-hidden className="tasks-viewdd-item-ico" />
                    <span className="tasks-viewdd-item-name">{item.label}</span>
                  </button>
                ))}
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
      </div>
      <div className="tasks-toolbar-right">
        <button
          type="button"
          className="tasks-sort-btn"
          aria-label="搜索"
          title="搜索"
          onClick={() => window.dispatchEvent(new CustomEvent(PAGE_FIND_OPEN_EVENT, { detail: { recordId: record.id } }))}
        >
          <MagnifyingGlassIcon aria-hidden className="size-[14px]" />
        </button>
        <div className="tasks-sort-wrap" ref={modeRef}>
          <button
            type="button"
            className={`tasks-sort-btn${open === 'mode' ? ' is-active' : ''}`}
            aria-label="查看模式"
            title="呈现方式"
            onClick={() => toggle('mode')}
          >
            <CurrentIcon aria-hidden className="size-[14px]" />
          </button>
          {open === 'mode' ? (
            <HeadlessDismiss onDismiss={() => setOpen(null)} insideRef={modeRef}>
              <div className="tasks-sort-menu fsdb-tool-flyout" role="menu">
                {MODES.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    role="menuitemradio"
                    aria-checked={item.id === current.id}
                    className={`tasks-viewdd-item-main fsdb-tool-row${item.id === current.id ? ' is-active' : ''}`}
                    onClick={() => {
                      setPagePresentMode(record.id, item.id)
                      setOpen(null)
                    }}
                  >
                    <item.Icon aria-hidden className="tasks-viewdd-item-ico" />
                    <span className="tasks-viewdd-item-name">{item.label}</span>
                  </button>
                ))}
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
        <div className="tasks-sort-wrap" ref={sortRef}>
          <button
            type="button"
            className={`tasks-sort-btn${open === 'sort' || sortOn ? ' is-active' : ''}${sortOn ? ' is-custom' : ''}`}
            aria-label="排序"
            title="排序"
            onClick={() => toggle('sort')}
          >
            <span aria-hidden className="fsdb-ui-glyph" data-icon="sort" />
            {sortOn ? <span className="tasks-sort-dot" aria-hidden /> : null}
          </button>
          {open === 'sort' ? (
            <HeadlessDismiss onDismiss={() => setOpen(null)} insideRef={sortRef}>
              <div className="tasks-sort-menu fsdb-tool-flyout" role="menu">
                {SORTS.map((item) => (
                  <Row
                    key={item.id}
                    label={item.label}
                    on={view.sort === item.id}
                    onToggle={() => patchPageViewState(record.id, { sort: item.id })}
                  />
                ))}
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
        <div className="tasks-filter-btn-wrap" ref={filterRef}>
          <button
            type="button"
            className={`tasks-refresh tasks-rbar-btn${open === 'filter' || filterOn ? ' is-active' : ''}`}
            aria-label="筛选"
            title="筛选"
            onClick={() => toggle('filter')}
          >
            <FunnelIcon aria-hidden className="size-[14px]" />
            {filterOn ? <span className="tasks-filter-dot" aria-hidden /> : null}
          </button>
          {open === 'filter' ? (
            <HeadlessDismiss onDismiss={() => setOpen(null)} insideRef={filterRef}>
              <div className="tasks-filter-menu fsdb-tool-flyout" role="menu">
                <Row
                  label="全部类型"
                  on={!filterOn}
                  onToggle={() => patchPageViewState(record.id, { filterKinds: [] })}
                />
                {KINDS.map((kind) => (
                  <Row
                    key={kind}
                    label={kindLabel(kind)}
                    on={view.filterKinds.includes(kind)}
                    onToggle={() => {
                      const has = view.filterKinds.includes(kind)
                      const next = has ? view.filterKinds.filter((item) => item !== kind) : [...view.filterKinds, kind]
                      patchPageViewState(record.id, { filterKinds: next })
                    }}
                  />
                ))}
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
        <div className="tasks-sort-wrap" ref={columnRef}>
          <button
            type="button"
            className={`tasks-sort-btn${open === 'columns' ? ' is-active' : ''}`}
            aria-label="可见列"
            title="可见属性"
            onClick={() => toggle('columns')}
          >
            <EyeIcon aria-hidden className="size-[14px]" />
          </button>
          {open === 'columns' ? (
            <HeadlessDismiss onDismiss={() => setOpen(null)} insideRef={columnRef}>
              <div className="tasks-sort-menu fsdb-tool-flyout" role="menu">
                {props.length ? (
                  props.map((item) => (
                    <Row
                      key={item.key}
                      label={item.label}
                      on={visibleKeys.includes(item.key)}
                      onToggle={() => {
                        const has = visibleKeys.includes(item.key)
                        const next = has ? visibleKeys.filter((key) => key !== item.key) : [...visibleKeys, item.key]
                        onVisiblePropertyKeys?.(next)
                        onHiddenPropertyKeys?.(props.map((prop) => prop.key).filter((key) => !next.includes(key)))
                      }}
                    />
                  ))
                ) : (
                  <div className="tasks-viewdd-empty">没有可隐藏的属性</div>
                )}
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
        <div className="tasks-filter-btn-wrap" ref={configRef}>
          <button
            type="button"
            className={`tasks-refresh tasks-rbar-btn${open === 'config' ? ' is-active' : ''}`}
            aria-label="表格配置"
            title="配置"
            onClick={() => toggle('config')}
          >
            <AdjustmentsHorizontalIcon aria-hidden className="size-[14px]" />
          </button>
          {open === 'config' ? (
            <HeadlessDismiss
              onDismiss={() => setOpen(null)}
              insideRef={configRef}
              inside={(node) => node instanceof Element && Boolean(node.closest('.fsdb-detail-more-menu'))}
            >
              <div className="tasks-filter-menu fsdb-tool-flyout" role="menu">
                {configMenu}
              </div>
            </HeadlessDismiss>
          ) : null}
        </div>
        <button type="button" className="tasks-refresh" aria-label="刷新" title="刷新" onClick={() => onRetry?.()}>
          <ArrowPathIcon aria-hidden className="size-[14px]" />
        </button>
        <div className="fsdb-create-group">
          <button
            type="button"
            className="fsdb-create-btn"
            aria-label="插入"
            title="插入"
            onClick={() => window.dispatchEvent(new Event(PAGE_INSERT_EVENT))}
          >
            插入
          </button>
          <HeadlessDismiss enabled={scopeOpen} onDismiss={() => setScopeOpen(false)}>
            <div className="fsdb-create-scope-wrap">
              <button
                type="button"
                className="fsdb-create-scope"
                aria-label="新建归属"
                aria-expanded={scopeOpen}
                title="新建子页面"
                onClick={() => setScopeOpen((prev) => !prev)}
              >
                {scope === 'workspace' ? <UsersIcon aria-hidden className="size-[14px]" /> : scope === 'shared' ? <GlobeAltIcon aria-hidden className="size-[14px]" /> : <UserIcon aria-hidden className="size-[14px]" />}
              </button>
              {scopeOpen ? (
                <div className="fsdb-create-scope-menu" role="menu">
                  <button type="button" role="menuitem" className={scope === 'personal' ? 'is-on' : ''} onClick={() => { setScope('personal'); setScopeOpen(false) }}>
                    私人
                  </button>
                  <button type="button" role="menuitem" className={scope === 'workspace' ? 'is-on' : ''} onClick={() => { setScope('workspace'); setScopeOpen(false) }}>
                    空间
                  </button>
                  <button type="button" role="menuitem" className={scope === 'shared' ? 'is-on' : ''} onClick={() => { setScope('shared'); setScopeOpen(false) }}>
                    共享
                  </button>
                  <button type="button" role="menuitem" disabled={creating} onClick={() => void createPage()}>
                    新建子页面
                  </button>
                </div>
              ) : null}
            </div>
          </HeadlessDismiss>
        </div>
      </div>
    </div>
  )
}
