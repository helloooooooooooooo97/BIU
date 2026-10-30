import { useSyncExternalStore } from 'react'
import { clientLog } from '@biu/web-event-log/log'

/** 文档里的块只认自己写下的插件 id，编辑器不猜、不查插件表。 */
export const ENABLE_PAGE_BLOCK_PLUGIN = 'biu:enable-page-block-plugin'
export const PAGE_BLOCK_PLUGIN_PHASE = 'biu:page-block-plugin-phase'
/** 启用请求先记在这里。监听还没挂上时事件会丢，后挂上的监听靠这份名单补上。 */
export const PENDING_PAGE_BLOCK_ENABLES = '__biuPendingPageBlockEnables'

function pendingPageBlockEnables() {
  const host = globalThis as typeof globalThis & { [PENDING_PAGE_BLOCK_ENABLES]?: Map<string, string> }
  if (!host[PENDING_PAGE_BLOCK_ENABLES]) host[PENDING_PAGE_BLOCK_ENABLES] = new Map()
  return host[PENDING_PAGE_BLOCK_ENABLES]
}

export type PageBlockPluginPhase = 'idle' | 'loading' | 'failed' | 'missing' | 'ready' | 'deferred'

const phases = new Map<string, PageBlockPluginPhase>()
let phaseVersion = 0
const phaseListeners = new Set<() => void>()

function emitPhase() {
  phaseVersion += 1
  for (const fn of phaseListeners) fn()
}

export function pageBlockPluginPhase(plugin: string): PageBlockPluginPhase {
  return phases.get(plugin.trim()) ?? 'idle'
}

export function setPageBlockPluginPhase(plugin: string, phase: PageBlockPluginPhase) {
  const id = plugin.trim()
  if (!id) return
  if (phase === 'ready' || phase === 'failed' || phase === 'missing') pendingPageBlockEnables().delete(id)
  if (phase === 'idle') phases.delete(id)
  else phases.set(id, phase)
  emitPhase()
}

export function subscribePageBlockPluginPhase(fn: () => void) {
  phaseListeners.add(fn)
  return () => phaseListeners.delete(fn)
}

export function usePageBlockPluginPhase(plugin: string) {
  useSyncExternalStore(
    (fn) => {
      phaseListeners.add(fn)
      return () => phaseListeners.delete(fn)
    },
    () => phaseVersion,
    () => 0,
  )
  return pageBlockPluginPhase(plugin)
}

if (typeof window !== 'undefined') {
  window.addEventListener(PAGE_BLOCK_PLUGIN_PHASE, (event) => {
    const detail = (event as CustomEvent<{ plugin?: unknown; phase?: unknown }>).detail
    const plugin = typeof detail?.plugin === 'string' ? detail.plugin.trim() : ''
    const phase = detail?.phase
    if (
      !plugin ||
      (phase !== 'ready' && phase !== 'failed' && phase !== 'missing' && phase !== 'loading' && phase !== 'idle' && phase !== 'deferred')
    ) return
    if (phase === 'ready' || phase === 'failed' || phase === 'missing') pendingPageBlockEnables().delete(plugin)
    setPageBlockPluginPhase(plugin, phase)
  })
}

const HTML_KINDS = new Set(['html', 'htmlframe'])
const SANDBOX_KIND = 'sandbox'
const VIDEO_KINDS = new Set(['video'])

