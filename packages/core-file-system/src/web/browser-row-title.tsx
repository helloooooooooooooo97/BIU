import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import {
  ArrowsPointingOutIcon,
  ChevronRightIcon,
  ViewColumnsIcon,
} from '@heroicons/react/16/solid'
import { computeFloatingPosition } from '@biu/biu-ui/floating-position'
import { TOOLTIP_OVERLAY_Z, overlayPortalRoot, overlayZ } from '@biu/biu-ui/overlay-portal'
import type { DbRecord } from '@biu/type-file-system'
import type { CollectionChrome } from '@biu/type-file-system/ui'
import { AGENTS_COLLECTION_PATH, PLUGINS_COLLECTION_PATH } from './database-path.ts'
import { idleTableIconKind } from './nav-glyphs.tsx'
import {
  RecordMark,
  recordPreviewMascot,
} from './record-mark.tsx'
import { AccessIcon, accessText, accessTone, ScopeIcon, scopeText, scopeTone } from './share-scope-label.tsx'
import {
  normalizeRecordEmoji,
  recordPreviewEmoji,
} from './sidebar-preview.ts'

const RecordEmojiBoard = lazy(() => import('@biu/biu-ui/emoji-board').then((m) => ({ default: m.RecordEmojiBoard })))

export function DockHoverTip() {
  const [tip, setTip] = useState<{ text: string; anchor: HTMLElement } | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const read = (node: EventTarget | null) => {
      if (!(node instanceof Element)) return null
      const el = node.closest('[data-dock-tip]')
      if (!(el instanceof HTMLElement) || !el.closest('.fsdb-page, .fsdb-col-menu')) return null
      if (el.getAttribute('aria-expanded') === 'true') return null
      const text = el.getAttribute('data-dock-tip')?.trim()
      if (!text) return null
      return { text, anchor: el }
    }
    const onOver = (event: PointerEvent) => setTip(read(event.target))
    const onOut = (event: PointerEvent) => setTip(read(event.relatedTarget))
    const onFocusIn = (event: FocusEvent) => setTip(read(event.target))
    const onFocusOut = (event: FocusEvent) => setTip(read(event.relatedTarget))
    const clear = () => setTip(null)
    document.addEventListener('pointerover', onOver)
    document.addEventListener('pointerout', onOut)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    window.addEventListener('scroll', clear, true)
    window.addEventListener('pointerdown', clear, true)
    window.addEventListener('click', clear, true)
    return () => {
      document.removeEventListener('pointerover', onOver)
      document.removeEventListener('pointerout', onOut)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.removeEventListener('scroll', clear, true)
      window.removeEventListener('pointerdown', clear, true)
      window.removeEventListener('click', clear, true)
    }
  }, [])

  useEffect(() => {
    if (!tip) return
    const { anchor } = tip
    const sync = () => {
      if (!anchor.isConnected || anchor.getAttribute('aria-expanded') === 'true') {
        setTip(null)
        return
      }
      const next = anchor.getAttribute('data-dock-tip')?.trim()
      if (!next) setTip(null)
      else if (next !== tip.text) setTip({ text: next, anchor })
    }
    const observer = new MutationObserver(sync)
    observer.observe(anchor, { attributes: true, attributeFilter: ['data-dock-tip', 'aria-expanded'] })
    return () => observer.disconnect()
  }, [tip])

  useLayoutEffect(() => {
    if (!tip || !tip.anchor.isConnected) {
      setPos(null)
      return
    }
    const rect = tip.anchor.getBoundingClientRect()
    const el = tipRef.current
    const placed = computeFloatingPosition({
      anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height },
      floating: { width: el?.offsetWidth || 80, height: el?.offsetHeight || 24 },
      placement: 'top',
      offset: 8,
      padding: 8,
    })
    setPos({ left: placed.left, top: placed.top })
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={tipRef}
      className="fsdb-dock-tip"
      role="tooltip"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        zIndex: overlayZ(TOOLTIP_OVERLAY_Z, tip.anchor),
      }}
    >
      {tip.text}
    </div>,
    overlayPortalRoot(tip.anchor) ?? document.body,
  )
}

export function TableRecordIcon({
  row,
  label,
  tableIcon,
  Icon,
  onWriteEmoji,
}: {
  row: DbRecord
  label: string
  tableIcon?: string
  Icon?: CollectionChrome['Icon']
  onWriteEmoji: (next: string) => void
}) {
  const emoji = recordPreviewEmoji(row)
  const [open, setOpen] = useState(false)
  const [anchor, setAnchor] = useState<HTMLElement | null>(null)
  return (
    <span className="fsdb-table-record-icon">
      <button
        type="button"
        className="fsdb-table-emoji-btn"
        title={emoji ? '更换图标' : '设置图标'}
        aria-label={emoji ? `更换 ${label} 的图标` : `设置 ${label} 的图标`}
        onClick={(event) => {
          event.stopPropagation()
          const btn = event.currentTarget
          setOpen((prev) => {
            if (prev) {
              setAnchor(null)
              return false
            }
            setAnchor(btn)
            return true
          })
        }}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <RecordMark record={row} tableIcon={tableIcon} Icon={Icon} />
      </button>
      {open && anchor ? (
        <Suspense fallback={null}>
          <RecordEmojiBoard
            anchor={anchor}
            onPick={(next) => {
              onWriteEmoji(normalizeRecordEmoji(next))
              setOpen(false)
              setAnchor(null)
            }}
            onClear={() => {
              onWriteEmoji('')
              setOpen(false)
              setAnchor(null)
            }}
            onClose={() => {
              setOpen(false)
              setAnchor(null)
            }}
          />
        </Suspense>
      ) : null}
    </span>
  )
}

