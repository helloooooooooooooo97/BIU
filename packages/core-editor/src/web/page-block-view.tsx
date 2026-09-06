import { useEffect } from 'react'
import type { NodeViewProps } from '@tiptap/react'
import { NodeViewWrapper } from '@tiptap/react'
import { getPageEditor, usePageEditorVersion } from './service.ts'
import { formatPageBlockFence, requestEnablePageBlockPlugin } from './page-block-meta.ts'

function assetName(file: string) {
  return file.replace(/^assets\//, '')
}

async function copyPageAsset(from: string, to: string) {
  const src = assetName(from)
  const dest = assetName(to)
  const res = await fetch(`/api/page/file/${encodeURIComponent(src)}`)
  let payload: unknown = { elements: [], appState: { theme: 'dark' }, files: {} }
  if (res.ok) {
    try {
      payload = JSON.parse(await res.text())
    } catch {
      /* keep empty */
    }
  }
  await fetch(`/api/page/file/${encodeURIComponent(dest)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

export function PageBlockMissing({ kind, plugin, data }: { kind: string; plugin: string; data: Record<string, unknown> }) {
  const source = formatPageBlockFence(kind, plugin, data)
  return (
    <div className="page-block-missing" data-testid="page-block-missing">
      <div className="page-block-missing-title">未启用「{kind}」块</div>
      {plugin ? (
        <p className="page-block-missing-copy">
          这块由插件 <code>{plugin}</code> 渲染。现在没在运行，下面是文档里存下的源码。
        </p>
      ) : (
        <p className="page-block-missing-copy">
          文档里没有记下插件 id。启用对应插件后重新保存，就会带上映射。
        </p>
      )}
      {plugin ? (
        <button
          type="button"
          className="page-block-missing-enable"
          data-testid="page-block-enable"
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            requestEnablePageBlockPlugin(plugin, kind)
          }}
        >
          启用 {plugin}
        </button>
      ) : null}
      <pre className="page-block-missing-source">{source}</pre>
    </div>
  )
}

export function PageBlockView({ node, updateAttributes, editor }: NodeViewProps) {
  usePageEditorVersion()
  const kind = String(node.attrs.kind ?? 'card')
  const plugin = String(node.attrs.plugin ?? '').trim()
  const data = (node.attrs.data && typeof node.attrs.data === 'object' ? node.attrs.data : {}) as Record<string, unknown>
  const spec = getPageEditor()?.block(kind)
  const cloneFrom = typeof data.cloneFrom === 'string' ? data.cloneFrom : ''
  const file = typeof data.file === 'string' ? data.file : ''
  const update = (patch: Record<string, unknown>, opts?: { replace?: boolean }) => {
    updateAttributes({ data: opts?.replace ? patch : { ...data, ...patch } })
  }
  const View = spec?.View

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
  }, [cloneFrom, file])

  return (
    <NodeViewWrapper className="page-block" data-page-block={kind} data-page-block-plugin={plugin} data-testid={`page-block-${kind}`}>
      {cloneFrom ? (
        <div className="page-block-missing">正在复制附件…</div>
      ) : View ? (
        <View data={data} update={update} writable={editor.isEditable} />
      ) : (
        <PageBlockMissing kind={kind} plugin={plugin} data={data} />
      )}
    </NodeViewWrapper>
  )
}
