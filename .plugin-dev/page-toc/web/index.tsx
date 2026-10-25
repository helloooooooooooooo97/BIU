import { Card, ReUI, Tree, TreeItem, TreeItemLabel, type TreeNodeItem } from './reui'
import { headingElById, headingsFromPage, nestHeadings, pageRootFrom, sameTocItems, type TocHeading, type TocNode } from './outline.ts'

const React = globalThis.React
const { useEffect, useMemo, useRef, useState } = React

export const name = 'page-toc'
export const inject = ['pageEditor']

function folderIds(nodes: TocNode[], out: string[] = []) {
  for (const node of nodes) {
    if (node.children.length) {
      out.push(node.id)
      folderIds(node.children, out)
    }
  }
  return out
}

function TocBranch({
  nodes,
  expanded,
  onToggle,
  onJump,
}: {
  nodes: TocNode[]
  expanded: Set<string>
  onToggle: (id: string) => void
  onJump: (id: string) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        const folder = node.children.length > 0
        const open = !folder || expanded.has(node.id)
        const item: TreeNodeItem = {
          getItemMeta: () => ({ level: node.depth }),
          isFolder: () => folder,
          isExpanded: () => open,
          getItemName: () => node.text,
        }
        return (
          <React.Fragment key={node.id}>
            <TreeItem item={item} onClick={() => onJump(node.id)}>
              <TreeItemLabel item={item} onToggle={() => onToggle(node.id)}>
                {node.text}
              </TreeItemLabel>
            </TreeItem>
            {folder && open ? (
              <TocBranch nodes={node.children} expanded={expanded} onToggle={onToggle} onJump={onJump} />
            ) : null}
          </React.Fragment>
        )
      })}
    </>
  )
}

function TocCard(props: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; writable: boolean }) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const [items, setItems] = useState<TocHeading[]>([])
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const title = typeof props.data.title === 'string' && props.data.title.trim() ? props.data.title.trim() : '目录'
  const tree = useMemo(() => nestHeadings(items), [items])

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

  useEffect(() => {
    setExpanded(new Set(folderIds(tree)))
  }, [tree])

  const jump = (id: string) => {
    const host = hostRef.current
    const root = pageRootFrom(host)
    const el = root ? headingElById(root, id, host) : null
    el?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  }

  const onToggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <ReUI className="rui-ios">
      <Card data-testid="page-toc" style={{ background: 'transparent', border: 0, padding: 0 }}>
        <div ref={hostRef}>
          <div className="rui-large">{title}</div>
          {items.length === 0 ? (
            <p className="rui-sub">暂无标题</p>
          ) : (
            <div className="rui-group" style={{ padding: '6px 0' }}>
            <Tree indent={16} data-testid="page-toc-tree">
              <TocBranch nodes={tree} expanded={expanded} onToggle={onToggle} onJump={jump} />
            </Tree>
            </div>
          )}
        </div>
      </Card>
    </ReUI>
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
    hint: '当前页标题树，点击跳转；建议放在文首',
    aliases: ['目录', '大纲', 'toc', 'outline'],
    assets: [],
    defaults: { title: '目录' },
    View: TocCard,
  })
}
