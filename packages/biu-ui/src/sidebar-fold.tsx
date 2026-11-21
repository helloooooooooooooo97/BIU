import { useEffect, useLayoutEffect, useRef, useState, type ReactNode, type TransitionEvent } from 'react'

export function SidebarFold({
  open,
  children,
  className,
  animate = true,
}: {
  open: boolean
  children: ReactNode
  className?: string
  animate?: boolean
}) {
  const [animating, setAnimating] = useState(false)
  const openRef = useRef(open)
  // 首帧切换 open 时立即带上 is-animating，避免 useLayoutEffect 二次提交才加 transition 导致漏帧或跳变。
  const isAnimating = animating || (animate && openRef.current !== open)

  useLayoutEffect(() => {
    if (openRef.current === open) return
    openRef.current = open
    setAnimating(animate)
  }, [animate, open])

  // 兜底清理：prefers-reduced-motion 或隐藏容器未触发 transitionend 时，不长期残留 is-animating。
  useEffect(() => {
    if (!animating) return
    const timer = window.setTimeout(() => setAnimating(false), 260)
    return () => window.clearTimeout(timer)
  }, [animating])

  function onTransitionEnd(event: TransitionEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return
    if (event.propertyName !== 'grid-template-rows') return
    setAnimating(false)
  }

  return (
    <div
      className={`sidebar-fold${open ? ' is-open' : ''}${isAnimating ? ' is-animating' : ''}${className ? ` ${className}` : ''}`}
      aria-hidden={!open}
      onTransitionEnd={onTransitionEnd}
    >
      <div className="sidebar-fold-inner" inert={!open || undefined}>
        {children}
      </div>
    </div>
  )
}
