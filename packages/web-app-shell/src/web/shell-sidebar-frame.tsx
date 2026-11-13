import { memo, useEffect, useRef, useState, type ReactNode, type RefObject } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDoubleLeftIcon, ChevronDoubleRightIcon, CloudIcon, ComputerDesktopIcon } from '@heroicons/react/16/solid'
import { chromeIcon } from './chrome-icon.ts'
import { ShellSidePlaces, ShellWorkspaceSwitcher, useActiveWorkspaceLocation } from './shell-chrome.tsx'
import {
  isSidebarFlyoutKeepTarget,
  isSidebarFlyoutIgnoreTarget,
  SIDEBAR_FLYOUT_HIDE_MS,
  shouldKeepSidebarFlyout,
} from './sidebar-flyout.ts'
import { shellColumnStartWidth } from './chat-overlay.ts'
import { FOCUS_SHELL_SIDEBAR, FOCUS_SHELL_TABLE, focusShellSidebar, sidebarStops, stepSidebarStop } from './sidebar-focus.ts'

export type ShellSidebarFrameProps = {
  visible: boolean
  narrow?: boolean
  showTags?: boolean
  onCollapse?: () => void
  onExpand?: () => void
  onWidthChange?: (width: number) => void
  onWidthLive?: (width: number) => void
  testId?: string
  activeId?: string
  agentHref?: string
  onSettings?: (tab?: string) => void
  onSearch?: () => void
  searchOpen?: boolean
  children: ReactNode
}

/** 聊天与数据库共用的左侧栏外框：品牌头、收起/展开、拖宽。 */
export const ShellSidebarFrame = memo(function ShellSidebarFrame({
  visible,
  narrow = false,
  showTags = false,
  onCollapse,
  onExpand,
  onWidthChange,
  onWidthLive,
  testId = 'shell-sidebar',
  activeId,
  agentHref,
  onSettings,
  onSearch,
  searchOpen = false,
  children,
}: ShellSidebarFrameProps) {
  const dragRef = useRef<{ startX: number; startWidth: number; last: number } | null>(null)
  const hostRef = useRef<HTMLDivElement | null>(null)
  const peekRef = useRef(false)
  const hideRef = useRef<number | null>(null)
  const [peek, setPeek] = useState(false)

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
    if (visible) {
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
  }, [visible])

  useEffect(() => {
    const onFocusSidebar = (event: Event) => {
      const host = hostRef.current
      const run = () => {
        if (focusShellSidebar(host)) event.preventDefault()
      }
      if (!visible) {
        onExpand?.()
        requestAnimationFrame(run)
        return
      }
      run()
    }
    window.addEventListener(FOCUS_SHELL_SIDEBAR, onFocusSidebar)
    return () => window.removeEventListener(FOCUS_SHELL_SIDEBAR, onFocusSidebar)
  }, [onExpand, visible])

  return (
    <div
      ref={hostRef}
      className={`sidebar-flyout-host${visible ? '' : ' is-collapsed'}${!visible && peek ? ' is-flyout-open' : ''}`}
      data-testid="sidebar-flyout-host"
    >
      {visible ? null : <div className="sidebar-edge-hot" data-testid="sidebar-edge-hot" aria-hidden />}
      {narrow ? <RailHoverTip hostRef={hostRef} /> : null}
    <aside
      className={`app-side-bar min-h-0 flex-col border-r border-(--biu-color-border) bg-(--biu-color-bg-subtle)${narrow ? ' is-narrow overflow-visible' : ' overflow-hidden'}${showTags ? ' is-wide' : ''}${visible ? ' flex' : ' is-closed flex'}`}
      aria-hidden={!visible}
      data-testid={testId}
      onKeyDown={(event) => {
        if (event.metaKey || event.ctrlKey || event.altKey) return
        const target = event.target instanceof Element ? event.target : null
        if (!target || target.closest('input, textarea, select, [contenteditable="true"]')) return
        const stops = sidebarStops(event.currentTarget)
        const current = stops.find((stop) => stop === target || stop.contains(target)) ?? null
        if (event.key === 'ArrowRight') {
          event.preventDefault()
          window.dispatchEvent(new CustomEvent(FOCUS_SHELL_TABLE))
          return
        }
        if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'ArrowLeft') return
        const dir = event.key === 'ArrowDown' ? 1 : -1
        const next = stepSidebarStop(stops, current, dir)
        if (!next || next === current) return
        event.preventDefault()
        next.focus()
      }}
    >
      {onWidthChange && !narrow ? (
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
      {visible && narrow ? (
        <ShellRailHead onExpand={onExpand} />
      ) : (
        <div className="app-side-bar-head app-side-bar-head-brand" data-biu-ignore>
          <div className="shell-workspace-head">
            <ShellWorkspaceSwitcher onWorkspaceSettings={() => onSettings?.('workspace')} />
          </div>
          {!visible ? (
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
              onClick={onCollapse}
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
            onSearch={onSearch}
            searchOpen={searchOpen}
          />
        </div>
      ) : null}
      {children}
    </aside>
    </div>
  )
})

function RailHoverTip({ hostRef }: { hostRef: RefObject<HTMLDivElement | null> }) {
  const [tip, setTip] = useState<{ text: string; x: number; y: number } | null>(null)
  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const read = (node: EventTarget | null) => {
      if (!(node instanceof Element)) return null
      const el = node.closest('[data-dock-tip]')
      if (!(el instanceof HTMLElement) || !host.contains(el) || el.closest('.shell-rail-expand')) return null
      const text = el.getAttribute('data-dock-tip')?.trim()
      if (!text) return null
      const box = el.getBoundingClientRect()
      return { text, x: Math.round(box.right + 8), y: Math.round(box.top + box.height / 2) }
    }
    const onOver = (event: PointerEvent) => setTip(read(event.target))
    const onOut = (event: PointerEvent) => setTip(read(event.relatedTarget))
    host.addEventListener('pointerover', onOver)
    host.addEventListener('pointerout', onOut)
    return () => {
      host.removeEventListener('pointerover', onOver)
      host.removeEventListener('pointerout', onOut)
    }
  }, [hostRef])
  if (!tip) return null
  return createPortal(
    <div className="shell-rail-tip" role="tooltip" data-testid="shell-rail-tip" style={{ left: tip.x, top: tip.y }}>
      {tip.text}
    </div>,
    document.body,
  )
}

function ShellRailHead({ onExpand }: { onExpand?: () => void }) {
  const location = useActiveWorkspaceLocation()
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
          {location === 'cloud' ? <CloudIcon {...chromeIcon} /> : <ComputerDesktopIcon {...chromeIcon} />}
        </span>
        <span className="shell-rail-expand-chevron" aria-hidden>
          <ChevronDoubleRightIcon {...chromeIcon} />
        </span>
      </button>
    </div>
  )
}
