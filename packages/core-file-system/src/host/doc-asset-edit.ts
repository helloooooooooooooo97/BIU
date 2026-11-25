import { readFile } from 'node:fs/promises'
import { isAbsolute, resolve } from 'node:path'
import {
  DATABASE_CHANNEL,
  databaseChannelPayload,
  type CollectionSpec,
  type DbRecord,
} from '@biu/type-file-system'
import {
  MENTION_KIND_PATH,
  listMentionRefs,
  mentionRefsByCollection,
  projectMentionLabels,
  stripMentionLabels,
} from '../mention-markup.ts'
import { normalizeCollectionPath, splitResourcePath } from '../paths.ts'

import { splitPath } from './index.ts'
import {
  collectAssetNames,
  isAssetFileName,
  mimeOfAsset,
  type FileSystemAssets,
} from './assets-store.ts'
import {
  asContentText,
  findReplaceText,
  insertText,
  mutationLocus,
  outlineContent,
  replaceLinesText,
  resolveContentCommand,
  strReplaceText,
  viewContent,
  writeContentText,
  type ContentCommand,
} from './content-edit.ts'
import { isTextDoc } from './schema-coerce.ts'
import type { TagStore } from './tags-store.ts'

export type DocAssetEditHost = {
  collection(pathOrId: string): CollectionSpec | undefined
  content(path: string): Promise<{
    kind: 'content'
    path: string
    field: string
    value: unknown
    version?: number
  }>
  writeContent(path: string, value: unknown, expectedVersion?: number): Promise<unknown>
  contentTitle(path: string): Promise<string>
  assertLiveRecord(
    spec: CollectionSpec,
    id: string,
    action?: 'resource:read' | 'resource:update' | 'resource:list',
    record?: { id?: unknown },
  ): void
  tags: TagStore
  assets: FileSystemAssets
  recordContentEdit?: (path: string, before: string, after: string, title: string) => Promise<void>
  broadcast?: (type: string, payload: unknown) => void
}

export async function readLocalWriteFile(raw: string) {
  const file = isAbsolute(raw) ? raw : resolve(process.cwd(), raw)
  try {
    return await readFile(file)
  } catch {
    throw new Error(`cannot read from: ${raw}`)
  }
}

/**
 * 写入侧正文：短文本用 value/new_str 内联；长文本用 from 读本地文件（工作区或 /tmp）。
 * 两者都可出现在参数里；给了 from 就用文件内容。write 只用 value；
 * insert / str_replace / find_replace / replace_lines 只用 new_str。
 */
export async function resolveIncomingText(command: ContentCommand, args: Record<string, unknown>): Promise<string> {
  const rawFrom = String(args.from ?? '').trim()
  if (rawFrom) {
    const bytes = await readLocalWriteFile(rawFrom)
    return bytes.toString('utf8')
  }
  if (command === 'write') {
    if (args.value === undefined) {
      throw new Error(
        'write needs string "value" or "from" (example: {"path":"/pages/<id>","command":"write","value":"# 标题\\n正文"})',
      )
    }
    return asContentText(args.value)
  }
  if (command === 'insert' || command === 'replace_lines') {
    if (typeof args.new_str !== 'string') throw new Error(`${command} needs new_str or from`)
    return args.new_str
  }
  return typeof args.new_str === 'string' ? args.new_str : String(args.new_str ?? '')
}

export function resolveFindReplace(text: string, args: Record<string, unknown>) {
  return findReplaceText(text, args.old_str, args.new_str, {
    regex: args.regex,
    all: args.all,
    count: args.count,
  })
}

export async function resolveMentionTitles(
  host: Pick<DocAssetEditHost, 'collection'>,
  markdown: string,
): Promise<Record<string, string>> {
  const groups = mentionRefsByCollection(listMentionRefs(markdown))
  const titles: Record<string, string> = {}
  for (const [path, ids] of groups) {
    const spec = host.collection(path)
    if (!spec) continue
    const rows = await spec.list({ ids })
    const kind = (Object.entries(MENTION_KIND_PATH).find(([, item]) => item === path)?.[0] ??
      'page') as keyof typeof MENTION_KIND_PATH
    for (const row of rows) {
      const id = String(row.id ?? '').trim()
      if (!id || !ids.includes(id)) continue
      const title = String(row.title ?? row.name ?? '').trim()
      if (title) titles[`${kind}/${id}`] = title
    }
  }
  return titles
}

