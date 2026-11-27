import { memo, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { computeFloatingPosition } from '@biu/biu-ui/floating-position'
import { TOOLTIP_OVERLAY_Z, overlayZ } from '@biu/biu-ui/overlay-portal'
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon } from '@heroicons/react/16/solid'
import { WorkspaceAvatar } from '@biu/biu-ui/workspace-avatar'
import { chromeIcon } from './chrome-icon.ts'
import { ShellSidePlaces, ShellSidebarAccount, ShellWorkspaceSwitcher, useActiveWorkspaceAvatar } from './shell-chrome.tsx'
import {
  isSidebarFlyoutKeepTarget,
  isSidebarFlyoutIgnoreTarget,
  SIDEBAR_FLYOUT_HIDE_MS,
  shouldKeepSidebarFlyout,
} from './sidebar-flyout.ts'
import { shellColumnStartWidth } from './chat-overlay.ts'

export type ShellSidebarFrameProps = {
  visible: boolean
  narrow?: boolean
  drawerOpen?: boolean
  onCollapse?: () => void
  onExpand?: () => void
  onDrawerClose?: () => void
  onWidthChange?: (width: number) => void
  onWidthLive?: (width: number) => void
  testId?: string
  activeId?: string
  agentHref?: string
  onSettings?: (tab?: string) => void
  onStore?: () => void
  storeOpen?: boolean
  onSearch?: () => void
  searchOpen?: boolean
  children: ReactNode
}

