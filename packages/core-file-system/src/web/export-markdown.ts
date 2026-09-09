import { stringify as stringifyYaml } from 'yaml'
import { normalizeSchemaValue } from '@biu/type-file-system'

const SKIP = new Set(['content', 'description', 'notes', 'body', 'banner'])

export function contentToMarkdown(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'object' && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>
    if (typeof rec.body === 'string') return rec.body
  }
  return String(value)
}

function asTagList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))]
}

function hasValue(value: unknown): boolean {
  if (value == null || value === '') return false
  if (typeof value === 'boolean') return true
  if (typeof value === 'number') return Number.isFinite(value)
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.values(value as Record<string, unknown>).some(hasValue)
  return String(value).trim() !== ''
}

function asIso(value: unknown): string | undefined {
  const n = Number(value)
  if (!Number.isFinite(n) || n <= 0) return undefined
  const date = new Date(n)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

function facetMatter(raw: unknown) {
  const facet = normalizeSchemaValue(raw)
  if (!facet.tags.length) return undefined
  const values: Record<string, Record<string, unknown>> = {}
  for (const id of facet.tags) {
    const bag = facet.values[id]
    if (!bag) continue
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(bag)) {
      if (hasValue(value)) next[key] = value
    }
    if (Object.keys(next).length) values[id] = next
  }
  return Object.keys(values).length ? { tags: facet.tags, values } : { tags: facet.tags }
}

export function recordMatter(row: Record<string, unknown>, bodyKey?: string | null): Record<string, unknown> {
  const skip = new Set(SKIP)
  if (bodyKey) skip.add(bodyKey)
  const matter: Record<string, unknown> = {}
  if (row.id != null) matter.id = String(row.id)
  const title = String(row.title ?? '').trim()
  if (title) matter.title = title
  const tags = asTagList(row.tags)
  if (tags.length) matter.tags = tags
  const emoji = String(row.emoji ?? '').trim()
  if (emoji) matter.emoji = emoji
  const createdAt = asIso(row.createdAt)
  if (createdAt) matter.createdAt = createdAt
  const updatedAt = asIso(row.updatedAt)
  if (updatedAt) matter.updatedAt = updatedAt
  if (hasValue(row.createdBy)) matter.createdBy = row.createdBy
  if (hasValue(row.updatedBy)) matter.updatedBy = row.updatedBy
  const parentId = row.parentId == null || row.parentId === '' ? '' : String(row.parentId)
  if (parentId) matter.parentId = parentId
  const dependsOn = asTagList(row.dependsOn)
  if (dependsOn.length) matter.dependsOn = dependsOn
  const facet = facetMatter(row.facet)
  if (facet) matter.facet = facet
  for (const [key, value] of Object.entries(row)) {
    if (skip.has(key) || key in matter || key === 'tags' || key === 'facet' || key === 'emoji' || key === 'parentId' || key === 'dependsOn') continue
    if (key === 'createdAt' || key === 'updatedAt' || key === 'createdBy' || key === 'updatedBy' || key === 'id' || key === 'title') continue
    if (!hasValue(value)) continue
    matter[key] = value
  }
  return matter
}

export function recordToMarkdown(row: Record<string, unknown>, body: string, bodyKey?: string | null): string {
  const yaml = stringifyYaml(recordMatter(row, bodyKey), { lineWidth: 0 }).trimEnd()
  return `---\n${yaml}\n---\n${body.replace(/^\n/, '')}`
}

export function markdownFileName(row: Record<string, unknown>): string {
  return `${String(row.id ?? 'record').replace(/[/\\?%*:|"<>]/g, '-')}.md`
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let c = i
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[i] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array) {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i += 1) c = CRC_TABLE[(c ^ data[i]!) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u16(n: number) {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff)
}

function u32(n: number) {
  return Uint8Array.of(n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff)
}

function concat(parts: Uint8Array[]) {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

export function zipMarkdownPack(files: Array<{ name: string; text: string }>): Blob {
  const encoder = new TextEncoder()
  const locals: Uint8Array[] = []
  const centrals: Uint8Array[] = []
  let offset = 0
  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.text)
    const crc = crc32(data)
    const local = concat([
      u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), name, data,
    ])
    const central = concat([
      u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(name.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), name,
    ])
    locals.push(local)
    centrals.push(central)
    offset += local.length
  }
  const center = concat(centrals)
  const end = concat([u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(center.length), u32(offset), u16(0)])
  return new Blob([concat([...locals, center, end])], { type: 'application/zip' })
}
