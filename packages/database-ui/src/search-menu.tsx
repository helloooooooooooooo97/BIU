import { useEffect, useRef, type ReactNode, type RefObject } from 'react'
import { AnchorMenu } from '@biu/biu-ui'

const STYLE_ID = 'biu-database-ui-search'
const CSS = `
.db-search-menu{box-sizing:border-box;padding:6px;background:var(--biu-sidebar);border:0;border-radius:10px;box-shadow:var(--biu-shadow);display:flex;flex-direction:column;gap:4px;font-size:var(--biu-font-4)}
.db-search-field{display:flex;align-items:center;gap:6px;border:0;border-radius:8px;padding:4px 8px;color:var(--biu-label-3);background:transparent;font-size:var(--biu-font-4)}
.db-search-field input{flex:1;min-width:0;border:0;background:transparent;color:var(--biu-label);font-family:inherit;font-size:var(--biu-font-4);font-weight:400;line-height:1.4;outline:none}
.db-search-field input::placeholder{font-size:var(--biu-font-4);color:var(--biu-label-3)}
.db-search-list{display:flex;flex-direction:column;gap:1px;max-height:220px;overflow:auto}
.db-search-option{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;border:0;border-radius:6px;padding:5px 6px;background:transparent;color:var(--biu-label);font-family:inherit;font-size:var(--biu-font-4);cursor:pointer;text-align:left}
.db-search-option:hover,.db-search-option.is-selected,.db-search-option.is-active{background:color-mix(in srgb,var(--biu-business) 12%,transparent)}
.db-search-option-main{display:inline-flex;align-items:center;gap:6px;min-width:0}
.db-search-option .fsdb-field-glyph,.db-cell-select-trigger .fsdb-field-glyph{color:var(--biu-icon);flex:none}
.db-search-empty{padding:8px;color:var(--biu-label-3);font-size:var(--biu-font-4)}
.db-search-foot{border-top:1px solid var(--biu-border);margin-top:4px;padding-top:4px}
.db-cell-select{display:inline-flex;position:relative;min-width:0;max-width:100%;box-sizing:border-box;vertical-align:middle}
.db-cell-select-trigger{display:inline-flex;align-items:center;gap:5px;max-width:none;height:var(--biu-control-h-sm);border:0;border-radius:4px;padding:0 6px;background:transparent;color:var(--biu-label);font:inherit;font-size:var(--biu-font-4);font-weight:500;line-height:var(--biu-control-h-sm);cursor:pointer;text-align:left}
.db-cell-select-trigger:hover,.db-cell-select-trigger[data-open]{background:transparent}
.db-cell-select-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.db-cell-select-caret{flex:none;opacity:.55;color:var(--biu-label-2)}
.db-cell-select-trigger.is-chip{background:transparent;padding:0;height:auto;max-width:none}
.db-cell-select-trigger.is-chip:hover,.db-cell-select-trigger.is-chip[data-open]{background:transparent}
.db-cell-select-trigger.is-empty{max-width:none;color:var(--biu-label-3);background:transparent;font-weight:500}
.db-cell-select.is-field{display:block;width:100%}
.db-cell-select.is-field .db-cell-select-trigger{display:flex;justify-content:space-between;gap:6px;width:100%;max-width:none;min-height:28px;border:1px solid var(--biu-border);border-radius:7px;padding:5px 8px;background:var(--biu-input);color:var(--biu-label)}
.db-cell-select.is-field .db-cell-select-trigger:hover,.db-cell-select.is-field .db-cell-select-trigger[data-open]{background:var(--biu-hover);filter:none}
.db-cell-select.is-field .db-cell-select-trigger.is-empty{color:var(--biu-label-3)}
.db-cell-multi{position:relative;display:flex;min-width:0;width:100%;max-width:100%;vertical-align:middle}
.db-cell-multi.is-empty{display:flex;width:100%;min-width:0;align-self:stretch}
.db-cell-multi-box{display:flex;flex-wrap:wrap;align-items:center;gap:4px;width:100%;max-width:none;min-height:20px;border:0;border-radius:6px;padding:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}
.db-cell-multi-box.is-empty{display:flex;width:100%;min-height:var(--biu-control-h-sm);min-width:0;align-self:stretch}
.db-cell-multi-box:hover,.db-cell-multi-box[aria-expanded="true"]{background:transparent}
.db-datetime{display:inline-flex;align-items:center;gap:4px;position:relative;min-width:0;width:100%;max-width:100%;vertical-align:middle;color:inherit}
.db-datetime-trigger,.db-datetime-label{display:inline-flex;min-width:0;max-width:100%;border:0;padding:0;background:transparent;font-size:var(--biu-font-4);font-weight:500;color:var(--biu-label);outline:none;text-align:left}
.db-datetime-trigger:focus-visible{outline:none}
.db-datetime-trigger:not(:empty)::placeholder,.db-datetime .db-datetime-trigger:empty{font-size:var(--biu-font-4);font-weight:500;color:var(--biu-label-3)}
.db-datetime.is-overdue .db-datetime-trigger,.db-datetime.is-overdue .db-datetime-label,.db-datetime.is-overdue{color:var(--biu-danger)}
`

