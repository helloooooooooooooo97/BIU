import { useEffect, useState, type KeyboardEvent } from 'react'

export function ExpandNavTitle({
  value,
  readOnly,
  testId,
  placeholder = '标题',
  onCommit,
}: {
  value: string
  readOnly?: boolean
  testId: string
  placeholder?: string
  onCommit: (next: string) => void
}) {
  const [draft, setDraft] = useState(value)
  useEffect(() => {
    setDraft(value)
  }, [value])
  const commit = () => {
    const next = draft.trim()
    if (!next || next === value) {
      setDraft(value)
      return
    }
    onCommit(next)
  }
  return (
    <input
      className="page-block-expand-nav-title"
      data-testid={testId}
      data-biu-ignore
      readOnly={readOnly}
      value={draft}
      placeholder={placeholder}
      aria-label="标题"
      onMouseDown={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          event.currentTarget.blur()
        }
        if (event.key === 'Escape') {
          setDraft(value)
          event.currentTarget.blur()
        }
      }}
    />
  )
}
