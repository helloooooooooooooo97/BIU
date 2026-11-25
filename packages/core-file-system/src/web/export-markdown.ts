import { stringify as stringifyYaml } from 'yaml'
import { zipByteFiles } from '../shared/zip.ts'
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

function tagMatter(raw: unknown) {
  const tag = normalizeSchemaValue(raw)
  if (!tag.tags.length) return undefined
  const values: Record<string, Record<string, unknown>> = {}
  for (const id of tag.tags) {
    const bag = tag.values[id]
    if (!bag) continue
    const next: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(bag)) {
      if (hasValue(value)) next[key] = value
    }
    if (Object.keys(next).length) values[id] = next
  }
  return Object.keys(values).length ? { tags: tag.tags, values } : { tags: tag.tags }
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
  const tag = tagMatter(row.tag)
  if (tag) matter.tag = tag
  for (const [key, value] of Object.entries(row)) {
    if (skip.has(key) || key in matter || key === 'tags' || key === 'tag' || key === 'emoji' || key === 'parentId' || key === 'dependsOn') continue
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

export function zipMarkdownPack(files: Array<{ name: string; text: string }>): Blob {
  const encoder = new TextEncoder()
  const bytes = zipByteFiles(files.map((file) => ({ name: file.name, data: encoder.encode(file.text) })))
  return new Blob([bytes as BlobPart], { type: 'application/zip' })
}
