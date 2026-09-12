import { formatPageBlockFence, parsePageBlockData, parsePageBlockMeta } from './web/page-block-meta.ts'

const FENCE = /^:::pageBlock(?:\s+\{([^}]*)\})?\s*\n([\s\S]*?)\n:::/gm

export type PageBlockFence = {
  id: string
  kind: string
  plugin: string
  extras: Record<string, unknown>
  body: string
  start: number
  end: number
  raw: string
}

/** 正文里改某一块的属性。id / kind 不改；data 默认合并。 */
export type PageBlockAttrsPatch = {
  plugin?: string
  data?: Record<string, unknown>
  replace?: boolean
}

export function pageBlockRecordId(pageId: string, blockId: string) {
  return `${pageId}::${blockId}`
}

export function parsePageBlockRecordId(id: string) {
  const raw = String(id ?? '')
  const at = raw.indexOf('::')
  if (at <= 0) return null
  const pageId = raw.slice(0, at).trim()
  const blockId = raw.slice(at + 2).trim()
  if (!pageId || !blockId) return null
  return { pageId, blockId }
}

export function listPageBlockFences(markdown: string): PageBlockFence[] {
  const re = new RegExp(FENCE.source, FENCE.flags)
  const out: PageBlockFence[] = []
  let match: RegExpExecArray | null
  while ((match = re.exec(markdown))) {
    const meta = parsePageBlockMeta(match[1] ?? '')
    out.push({
      id: meta.id,
      kind: meta.kind,
      plugin: meta.plugin,
      extras: meta.extras,
      body: match[2] ?? '',
      start: match.index,
      end: match.index + match[0].length,
      raw: match[0],
    })
  }
  return out
}

export function pageBlockData(fence: PageBlockFence) {
  return parsePageBlockData(fence.kind, fence.body, fence.extras)
}

export function patchPageBlockMarkdown(markdown: string, id: string, patch: PageBlockAttrsPatch): string {
  const needle = String(id ?? '').trim()
  if (!needle) throw new Error('pageBlock id is required')
  const hits = listPageBlockFences(markdown).filter((item) => item.id === needle)
  if (!hits.length) throw new Error(`unknown pageBlock: ${needle}`)
  if (hits.length > 1) throw new Error(`pageBlock id is not unique: ${needle}`)
  const fence = hits[0]!
  const current = pageBlockData(fence)
  const data = patch.replace
    ? { ...(patch.data ?? {}) }
    : { ...current, ...(patch.data ?? {}) }
  const plugin = patch.plugin !== undefined ? String(patch.plugin) : fence.plugin
  const next = formatPageBlockFence(fence.kind, plugin, data, fence.id)
  return markdown.slice(0, fence.start) + next + markdown.slice(fence.end)
}
