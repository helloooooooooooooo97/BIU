import { BoundedMap, registerWorkspaceCache } from '@biu/biu-ui/cache'
import { PAGE_VIEW_EVENT } from './editor-view-state.ts'

export const PAGE_BUILTIN_MODES = ['doc', 'outline', 'table', 'source', 'hidden'] as const
export type PageBuiltinMode = (typeof PAGE_BUILTIN_MODES)[number]

export function isPageBuiltinMode(mode: string): mode is PageBuiltinMode {
  return (PAGE_BUILTIN_MODES as readonly string[]).includes(mode)
}

export function isPageCustomView(mode: string) {
  return Boolean(mode) && !isPageBuiltinMode(mode)
}

const folded = new BoundedMap<string, Set<string>>(128)

function bump() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event(PAGE_VIEW_EVENT))
}

registerWorkspaceCache('editor-source-mode-folded', () => {
  folded.clear()
  bump()
})

export function pageOutlineFolded(recordId: string) {
  return folded.get(String(recordId ?? '')) ?? new Set<string>()
}

export function togglePageOutlineFold(recordId: string, blockId: string) {
  const id = String(recordId ?? '').trim()
  const block = String(blockId ?? '').trim()
  if (!id || !block) return
  const next = new Set(pageOutlineFolded(id))
  if (next.has(block)) next.delete(block)
  else next.add(block)
  folded.set(id, next)
  bump()
}
