/**
 * 标签块：一次只选一个标签当字段模板，值存在块数据里，不写页面属性标签。
 * 完整表格视图由 core-file-system-ui 登记；这里在尚未登记时补一份单选。
 */
import { HeadlessPopover, TagChip } from '@biu/biu-ui'

const React = globalThis.React
const { useEffect, useState } = React

export const name = 'page-tag'
export const inject = ['pageEditor']

type TagRow = { id: string; label: string }

function parseTagId(data: Record<string, unknown>): string {
  const direct = String(data.tagId ?? '').trim()
  if (direct) return direct
  const raw = data.tagIds ?? data.tags
  if (!Array.isArray(raw)) return ''
  return String(raw.find((item) => String(item ?? '').trim()) ?? '').trim()
}

async function loadCatalog(): Promise<TagRow[]> {
  try {
    const res = await fetch('/api/db/tags')
    const body = (await res.json().catch(() => ({}))) as { tags?: unknown[]; facets?: unknown[] }
    const listed = body.tags ?? body.facets
    if (!res.ok || !Array.isArray(listed)) return []
    return listed
      .map((item) => {
        if (!item || typeof item !== 'object' || Array.isArray(item)) return null
        const rec = item as { id?: unknown; label?: unknown }
        const id = String(rec.id ?? '').trim()
        if (!id) return null
        return { id, label: String(rec.label ?? '').trim() || id }
      })
      .filter((item): item is TagRow => Boolean(item))
  } catch {
    return []
  }
}

function TagCard(props: { data: Record<string, unknown>; update: (patch: Record<string, unknown>) => void; writable: boolean }) {
  const tagId = parseTagId(props.data)
  const [catalog, setCatalog] = useState<TagRow[]>([])
  const [open, setOpen] = useState(false)
  useEffect(() => {
    let gone = false
    void loadCatalog().then((rows) => {
      if (!gone) setCatalog(rows)
    })
    return () => {
      gone = true
    }
  }, [])
  const label = catalog.find((tag) => tag.id === tagId)?.label || tagId
  return (
    <div className="page-tag-block" data-testid="page-tag-block" onMouseDown={(event) => event.stopPropagation()}>
      <div className="tasks-toolbar">
        <div className="tasks-toolbar-left">
          <div className="tasks-viewtabs">
            <div className="tasks-viewdd-btn tasks-viewtab is-active" data-testid="page-tag-block-view" title="呈现方式">
              <span className="tasks-viewdd-name">表格</span>
            </div>
            {props.writable ? (
              <HeadlessPopover
                open={open}
                onOpenChange={setOpen}
                trigger={
                  <button
                    type="button"
                    className={`page-tag-block-switch${tagId ? '' : ' is-empty'}`}
                    data-testid="page-tag-block-switch"
                    aria-label={tagId ? '切换标签' : '选择标签'}
                  >
                    {tagId ? <TagChip id={tagId} label={label} /> : <span>选择标签</span>}
                  </button>
                }
              >
                <div className="page-tag-block-menu" role="dialog" aria-label="切换标签">
                  {catalog.map((tag) => (
                    <button
                      key={tag.id}
                      type="button"
                      className={`page-tag-block-option${tag.id === tagId ? ' is-on' : ''}`}
                      onClick={() => {
                        props.update({ tagId: tag.id, tagIds: undefined, tags: undefined, values: {} })
                        setOpen(false)
                      }}
                    >
                      <TagChip id={tag.id} label={tag.label} />
                    </button>
                  ))}
                </div>
              </HeadlessPopover>
            ) : (
              <div className={`page-tag-block-switch${tagId ? '' : ' is-empty'}`} data-testid="page-tag-block-switch">
                {tagId ? <TagChip id={tagId} label={label} /> : <span>没有标签</span>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

export function apply(ctx: {
  pageEditor: {
    blocks?: () => Array<{ kind: string }>
    registerBlock: (spec: Record<string, unknown>) => void
  }
}) {
  if (ctx.pageEditor.blocks?.().some((item) => item.kind === 'tag')) return
  ctx.pageEditor.registerBlock({
    kind: 'tag',
    plugin: name,
    label: '标签块',
    blockType: 'basic',
    hint: '选一个标签，在块里填写它的字段',
    aliases: ['标签块', '标签', 'tag', 'tags'],
    assets: [],
    defaults: { tagId: '', values: {} },
    View: TagCard,
  })
}