export async function executeEditContent(
  host: DocAssetEditHost,
  path: string,
  args: Record<string, unknown> = {},
) {
  const command = resolveContentCommand(args)
  const current = await host.content(path)
  const text = stripMentionLabels(asContentText(current.value))
  if (command === 'outline') {
    const out = outlineContent(text)
    return {
      kind: 'content' as const,
      path: current.path,
      field: current.field,
      command,
      total: out.total,
      headings: out.headings,
      text: out.text,
    }
  }
  if (command === 'view') {
    const viewed = viewContent(text, args.view_range, args.grep)
    const titles = await resolveMentionTitles(host, viewed.text)
    return {
      kind: 'content' as const,
      path: current.path,
      field: current.field,
      command,
      start: viewed.start,
      end: viewed.end,
      total: viewed.total,
      ...(viewed.matched !== undefined ? { matched: viewed.matched } : {}),
      truncated: viewed.truncated,
      text: projectMentionLabels(viewed.text, titles),
    }
  }
  let replaced: number | undefined
  const incoming = stripMentionLabels(await resolveIncomingText(command, args))
  const oldStr = args.old_str != null ? stripMentionLabels(String(args.old_str)) : args.old_str
  const patch = { ...args, old_str: oldStr, new_str: incoming, ...(command === 'write' ? { value: incoming } : {}) }
  const next =
    command === 'write'
      ? writeContentText(incoming)
      : command === 'str_replace'
        ? strReplaceText(text, oldStr, incoming)
        : command === 'find_replace'
          ? resolveFindReplace(text, { ...args, old_str: oldStr, new_str: incoming })
          : command === 'insert'
            ? insertText(text, args.insert_line, incoming)
            : replaceLinesText(text, args.start_line, args.end_line, incoming)
  if (typeof next === 'object') {
    replaced = next.replaced
  }
  const nextText = typeof next === 'object' ? next.text : next
  await host.writeContent(path, nextText, current.version)
  const locus = mutationLocus(command === 'find_replace' ? 'str_replace' : command, text, nextText, patch)
  const written = await host.content(current.path)
  const after = asContentText(written.value)
  const title = await host.contentTitle(current.path)
  await host.recordContentEdit?.(current.path, text, after, title)
  return {
    kind: 'content' as const,
    path: current.path,
    field: current.field,
    command,
    ok: true as const,
    ...(replaced != null ? { replaced } : {}),
    ...(locus ? { start_line: locus.start_line, end_line: locus.end_line, ...(locus.text ? { text: locus.text } : {}) } : {}),
  }
}

function broadcastAssetChange(host: DocAssetEditHost, path: string, name: string, etag: string) {
  host.broadcast?.(DATABASE_CHANNEL, databaseChannelPayload('asset', { asset: { name, etag, path } }))
}

