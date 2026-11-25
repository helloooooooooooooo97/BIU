import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import type { SlotProps } from '@biu/types/slots'
import { getPick, usePickState } from './service.ts'
import { boxFromPoints, pickSurfaceAtPoint, resolvePickFromEvent, resolvePickFromNode, resolvePicksInRect, visiblePickBox } from './resolve.ts'
import { bindPickDragScroll, pickDragScroller } from './drag-scroll.ts'
import { pickKey, type PickRef } from './types.ts'
import { SANDBOX_PICK_EVENT } from './sandbox-relay.ts'

const DRAG_PX = 6

export const PICK_NAV_GUARD =
  '[data-biu-ignore], .brand-corner-cluster, .page-bubble, [data-testid="inspector-toggle"], [data-testid="fsdb-inspector-toggle"], [data-testid="chat-overlay-panel"]'

export function ignorePickCapture(target: EventTarget | null, event?: Event) {
  const path = event && 'composedPath' in event ? event.composedPath() : []
  const nodes = path.length ? path : target instanceof Element ? [target] : []
  if (
    nodes.some(
      (node) =>
        node instanceof Element &&
        (node.hasAttribute('data-sandbox-pick') ||
          node.hasAttribute('data-html-pick') ||
          node.hasAttribute('data-biu-kind')),
    )
  ) {
    return false
  }
  return nodes.some((node) => node instanceof Element && node.closest(PICK_NAV_GUARD))
}

function hoverBox(el: HTMLElement) {
  const box = visiblePickBox(el) ?? el.getBoundingClientRect()
  return { top: box.top, left: box.left, width: box.width, height: box.height }
}

