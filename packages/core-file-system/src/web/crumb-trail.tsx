import { useEffect, useMemo, useRef, useState, type PointerEvent, type Ref, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { MagnifyingGlassIcon, PlusIcon } from '@heroicons/react/16/solid'
import { HeadlessDismiss } from '@biu/biu-ui/headless-dismiss'
import { overlayPortalRoot } from '@biu/biu-ui/overlay-portal'
import { delayCrumbQuery, pullCrumbRecords, recordChoicesFromRows } from './crumb-records.ts'
import { CrumbItemGlyph, TableGlyph } from './nav-glyphs.tsx'
import { crumbButtonAction, type Crumb, type CrumbChoice, type CrumbTarget } from './sidebar-nav.ts'
import { emitFsdbChange } from '@biu/type-file-system'
import { FSDB_CRUMB_LABELS_EVENT, emitFsdbEvent } from './fsdb-events.ts'
import { pullSavedViews } from './view-storage.ts'

function canOpenCrumbMenu(crumb: Crumb) {
  return crumb.kind === 'collection' || crumb.kind === 'scope' || crumb.kind === 'view' || crumb.kind === 'record'
}

function createKindOf(crumb: Crumb): 'view' | 'record' | null {
  if (crumb.kind === 'record') return 'record'
  if (crumb.kind === 'view') return 'view'
  return null
}

function CrumbMenu({
  crumb,
  crumbs,
  onPick,
  onOpenId,
  onCreate,
  canCreateView,
  canCreateRecord,
  trailRef,
}: {
  crumb: Crumb
  crumbs: Crumb[]
  onPick: (target: CrumbTarget) => void
  onOpenId: (id: string | null) => void
  onCreate?: (kind: 'view' | 'record') => void
  canCreateView?: boolean
  canCreateRecord?: boolean
  trailRef: RefObject<HTMLElement | null>
}) {
  const [query, setQuery] = useState('')
  const [remote, setRemote] = useState<CrumbChoice[] | null>(null)
  const [loading, setLoading] = useState(crumb.kind === 'record' || crumb.kind === 'view')
  const crumbRef = useRef(crumb)
  crumbRef.current = crumb
  const q = query.trim().toLowerCase()
  const source = remote ?? crumb.choices
  const filtered = useMemo(
    () =>
      crumb.kind === 'record'
        ? source
        : source.filter((item) => !q || item.label.toLowerCase().includes(q) || item.id.toLowerCase().includes(q)),
    [crumb.kind, q, source],
  )
  const shown = filtered
  const recordCollection = crumb.target.kind === 'record' ? crumb.target.collection : ''
  const recordViewId = crumb.target.kind === 'record' ? crumb.target.viewId : undefined
  const viewCollection = crumb.target.kind === 'view' ? crumb.target.collection : ''
  useEffect(() => {
    let live = true
    if (crumb.kind === 'view' && viewCollection) {
      setLoading(true)
      void pullSavedViews([viewCollection])
        .then(() => {
          if (!live) return
          emitFsdbChange({ scope: 'views' })
          emitFsdbEvent(FSDB_CRUMB_LABELS_EVENT)
        })
        .finally(() => {
          if (live) setLoading(false)
        })
      return () => {
        live = false
      }
    }
    if (crumb.kind !== 'record' || !recordCollection) {
      setLoading(false)
      return
    }
    const qtext = query.trim()
    setLoading(true)
    const run = () => {
      void pullCrumbRecords({ collection: recordCollection, viewId: recordViewId, query: qtext })
        .then((rows) => {
          if (!live) return
          setRemote(recordChoicesFromRows(crumbRef.current, rows))
        })
        .catch(() => undefined)
        .finally(() => {
          if (live) setLoading(false)
        })
    }
    if (!qtext) {
      run()
      return () => {
        live = false
      }
    }
    const cancel = delayCrumbQuery(run)
    return () => {
      live = false
      cancel()
    }
  }, [crumb.kind, query, recordCollection, recordViewId, viewCollection])
  const createKind = createKindOf(crumb)
  const showCreate =
    (createKind === 'view' && canCreateView && onCreate) || (createKind === 'record' && canCreateRecord && onCreate)

  return (
    <HeadlessDismiss onDismiss={() => onOpenId(null)} insideRef={trailRef}>
    <div
      className="fsdb-crumb-menu is-fixed"
      role="menu"
      data-fsdb-crumb-menu=""
      onMouseDown={(event) => event.stopPropagation()}
    >
      <label className="fsdb-crumb-search">
        <MagnifyingGlassIcon aria-hidden className="size-[14px]" />
        <input
          value={query}
          placeholder="搜索"
          aria-label="搜索"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onOpenId(null)
              return
            }
            if (event.key !== 'Enter' || !filtered[0]) return
            event.preventDefault()
            onPick(filtered[0].target)
            onOpenId(null)
          }}
        />
      </label>
      <div className="fsdb-crumb-menu-list">
        {loading && shown.length === 0 ? <div className="fsdb-crumb-empty">加载中…</div> : null}
        {!loading && shown.length === 0 ? <div className="fsdb-crumb-empty">没有匹配项</div> : null}
        {shown.map((choice) => {
          const viewId = crumbs.find((item) => item.kind === 'view')?.id
          const active =
            choice.target.kind === 'view'
              ? choice.target.viewId === viewId
              : choice.target.kind === 'collection'
                ? choice.target.collection === crumb.id
                : choice.id === crumb.id
          const glyphKind =
            choice.target.kind === 'view' ? 'view' : choice.target.kind === 'collection' ? 'collection' : crumb.kind
          return (
            <button
              key={choice.id}
              type="button"
              className={`fsdb-crumb-option${active ? ' is-active' : ''}`}
              role="menuitem"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                onPick(choice.target)
                onOpenId(null)
              }}
            >
              <CrumbItemGlyph
                kind={glyphKind}
                icon={choice.icon}
                avatar={choice.avatar}
                avatarSeed={choice.avatarSeed}
                mode={choice.mode}
                emoji={choice.emoji}
                mascot={choice.mascot}
                collection={choice.target.kind === 'record' ? choice.target.collection : undefined}
                recordId={choice.target.kind === 'record' ? choice.target.recordId : undefined}
              />
              <span className="chat-view-project-name">{choice.label}</span>
            </button>
          )
        })}
      </div>
      {showCreate && createKind ? (
        <div className="fsdb-crumb-menu-foot">
          <button
            type="button"
            className="fsdb-crumb-create"
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              onCreate?.(createKind)
              onOpenId(null)
            }}
          >
            <PlusIcon aria-hidden className="size-[14px]" />
            {createKind === 'record' ? '新建记录' : '添加视图'}
          </button>
        </div>
      ) : null}
    </div>
    </HeadlessDismiss>
  )
}

