import type { CollectionSpec, DbRecord } from '@biu/type-file-system'
import { recordBuiltinValues, REQUIRED_RECORD_FIELDS } from '@biu/type-file-system'
import {
  listPageBlockFences,
  pageBlockData,
  pageBlockRecordId,
  parsePageBlockRecordId,
  patchPageBlockMarkdown,
  type PageBlockFence,
} from '@biu/core-editor/host'
import type { PagesStore, PageRow } from './store.ts'

function asDataObject(raw: unknown): Record<string, unknown> | undefined {
  if (raw == null) return undefined
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw as Record<string, unknown>
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('data must be a JSON object')
    return parsed as Record<string, unknown>
  }
  throw new Error('data must be a JSON object')
}

function blockTitle(kind: string, data: Record<string, unknown>) {
  if (typeof data.title === 'string' && data.title.trim()) return data.title.trim()
  if (typeof data.html === 'string' && data.html.trim()) {
    const text = data.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 48)
    if (text) return text
  }
  if (typeof data.file === 'string' && data.file.trim()) return data.file.replace(/^assets\//, '')
  return kind
}

function toRecord(page: PageRow, fence: PageBlockFence): DbRecord {
  const data = pageBlockData(fence)
  return {
    id: pageBlockRecordId(page.id, fence.id),
    title: blockTitle(fence.kind, data),
    pageId: page.id,
    blockId: fence.id,
    kind: fence.kind,
    plugin: fence.plugin,
    data: JSON.stringify(data),
    ...recordBuiltinValues({ createdAt: page.createdAt, updatedAt: page.updatedAt }),
  }
}

async function fencesOn(store: PagesStore, pageId: string) {
  const page = await store.get(pageId)
  if (!page) return null
  return {
    page,
    fences: listPageBlockFences(page.notes).filter((item) => item.id),
  }
}

async function recordOf(store: PagesStore, id: string) {
  const parsed = parsePageBlockRecordId(id)
  if (!parsed) return null
  const found = await fencesOn(store, parsed.pageId)
  if (!found) return null
  const fence = found.fences.find((item) => item.id === parsed.blockId)
  if (!fence) return null
  return toRecord(found.page, fence)
}

export function pageBlocksCollection(store: PagesStore): CollectionSpec {
  return {
    id: 'page-blocks',
    path: '/page-blocks',
    label: '特殊块',
    view: {
      moduleId: 'page',
      route: '/page-blocks',
      title: '特殊块',
      inspector: true,
      blurb:
        '页面 :::pageBlock 的投影。记录 id 为 <pageId>::<blockId>。改属性用 db_update：data 为 JSON 对象（默认合并），也可写 plugin。不改 id/kind，不能从本表新建或删除块。正文仍在对应页面的 notes。',
      order: 26,
      icon: 'puzzle-piece',
    },
    schema: {
      labelField: 'title',
      columns: ['title', 'kind', 'plugin', 'pageId'],
      fields: {
        ...REQUIRED_RECORD_FIELDS,
        title: { type: 'string', label: '标题' },
        pageId: { type: 'ref', label: '页面' },
        blockId: { type: 'string', label: '块 id' },
        kind: { type: 'string', label: '类型' },
        plugin: { type: 'string', label: '插件', writable: true },
        data: {
          type: 'string',
          label: '属性',
          writable: true,
          description: '块 data 的 JSON。默认与现有字段合并；replace=true 时整份替换。',
        },
      },
    },
    records: { update: true },
    list: async (query) => {
      if (query?.ids?.length) {
        const rows: DbRecord[] = []
        for (const id of query.ids) {
          const row = await recordOf(store, id)
          if (row) rows.push(row)
        }
        return rows
      }
      const pages = await store.list()
      const rows: DbRecord[] = []
      for (const slim of pages) {
        const found = await fencesOn(store, slim.id)
        if (!found) continue
        for (const fence of found.fences) rows.push(toRecord(found.page, fence))
      }
      return rows
    },
    get: (id) => recordOf(store, id),
    update: async (id, patch) => {
      const parsed = parsePageBlockRecordId(id)
      if (!parsed) throw new Error(`unknown pageBlock: ${id}`)
      const page = await store.get(parsed.pageId)
      if (!page) throw new Error(`unknown page: ${parsed.pageId}`)
      const data = asDataObject(patch.data)
      const extras: Record<string, unknown> = { ...(data ?? {}) }
      if ('deck' in patch) extras.deck = patch.deck
      if ('width' in patch) extras.width = patch.width
      if ('height' in patch) extras.height = patch.height
      const notes = patchPageBlockMarkdown(page.notes, parsed.blockId, {
        plugin: typeof patch.plugin === 'string' ? patch.plugin : undefined,
        data: Object.keys(extras).length ? extras : undefined,
        replace: patch.replace === true,
      })
      const next = await store.update(page.id, { notes })
      const fence = listPageBlockFences(next.notes).find((item) => item.id === parsed.blockId)
      if (!fence) throw new Error(`unknown pageBlock: ${id}`)
      return toRecord(next, fence)
    },
  }
}
