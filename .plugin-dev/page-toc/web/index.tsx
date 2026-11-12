/**
 * 目录：当前页 h1–h3，点击跳转。不写标题、不记选中高亮。
 */
import { ReUI, Tree, TreeItem, TreeItemLabel, type TreeNodeItem } from '@biu/reui'
import { headingElById, headingsFromPage, nestHeadings, pageRootFrom, sameTocItems, type TocHeading, type TocNode } from './outline.ts'

const React = globalThis.React
const { useEffect, useMemo, useRef, useState } = React

export const name = 'page-toc'
export const inject = ['blockEditor']

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
  maxLevel,
  onToggle,
  onJump,
}: {
  nodes: TocNode[]
  expanded: Set<string>
  maxLevel: number
  onToggle: (id: string) => void
  onJump: (id: string) => void
}) {
  return (
    <>
      {nodes.map((node) => {
        if (node.level > maxLevel) return null
        const folder = node.children.some((child) => child.level <= maxLevel)
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
              <TocBranch nodes={node.children} expanded={expanded} maxLevel={maxLevel} onToggle={onToggle} onJump={onJump} />
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
  const maxLevel = props.data.maxLevel === 1 || props.data.maxLevel === 2 ? props.data.maxLevel : 3
  const collapsed = Array.isArray(props.data.collapsed) ? (props.data.collapsed as string[]) : []
  const tree = useMemo(() => nestHeadings(items), [items])
  const expanded = useMemo(() => {
    const all = new Set(folderIds(tree))
    for (const id of collapsed) all.delete(id)
    return all
  }, [tree, collapsed.join('|')])

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

  const onToggle = (id: string) => {
    if (!props.writable) return
    const next = collapsed.includes(id) ? collapsed.filter((item) => item !== id) : [...collapsed, id]
    props.update({ collapsed: next })
  }

  return (
    <ReUI>
      <div ref={hostRef} className="toc-shell" data-testid="page-toc">
        {items.length === 0 ? (
          <p className="rui-muted" style={{ margin: 0 }}>暂无标题</p>
        ) : (
          <Tree indent={14} data-testid="page-toc-tree">
            <TocBranch nodes={tree} expanded={expanded} maxLevel={maxLevel} onToggle={onToggle} onJump={jump} />
          </Tree>
        )}
      </div>
    </ReUI>
  )
}

export function apply(ctx: {
  blockEditor: {
    registerBlock: (spec: Record<string, unknown>) => void
  }
}) {
  ctx.blockEditor.registerBlock({
    kind: 'toc',
    plugin: name,
    label: '目录',
    blockType: 'basic',
    hint: '当前页标题树，点击跳转',
    aliases: ['目录', '大纲', 'toc', 'outline', 'notion'],
    assets: [],
    defaults: { collapsed: [], maxLevel: 3 },
    View: TocCard,
  })
}