export function CrumbTrail({
  crumbs,
  onPick,
  onActivate,
  onCreate,
  canCreateView = false,
  canCreateRecord = false,
  navRef,
  className,
  label,
  allowMenu = true,
  lockRootCrumb = false,
  collapseToLeaf = false,
}: {
  crumbs: Crumb[]
  onPick: (target: CrumbTarget) => void
  onActivate?: () => void
  onCreate?: (kind: 'view' | 'record') => void
  canCreateView?: boolean
  canCreateRecord?: boolean
  navRef?: Ref<HTMLElement | null>
  className?: string
  label?: string
  /** 收起时只激活面板，不弹出某一级的选择菜单 */
  allowMenu?: boolean
  /** 右侧检查器：一级只显示类型图标；点该图标才展开父级 */
  lockRootCrumb?: boolean
  /** 宽度不够时只显示最后一级，避免顶栏挤成一排省略号 */
  collapseToLeaf?: boolean
}) {
  const trailRef = useRef<HTMLElement | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [parentsOpen, setParentsOpen] = useState(false)
  const [leafOnly, setLeafOnly] = useState(false)
  const openCrumb = crumbs.find((item) => item.id === openId)
  const tableCrumb = crumbs.find((item) => item.kind === 'collection')
  const tableIcon = tableCrumb?.icon

  useEffect(() => {
    if (allowMenu) return
    setOpenId(null)
    setParentsOpen(false)
  }, [allowMenu])

  useEffect(() => {
    if (!collapseToLeaf) {
      setLeafOnly(false)
      return
    }
    const node = trailRef.current
    const host = node?.parentElement
    if (!node || !host) return
    const measure = () => {
      setLeafOnly(false)
      requestAnimationFrame(() => {
        if (!trailRef.current || !host.isConnected) return
        setLeafOnly(trailRef.current.scrollWidth > host.clientWidth + 1)
      })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(host)
    return () => ro.disconnect()
  }, [collapseToLeaf, crumbs])

  return (
    <nav
      className={`${className ?? 'fsdb-crumbs'}${leafOnly ? ' is-leaf-only' : ''}${lockRootCrumb && parentsOpen ? ' is-parents-open' : ''}`}
      aria-label={label ?? '位置'}
      ref={(node) => {
        trailRef.current = node
        if (typeof navRef === 'function') navRef(node)
        else if (navRef) navRef.current = node
      }}
    >
      {crumbs.map((crumb, index) => {
        const rootLocked = lockRootCrumb && index === 0 && crumbs.length > 1
        const canPick = allowMenu && !rootLocked && canOpenCrumbMenu(crumb)
        const open = openId === crumb.id
        const current = crumb.choices.find((item) => item.id === crumb.id)
        const glyph = (
          <>
            {!allowMenu && !lockRootCrumb && crumb.kind === 'view' ? <TableGlyph icon={tableIcon} /> : null}
            <CrumbItemGlyph
              kind={crumb.kind}
              icon={crumb.icon ?? current?.icon}
              avatar={crumb.avatar ?? current?.avatar}
              avatarSeed={crumb.avatarSeed ?? current?.avatarSeed}
              mode={current?.mode}
              emoji={current?.emoji ?? crumb.emoji}
              mascot={current?.mascot ?? crumb.mascot}
              collection={crumb.kind === 'record' && crumb.target.kind === 'record' ? crumb.target.collection : undefined}
              recordId={crumb.kind === 'record' && crumb.target.kind === 'record' ? crumb.target.recordId : undefined}
            />
            {rootLocked ? null : <span className="chat-view-project-name">{crumb.label}</span>}
          </>
        )
        return (
          <span key={crumb.id} className="fsdb-crumb">
            {index && !(lockRootCrumb && index === 1) ? <span className="fsdb-crumb-sep" aria-hidden>/</span> : null}
            <span className="fsdb-crumb-pick">
              <button
                type="button"
                className={`fsdb-crumb-btn${open || (rootLocked && parentsOpen) ? ' is-open' : ''}`}
                aria-label={rootLocked ? '展开父级' : crumb.label}
                aria-haspopup={canPick ? 'menu' : undefined}
                aria-expanded={rootLocked ? (allowMenu ? parentsOpen : undefined) : canPick ? open : undefined}
                onPointerDown={(event: PointerEvent<HTMLButtonElement>) => {
                  if (event.button !== 0) return
                  event.preventDefault()
                  event.stopPropagation()
                  if (rootLocked) {
                    if (allowMenu) setParentsOpen((value) => !value)
                    else onActivate?.()
                    setOpenId(null)
                    return
                  }
                  if (!allowMenu) {
                    onActivate?.()
                    setOpenId(null)
                    return
                  }
                  const action = crumbButtonAction(crumb, index ? crumbs[index - 1] : undefined)
                  if (action === 'menu') {
                    setOpenId(open ? null : crumb.id)
                    return
                  }
                  onActivate?.()
                  onPick(action)
                  setOpenId(null)
                }}
              >
                {glyph}
              </button>
            </span>
          </span>
        )
      })}
      {allowMenu && openCrumb && canOpenCrumbMenu(openCrumb) && typeof document !== 'undefined'
        ? createPortal(
            <CrumbMenu
              key={openCrumb.id}
              crumb={openCrumb}
              crumbs={crumbs}
              trailRef={trailRef}
              onPick={onPick}
              onOpenId={(id) => {
                if (!id) setOpenId(null)
              }}
              onCreate={onCreate}
              canCreateView={canCreateView}
              canCreateRecord={canCreateRecord}
            />,
            overlayPortalRoot() ?? document.body,
          )
        : null}
    </nav>
  )
}