import { useSyncExternalStore } from 'react'
import { subscribePageBlockPluginPhase } from './page-block-meta.ts'

export type RememberedPageBlock = {
  kind: string
  plugin: string
  label: string
  hint: string
  aliases: string[]
  blockType: string
  blockTypeLabel: string
}

export type InstalledPageBlockPlugin = {
  id: string
  label: string
  hint: string
}

export const SLASH_PAGE_BLOCKS_KEY = 'biu.slash.pageBlocks'
export const INSTALLED_PAGE_BLOCK_TYPE = 'installed-page-block'

type StoredSlashPageBlocks = {
  plugins: string[]
  blocks: RememberedPageBlock[]
}

let catalogSeq = 0
const catalogListeners = new Set<() => void>()
const openListeners = new Set<() => void>()

let memoryBlocks: RememberedPageBlock[] = []
/** null：还没用本次拉取覆盖，确认集合读磁盘（冷启动）。[]：拉取结果就是空。 */
let confirmedPlugins: string[] | null = null
let installed: InstalledPageBlockPlugin[] | null = null
/** 最近一次 /plugins 列表里的全部 id。null 表示还没拉过。 */
let listedPluginIds: Set<string> | null = null

function bumpSlashCatalog() {
  catalogSeq += 1
  for (const fn of catalogListeners) fn()
}

export function subscribeSlashCatalog(fn: () => void) {
  catalogListeners.add(fn)
  return () => catalogListeners.delete(fn)
}

export function slashCatalogVersion() {
  return catalogSeq
}

export function useSlashCatalogVersion() {
  return useSyncExternalStore(subscribeSlashCatalog, slashCatalogVersion, () => 0)
}

export function onSlashCatalogOpen(fn: () => void) {
  openListeners.add(fn)
  return () => openListeners.delete(fn)
}

export function notifySlashCatalogOpen() {
  for (const fn of openListeners) fn()
}

function flag(value: unknown) {
  return value === true || value === 'true'
}

function asBlock(raw: unknown): RememberedPageBlock | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null
  const row = raw as Record<string, unknown>
  const kind = String(row.kind ?? '').trim()
  const plugin = String(row.plugin ?? '').trim()
  if (!kind || !plugin) return null
  const blockType = String(row.blockType ?? kind).trim() || kind
  const label = String(row.label ?? '').trim() || kind
  return {
    kind,
    plugin,
    label,
    hint: String(row.hint ?? '').trim(),
    aliases: Array.isArray(row.aliases) ? row.aliases.map((item) => String(item)) : [],
    blockType,
    blockTypeLabel: String(row.blockTypeLabel ?? '').trim() || label,
  }
}

function readStorage(): StoredSlashPageBlocks {
  if (typeof localStorage === 'undefined') return { plugins: [], blocks: [] }
  try {
    const raw = localStorage.getItem(SLASH_PAGE_BLOCKS_KEY)
    if (!raw) return { plugins: [], blocks: [] }
    const parsed = JSON.parse(raw) as StoredSlashPageBlocks
    const plugins = Array.isArray(parsed.plugins) ? parsed.plugins.map((id) => String(id).trim()).filter(Boolean) : []
    const blocks = Array.isArray(parsed.blocks)
      ? parsed.blocks.map(asBlock).filter((item): item is RememberedPageBlock => Boolean(item))
      : []
    return { plugins, blocks }
  } catch {
    return { plugins: [], blocks: [] }
  }
}

function persist() {
  if (typeof localStorage === 'undefined') return
  const plugins = confirmedPlugins ?? readStorage().plugins
  localStorage.setItem(SLASH_PAGE_BLOCKS_KEY, JSON.stringify({ plugins, blocks: memoryBlocks }))
}

function confirmedIds() {
  if (confirmedPlugins !== null) return new Set(confirmedPlugins)
  return new Set(readStorage().plugins)
}

memoryBlocks = readStorage().blocks

subscribePageBlockPluginPhase(() => bumpSlashCatalog())

export function rememberedPageBlocks() {
  const ok = confirmedIds()
  return memoryBlocks.filter((item) => ok.has(item.plugin))
}

export function installedPageBlocks() {
  return installed ?? []
}

export function rememberSlashBlock(spec: RememberedPageBlock) {
  const next = asBlock(spec)
  if (!next) return
  memoryBlocks = [...memoryBlocks.filter((item) => item.kind !== next.kind), next]
  persist()
  bumpSlashCatalog()
}

export function setListedPluginIds(ids: Iterable<string>) {
  listedPluginIds = new Set([...ids].map((id) => String(id ?? '').trim()).filter(Boolean))
}

/** true/false：列表已到，这个 id 在不在。null：还没拉过列表。 */
export function listedPluginKnown(id: string): boolean | null {
  if (!listedPluginIds) return null
  const next = String(id ?? '').trim()
  if (!next) return false
  return listedPluginIds.has(next)
}

export function setInstalledPageBlocks(rows: InstalledPageBlockPlugin[]) {
  installed = rows.map((row) => ({
    id: String(row.id ?? '').trim(),
    label: String(row.label ?? '').trim() || String(row.id ?? '').trim(),
    hint: String(row.hint ?? '').trim(),
  })).filter((row) => row.id)
  confirmedPlugins = installed.map((row) => row.id)
  const keep = new Set(confirmedPlugins)
  memoryBlocks = memoryBlocks.filter((item) => keep.has(item.plugin))
  persist()
  bumpSlashCatalog()
}

export function reloadSlashCatalogFromStorage() {
  installed = null
  confirmedPlugins = null
  listedPluginIds = null
  memoryBlocks = readStorage().blocks
  bumpSlashCatalog()
}

export function resetSlashCatalog() {
  memoryBlocks = []
  confirmedPlugins = []
  installed = []
  listedPluginIds = null
  if (typeof localStorage !== 'undefined') localStorage.removeItem(SLASH_PAGE_BLOCKS_KEY)
  bumpSlashCatalog()
}

function rowTags(row: Record<string, unknown>) {
  const raw = row.tags
  if (Array.isArray(raw)) return raw.map((item) => String(item).trim().toLowerCase()).filter(Boolean)
  if (typeof raw === 'string') {
    return raw
      .split(/[,\s]+/)
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean)
  }
  return []
}

export function installedPageBlocksFromRows(rows: unknown[]): InstalledPageBlockPlugin[] {
  const out: InstalledPageBlockPlugin[] = []
  for (const raw of rows) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue
    const row = raw as Record<string, unknown>
    if (!flag(row.installed) || !flag(row.hasWeb) || !flag(row.headless)) continue
    if (!rowTags(row).includes('page')) continue
    const id = String(row.id ?? '').trim()
    if (!id) continue
    const label = String(row.title ?? row.name ?? '').trim() || id
    out.push({ id, label, hint: String(row.blurb ?? '').trim() })
  }
  return out
}

export function pluginRecordPath(id: string) {
  return `/database/plugins/record/${encodeURIComponent(id)}`
}

export function openAppPath(path: string) {
  if (typeof window === 'undefined' || !path) return
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}