/** 聊天与数据库共用的左侧栏外框：品牌头、收起/展开、拖宽、窄窗浮层抽屉。 */
export const ShellSidebarFrame = memo(function ShellSidebarFrame({
  visible,
  narrow = false,
  drawerOpen = false,
  onCollapse,
  onExpand,
  onDrawerClose,
  onWidthChange,
  onWidthLive,
  testId = 'shell-sidebar',
  activeId,
  agentHref,
  onSettings,
  onStore,
  storeOpen = false,
  onSearch,
  searchOpen = false,
  children,
}: ShellSidebarFrameProps) {
  const effectiveNarrow = narrow && !drawerOpen
  const effectiveVisible = visible || drawerOpen
  const dragRef = useRef<{ startX: number; startWidth: number; last: number } | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const peekRef = useRef(false)
  const hideRef = useRef<number | null>(null)
  const [peek, setPeek] = useState(false)
  const prevVisibleRef = useRef(visible)
  const [entering, setEntering] = useState(false)

  useLayoutEffect(() => {
    const wasVisible = prevVisibleRef.current
    prevVisibleRef.current = visible
    if (!wasVisible && visible) {
      setEntering(true)
      const timer = window.setTimeout(() => setEntering(false), 220)
      return () => window.clearTimeout(timer)
    }
    if (!visible) setEntering(false)
  }, [visible])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current
      if (!drag) return
      const next = drag.startWidth + (event.clientX - drag.startX)
      drag.last = next
      if (onWidthLive) onWidthLive(next)
      else onWidthChange?.(next)
    }
    const onUp = () => {
      const drag = dragRef.current
      dragRef.current = null
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
      if (drag && onWidthLive) onWidthChange?.(drag.last)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [onWidthChange, onWidthLive])

  useEffect(() => {
    if (visible || drawerOpen) {
      peekRef.current = false
      setPeek(false)
      if (hideRef.current != null) {
        clearTimeout(hideRef.current)
        hideRef.current = null
      }
      return
    }

    const openPeek = () => {
      if (hideRef.current != null) {
        clearTimeout(hideRef.current)
        hideRef.current = null
      }
      peekRef.current = true
      setPeek(true)
    }
    const scheduleHide = () => {
      if (hideRef.current != null) return
      hideRef.current = window.setTimeout(() => {
        hideRef.current = null
        peekRef.current = false
        setPeek(false)
      }, SIDEBAR_FLYOUT_HIDE_MS)
    }
    const onPointer = (event: PointerEvent) => {
      const host = hostRef.current
      const shell = host?.parentElement
      const raw = shell ? getComputedStyle(shell).getPropertyValue('--sidebar-flyout-width') : ''
      const width = Number.parseFloat(raw) || 240
      if (isSidebarFlyoutIgnoreTarget(event.target)) {
        if (peekRef.current) scheduleHide()
        return
      }
      if (
        isSidebarFlyoutKeepTarget(event.target, host) ||
        shouldKeepSidebarFlyout(event.clientX, event.clientY, peekRef.current, width, window.innerWidth, window.innerHeight)
      ) {
        openPeek()
        return
      }
      if (peekRef.current) scheduleHide()
    }
    window.addEventListener('pointermove', onPointer)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('pointermove', onPointer)
      window.removeEventListener('pointerdown', onPointer)
      if (hideRef.current != null) {
        clearTimeout(hideRef.current)
        hideRef.current = null
      }
    }
  }, [visible, drawerOpen])

  return (
    <div
      ref={hostRef}
      className={`sidebar-flyout-host${visible ? '' : ' is-collapsed'}${!visible && !drawerOpen && peek ? ' is-flyout-open' : ''}${drawerOpen ? ' is-drawer-open' : ''}`}
      data-testid="sidebar-flyout-host"
    >
      {drawerOpen ? (
        <div
          className="shell-drawer-backdrop"
          data-testid="sidebar-drawer-backdrop"
          aria-hidden
          onClick={onDrawerClose ?? onCollapse}
        />
      ) : null}
      {visible || drawerOpen ? null : <div className="sidebar-edge-hot" data-testid="sidebar-edge-hot" aria-hidden />}
      {effectiveNarrow ? <RailHoverTip hostRef={hostRef} /> : null}
    <aside
      className={`app-side-bar min-h-0 flex-col border-r border-(--biu-color-border) bg-(--biu-color-bg-subtle)${effectiveNarrow ? ' is-narrow overflow-visible' : ' overflow-hidden'}${drawerOpen ? ' is-drawer flex' : visible ? (entering ? ' flex is-entering' : ' flex') : ' is-closed flex'}`}
      aria-hidden={!effectiveVisible}
      data-testid={testId}
      onAnimationEnd={() => setEntering(false)}
    >
      {onWidthChange && !narrow && !drawerOpen && visible ? (
        <div
          className="sidebar-resize"
          data-biu-ignore
          data-testid="sidebar-resize"
          title="拖动调整宽度"
          onPointerDown={(event) => {
            event.preventDefault()
            const visual = shellColumnStartWidth(event.currentTarget, 'left', 0)
            dragRef.current = { startX: event.clientX, startWidth: visual, last: visual }
            document.body.style.cursor = 'col-resize'
            document.body.style.userSelect = 'none'
          }}
        />
      ) : null}
      {visible && narrow && !drawerOpen ? (
        <ShellRailHead onExpand={onExpand} />
      ) : (
        <div className="app-side-bar-head app-side-bar-head-brand" data-biu-ignore>
          <div className="shell-workspace-head">
            <ShellWorkspaceSwitcher onWorkspaceSettings={() => onSettings?.('workspace')} />
          </div>
          {!effectiveVisible ? (
            <button
              type="button"
              className="chat-view-header-expand"
              title="展开左侧边栏"
              aria-label="展开左侧边栏"
              data-testid="sidebar-expand"
              onClick={onExpand}
            >
              <ChevronDoubleRightIcon {...chromeIcon} />
            </button>
          ) : (
            <button
              type="button"
              className="chat-view-header-expand"
              title="收起左侧边栏"
              aria-label="收起左侧边栏"
              data-testid="sidebar-collapse"
              onClick={drawerOpen ? (onDrawerClose ?? onCollapse) : onCollapse}
            >
              <ChevronDoubleLeftIcon {...chromeIcon} />
            </button>
          )}
        </div>
      )}
      {onSettings && agentHref && activeId != null ? (
        <div className="shrink-0 px-2 pt-1" data-biu-ignore>
          <ShellSidePlaces
            activeId={activeId}
            agentHref={agentHref}
            onSettings={() => onSettings()}
            onStore={onStore}
            storeOpen={storeOpen}
            onSearch={onSearch}
            searchOpen={searchOpen}
          />
        </div>
      ) : null}
      {children}
      <ShellSidebarAccount
        narrow={effectiveNarrow}
        onOpenAccount={onSettings ? () => onSettings('account') : undefined}
      />
    </aside>
    </div>
  )
})

