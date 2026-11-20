import { useLayoutEffect, useState, type RefObject } from 'react'

export type FloatingPlacement =
  | 'bottom'
  | 'bottom-start'
  | 'bottom-end'
  | 'top'
  | 'top-start'
  | 'top-end'
  | 'right'
  | 'right-start'
  | 'left'
  | 'left-start'

export type FloatingRect = {
  top: number
  bottom: number
  left: number
  right: number
  width: number
  height: number
}

export type FloatingPosition = {
  top: number
  left: number
  maxHeight: number
  maxWidth: number
  placement: FloatingPlacement
}

export type ComputeFloatingOptions = {
  anchor: FloatingRect
  floating: { width: number; height: number }
  viewport?: { width: number; height: number }
  placement?: FloatingPlacement
  offset?: number
  padding?: number
  flip?: boolean
  shift?: boolean
}

function splitPlacement(placement: FloatingPlacement): [side: 'top' | 'bottom' | 'left' | 'right', align: 'center' | 'start' | 'end'] {
  const [side, align] = placement.split('-') as ['top' | 'bottom' | 'left' | 'right', 'start' | 'end' | undefined]
  return [side, align ?? 'center']
}

function joinPlacement(side: 'top' | 'bottom' | 'left' | 'right', align: 'center' | 'start' | 'end'): FloatingPlacement {
  if (align === 'center') return side
  if ((side === 'left' || side === 'right') && align === 'end') return `${side}-start`
  return `${side}-${align}` as FloatingPlacement
}

/**
 * 统一的视口防溢出浮窗定位算法：
 * - 自动碰撞翻转（底→顶、顶→底、右→左、左→右）
 * - 自动视口边缘 clamp（保证永不被浏览器四边裁切）
 * - 计算剩余可用 maxHeight / maxWidth，超长内容在浮窗内部滚动
 */
export function computeFloatingPosition(opts: ComputeFloatingOptions): FloatingPosition {
  const {
    anchor,
    floating,
    viewport = {
      width: typeof window !== 'undefined' ? window.innerWidth : 1280,
      height: typeof window !== 'undefined' ? window.innerHeight : 800,
    },
    placement = 'bottom-start',
    offset = 6,
    padding = 8,
    flip = true,
    shift = true,
  } = opts

  const vw = Math.max(160, viewport.width || 1280)
  const vh = Math.max(160, viewport.height || 800)
  const maxWidth = Math.max(120, vw - padding * 2)
  const fw = Math.min(Math.max(0, floating.width), maxWidth)
  const fh = Math.max(0, floating.height)

  let [side, align] = splitPlacement(placement)

  const spaceBelow = vh - padding - (anchor.bottom + offset)
  const spaceAbove = anchor.top - offset - padding
  const spaceRight = vw - padding - (anchor.right + offset)
  const spaceLeft = anchor.left - offset - padding

  if (flip) {
    if (side === 'bottom' && fh > spaceBelow && spaceAbove > spaceBelow) {
      side = 'top'
    } else if (side === 'top' && fh > spaceAbove && spaceBelow > spaceAbove) {
      side = 'bottom'
    } else if (side === 'right' && fw > spaceRight && spaceLeft > spaceRight) {
      side = 'left'
    } else if (side === 'left' && fw > spaceLeft && spaceRight > spaceLeft) {
      side = 'right'
    }
  }

  let left = 0
  let top = 0
  let maxHeight = Math.max(80, vh - padding * 2)

  if (side === 'bottom' || side === 'top') {
    if (align === 'start') left = anchor.left
    else if (align === 'end') left = anchor.right - fw
    else left = anchor.left + anchor.width / 2 - fw / 2

    if (side === 'bottom') {
      top = anchor.bottom + offset
      maxHeight = Math.max(80, vh - padding - top)
    } else {
      maxHeight = Math.max(80, anchor.top - offset - padding)
      const effectiveH = Math.min(fh, maxHeight)
      top = anchor.top - offset - effectiveH
    }
  } else {
    if (align === 'start') top = anchor.top
    else top = anchor.top + anchor.height / 2 - fh / 2

    if (side === 'right') {
      left = anchor.right + offset
    } else {
      left = anchor.left - offset - fw
    }
    maxHeight = Math.max(80, vh - padding * 2)
  }

  if (shift) {
    const maxLeft = Math.max(padding, vw - padding - fw)
    left = Math.min(maxLeft, Math.max(padding, left))
    const clampedH = Math.min(fh, maxHeight)
    const maxTop = Math.max(padding, vh - padding - clampedH)
    top = Math.min(maxTop, Math.max(padding, top))
    if (side === 'bottom') {
      maxHeight = Math.max(80, vh - padding - top)
    }
  }

  return {
    top: Math.round(top),
    left: Math.round(left),
    maxHeight: Math.round(maxHeight),
    maxWidth: Math.round(maxWidth),
    placement: joinPlacement(side, align),
  }
}

