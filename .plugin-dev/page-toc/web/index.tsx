import { Button, Card, CardTitle } from '@biu/biu-ui'
import { headingElById, headingsFromPage, pageRootFrom, sameTocItems, type TocHeading } from './outline.ts'

const React = globalThis.React
const { useEffect, useRef, useState } = React

export const name = 'page-toc'
export const inject = ['pageEditor']

function TocCard(props: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; writable: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [items, setItems] = useState<TocHeading[]>([])
  const title = typeof props.data.title === 'string' && props.data.title.trim() ? props.data.title.trim() : '目录'

  useEffect(() => {
    const host = hostRef.current
    const scan = () => {
      const root = pageRootFrom(host)
      const next = root ? headingsFromPage(root, host) : []
      setItems((prev) => (sameTocItems(prev, next) ? prev : next))
    }
    scan()
    const root = pageRootFrom(host)
    if (!root || typeof MutationObserver === 'undefined') return
    const mo = new MutationObserver(scan)
    mo.observe(root, { subtree: true, childList: true, characterData: true })
    return () => mo.disconnect()
  }, [])

  const jump = (id: string) => {
    const host = hostRef.current
    const root = pageRootFrom(host)
    const el = root ? headingElById(root, id, host) : null
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  return (
    <Card className="border-dsw-border text-dsw-label" data-testid="page-toc">
      <div ref={hostRef}>
      <CardTitle className="mb-1 text-[12px] text-dsw-label-3">{title}</CardTitle>
      {items.length === 0 ? (
        <p className="m-0 px-2 py-1 text-[13px] text-dsw-label-3">暂无标题</p>
      ) : (
        <ul className="m-0 list-none p-0">
          {items.map((item) => (
            <li key={item.id}>
              <Button
                type="button"
                variant="ghost"
                className={`h-auto w-full justify-start font-medium ${item.level === 2 ? 'pl-5' : item.level >= 3 ? 'pl-9' : ''}`}
                onClick={() => jump(item.id)}
              >
                {item.text}
              </Button>
            </li>
          ))}
        </ul>
      )}
      </div>
    </Card>
  )
}

export function apply(ctx: {
  pageEditor: {
    registerBlock: (spec: {
      kind: string
      plugin: string
      label: string
      blockType?: string
      blockTypeLabel?: string
      hint?: string
      aliases?: string[]
      defaults?: Record<string, unknown>
      assets?: unknown[]
      View: (props: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; writable: boolean }) => unknown
    }) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'toc',
    plugin: name,
    label: '目录',
    blockType: 'basic',
    hint: '当前页标题列表，点击跳转；建议放在文首',
    aliases: ['目录', '大纲', 'toc', 'outline'],
    assets: [],
    defaults: { title: '目录' },
    View: TocCard,
  })
}
