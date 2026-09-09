import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import { scrollMenuChild } from './slash-list.tsx'
import { MentionKindGlyph, type MentionKind } from './mention-kind.tsx'

export type MentionPick = {
  id: string
  label: string
  kind: MentionKind
  kindLabel: string
}

export const MentionList = forwardRef(function MentionList(
  {
    items,
    command,
    loading,
  }: {
    items: MentionPick[]
    command: (item: { id: string; label: string }) => void
    loading?: boolean
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

  const selectItem = (index: number) => {
    const item = items[index]
    if (!item) return
    command({ id: item.id, label: item.label })
  }

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
        selectItem(activeRef.current)
        return true
      }
      return false
    },
  }))

  const groups = useMemo(() => {
    const order: string[] = []
    const map = new Map<string, { id: string; label: string; items: MentionPick[] }>()
    for (const item of items) {
      let group = map.get(item.kind)
      if (!group) {
        group = { id: item.kind, label: item.kindLabel, items: [] }
        map.set(item.kind, group)
        order.push(item.kind)
      }
      group.items.push(item)
    }
    return order.map((id) => map.get(id)!).filter(Boolean)
  }, [items])

  const flat = useMemo(
    () => groups.flatMap((group) => group.items),
    [groups],
  )

  return (
    <div className="page-slash" role="listbox" aria-label="引用对象" data-testid="page-mention">
      <div ref={listRef} className="page-slash-list" onWheel={(event) => event.stopPropagation()}>
        {loading ? (
          <div className="page-slash-empty">搜索中…</div>
        ) : items.length ? (
          groups.map((group) => (
            <div key={group.id} className="page-slash-group">
              <div className="page-slash-head">{group.label}</div>
              {group.items.map((item) => {
                const index = flat.findIndex((entry) => entry.id === item.id)
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
                      selectItem(index)
                    }}
                  >
                    <MentionKindGlyph kind={item.kind} />
                    <span className="page-slash-label">{item.label}</span>
                  </button>
                )
              })}
            </div>
          ))
        ) : (
          <div className="page-slash-empty">没有匹配的对象</div>
        )}
      </div>
      <div className="page-slash-foot">
        <span>关闭菜单</span>
        <span className="page-slash-keys">esc</span>
      </div>
    </div>
  )
})
