import { useEffect, useRef, type KeyboardEvent } from 'react'
import { ChevronDownIcon, ChevronUpIcon, MagnifyingGlassIcon, XMarkIcon } from '@heroicons/react/16/solid'

export function FindBar({
  query,
  index,
  total,
  onQuery,
  onNext,
  onPrev,
  onClose,
}: {
  query: string
  index: number
  total: number
  onQuery: (next: string) => void
  onNext: () => void
  onPrev: () => void
  onClose: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [])

  const onKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      onClose()
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (event.shiftKey) onPrev()
      else onNext()
    }
  }

  const label = query.trim() ? `${total ? index + 1 : 0}/${total}` : ''

  return (
    <div className="page-find" data-testid="page-find" role="search">
      <div className="page-find-box">
        <MagnifyingGlassIcon aria-hidden className="page-find-icon" />
        <input
          ref={input}
          type="search"
          className="page-find-input"
          placeholder="搜索"
          aria-label="正文搜索"
          value={query}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={onKey}
        />
        <span className="page-find-count" data-testid="page-find-count">
          {label}
        </span>
        <button type="button" className="page-find-btn" title="上一个" aria-label="上一个" onClick={onPrev}>
          <ChevronUpIcon aria-hidden className="size-3.5" />
        </button>
        <button type="button" className="page-find-btn" title="下一个" aria-label="下一个" onClick={onNext}>
          <ChevronDownIcon aria-hidden className="size-3.5" />
        </button>
        <button type="button" className="page-find-btn" title="关闭" aria-label="关闭搜索" onClick={onClose}>
          <XMarkIcon aria-hidden className="size-3.5" />
        </button>
      </div>
    </div>
  )
}

export function isFindHotkey(event: { key: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean; isComposing?: boolean }) {
  if (event.isComposing) return false
  if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return false
  return event.key === 'f' || event.key === 'F'
}
