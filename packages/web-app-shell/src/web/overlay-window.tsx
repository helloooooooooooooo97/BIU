import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { ChatPane } from '@biu/public-ui/chat-pane'
import {
  closeChatOverlay,
  getOverlayThread,
  isComposerFocusPending,
  overlayLayoutGeom,
  overlayStillHoldsPointer,
  OVERLAY_OUTSIDE_KEEP,
  readOverlayWinState,
  setOverlayResizing,
  shouldCloseOverlayOnOutside,
  subscribeOverlayThread,
  writeOverlayWinState,
  type OverlayWinGeom,
} from './chat-overlay.ts'

type ResizeEdge = { north?: boolean; south?: boolean; east?: boolean; west?: boolean }

let overlayZ = 80

function overlayHoldsFocus(root: HTMLElement | null, target: EventTarget | null) {
  if (!(target instanceof Element)) return false
  if (root?.contains(target)) return true
  return Boolean(target.closest(OVERLAY_OUTSIDE_KEEP))
}

export function OverlayChatWindow({
  header,
  thread,
  dock,
}: {
  header: ReactNode
  thread: ReactNode
  dock: ReactNode
}) {
  const threadOpen = useSyncExternalStore(subscribeOverlayThread, getOverlayThread, () => false)
  const initial = readOverlayWinState()
  const [geom, setGeom] = useState<OverlayWinGeom>(initial)
  const [z, setZ] = useState(overlayZ)
  const [pointerInside, setPointerInside] = useState(false)
  const [composerFocused, setComposerFocused] = useState(true)
  const [resizing, setResizing] = useState(false)
  const boxRef = useRef<HTMLDivElement>(null)
  const cardRef = useRef<HTMLDivElement>(null)
  const leaveTimer = useRef<number>(0)
  const resizeRef = useRef<(OverlayWinGeom & ResizeEdge & { px: number; py: number }) | null>(null)
  const geomRef = useRef(geom)
  geomRef.current = geom
  const dimmed = !pointerInside && !composerFocused && !resizing

  const bringFront = useCallback(() => {
    overlayZ += 1
    setZ(overlayZ)
  }, [])

  const apply = useCallback((next: OverlayWinGeom, persist = true) => {
    const vw = window.innerWidth
    const vh = window.innerHeight
    const geom = overlayLayoutGeom('right', next, vw, vh)
    setGeom(geom)
    if (persist) writeOverlayWinState({ ...geom, layout: 'right' })
    return geom
  }, [])

  useEffect(() => {
    const onFocus = () => bringFront()
    window.addEventListener('biu:overlay-focus', onFocus)
    return () => window.removeEventListener('biu:overlay-focus', onFocus)
  }, [bringFront])

  useEffect(() => {
    const wake = () => setComposerFocused(true)
    const syncFocus = () => {
      setComposerFocused(overlayHoldsFocus(boxRef.current, document.activeElement) || isComposerFocusPending())
    }
    const onFocusIn = (event: FocusEvent) => {
      if (overlayHoldsFocus(boxRef.current, event.target)) setComposerFocused(true)
    }
    const onFocusOut = () => {
      window.requestAnimationFrame(syncFocus)
    }
    window.addEventListener('biu:composer-focus', wake)
    document.addEventListener('focusin', onFocusIn)
    document.addEventListener('focusout', onFocusOut)
    const boot = window.setTimeout(syncFocus, 200)
    return () => {
      window.removeEventListener('biu:composer-focus', wake)
      document.removeEventListener('focusin', onFocusIn)
      document.removeEventListener('focusout', onFocusOut)
      window.clearTimeout(boot)
    }
  }, [])

  useEffect(() => {
    const onOutside = (event: PointerEvent) => {
      if (!shouldCloseOverlayOnOutside(event.target)) return
      closeChatOverlay()
    }
    document.addEventListener('pointerdown', onOutside)
    return () => document.removeEventListener('pointerdown', onOutside)
  }, [])

  useEffect(() => {
    const el = boxRef.current
    if (!el) return
    const onClose = (event: PointerEvent) => {
      const target = event.target
      if (!(target instanceof Element) || !target.closest('[data-testid="chat-overlay-close"]')) return
      event.preventDefault()
      event.stopPropagation()
      closeChatOverlay()
    }
    el.addEventListener('pointerdown', onClose, true)
    return () => el.removeEventListener('pointerdown', onClose, true)
  }, [])

  useEffect(() => {
    const onMove = (event: PointerEvent) => {
      const resize = resizeRef.current
      if (!resize) return
      const dx = event.clientX - resize.px
      const dy = event.clientY - resize.py
      let { x, y, w, h } = resize
      if (resize.east) w = resize.w + dx
      if (resize.west) {
        w = resize.w - dx
        x = resize.x + dx
      }
      if (resize.north) {
        h = resize.h - dy
        y = resize.y + dy
      }
      if (resize.south) h = resize.h + dy
      apply({ x, y, w, h }, false)
    }
    const onUp = () => {
      if (resizeRef.current) {
        writeOverlayWinState({ ...geomRef.current, layout: 'right' })
      }
      resizeRef.current = null
      setResizing(false)
      setOverlayResizing(false)
    }
    const onResize = () => {
      apply(geomRef.current)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      window.removeEventListener('resize', onResize)
    }
  }, [apply])

  const startResize = (edge: ResizeEdge) => (event: ReactPointerEvent) => {
    event.preventDefault()
    event.stopPropagation()
    bringFront()
    setResizing(true)
    setOverlayResizing(true)
    const el = cardRef.current
    const r = el?.getBoundingClientRect()
    resizeRef.current = {
      ...edge,
      x: geom.x,
      y: geom.y,
      w: r?.width ?? geom.w,
      h: r?.height ?? geom.h,
      px: event.clientX,
      py: event.clientY,
    }
  }

  const handles: Array<{ key: string; className: string; edge: ResizeEdge }> = [
    { key: 'n', className: 'absolute inset-x-8 top-0 h-2.5 cursor-n-resize', edge: { north: true } },
    { key: 'w', className: 'absolute inset-y-2 left-0 w-1.5 cursor-w-resize', edge: { west: true } },
    { key: 'nw', className: 'absolute top-0 left-0 size-3 cursor-nwse-resize', edge: { north: true, west: true } },
  ]

  return (
    <div
      ref={boxRef}
      className={`chat-overlay-panel${threadOpen ? '' : ' is-compose-only'}${dimmed ? ' is-dimmed' : ''}`}
      data-testid="chat-overlay-panel"
      data-overlay-layout="right"
      data-biu-ignore
      style={{
        left: geom.x,
        width: geom.w,
        bottom: 12,
        zIndex: z,
      }}
      onPointerDown={bringFront}
      onPointerEnter={() => {
        window.clearTimeout(leaveTimer.current)
        setPointerInside(true)
      }}
      onPointerLeave={(event) => {
        if (overlayStillHoldsPointer(boxRef.current, event.relatedTarget, event.clientX, event.clientY)) return
        window.clearTimeout(leaveTimer.current)
        leaveTimer.current = window.setTimeout(() => setPointerInside(false), 120)
      }}
    >
      {threadOpen ? (
        <ChatPane
          paneRef={cardRef}
          style={{ height: geom.h }}
          aside={
            <>
              <div className="chat-overlay-head" data-testid="chat-overlay-head">
                {header}
              </div>
              {handles.map((item) => (
                <div
                  key={item.key}
                  className={`${item.className} z-40`}
                  data-testid={`chat-overlay-resize-${item.key}`}
                  onPointerDown={startResize(item.edge)}
                />
              ))}
            </>
          }
          thread={thread}
        />
      ) : null}
      <div className="chat-composer-dock">{dock}</div>
    </div>
  )
}