export function RecordOpenControls({
  row,
  kidCount = 0,
  toolsLive = true,
  pick,
  onOpenSplit,
  onOpenRow,
}: {
  row: DbRecord
  kidCount?: number
  toolsLive?: boolean
  pick: object
  onOpenSplit: () => void
  onOpenRow: () => void
}) {
  return (
    <span className="tasks-title-aside">
      {toolsLive ? (
        <button
          type="button"
          className="tasks-icon-btn tasks-title-open"
          data-testid="record-title-split"
          aria-label="在右侧打开"
          title="在右侧打开"
          onClick={(event) => {
            event.stopPropagation()
            onOpenSplit()
          }}
        >
          <ViewColumnsIcon aria-hidden className="size-[14px]" />
        </button>
      ) : null}
      <span className="tasks-title-zoom">
        {toolsLive ? (
          <button
            type="button"
            className="tasks-icon-btn tasks-title-open"
            data-testid="record-title-open"
            {...pick}
            data-biu-action="open"
            aria-label="查看详情"
            title="查看详情"
            onClick={(event) => {
              event.stopPropagation()
              onOpenRow()
            }}
          >
            <ArrowsPointingOutIcon aria-hidden className="size-[14px]" />
          </button>
        ) : null}
      </span>
    </span>
  )
}

export function TitleScopeIcon({ scope, hasExternal = false }: { scope: unknown; hasExternal?: boolean }) {
  const raw = typeof scope === 'string' ? scope.trim() : ''
  if (!raw) return null
  const text = scopeText(raw)
  const tone = scopeTone(raw)
  const tip = hasExternal ? `分享范围：${text}（已对外公开或邀请外部访客）` : `分享范围：${text}`
  return (
    <span
      className={`fsdb-title-scope is-${tone}`}
      data-testid="fsdb-title-scope-icon"
      data-scope={tone}
      data-dock-tip={tip}
      aria-label={tip}
    >
      <ScopeIcon scope={text} />
    </span>
  )
}

export function TitleRoleIcon({ role }: { role: unknown }) {
  const raw = typeof role === 'string' ? role.trim() : ''
  if (!raw) return null
  const text = accessText(raw)
  const tone = accessTone(text)
  return (
    <span
      className={`fsdb-title-role is-${tone}`}
      data-testid="fsdb-title-role-icon"
      data-role={tone}
      data-dock-tip={`我的权限：${text}`}
      aria-label={`我的权限：${text}`}
    >
      <AccessIcon role={text} />
    </span>
  )
}

export function TitleMetaIcons({ row }: { row: DbRecord }) {
  const hasScope = typeof row.shareScope === 'string' && row.shareScope.trim().length > 0
  const hasRole = typeof row.shareRole === 'string' && row.shareRole.trim().length > 0
  if (!hasScope && !hasRole) return null
  return (
    <span className="fsdb-title-badges">
      <TitleScopeIcon scope={row.shareScope} hasExternal={Boolean((row as { hasExternal?: unknown }).hasExternal)} />
      <TitleRoleIcon role={row.shareRole} />
    </span>
  )
}

export function isRecordActive(row: DbRecord): boolean {
  return (
    row.running === true ||
    row.running === 'true' ||
    row.enabled === true ||
    row.enabled === 'true'
  )
}

