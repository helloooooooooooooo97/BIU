import { useEffect, useState } from 'react'
import type { Editor } from '@tiptap/core'
import type { Node } from '@tiptap/pm/model'
import { kindLabel, nodeBlockId } from './block-id.ts'
import { comparePageBlocks } from './page-filter-plugin.ts'
import { usePageViewState } from './page-view-state.ts'

export function listPageTableBlocks(doc: Node) {
  const out: { id: string; kind: string; type: string; label: string; pos: number }[] = []
  doc.forEach((node, pos) => {
    const type = node.type.name
    const heading = type === 'heading' ? Math.min(3, Math.max(1, Number(node.attrs.level) || 1)) : 0
    const kind = heading ? `标题 ${heading}` : kindLabel(type)
    const label = node.textContent.replace(/\s+/g, ' ').trim() || kind
    out.push({ id: nodeBlockId(node), kind, type, label, pos })
  })
  return out
}

export function PageBlocksTable({ editor, recordId }: { editor: Editor; recordId: string }) {
  const view = usePageViewState(recordId)
  const [, setTick] = useState(0)
  useEffect(() => {
    const bump = () => setTick((n) => n + 1)
    editor.on('update', bump)
    editor.on('transaction', bump)
    return () => {
      editor.off('update', bump)
      editor.off('transaction', bump)
    }
  }, [editor])

  const allow = view.filterKinds.length ? new Set(view.filterKinds) : null
  let rows = listPageTableBlocks(editor.state.doc)
  if (allow) rows = rows.filter((item) => allow.has(item.type))
  if (view.sort !== 'doc') {
    rows = rows
      .slice()
      .sort((a, b) => comparePageBlocks({ kind: a.type, label: a.label }, { kind: b.type, label: b.label }, view.sort) || a.id.localeCompare(b.id) || a.pos - b.pos)
  }

  return (
    <div className="page-blocks-table-wrap" data-testid="page-blocks-table">
      <table className="tasks-table is-wrap">
        <thead>
          <tr>
            <th>
              <span className="tasks-th">类型</span>
            </th>
            <th>
              <span className="tasks-th">内容</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((row, index) => (
              <tr key={row.id || `${row.pos}-${index}`}>
                <td>
                  <div className="fsdb-cell">{row.kind}</div>
                </td>
                <td>
                  <div className="fsdb-cell">{row.label}</div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={2}>
                <div className="fsdb-cell">没有块</div>
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}