function RailHoverTip({ hostRef }: { hostRef: RefObject<HTMLDivElement | null> }) {
  const [tip, setTip] = useState<{ text: string; anchor: HTMLElement } | null>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const read = (node: EventTarget | null) => {
      if (!(node instanceof Element)) return null
      const el = node.closest('[data-dock-tip]')
      if (!(el instanceof HTMLElement) || !host.contains(el) || el.closest('.shell-rail-expand')) return null
      const text = el.getAttribute('data-dock-tip')?.trim()
      if (!text) return null
      return { text, anchor: el }
    }
    const onOver = (event: PointerEvent) => setTip(read(event.target))
    const onOut = (event: PointerEvent) => setTip(read(event.relatedTarget))
    const clear = () => setTip(null)
    host.addEventListener('pointerover', onOver)
    host.addEventListener('pointerout', onOut)
    window.addEventListener('scroll', clear, true)
    window.addEventListener('pointerdown', clear, true)
    return () => {
      host.removeEventListener('pointerover', onOver)
      host.removeEventListener('pointerout', onOut)
      window.removeEventListener('scroll', clear, true)
      window.removeEventListener('pointerdown', clear, true)
    }
  }, [hostRef])

  useLayoutEffect(() => {
    if (!tip || !tip.anchor.isConnected) {
      setPos(null)
      return
    }
    const rect = tip.anchor.getBoundingClientRect()
    const el = tipRef.current
    const placed = computeFloatingPosition({
      anchor: { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, width: rect.width, height: rect.height },
      floating: { width: el?.offsetWidth || 96, height: el?.offsetHeight || 26 },
      placement: 'right',
      offset: 8,
      padding: 8,
    })
    setPos({ left: placed.left, top: placed.top })
  }, [tip])

  if (!tip) return null
  return createPortal(
    <div
      ref={tipRef}
      className="shell-rail-tip"
      role="tooltip"
      data-testid="shell-rail-tip"
      style={{
        left: pos?.left ?? -9999,
        top: pos?.top ?? -9999,
        transform: 'none',
        zIndex: overlayZ(TOOLTIP_OVERLAY_Z, tip.anchor),
      }}
    >
      {tip.text}
    </div>,
    document.body,
  )
}

function ShellRailHead({ onExpand }: { onExpand?: () => void }) {
  const workspaceAvatar = useActiveWorkspaceAvatar()
  return (
    <div className="shell-rail-head" data-biu-ignore>
      <button
        type="button"
        className="shell-rail-expand"
        aria-label="展开左侧边栏"
        data-testid="sidebar-expand"
        onClick={onExpand}
      >
        <span className="shell-rail-expand-mark" aria-hidden>
          {workspaceAvatar ? (
            <img
              src={workspaceAvatar}
              alt=""
              className="shell-workspace-switch-icon is-avatar"
              data-testid="sidebar-expand-workspace-avatar"
            />
          ) : (
            <WorkspaceAvatar
              size={18}
              className="shell-workspace-switch-icon is-avatar"
              data-testid="sidebar-expand-workspace-avatar"
            />
          )}
        </span>
        <span className="shell-rail-expand-chevron" aria-hidden>
          <ChevronDoubleRightIcon {...chromeIcon} />
        </span>
      </button>
    </div>
  )
}