export function PickOverlay(_props: SlotProps) {
  const pick = getPick()
  const { picking, hover, marquee, marqueeHits } = usePickState(pick)

  useEffect(() => {
    if (!pick || !picking) {
      document.documentElement.classList.remove('pick-mode')
      return
    }
    document.documentElement.classList.add('pick-mode')
    const route = () => window.location.pathname
    const EDITOR_SEL = '.page-editor:not(.is-host), .tiptap, [data-testid="page-editor"], .cm-editor'
    const pathHasEditor = (event: Event) =>
      event.composedPath().some((node) => node instanceof Element && (node.matches(EDITOR_SEL) || Boolean(node.closest(EDITOR_SEL))))

    type DragHit = { ref: PickRef; left: number; top: number; width: number; height: number }
    let drag: {
      x: number; y: number; boxed: boolean; editor: boolean
      pointer: { x: number; y: number }
      root: ParentNode
      scroller: HTMLElement | null
      scrollTop: number; scrollLeft: number
      hits: Map<string, DragHit>
    } | null = null
    let autoScroll: ReturnType<typeof bindPickDragScroll> | null = null
    let paintRaf = 0

    const paintDrag = () => {
      if (!drag || !drag.boxed) return
      const dx = (drag.scroller?.scrollLeft ?? 0) - drag.scrollLeft
      const dy = (drag.scroller?.scrollTop ?? 0) - drag.scrollTop
      const box = boxFromPoints(drag.x - dx, drag.y - dy, drag.pointer.x, drag.pointer.y)
      const hits = resolvePicksInRect(box, route(), drag.root)
      for (const hit of hits) {
        const rect = hit.el.getBoundingClientRect()
        drag.hits.set(pickKey(hit.ref), {
          ref: hit.ref, left: rect.left + dx, top: rect.top + dy, width: rect.width, height: rect.height,
        })
      }
      const content = boxFromPoints(drag.x, drag.y, drag.pointer.x + dx, drag.pointer.y + dy)
      for (const [key, hit] of drag.hits) {
        if (hit.left >= content.left + content.width || hit.left + hit.width <= content.left ||
            hit.top >= content.top + content.height || hit.top + hit.height <= content.top) drag.hits.delete(key)
      }
      // Keep refs for rows that virtualization unmounted, but draw within the original pane.
      const viewport = drag.scroller ? visiblePickBox(drag.scroller) : null
      const left = viewport ? Math.max(box.left, viewport.left) : box.left
      const top = viewport ? Math.max(box.top, viewport.top) : box.top
      const right = viewport ? Math.min(box.left + box.width, viewport.left + viewport.width) : box.left + box.width
      const bottom = viewport ? Math.min(box.top + box.height, viewport.top + viewport.height) : box.top + box.height
      pick.setMarquee(
        { top, left, width: Math.max(0, right - left), height: Math.max(0, bottom - top) },
        hits.map((hit) => hoverBox(hit.el)),
      )
    }
    const onScroll = () => {
      if (paintRaf) return
      paintRaf = requestAnimationFrame(() => { paintRaf = 0; paintDrag() })
    }
    const stopDrag = () => {
      autoScroll?.stop()
      autoScroll = null
      drag?.scroller?.removeEventListener('scroll', onScroll)
      if (paintRaf) cancelAnimationFrame(paintRaf)
      paintRaf = 0
      drag = null
    }

    const onMove = (event: PointerEvent) => {
      if (drag) {
        if (event.buttons === 0) { stopDrag(); pick.setMarquee(null); return }
        drag.pointer = { x: event.clientX, y: event.clientY }
        const dx = event.clientX - drag.x
        const dy = event.clientY - drag.y
        if (!drag.boxed && dx * dx + dy * dy >= DRAG_PX * DRAG_PX) drag.boxed = true
        if (!drag.boxed || drag.editor) return
        paintDrag()
        autoScroll?.update(drag.pointer)
        return
      }
      const hit = resolvePickFromEvent(event, route())
      if (!hit) {
        pick.setHover(null)
        return
      }
      pick.setHover(hoverBox(hit.el))
    }

    const onDown = (event: PointerEvent) => {
      if (event.button !== 0) return
      if (ignorePickCapture(event.target, event)) return
      stopDrag()
      const inReadable = pathHasEditor(event) || event.composedPath().some((node) => node instanceof Element && Boolean(node.closest('.chat-stage')))
      if (!inReadable) event.preventDefault()
      const editor = pathHasEditor(event)
      const scroller = editor ? null : pickDragScroller(event.composedPath())
      drag = {
        x: event.clientX, y: event.clientY, boxed: false, editor,
        pointer: { x: event.clientX, y: event.clientY },
        root: pickSurfaceAtPoint(event.clientX, event.clientY) ?? scroller ?? document,
        scroller, scrollTop: scroller?.scrollTop ?? 0, scrollLeft: scroller?.scrollLeft ?? 0,
        hits: new Map(),
      }
      if (scroller) {
        autoScroll = bindPickDragScroll(scroller, onScroll)
        scroller.addEventListener('scroll', onScroll, { passive: true })
      }
    }

    const onUp = (event: PointerEvent) => {
      if (!drag) return
      drag.pointer = { x: event.clientX, y: event.clientY }
      paintDrag()
      const started = drag
      stopDrag()
      if (!pick.picking) return
      if (started.boxed) {
        pick.addMany([...started.hits.values()].map((hit) => hit.ref))
        return
      }
      const hit = resolvePickFromEvent(event, route())
      if (hit) pick.add(hit.ref)
    }
    const onCancel = () => { stopDrag(); pick.setMarquee(null) }

    const onClick = (event: MouseEvent) => {
      if (ignorePickCapture(event.target, event)) return
      event.preventDefault()
      event.stopPropagation()
    }

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        pick.exit()
        const active = document.activeElement
        if (active instanceof HTMLElement) active.blur()
      }
    }

    const onSandbox = (event: Event) => {
      const detail = (event as CustomEvent<{ el?: HTMLElement; type?: string }>).detail
      const el = detail?.el
      if (!(el instanceof HTMLElement)) return
      const hit = resolvePickFromNode(el, route(), null)
      if (!hit) return
      if (detail?.type === 'pointerup') {
        if (pick.picking) pick.add(hit.ref)
        return
      }
      pick.setHover(hoverBox(hit.el))
    }

    window.addEventListener('pointerdown', onDown, true)
    window.addEventListener('pointermove', onMove, true)
    window.addEventListener('pointerup', onUp, true)
    window.addEventListener('pointercancel', onCancel, true)
    window.addEventListener('blur', onCancel)
    window.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKey, true)
    window.addEventListener(SANDBOX_PICK_EVENT, onSandbox)
    return () => {
      stopDrag()
      document.documentElement.classList.remove('pick-mode')
      window.removeEventListener('pointerdown', onDown, true)
      window.removeEventListener('pointermove', onMove, true)
      window.removeEventListener('pointerup', onUp, true)
      window.removeEventListener('pointercancel', onCancel, true)
      window.removeEventListener('blur', onCancel)
      window.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener(SANDBOX_PICK_EVENT, onSandbox)
    }
  }, [picking, pick])

  useEffect(() => {
    const onHotkey = (event: KeyboardEvent) => {
      if (event.repeat) return
      if (!pick) return
      const key = event.key.toLowerCase()
      const pickChord = (event.metaKey || event.ctrlKey) && key === '2'
      const legacy = event.altKey && key === 'c'
      if (!pickChord && !legacy) return
      event.preventDefault()
      pick.toggle()
    }
    window.addEventListener('keydown', onHotkey)
    return () => window.removeEventListener('keydown', onHotkey)
  }, [pick])

  if (!picking) return null
  const layer = (
    <>
      {marquee ? (
        <div
          className="pick-overlay-box pick-overlay-marquee"
          data-biu-ignore
          data-testid="pick-marquee"
          style={{
            top: marquee.top,
            left: marquee.left,
            width: marquee.width,
            height: marquee.height,
          }}
        />
      ) : null}
      {(marquee ? marqueeHits : hover ? [hover] : []).map((box, index) => (
        <div
          key={`${box.left}-${box.top}-${index}`}
          className="pick-overlay-box pick-overlay-hit"
          data-biu-ignore
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
          }}
        />
      ))}
    </>
  )
  if (typeof document === 'undefined') return layer
  return createPortal(layer, document.body)
}