export function ensureDbSearchStyle() {
  if (typeof document === 'undefined') return
  let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
  if (!style) {
    style = document.createElement('style')
    style.id = STYLE_ID
    document.head.appendChild(style)
  }
  if (style.textContent !== CSS) style.textContent = CSS
}

function SearchMark() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
      <path
        fillRule="evenodd"
        d="M11.5 7a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0Zm-.82 4.26a6 6 0 1 1 1.06-1.06l3.04 3.04a.75.75 0 1 1-1.06 1.06l-3.04-3.04Z"
        clipRule="evenodd"
      />
    </svg>
  )
}

export function DbMenu({
  anchor,
  onClose,
  children,
  footer,
  className,
  ...rest
}: {
  anchor: HTMLElement | null
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  className?: string
} & Record<string, unknown>) {
  ensureDbSearchStyle()
  return (
    <AnchorMenu
      anchor={anchor}
      onClose={onClose}
      className={className ? `db-search-menu fsdb-page ${className}` : 'db-search-menu fsdb-page'}
      {...rest}
    >
      {children}
      {footer ? <div className="db-search-foot">{footer}</div> : null}
    </AnchorMenu>
  )
}

export function DbSearchMenu({
  anchor,
  onClose,
  query,
  onQuery,
  placeholder = '搜索',
  children,
  empty,
  footer,
  onEnter,
  searchRef,
  ...rest
}: {
  anchor: HTMLElement | null
  onClose: () => void
  query: string
  onQuery: (next: string) => void
  placeholder?: string
  children: ReactNode
  empty?: ReactNode
  footer?: ReactNode
  onEnter?: () => void
  searchRef?: RefObject<HTMLInputElement | null>
} & Record<string, unknown>) {
  const innerRef = useRef<HTMLInputElement>(null)
  const inputRef = searchRef ?? innerRef
  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 0)
    return () => window.clearTimeout(id)
  }, [inputRef])
  return (
    <DbMenu anchor={anchor} onClose={onClose} footer={footer} {...rest}>
      <label className="db-search-field">
        <SearchMark />
        <input
          ref={inputRef}
          value={query}
          placeholder={placeholder}
          aria-label={placeholder}
          onChange={(event) => onQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault()
              onClose()
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              onEnter?.()
            }
          }}
        />
      </label>
      <div className="db-search-list">
        {children}
        {empty}
      </div>
    </DbMenu>
  )
}

export function DbSearchOption({
  selected,
  onClick,
  children,
  mark,
}: {
  selected?: boolean
  onClick: () => void
  children: ReactNode
  mark?: ReactNode
}) {
  return (
    <button
      type="button"
      className={`db-search-option${selected ? ' is-selected' : ''}`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={(event) => {
        event.stopPropagation()
        onClick()
      }}
    >
      <span className="db-search-option-main">{children}</span>
      {mark}
    </button>
  )
}
