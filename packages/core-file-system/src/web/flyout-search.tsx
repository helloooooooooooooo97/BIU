import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useOptionCursor } from '@biu/database-ui/search'

export function flyoutQueryMatch(text: string, q: string) {
  const needle = q.trim().toLowerCase()
  if (!needle) return true
  return text.toLowerCase().includes(needle)
}

export function FlyoutSearch({
  value,
  onChange,
  onListKeyDown,
}: {
  value: string
  onChange: (next: string) => void
  onListKeyDown?: (event: KeyboardEvent<HTMLInputElement>) => void
}) {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const id = window.requestAnimationFrame(() => ref.current?.focus({ preventScroll: true }))
    return () => window.cancelAnimationFrame(id)
  }, [])
  return (
    <input
      ref={ref}
      className="tasks-sort-search font-medium"
      data-testid="tasks-sort-search"
      value={value}
      placeholder="搜索…"
      aria-label="搜索"
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Escape') {
          if (!value) return
          event.preventDefault()
          event.stopPropagation()
          onChange('')
          return
        }
        onListKeyDown?.(event)
      }}
    />
  )
}

export function FlyoutEmpty() {
  return (
    <div className="tasks-viewdd-empty" data-testid="tasks-sort-empty">
      没有匹配项
    </div>
  )
}

export function SearchableFlyout({
  className,
  children,
}: {
  className: string
  children: (q: string) => ReactNode
}) {
  const [q, setQ] = useState('')
  const { listRef, onKeyDown } = useOptionCursor(q)
  return (
    <div className={`fsdb-tool-flyout ${className}`} role="menu" onKeyDown={(event) => onKeyDown(event)}>
      <FlyoutSearch value={q} onChange={setQ} onListKeyDown={onKeyDown} />
      <div className="tasks-sort-list" ref={listRef}>
        {children(q)}
      </div>
    </div>
  )
}
