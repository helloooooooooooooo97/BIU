import { useEffect, useRef } from 'react'

/**
 * 滚动入场动画：给容器内所有 [data-reveal] 元素在进入视口时加上 is-visible。
 * 没有 IntersectionObserver 时（老环境 / no-JS 兜底失败）直接全部可见，
 * 保证内容不会因为动画而整页空白。
 */
export function useReveal<T extends HTMLElement>() {
  const ref = useRef<T>(null)

  useEffect(() => {
    const root = ref.current
    if (!root) return
    const items = Array.from(root.querySelectorAll<HTMLElement>('[data-reveal]'))
    if (typeof IntersectionObserver === 'undefined') {
      for (const item of items) item.classList.add('is-visible')
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          entry.target.classList.add('is-visible')
          observer.unobserve(entry.target)
        }
      },
      { root, rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    )
    for (const item of items) observer.observe(item)
    return () => observer.disconnect()
  }, [])

  return ref
}
