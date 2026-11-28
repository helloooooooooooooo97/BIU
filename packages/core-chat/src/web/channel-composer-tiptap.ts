import StarterKit from '@tiptap/starter-kit'
import Placeholder from '@tiptap/extension-placeholder'
import type { Editor, JSONContent } from '@tiptap/react'
import { readStorageString, writeStorageString } from '@biu/biu-ui/client-storage'
import { mentionPickFromAttrs } from '@biu/core-editor/mention'
import { formatPick, pickChipAttrs, pickRefFromAttrs, type PickRef } from '@biu/core-pick/web'
import type { ChannelMention } from '../shared/channel-types.ts'
import { PickChipNode } from './composer-pick-node.tsx'
import { composerEditorReady } from './composer-tiptap.ts'
import { ChannelMentionNode } from './channel-mention-node.tsx'

const CHANNEL_DRAFT_KEY = 'channel.draft'

export type ChannelMentionTrigger = {
  query: string
  from: number
  to: number
}

export type SerializedChannelComposer = {
  text: string
  plain: string
  mentions: ChannelMention[]
  refs: PickRef[]
  hasChips: boolean
}

/** 频道聊天输入框扩展：纯段落 + ⌘L/长粘贴 Pick 芯片 + 原子 @ 提及芯片 + 占位提示。 */
export function channelComposerExtensions(placeholder: () => string) {
  return [
    StarterKit.configure({
      heading: false,
      bulletList: false,
      orderedList: false,
      listItem: false,
      listKeymap: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      bold: false,
      italic: false,
      strike: false,
      code: false,
      link: false,
      underline: false,
    }),
    PickChipNode,
    ChannelMentionNode,
    Placeholder.configure({
      placeholder,
    }),
  ]
}

function normalizeMentionKind(raw: unknown): ChannelMention['kind'] {
  if (raw === 'everyone' || raw === 'agent' || raw === 'account') return raw
  return 'account'
}

/** 从 TipTap 文档树一次性序列化正文、结构化 mentions 与 pick 引用，彻底避免纯文本与 mentions 错位。 */
export function serializeChannelComposer(editor: Editor | null): SerializedChannelComposer {
  if (!composerEditorReady(editor)) {
    return { text: '', plain: '', mentions: [], refs: [], hasChips: false }
  }
  let text = ''
  let plain = ''
  const mentions: ChannelMention[] = []
  const mentionKeys = new Set<string>()
  const refs: PickRef[] = []
  let hasChips = false
  let block = 0

  editor.state.doc.forEach((node) => {
    if (block++ > 0) {
      text += '\n'
      plain += '\n'
    }
    node.forEach((child) => {
      if (child.isText) {
        const value = child.text ?? ''
        text += value
        plain += value
        return
      }
      if (child.type.name === 'hardBreak') {
        text += '\n'
        plain += '\n'
        return
      }
      if (child.type.name === 'channelMention') {
        const kind = normalizeMentionKind(child.attrs.kind)
        const id = String(child.attrs.id ?? '').trim()
        const label = String(child.attrs.label ?? id).trim()
        if (!id || !label) return
        hasChips = true
        const token = `@${label}`
        text += token
        plain += token
        const key = `${kind}:${id}`
        if (!mentionKeys.has(key)) {
          mentionKeys.add(key)
          mentions.push({ kind, id, label })
        }
        return
      }
      if (child.type.name === 'pickChip') {
        const ref = pickRefFromAttrs(child.attrs)
        if (!ref) return
        hasChips = true
        refs.push(ref)
        text += formatPick(ref)
      }
    })
  })

  return {
    text: text.replace(/\s+$/g, '').trim(),
    plain,
    mentions,
    refs,
    hasChips,
  }
}

/**
 * 基于 ProseMirror 文档位置精准检测光标前的 `@query`：
 * 使用 `\0` 占位每个 inline atom 节点（nodeSize === 1），与字符偏移严格 1:1 对应，
 * 即使同行前面已有多个 @ 芯片或 Pick 芯片也不会偏移。
 */
export function readChannelMentionAtCursor(editor: Editor | null): ChannelMentionTrigger | null {
  if (!composerEditorReady(editor)) return null
  const { selection } = editor.state
  if (!selection.empty) return null
  const { $from } = selection
  if (!$from.parent.isTextblock) return null
  const parentStart = $from.start()
  const textBefore = editor.state.doc.textBetween(parentStart, $from.pos, '\n', '\0')
  const match = /(?:^|\s|\0)@([^\s@\0]*)$/.exec(textBefore)
  if (!match) return null
  const query = match[1] ?? ''
  const from = $from.pos - query.length - 1
  if (from < parentStart) return null
  return { query, from, to: $from.pos }
}

/** 将当前 `@query` 替换为原子 ChannelMention 芯片并自动补一个空格。 */
export function insertChannelMentionAtRange(
  editor: Editor,
  range: { from: number; to: number },
  mention: ChannelMention,
) {
  if (!composerEditorReady(editor)) return
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      {
        type: 'channelMention',
        attrs: {
          kind: mention.kind,
          id: mention.id,
          label: mention.label,
        },
      },
      { type: 'text', text: ' ' },
    ])
    .run()
}

/** 将 `@query` 替换为工作区页面/记录的 PickChip 芯片并自动补一个空格。 */
export function insertPageMentionAtRange(
  editor: Editor,
  range: { from: number; to: number },
  item: { id: string; label: string },
): PickRef | null {
  if (!composerEditorReady(editor)) return null
  const ref = mentionPickFromAttrs({ id: item.id, label: item.label })
  if (!ref) return null
  editor
    .chain()
    .focus()
    .insertContentAt(range, [
      {
        type: 'pickChip',
        attrs: pickChipAttrs(ref),
      },
      { type: 'text', text: ' ' },
    ])
    .run()
  return ref
}

/** 判断编辑器是否完全为空（无非空文本、无芯片）。 */
export function isChannelEditorEmpty(editor: Editor | null): boolean {
  if (!composerEditorReady(editor)) return true
  const packed = serializeChannelComposer(editor)
  return !packed.plain.trim() && !packed.hasChips
}

function readDraftMap(): Record<string, JSONContent> {
  try {
    const raw = readStorageString(CHANNEL_DRAFT_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const out: Record<string, JSONContent> = {}
      for (const [k, v] of Object.entries(parsed)) {
        if (v && typeof v === 'object' && !Array.isArray(v) && (v as JSONContent).type === 'doc') {
          out[k] = v as JSONContent
        }
      }
      return out
    }
  } catch {
    /* ignore: localStorage unavailable */
  }
  return {}
}

export function readChannelDraft(channelId: string): JSONContent | null {
  if (!channelId) return null
  return readDraftMap()[channelId] ?? null
}

export function writeChannelDraft(channelId: string, doc: JSONContent) {
  if (!channelId) return
  try {
    const map = readDraftMap()
    map[channelId] = doc
    writeStorageString(CHANNEL_DRAFT_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}

export function clearChannelDraft(channelId: string) {
  if (!channelId) return
  try {
    const map = readDraftMap()
    if (!(channelId in map)) return
    delete map[channelId]
    writeStorageString(CHANNEL_DRAFT_KEY, JSON.stringify(map))
  } catch {
    /* ignore */
  }
}
