import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { SlashItem } from './slash.ts'
import { filterSlashItems, slashGroups } from './slash.ts'
import { usePageEditorVersion } from './service.ts'
import { openAppPath, useSlashCatalogVersion } from './slash-memory.ts'

function iconPath(d: string) {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor" aria-hidden>
      <path fillRule="evenodd" d={d} clipRule="evenodd" />
    </svg>
  )
}

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
  if (id === 'toc') {
    return iconPath(
      'M2 3.75A.75.75 0 0 1 2.75 3h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 3.75ZM2 8.25a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8.25ZM2 12.75a.75.75 0 0 1 .75-.75h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1-.75-.75Z',
    )
  }
  if (id === 'run') {
    return iconPath(
      'M3 3.25a.75.75 0 0 1 1.14-.64l8.25 4.75a.75.75 0 0 1 0 1.28l-8.25 4.75A.75.75 0 0 1 3 12.75v-9.5Z',
    )
  }
  if (id === 'sandbox') {
    return (
      <svg viewBox="0 0 16 16" width="14" height="14" fill="var(--biu-color-ink-purple)" aria-hidden>
        <path
          fillRule="evenodd"
          clipRule="evenodd"
          d="M7.628 1.349a.75.75 0 0 1 .744 0l1.247.712a.75.75 0 1 1-.744 1.303L8 2.864l-.875.5a.75.75 0 0 1-.744-1.303l1.247-.712ZM4.65 3.914a.75.75 0 0 1-.279 1.023L4.262 5l.11.063a.75.75 0 0 1-.744 1.302l-.13-.073A.75.75 0 0 1 2 6.25V5a.75.75 0 0 1 .378-.651l1.25-.714a.75.75 0 0 1 1.023.279Zm6.698 0a.75.75 0 0 1 1.023-.28l1.25.715A.75.75 0 0 1 14 5v1.25a.75.75 0 0 1-1.499.042l-.129.073a.75.75 0 0 1-.744-1.302l.11-.063-.11-.063a.75.75 0 0 1-.28-1.023ZM6.102 6.915a.75.75 0 0 1 1.023-.279l.875.5.875-.5a.75.75 0 0 1 .744 1.303l-.869.496v.815a.75.75 0 0 1-1.5 0v-.815l-.869-.496a.75.75 0 0 1-.28-1.024ZM2.75 9a.75.75 0 0 1 .75.75v.815l.872.498a.75.75 0 0 1-.744 1.303l-1.25-.715A.75.75 0 0 1 2 11V9.75A.75.75 0 0 1 2.75 9Zm10.5 0a.75.75 0 0 1 .75.75V11a.75.75 0 0 1-.378.651l-1.25.715a.75.75 0 0 1-.744-1.303l.872-.498V9.75a.75.75 0 0 1 .75-.75Zm-4.501 3.708.126-.072a.75.75 0 0 1 .744 1.303l-1.247.712a.75.75 0 0 1-.744 0L6.38 13.94a.75.75 0 0 1 .744-1.303l.126.072a.75.75 0 0 1 1.498 0Z"
        />
      </svg>
    )
  }
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
    query,
    command,
  }: {
    items?: SlashItem[]
    query?: string
    command: (item: SlashItem) => void
  },
  ref,
) {
  const catalogVersion = useSlashCatalogVersion()
  const editorVersion = usePageEditorVersion()
  const resolved = useMemo(() => {
    if (typeof query === 'string') return filterSlashItems(query)
    return items ?? []
  }, [query, items, catalogVersion, editorVersion])
  const [active, setActive] = useState(0)
  const activeRef = useRef(0)
  const listRef = useRef<HTMLDivElement>(null)
  const keyNav = useRef(false)
  const groups = useMemo(() => slashGroups(resolved), [resolved])
  const flat = useMemo(() => groups.flatMap((group) => group.items.map((item) => ({ group: group.id, item }))), [groups])
  activeRef.current = active

  useEffect(() => {
    setActive(0)
  }, [resolved])

  useEffect(() => {
    if (!keyNav.current) return
    keyNav.current = false
    const list = listRef.current
    const item = list?.querySelector<HTMLElement>('.page-slash-item.is-active')
    if (list && item) scrollMenuChild(list, item)
  }, [active, resolved])

  useImperativeHandle(ref, () => ({
    onKeyDown({ event }: { event: KeyboardEvent }) {
      if (!flat.length) return false
      if (event.key === 'ArrowUp') {
        keyNav.current = true
        setActive((index) => (index + flat.length - 1) % flat.length)
        return true
      }
      if (event.key === 'ArrowDown') {
        keyNav.current = true
        setActive((index) => (index + 1) % flat.length)
        return true
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        const item = flat[activeRef.current]?.item
        if (item) command(item)
        return true
      }
      return false
    },
  }))

  return (
    <div className="page-slash" id="slash-command" role="listbox" aria-label="插入模块" data-testid="page-slash">
      <div ref={listRef} className="page-slash-list" onWheel={(event) => event.stopPropagation()}>
        {resolved.length ? (
          groups.map((group) => (
            <div key={group.id} className="page-slash-group">
              <div className="page-slash-head">{group.label}</div>
              {group.items.map((item) => {
                const index = flat.findIndex((entry) => entry.item.id === item.id)
                const statusClass = item.status === 'failed' ? ' is-failed' : item.status === 'loading' ? ' is-loading' : ''
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={index === active}
                    className={`page-slash-item${index === active ? ' is-active' : ''}${statusClass}`}
                    onMouseEnter={() => setActive(index)}
                    onMouseDown={(event) => {
                      event.preventDefault()
                      command(item)
                    }}
                  >
                    <span className="page-slash-icon">{slashIcon(item.id)}</span>
                    <span className="page-slash-label">{item.label}</span>
                    {item.status === 'loading' ? <span className="page-slash-status">启动中</span> : null}
                    {item.status === 'failed' ? <span className="page-slash-status">启动失败</span> : null}
                    {item.status === 'failed' && item.pluginHref ? (
                      <span
                        role="link"
                        className="page-slash-plugin-link"
                        data-testid="page-slash-plugin-link"
                        onMouseDown={(event) => {
                          event.preventDefault()
                          event.stopPropagation()
                          openAppPath(item.pluginHref!)
                        }}
                      >
                        去插件页看日志
                      </span>
                    ) : null}
                    {!item.status && slashKeys(item.id) ? <span className="page-slash-keys">{slashKeys(item.id)}</span> : null}
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