export type UseFloatingPositionOptions = {
  placement?: FloatingPlacement
  offset?: number
  padding?: number
  flip?: boolean
  shift?: boolean
  fallbackWidth?: number
  fallbackHeight?: number
  enabled?: boolean
}

export function useFloatingPosition(
  anchor: Element | null,
  floatingRef: RefObject<HTMLElement | null>,
  opts: UseFloatingPositionOptions = {},
): FloatingPosition & { anchorWidth: number } {
  const {
    placement = 'bottom-start',
    offset = 6,
    padding = 8,
    flip = true,
    shift = true,
    fallbackWidth = 220,
    fallbackHeight = 200,
    enabled = true,
  } = opts

  const [pos, setPos] = useState<FloatingPosition & { anchorWidth: number }>({
    top: 0,
    left: 0,
    maxHeight: 360,
    maxWidth: 400,
    placement,
    anchorWidth: fallbackWidth,
  })

  useLayoutEffect(() => {
    if (!enabled || !anchor) return
    let raf = 0

    const measure = () => {
      raf = 0
      if (!anchor.isConnected) return
      const anchorRect = anchor.getBoundingClientRect()
      const el = floatingRef.current
      const elRect = el?.getBoundingClientRect()
      const fw = elRect && elRect.width > 0 ? elRect.width : Math.max(fallbackWidth, anchorRect.width)
      const fh = elRect && elRect.height > 0 ? elRect.height : fallbackHeight
      const next = computeFloatingPosition({
        anchor: {
          top: anchorRect.top,
          bottom: anchorRect.bottom,
          left: anchorRect.left,
          right: anchorRect.right,
          width: anchorRect.width,
          height: anchorRect.height,
        },
        floating: { width: fw, height: fh },
        viewport: { width: window.innerWidth, height: window.innerHeight },
        placement,
        offset,
        padding,
        flip,
        shift,
      })
      const anchorWidth = Math.round(anchorRect.width)
      setPos((prev) =>
        prev.top === next.top &&
        prev.left === next.left &&
        prev.maxHeight === next.maxHeight &&
        prev.maxWidth === next.maxWidth &&
        prev.placement === next.placement &&
        prev.anchorWidth === anchorWidth
          ? prev
          : { ...next, anchorWidth },
      )
    }

    const schedule = () => {
      if (raf) return
      raf = window.requestAnimationFrame(measure)
    }

    measure()
    window.addEventListener('resize', schedule)
    window.addEventListener('scroll', schedule, true)

    let ro: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && floatingRef.current) {
      ro = new ResizeObserver(schedule)
      ro.observe(floatingRef.current)
    }

    return () => {
      if (raf) window.cancelAnimationFrame(raf)
      window.removeEventListener('resize', schedule)
      window.removeEventListener('scroll', schedule, true)
      ro?.disconnect()
    }
  }, [anchor, enabled, fallbackHeight, fallbackWidth, flip, floatingRef, offset, padding, placement, shift])

  return pos
}
