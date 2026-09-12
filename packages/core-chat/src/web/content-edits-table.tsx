import { memo } from 'react'
import { CONTENT_JUMP_EVENT } from '@biu/type-file-system'

export type ContentEditRow = {
  path: string
  title: string
  added: number
  removed: number
  jump_line: number
  reverted?: boolean
  kind?: 'content' | 'create' | 'update' | 'delete'
}

export const INSPECTOR_REVEAL_EVENT = 'biu:inspector-reveal'

export function recordParts(path: string) {
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return null
  return { collection: `/${parts[0]}`, recordId: parts.slice(1).join('/') }
}

function kindLabel(kind: ContentEditRow['kind']) {
  if (kind === 'create') return '新建'
  if (kind === 'delete') return '删除'
  if (kind === 'update') return '更新'
  return ''
}

export function contentEditLabel(file: ContentEditRow, files: ContentEditRow[]) {
  const title = file.title.trim() || file.path
  const dup = files.filter((row) => (row.title.trim() || row.path) === title).length > 1
  if (!dup) return title
  const id = recordParts(file.path)?.recordId
  return id ? `${title} · ${id}` : title
}

/** 右侧检查器打开记录并跳到改动行；不改中间主界面、不关聊天。 */
export function revealContentEdit(path: string, jumpLine: number) {
  const parts = recordParts(path)
  if (parts) {
    window.dispatchEvent(
      new CustomEvent(INSPECTOR_REVEAL_EVENT, {
        detail: { collection: parts.collection, recordId: parts.recordId, unique: true },
      }),
    )
  }
  window.dispatchEvent(
    new CustomEvent(CONTENT_JUMP_EVENT, {
      detail: { path, start_line: jumpLine, end_line: jumpLine, navigate: true },
    }),
  )
}

export const ContentEditsTable = memo(function ContentEditsTable({ files }: { files: ContentEditRow[] }) {
  const visible = files.filter(
    (file) => file.added || file.removed || file.kind === 'create' || file.kind === 'update' || file.kind === 'delete',
  )
  if (!visible.length) return null
  const added = visible.reduce((n, file) => n + file.added, 0)
  const removed = visible.reduce((n, file) => n + file.removed, 0)

  return (
    <div
      className="overflow-hidden rounded-[10px] border border-(--dsw-border) bg-(color-mix(in_srgb,var(--dsw-sidebar)_65%,transparent))"
      data-testid="content-edits-table"
    >
      <div className="flex items-center justify-between gap-2 border-b border-(--dsw-border) px-3 py-2">
        <div className="text-(length:--dsw-chat-ui-font-size) font-semibold text-(--dsw-label-2)">本回合改动</div>
        <div className="flex items-center gap-2 text-[12px] font-semibold tabular-nums">
          <span className="text-[#448361]">+{added}</span>
          <span className="text-[#c4554d]">−{removed}</span>
        </div>
      </div>
      <ul className="m-0 list-none p-0">
        {visible.map((file) => (
          <li key={`${file.kind ?? 'content'}:${file.path}`} className="flex items-center gap-2 border-t border-(--dsw-border) px-3 py-1.5 first:border-t-0">
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-[13px] font-semibold text-(--dsw-label) hover:underline"
              onClick={() => revealContentEdit(file.path, file.jump_line)}
            >
              {kindLabel(file.kind) ? `${kindLabel(file.kind)} · ${contentEditLabel(file, visible)}` : contentEditLabel(file, visible)}
            </button>
            {file.kind === 'content' || !file.kind ? (
              <>
                <button
                  type="button"
                  className="text-[12px] font-semibold tabular-nums text-[#448361] hover:underline"
                  onClick={() => revealContentEdit(file.path, file.jump_line)}
                >
                  +{file.added}
                </button>
                <button
                  type="button"
                  className="text-[12px] font-semibold tabular-nums text-[#c4554d] hover:underline"
                  onClick={() => revealContentEdit(file.path, file.jump_line)}
                >
                  −{file.removed}
                </button>
              </>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  )
})