export function parsePageBlockMeta(raw: string) {
  const kind = raw.match(/\bkind=["']?([a-z0-9-]+)/i)?.[1] ?? 'card'
  const plugin = raw.match(/\bplugin=["']?([a-z][a-z0-9-]*)/i)?.[1] ?? ''
  const id = raw.match(/\bid=["']?([a-z0-9]{6,32})/i)?.[1] ?? ''
  const extras: Record<string, unknown> = {}
  const title = raw.match(/\btitle=(?:"([^"]*)"|'([^']*)'|([^\s}]+))/i)
  if (title) extras.title = String(title[1] ?? title[2] ?? title[3] ?? '').trim()
  const deck = raw.match(/\bdeck=(true|false|1|0)\b/i)?.[1]
  if (deck) extras.deck = /^(true|1)$/i.test(deck)
  const width = raw.match(/\bwidth=([^\s}]+)/i)?.[1]
  if (width) {
    const parsed = parseFenceSize(width)
    if (parsed != null) extras.width = parsed
  }
  const height = raw.match(/\bheight=([^\s}]+)/i)?.[1]
  if (height) {
    const parsed = parseFenceSize(height)
    if (parsed != null) extras.height = parsed
  }
  return { kind, plugin, id, extras }
}

function parseFenceSize(raw: string): string | number | undefined {
  const value = raw.trim()
  if (!value) return undefined
  if (/^\d+(\.\d+)?$/.test(value)) return Math.round(Number(value))
  if (/^\d+(\.\d+)?(px|%|vh|vw|em|rem)$/i.test(value)) return value
  return undefined
}

function formatFenceSize(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return String(Math.round(value))
  if (typeof value === 'string') return parseFenceSize(value) == null ? undefined : String(parseFenceSize(value))
  return undefined
}

function parseJsonObject(raw: string): Record<string, unknown> | null {
  const trimmed = raw.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const data = JSON.parse(trimmed) as unknown
    if (!data || typeof data !== 'object' || Array.isArray(data)) return null
    return data as Record<string, unknown>
  } catch {
    return null
  }
}

function videoScriptFromJson(json: Record<string, unknown>, fallback: string) {
  return typeof json.script === 'string' ? json.script : fallback
}

/** HTML 块：新写只用附件 file；旧围栏体 HTML / JSON 仍能读。deck / height 写在头上。 */
export function parsePageBlockData(kind: string, raw: string, extras: Record<string, unknown> = {}) {
  const json = parseJsonObject(raw)
  if (VIDEO_KINDS.has(kind)) {
    const script = json ? videoScriptFromJson(json, raw.trim()) : raw.trim()
    return { ...extras, script }
  }
  if (kind === SANDBOX_KIND) {
    if (json) {
      const file = typeof json.file === 'string' ? json.file.trim() : ''
      if (file) {
        const rest = { ...json }
        delete rest.html
        delete rest.source
        return { ...rest, ...extras, file }
      }
      const source = typeof json.source === 'string' ? json.source : typeof json.html === 'string' ? json.html : ''
      const rest = { ...json }
      delete rest.html
      delete rest.file
      return { ...rest, ...extras, source }
    }
    return { ...extras, source: raw.trim() }
  }
  if (json) return { ...json, ...extras }
  if (HTML_KINDS.has(kind)) return { ...extras, html: raw.trim() }
  return { ...extras }
}

function formatMeta(kind: string, plugin: string, extras: string[], id = '') {
  const parts = [`kind=${kind}`]
  if (plugin) parts.push(`plugin=${plugin}`)
  if (id) parts.push(`id=${id}`)
  parts.push(...extras)
  return `{${parts.join(' ')}}`
}

function fenceAttrExtras(data: Record<string, unknown>) {
  const extras: string[] = []
  const title = typeof data.title === 'string' ? data.title.trim() : ''
  if (title) extras.push(`title=${JSON.stringify(title)}`)
  if (typeof data.deck === 'boolean') extras.push(`deck=${data.deck}`)
  const width = formatFenceSize(data.width)
  if (width) extras.push(`width=${width}`)
  const height = formatFenceSize(data.height)
  if (height) extras.push(`height=${height}`)
  return extras
}

export function formatPageBlockFence(kind: string, plugin: string, data: Record<string, unknown>, id = '') {
  const body = { ...data }
  delete body.cloneFrom
  if (kind === SANDBOX_KIND) {
    delete body.deck
    const extras = fenceAttrExtras(body)
    const file = typeof body.file === 'string' ? body.file.trim() : ''
    if (file) {
      const pointer: Record<string, string> = { file }
      const dataFile = typeof body.dataFile === 'string' ? body.dataFile.trim() : ''
      if (dataFile) pointer.dataFile = dataFile
      return `:::pageBlock ${formatMeta(kind, plugin, extras, id)}\n${JSON.stringify(pointer, null, 2)}\n:::`
    }
    const source = typeof body.source === 'string' ? body.source : typeof body.html === 'string' ? body.html : ''
    return `:::pageBlock ${formatMeta(kind, plugin, extras, id)}\n${source}\n:::`
  }
  if (HTML_KINDS.has(kind)) {
    const extras = fenceAttrExtras(body)
    const file = typeof body.file === 'string' ? body.file.trim() : ''
    if (file) {
      return `:::pageBlock ${formatMeta(kind, plugin, extras, id)}\n${JSON.stringify({ file }, null, 2)}\n:::`
    }
    const html = typeof body.html === 'string' ? body.html : ''
    return `:::pageBlock ${formatMeta(kind, plugin, extras, id)}\n${html}\n:::`
  }
  if (VIDEO_KINDS.has(kind)) {
    const script = typeof body.script === 'string' ? body.script.trim() : ''
    return `:::pageBlock ${formatMeta(kind, plugin, [], id)}\n${script}\n:::`
  }
  const meta = formatMeta(kind, plugin, [], id)
  return `:::pageBlock ${meta}\n${JSON.stringify(body, null, 2)}\n:::`
}

/** 块 ↔ 源码的唯一读出口。id 在围栏头上，体再走 parsePageBlockData。 */
export function readPageBlockFence(raw: string) {
  const match = raw.trim().match(/^:::pageBlock(?:\s+\{([^}]*)\})?\s*\n([\s\S]*?)\n:::\s*$/)
  const header = match?.[1] ?? ''
  const body = match?.[2] ?? raw
  const meta = parsePageBlockMeta(header || raw)
  return {
    kind: meta.kind,
    plugin: meta.plugin,
    id: meta.id,
    extras: meta.extras,
    body,
    data: parsePageBlockData(meta.kind, body, meta.extras),
  }
}

export function blockDataUnchanged(current: Record<string, unknown>, next: Record<string, unknown>) {
  if (current === next) return true
  const left = Object.keys(current)
  const right = Object.keys(next)
  if (left.length !== right.length) return false
  for (const key of right) {
    if (Object.is(current[key], next[key])) continue
    if (JSON.stringify(current[key]) !== JSON.stringify(next[key])) return false
  }
  return true
}

export function requestEnablePageBlockPlugin(plugin: string, kind: string, opts?: { force?: boolean }) {
  const id = plugin.trim()
  if (!id || typeof window === 'undefined') return
  if (pageBlockPluginPhase(id) === 'loading') return
  if (!opts?.force && pageBlockPluginPhase(id) === 'deferred') return
  pendingPageBlockEnables().set(id, kind || '')
  clientLog('info', 'page-block', `${kind || 'unknown'}（${id}）还没有视图，请求启用`)
  window.dispatchEvent(new CustomEvent(ENABLE_PAGE_BLOCK_PLUGIN, { detail: { plugin: id, kind, force: Boolean(opts?.force) } }))
}
