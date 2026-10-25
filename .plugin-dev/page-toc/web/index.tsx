/**
 * 目录：Notion / Obsidian / VS Code Outline / GitHub docs
 * 左侧 On this page，树形大纲，当前标题高亮，折叠写进块数据。
 */
import { ReUI, Tree, TreeItem, TreeItemLabel, type TreeNodeItem } from '@biu/reui'
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
  activeId,
  maxLevel,
  onToggle,
  onJump,
}: {
  nodes: TocNode[]
  expanded: Set<string>
  activeId: string
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
            <TreeItem item={item} data-selected={activeId === node.id} onClick={() => onJump(node.id)}>
              <TreeItemLabel item={item} onToggle={() => onToggle(node.id)}>
                {node.text}
              </TreeItemLabel>
            </TreeItem>
            {folder && open ? (
              <TocBranch nodes={node.children} expanded={expanded} activeId={activeId} maxLevel={maxLevel} onToggle={onToggle} onJump={onJump} />
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
  const title = typeof props.data.title === 'string' && props.data.title.trim() ? props.data.title.trim() : '目录'
  const maxLevel = props.data.maxLevel === 1 || props.data.maxLevel === 2 ? props.data.maxLevel : 3
  const collapsed = Array.isArray(props.data.collapsed) ? (props.data.collapsed as string[]) : []
  const activeId = typeof props.data.activeId === 'string' ? props.data.activeId : ''
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
    if (props.writable) props.update({ activeId: id })
  }

  const onToggle = (id: string) => {
    if (!props.writable) return
    const next = collapsed.includes(id) ? collapsed.filter((item) => item !== id) : [...collapsed, id]
    props.update({ collapsed: next })
  }

  const setMax = (level: 1 | 2 | 3) => {
    if (props.writable) props.update({ maxLevel: level })
  }

  return (
    <ReUI>
      <div ref={hostRef} className="toc-shell" data-testid="page-toc">
        <div className="toc-kicker">On this page</div>
        <h2>{title}</h2>
        <div className="rui-row" style={{ padding: '0 8px 8px', gap: 4 }}>
          {([1, 2, 3] as const).map((level) => (
            <button key={level} type="button" className="rui-btn rui-btn-ghost rui-btn-sm" data-on={maxLevel === level} onClick={() => setMax(level)} style={maxLevel === level ? { color: '#171717', fontWeight: 650 } : undefined}>
              H{level}
            </button>
          ))}
        </div>
        {items.length === 0 ? (
          <p className="rui-muted" style={{ padding: '0 8px' }}>暂无标题</p>
        ) : (
          <Tree indent={14} data-testid="page-toc-tree">
            <TocBranch nodes={tree} expanded={expanded} activeId={activeId} maxLevel={maxLevel} onToggle={onToggle} onJump={jump} />
          </Tree>
        )}
      </div>
    </ReUI>
  )
}

export function apply(ctx: {
  pageEditor: {
    registerBlock: (spec: Record<string, unknown>) => void
  }
}) {
  ctx.pageEditor.registerBlock({
    kind: 'toc',
    plugin: name,
    label: '目录',
    blockType: 'basic',
    hint: 'Notion / VS Code 大纲：当前页标题树，折叠和当前项写进块数据',
    aliases: ['目录', '大纲', 'toc', 'outline', 'notion'],
    assets: [],
    defaults: { title: '目录', collapsed: [], activeId: '', maxLevel: 3 },
    View: TocCard,
  })
}