export function RecordTitle({
  row,
  label,
  Title,
  openDetail = true,
  depth = 0,
  hasKids = false,
  kidCount = 0,
  treeOn,
  collapsed,
  onToggleCollapsed,
  tableIcon,
  Icon,
  pick,
  onOpenSplit,
  onOpenRow,
  onWriteEmoji,
  toolsArmed = false,
}: {
  row: DbRecord
  label: string
  Title?: CollectionChrome['Title']
  openDetail?: boolean
  depth?: number
  hasKids?: boolean
  kidCount?: number
  treeOn: boolean
  collapsed: boolean
  onToggleCollapsed: () => void
  tableIcon?: string
  Icon?: CollectionChrome['Icon']
  pick: object
  onOpenSplit: () => void
  onOpenRow: () => void
  onWriteEmoji: (next: string) => void
  toolsArmed?: boolean
}) {
  const [toolsLive, setToolsLive] = useState(toolsArmed)
  const armTools = () => {
    if (!toolsLive) setToolsLive(true)
  }
  const tree = openDetail && treeOn
  const typeIcon = typeof row.tableIcon === 'string' && row.tableIcon.trim() ? row.tableIcon : tableIcon
  const active = isRecordActive(row)
  if (!toolsLive && !tree) {
    const emoji = recordPreviewEmoji(row)
    const mascotRow = Boolean(recordPreviewMascot(row)) || row.tablePath === AGENTS_COLLECTION_PATH
    return (
      <span className="fsdb-title-host" data-record-active={active ? '' : undefined} onMouseEnter={armTools}>
        {!mascotRow && emoji ? (
          <span className="fsdb-record-emoji">{emoji}</span>
        ) : (typeIcon && typeIcon !== tableIcon) || mascotRow ? (
          <RecordMark record={row} tableIcon={typeIcon} />
        ) : (
          <span className="fsdb-record-mark is-sm" data-icon={idleTableIconKind(tableIcon)} aria-hidden />
        )}
        <span className="fsdb-title-text">{label}</span>
        <TitleMetaIcons row={row} />
      </span>
    )
  }
  return (
    <>
      <span
        className="fsdb-title-host"
        data-record-active={active ? '' : undefined}
        style={tree ? { paddingLeft: depth * 16 } : undefined}
        onMouseEnter={armTools}
      >
        {tree ? (
          hasKids ? (
            <button
              type="button"
              className="tasks-tree-toggle"
              aria-label={collapsed ? '展开子记录' : '收起子记录'}
              aria-expanded={!collapsed}
              onPointerDown={(event) => event.stopPropagation()}
              onClick={(event) => {
                event.stopPropagation()
                onToggleCollapsed()
              }}
            >
              <ChevronRightIcon aria-hidden className={`size-[14px] sidebar-chevron${collapsed ? '' : ' is-open'}`} />
            </button>
          ) : (
            <span className="tasks-tree-toggle is-empty" aria-hidden>
              <ChevronRightIcon className="size-[14px]" />
            </span>
          )
        ) : null}
        {openDetail && toolsLive ? (
          <TableRecordIcon row={row} label={label} tableIcon={typeIcon} Icon={Icon} onWriteEmoji={onWriteEmoji} />
        ) : (
          <RecordMark record={row} tableIcon={typeIcon} />
        )}
        <span className="fsdb-title-text">{toolsLive && Title ? <Title record={row} label={label} /> : label}</span>
        <TitleMetaIcons row={row} />
      </span>
      {toolsLive ? (
        <span className="tasks-row-tools-slot">
          <RecordOpenControls
            row={row}
            toolsLive={toolsLive}
            pick={pick}
            onOpenSplit={onOpenSplit}
            onOpenRow={onOpenRow}
          />
        </span>
      ) : null}
    </>
  )
}

export function PluginSurface({
  plugin,
  label,
  children,
}: {
  plugin?: string
  label?: string
  children: ReactNode
}) {
  if (!plugin) return children
  return (
    <div
      className="fsdb-plugin-surface"
      data-biu-plugin={plugin}
      data-biu-kind="plugin"
      data-biu-id={plugin}
      data-biu-label={label || plugin}
    >
      {children}
    </div>
  )
}

export function askNewPresentation(opts: { path: string; title?: string }) {
  const path = opts.path.trim()
  const name = opts.title?.trim() || path
  const draft = `请为「${name}」添加一种新的呈现方式。先听我描述要看板、日历还是别的样子，再写无头插件：databaseUi.registerRowView("${path}", { id, label, plugin: 本插件id, Row }) 只换每一行；或 databaseUi.registerView("${path}", { id, label, plugin: 本插件id, View }) 整页自己画。plugin 必须能被 pick 抓到。不要改 packages/。用 sandbox + pack 安装。装好后会出现在查看模式菜单里。`
  void import('@biu/core-pick/web').then((mod) => {
    mod.getPick()?.attach(
      path
        ? [
            {
              kind: 'collection',
              id: `view:${path}`,
              action: 'view',
              path,
              label: '呈现方式',
              title: name,
              route: typeof window === 'undefined' ? '' : window.location.pathname,
            },
          ]
        : [],
      { text: draft },
    )
  })
}

export function askNewPlugin(scope: 'personal' | 'workspace' | 'shared' | 'local' = 'personal') {
  const scopeName = scope === 'workspace' ? '空间' : scope === 'shared' ? '共享' : '私人'
  const draft = `请帮我写一个新插件。先听我描述它要做什么（窗口应用、页面块还是无头登记）。然后 db_action path=/plugins/<id> action=sandbox args={{name, scope:"${scope}"}} 建 .plugin-dev/<id>/（记录可以还不存在，归属${scopeName}），写完代码再 action=pack 打进 .plugin。不要 db_create /plugins，不要直写 .plugin，不要改 packages/ 或 cordis.plugins.json。有窗口写 shell 宽高；无头写 headless:true。`
  void import('@biu/core-pick/web').then((mod) => {
    mod.getPick()?.attach(
      [
        {
          kind: 'collection',
          id: 'plugins',
          action: 'plugin',
          path: PLUGINS_COLLECTION_PATH,
          label: '插件',
          title: '插件',
          route: typeof window === 'undefined' ? '' : window.location.pathname,
        },
      ],
      { text: draft },
    )
  })
}
