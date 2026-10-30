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
  if (id === 'option-matrix') {
    return iconPath(
      'M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9ZM5.75 3.5H3.5a.25.25 0 0 0-.25.25v2.5h2.5v-2.75Zm1.5 2.75V3.5h5.25a.25.25 0 0 1 .25.25v2.5h-5.5ZM3.25 7.75h2.5v2.5h-2.5v-2.5Zm4 0h5.5v2.5h-5.5v-2.5ZM3.25 11.75h2.5V13H3.5a.25.25 0 0 1-.25-.25v-1Zm4 0h5.5V13H7.25v-1.25Z',
    )
  }
  if (id === 'run') {
    return iconPath(
      'M3 3.25a.75.75 0 0 1 1.14-.64l8.25 4.75a.75.75 0 0 1 0 1.28l-8.25 4.75A.75.75 0 0 1 3 12.75v-9.5Z',
    )
  }
  if (id === 'api-play') {
    return iconPath(
      'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-4.25a.75.75 0 0 1 .75.75v2.69l1.78 1.78a.75.75 0 1 1-1.06 1.06l-2-2A.75.75 0 0 1 7.25 8V4.5A.75.75 0 0 1 8 3.75Z',
    )
  }
  if (id === 'plugin-doctor') {
    return iconPath(
      'M8.75 3.75a.75.75 0 0 0-1.5 0v1.5h-1.5a.75.75 0 0 0 0 1.5h1.5v1.5a.75.75 0 0 0 1.5 0v-1.5h1.5a.75.75 0 0 0 0-1.5h-1.5v-1.5ZM3.5 1A2.5 2.5 0 0 0 1 3.5v9A2.5 2.5 0 0 0 3.5 15h9a2.5 2.5 0 0 0 2.5-2.5v-9A2.5 2.5 0 0 0 12.5 1h-9ZM2.5 3.5A1 1 0 0 1 3.5 2.5h9A1 1 0 0 1 13.5 3.5v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1v-9Z',
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
