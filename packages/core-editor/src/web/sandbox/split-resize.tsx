import React, { useEffect, useRef } from 'react'

/** Same drag as shell `.sidebar-resize`: left pane keeps a px width, right pane flexes. */
export function SplitResize({
  paneRef,
  onWidth,
  testId = 'sandbox-split-resize',
}: {
  paneRef: { current: HTMLElement | null }
  onWidth: (width: number) => void
  testId?: string
}) {
  const drag = useRef<{ x: number; w: number } | null>(null)
  const onWidthRef = useRef(onWidth)
  onWidthRef.current = onWidth
  useEffect(() => {
    const move = (event: PointerEvent) => {
      const start = drag.current
      if (!start) return
      event.preventDefault()
      const stage = paneRef.current?.parentElement
      const max = Math.max(120, (stage?.clientWidth ?? start.w) - 120)
      onWidthRef.current(Math.min(max, Math.max(120, Math.round(start.w + event.clientX - start.x))))
    }
    const up = () => {
      drag.current = null
      document.body.style.removeProperty('cursor')
      document.body.style.removeProperty('user-select')
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', up)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', up)
    }
  }, [paneRef])
  return (
    <div
      className="sandbox-split-resize"
      data-testid={testId}
      data-biu-ignore
      title="拖动调整宽度"
      onPointerDown={(event) => {
        event.preventDefault()
        event.stopPropagation()
        const pane = paneRef.current
        if (!pane) return
        drag.current = { x: event.clientX, w: pane.offsetWidth }
        document.body.style.cursor = 'col-resize'
        document.body.style.userSelect = 'none'
      }}
    />
  )
}

export function splitPaneStyle(width: number): React.CSSProperties | undefined {
  if (!width) return undefined
  return { flex: 'none', width }
}
