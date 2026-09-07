import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { SlashItem } from './slash.ts'
import { slashGroups } from './slash.ts'

function slashIcon(id: string) {
  if (id === 'text') return 'T'
  if (id === 'h1') return 'H1'
  if (id === 'h2') return 'H2'
  if (id === 'h3') return 'H3'
  if (id === 'bullet') return '•'
  if (id === 'ordered') return '1.'
  if (id === 'quote') return '“'
  if (id === 'code') return '</>'
  if (id === 'divider') return '—'
  if (id === 'image') return '图'
  if (id === 'table') return '表'
  if (id === 'math') return '∑'
  if (id === 'math-inline') return '𝑥'
  if (id === 'algorithm') return 'LC'
  return '+'
}

function slashKeys(id: string) {
  if (id === 'h1') return '#'
  if (id === 'h2') return '##'
  if (id === 'h3') return '###'
  if (id === 'bullet') return '-'
  if (id === 'ordered') return '1.'
  if (id === 'quote') return '>'
  if (id === 'code') return '```'
  if (id === 'divider') return '---'
  if (id === 'math') return '$$'
  if (id === 'math-inline') return '$'
  return ''
}

/** 只滚菜单自己，避免 scrollIntoView 把页面/编辑器卷走、光标乱插空段。 */
export function scrollMenuChild(list: HTMLElement, item: HTMLElement) {
  const top = item.offsetTop
  const bottom = top + item.offsetHeight
  const viewTop = list.scrollTop
  const viewBottom = viewTop + list.clientHeight
  if (top < viewTop) list.scrollTop = top
  else if (bottom > viewBottom) list.scrollTop = bottom - list.clientHeight
}

export const SlashList = forwardRef(function SlashList(
  {
    items,
    command,
  }: {
    items: SlashItem[]
    command: (item: SlashItem) => void
  },
  ref,
) {
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)
  const keyNav = useRef(false)
  activeRef.current = active

  useEffect(() => {
    setActive(0)
  }, [items])

  useEffect(() => {
    if (!keyNav.current) return
    keyNav.current = false
    const list = listRef.current
    const item = list?.querySelector<HTMLElement>('.page-slash-item.is-active')
    if (list && item) scrollMenuChild(list, item)
  }, [active, items])

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }: { event: KeyboardEvent }) {
      if (!items.length) return false
      if (event.key === 'ArrowUp') {
        keyNav.current = true
        setActive((index) => (index + items.length - 1) % items.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        keyNav.current = true
        setActive((index) => (index + 1) % items.length)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = items[activeRef.current]
        if (item) command(item)
        return true
      }
      return false
    },
  }))

  const groups = useMemo(() => slashGroups(items), [items])
  const flat = useMemo(() => groups.flatMap((group) => group.items.map((item) => ({ group: group.id, item }))), [groups])

  return (
    <div className="page-slash" id="slash-command" role="listbox" aria-label="插入模块" data-testid="page-slash">
      <div ref={listRef} className="page-slash-list" onWheel={(event) => event.stopPropagation()}>
        {items.length ? (
          groups.map((group) => (
            <div key={group.id} className="page-slash-group">
              <div className="page-slash-head">{group.label}</div>
              {group.items.map((item) => {
                const index = flat.findIndex((entry) => entry.item.id === item.id)
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className={`page-slash-item${index === active ? ' is-active' : ''}`}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      command(item)
                    }}
                  >
                    <span className="page-slash-icon">{slashIcon(item.id)}</span>
                    <span className="page-slash-label">{item.label}</span>
                    {slashKeys(item.id) ? <span className="page-slash-keys">{slashKeys(item.id)}</span> : null}
                  </button>
                )
              })}
            </div>
          ))
        ) : (
          <div className="page-slash-empty">没有匹配的模块</div>
        )}
      </div>
      <div className="page-slash-foot">
        <span>关闭菜单</span>
        <span className="page-slash-keys">esc</span>
      </div>
    </div>
  )
})
