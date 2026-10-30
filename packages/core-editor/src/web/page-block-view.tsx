import { memo, useCallback, useEffect, useRef, type MouseEvent } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { blockDataUnchanged } from './page-block-meta.ts'
import { PagePluginSurface, pagePluginHostAttrs, useBindPagePlugin, usePagePluginResolve } from './page-plugin-host.tsx'

export { PageBlockMissing } from './page-plugin-host.tsx'

function assetName(file: string) {
  return file.replace(/^assets\//, '')
}

async function copyPageAsset(from: string, to: string) {
  const src = assetName(from)
  const dest = assetName(to)
  const res = await fetch(`/api/page/file/${encodeURIComponent(src)}`)
  const text = res.ok ? await res.text() : ''
  const jsonName = /\.json$/i.test(dest)
  let body = text
  let type = 'text/plain; charset=utf-8'
  if (jsonName) {
    type = 'application/json'
    if (!text) body = JSON.stringify({ elements: [], appState: { theme: 'dark' }, files: {} })
    else {
      try {
        JSON.parse(text)
        body = text
      } catch {
        body = JSON.stringify({ elements: [], appState: { theme: 'dark' }, files: {} })
      }
    }
  } else if (/\.html?$/i.test(dest)) {
    type = 'text/html; charset=utf-8'
  }
  await fetch(`/api/page/file/${encodeURIComponent(dest)}`, {
    method: 'PUT',
    headers: { 'Content-Type': type },
    body,
  })
}

function samePageBlockProps(prev: NodeViewProps, next: NodeViewProps) {
  return (
    prev.selected === next.selected &&
    prev.node.attrs.kind === next.node.attrs.kind &&
    prev.node.attrs.plugin === next.node.attrs.plugin &&
    prev.node.attrs.id === next.node.attrs.id &&
    JSON.stringify(prev.node.attrs.data) === JSON.stringify(next.node.attrs.data) &&
    prev.editor.isEditable === next.editor.isEditable
  )
}

export const PageBlockView = memo(function PageBlockView({ node, updateAttributes, editor, getPos, selected }: NodeViewProps) {
  const kind = String(node.attrs.kind ?? 'card')
  const plugin = String(node.attrs.plugin ?? '').trim()
  const data = (node.attrs.data && typeof node.attrs.data === 'object' ? node.attrs.data : {}) as Record<string, unknown>
  const cloneFrom = typeof data.cloneFrom === 'string' ? data.cloneFrom : ''
  const file = typeof data.file === 'string' ? data.file : ''
  const blockId = String(node.attrs.id ?? '').trim()
  const { spec, View, phase } = usePagePluginResolve(kind, plugin)
  const hostRef = useBindPagePlugin(plugin)
  const dataRef = useRef(data)
  dataRef.current = data
  const updateAttributesRef = useRef(updateAttributes)
  updateAttributesRef.current = updateAttributes
  const update = useCallback((patch: Record<string, unknown>, opts?: { replace?: boolean }) => {
    const current = dataRef.current
    const next = opts?.replace ? { ...patch } : { ...current, ...patch }
    if (!Object.prototype.hasOwnProperty.call(patch, 'title') && typeof current.title === 'string') {
      next.title = current.title
    }
    if (blockDataUnchanged(current, next)) return
    updateAttributesRef.current({ data: next })
  }, [])

  useEffect(() => {
    if (!cloneFrom || !file) return
    let gone = false
    void copyPageAsset(cloneFrom, file).then(() => {
      if (gone) return
      update({ cloneFrom: undefined })
    })
    return () => {
      gone = true
    }
  }, [cloneFrom, file, update])

  const onMouseDown = (event: MouseEvent) => {
    if (!editor.isEditable || editor.isDestroyed) return
    if (event.target instanceof Element && event.target.closest('textarea, input, select, button, a')) return
    if (event.currentTarget instanceof Element && event.target !== event.currentTarget) return
    // Pick overlay owns the click. Node selection here becomes a fence pick
    // and hides the block. Shadow internals are resolved by pick, not TipTap.
    if (document.documentElement.classList.contains('pick-mode')) return
    const pos = getPos()
    if (typeof pos !== 'number') return
    editor.chain().setNodeSelection(pos).run()
  }

  return (
    <NodeViewWrapper
      ref={hostRef}
      {...pagePluginHostAttrs({
        kind,
        plugin,
        blockId,
        label: spec?.label || kind,
        testId: `page-block-${kind}`,
      })}
      contentEditable={false}
      onMouseDown={onMouseDown}
    >
      <PagePluginSurface
        kind={kind}
        plugin={plugin}
        data={data}
        update={update}
        writable
        selected={selected}
        View={View}
        phase={phase}
        pending={cloneFrom ? <div className="page-block-missing">正在复制附件…</div> : null}
      />
    </NodeViewWrapper>
  )
}, samePageBlockProps)