export async function executeEditAsset(
  host: DocAssetEditHost,
  path: string,
  args: Record<string, unknown> = {},
) {
  const parts = splitPath(path)
  if (parts.length !== 2) throw new Error(`cannot asset: ${normalizeCollectionPath(path)}`)
  const spec = host.collection(`/${parts[0]}`)
  if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
  const record = (await spec.get(parts[1]!)) as DbRecord | null
  if (!record) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
  const from = String(args.from ?? '').trim()
  const command = String(args.command ?? (args.value != null || from ? 'write' : 'view'))
  host.assertLiveRecord(spec, record.id, command === 'view' ? 'resource:read' : 'resource:update', record)
  const names = new Set([
    ...collectAssetNames(record, host.tags.recordBanner(spec.path, record.id)?.html),
    ...host.tags.listedAttachmentNames(spec.path, record.id),
  ])
  const file = String(args.name ?? '')
    .trim()
    .replace(/^assets\//, '')
    .replace(/^.*[/\\]/, '')
  const recPath = `${spec.path}/${record.id}`
  if (command === 'view' && !file) {
    const assets = []
    for (const name of [...names].sort()) {
      try {
        const read = await host.assets.readAny(name)
        assets.push({ name, etag: read.etag, type: read.type })
      } catch {
        assets.push({ name, missing: true })
      }
    }
    return { kind: 'asset' as const, path: recPath, command: 'view' as const, assets }
  }
  if (!isAssetFileName(file)) throw new Error('invalid asset')
  if (command === 'view') {
    if (!names.has(file)) throw new Error(`asset not referenced: ${file}`)
    try {
      const read = await host.assets.readAny(file)
      const text =
        read.type.startsWith('text/') || read.type.includes('json') ? read.bytes.toString('utf8') : undefined
      return {
        kind: 'asset' as const,
        path: recPath,
        command: 'view' as const,
        name: file,
        etag: read.etag,
        type: read.type,
        ...(text != null ? { text } : {}),
      }
    } catch {
      return {
        kind: 'asset' as const,
        path: recPath,
        command: 'view' as const,
        name: file,
        missing: true,
        etag: '',
      }
    }
  }
  if (command !== 'write') throw new Error(`unknown asset command: ${command}`)
  const body = from ? await readLocalWriteFile(from) : String(args.value ?? '')
  if (!from && args.value == null) throw new Error('write needs value or from')
  const written = await host.assets.write(file, body)
  const kind = String(args.kind ?? '') === 'core' ? 'core' : 'asset'
  const blockId = String(args.block_id ?? args.blockId ?? '').trim()
  const source = String(args.source ?? (blockId ? `block:${blockId}` : 'asset')).trim() || 'asset'
  host.tags.putAttachment({
    name: written.name,
    etag: written.etag,
    mime: mimeOfAsset(written.name),
    bytes: written.bytes,
    kind,
    storage: 'hash',
  })
  if (Array.isArray(args.refs)) {
    const refs = args.refs.flatMap((item) => {
      if (!item || typeof item !== 'object' || Array.isArray(item)) return []
      const rec = item as Record<string, unknown>
      const name = String(rec.name ?? '').trim()
      if (!isAssetFileName(name)) return []
      return [{ name, source: String(rec.source ?? source) }]
    })
    if (blockId) host.tags.replaceBlockRefs(spec.path, record.id, blockId, refs.length ? refs : [{ name: written.name, source }])
  } else if (blockId) {
    host.tags.upsertBlockRef(spec.path, record.id, blockId, written.name, source)
  }
  broadcastAssetChange(host, recPath, written.name, written.etag)
  return { kind: 'asset' as const, ok: true as const, path: recPath, name: written.name, etag: written.etag, storage: 'hash' as const }
}

export async function executeEditDoc(
  host: DocAssetEditHost,
  path: string,
  args: Record<string, unknown> = {},
) {
  const parts = splitPath(path)
  if (parts.length !== 2) throw new Error(`cannot doc: ${normalizeCollectionPath(path)}`)
  const spec = host.collection(`/${parts[0]}`)
  if (!spec) throw new Error(`unknown collection: /${parts[0]}`)
  const record = (await spec.get(parts[1]!)) as DbRecord | null
  if (!record) throw new Error(`unknown record: ${spec.path}/${parts[1]}`)
  const command = resolveContentCommand(args)
  host.assertLiveRecord(spec, record.id, command === 'view' ? 'resource:read' : 'resource:update', record)
  const names = new Set([
    ...collectAssetNames(record, host.tags.recordBanner(spec.path, record.id)?.html),
    ...host.tags.listedAttachmentNames(spec.path, record.id),
  ])
  const file = String(args.name ?? '')
    .trim()
    .replace(/^assets\//, '')
    .replace(/^.*[/\\]/, '')
  const recPath = `${spec.path}/${record.id}`
  const readOwnedOrAsset = async (name: string) => host.assets.readAny(name)
  if (command === 'view' && !file) {
    const assets = []
    for (const name of [...names].sort()) {
      try {
        const read = await readOwnedOrAsset(name)
        assets.push({
          name,
          etag: read.etag,
          type: read.type,
          ...('storage' in read ? { storage: (read as { storage?: string }).storage } : {}),
        })
      } catch {
        assets.push({ name, missing: true })
      }
    }
    return { kind: 'doc' as const, path: recPath, command: 'view' as const, assets }
  }
  if (!isAssetFileName(file)) throw new Error('invalid asset')
  if (!names.has(file)) throw new Error(`doc not referenced: ${file}`)
  const readDoc = async () => host.assets.readDoc(file)
  let current: { text: string; etag: string; type: string } | null = null
  try {
    const read = await readDoc()
    const raw = Buffer.from(read.bytes).toString('utf8')
    current = { text: raw, etag: read.etag, type: read.type }
  } catch {
    current = null
  }
  if (command === 'outline') {
    if (!current) {
      return { kind: 'doc' as const, path: recPath, command: 'outline' as const, name: file, missing: true, etag: '' }
    }
    const out = outlineContent(current.text)
    return {
      kind: 'doc' as const,
      path: recPath,
      command: 'outline' as const,
      name: file,
      etag: current.etag,
      type: current.type,
      total: out.total,
      headings: out.headings,
      text: out.text,
    }
  }
  if (command === 'view') {
    if (!current) {
      return { kind: 'doc' as const, path: recPath, command: 'view' as const, name: file, missing: true, etag: '' }
    }
    const viewed = viewContent(current.text, args.view_range, args.grep)
    return {
      kind: 'doc' as const,
      path: recPath,
      command: 'view' as const,
      name: file,
      etag: current.etag,
      type: current.type,
      start: viewed.start,
      end: viewed.end,
      total: viewed.total,
      ...(viewed.matched !== undefined ? { matched: viewed.matched } : {}),
      truncated: viewed.truncated,
      text: viewed.text,
    }
  }
  if (command !== 'write' && !current) throw new Error(`doc missing: ${file}`)
  if (command !== 'write' && current && !isTextDoc(file, current.type)) throw new Error(`doc is not text: ${file}`)
  let replaced: number | undefined
  const incoming = await resolveIncomingText(command, args)
  const base = current?.text ?? ''
  const patch = { ...args, new_str: incoming, ...(command === 'write' ? { value: incoming } : {}) }
  const next =
    command === 'write'
      ? writeContentText(incoming)
      : command === 'str_replace'
        ? strReplaceText(base, args.old_str, incoming)
        : command === 'find_replace'
          ? resolveFindReplace(base, { ...args, new_str: incoming })
          : command === 'insert'
            ? insertText(base, args.insert_line, incoming)
            : replaceLinesText(base, args.start_line, args.end_line, incoming)
  if (typeof next === 'object') replaced = next.replaced
  const nextText = typeof next === 'object' ? next.text : next
  const matchEtag = String(args.etag ?? current?.etag ?? '')
  const written = await host.assets.writeDoc(file, nextText, { etag: matchEtag })
  const kind = String(args.kind ?? '') === 'core' ? 'core' : 'asset'
  const blockId = String(args.block_id ?? args.blockId ?? '').trim()
  const source = String(args.source ?? (blockId ? `block:${blockId}` : 'doc')).trim() || 'doc'
  host.tags.putAttachment({
    name: written.name,
    etag: written.etag,
    mime: mimeOfAsset(written.name),
    bytes: written.bytes ?? Buffer.byteLength(nextText),
    kind,
    storage: 'name',
  })
  if (blockId) host.tags.upsertBlockRef(spec.path, record.id, blockId, written.name, source)
  broadcastAssetChange(host, recPath, written.name, written.etag)
  const locus = mutationLocus(command === 'find_replace' ? 'str_replace' : command, base, nextText, patch)
  return {
    kind: 'doc' as const,
    ok: true as const,
    path: recPath,
    name: written.name,
    etag: written.etag,
    storage: 'name' as const,
    command,
    ...(replaced != null ? { replaced } : {}),
    ...(locus ? { start_line: locus.start_line, end_line: locus.end_line, ...(locus.text ? { text: locus.text } : {}) } : {}),
  }
}
