import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type FormEvent,
} from 'react'
import {
  ArrowUpIcon,
  ArrowUturnLeftIcon,
  AtSymbolIcon,
  DocumentIcon,
  PlusIcon,
  UserGroupIcon,
} from '@heroicons/react/16/solid'
import { useLocation } from 'react-router-dom'
import { EditorContent, useEditor } from '@tiptap/react'
import { AiAvatar } from '@biu/biu-ui/ai-avatar'
import { resolveAssetUrl } from '@biu/biu-ui/workspace-transport'
import { fetchMentionItems } from '@biu/core-editor/mention'
import {
  consumePlainPasteIntent,
  isPlainPasteHotkey,
  markPlainPasteIntent,
  pickKey,
  readPickClipboard,
  textPickFromPlain,
  usePickState,
  type PickService,
} from '@biu/core-pick/web'
import { SidebarMascot, resolveSessionMascot } from '@biu/public-mascot'
import { focusComposerEditor, isComposerFocusPending } from '@biu/web-app-shell/chat-overlay'
import type {
  ChannelAttachment,
  ChannelMemberView,
  ChannelMention,
  ChannelMessageView,
} from '../shared/channel-types.ts'
import {
  COMPOSER_LINE_PX,
  COMPOSER_PASTE_PICK_CHARS,
  collectPickKeys,
  composerEditorReady,
  editorWrapsInCompactRow,
  insertPickChips,
  runComposerCommands,
} from './composer-tiptap.ts'
import {
  channelComposerExtensions,
  clearChannelDraft,
  insertChannelMentionAtRange,
  insertPageMentionAtRange,
  isChannelEditorEmpty,
  readChannelDraft,
  readChannelMentionAtCursor,
  serializeChannelComposer,
  writeChannelDraft,
  type ChannelMentionTrigger,
} from './channel-composer-tiptap.ts'
import { ImageThumbs } from './image-thumbs.tsx'
import { notifyChannelTyping, sendChannelMessage, uploadChannelAttachment } from './channel-store.ts'

const INPUT_DEBOUNCE_MS = 120
const DRAFT_DEBOUNCE_MS = 300
const PAGE_MENTION_DEBOUNCE_MS = 160
const MAX_CHANNEL_ATTACHMENTS = 12
const MAX_PAGE_MENTION_ITEMS = 8

type PageMentionItem = Awaited<ReturnType<typeof fetchMentionItems>>[number]

type MemberMentionOption = {
  section: 'member'
  kind: ChannelMention['kind']
  id: string
  label: string
  sub?: string
  avatar?: string
  mascot?: ChannelMemberView['mascot']
}

type PageMentionOption = {
  section: 'page'
  id: string
  label: string
  kindLabel: string
}

type UnifiedMentionOption = MemberMentionOption | PageMentionOption

export type ChannelComposerHandle = {
  focus: () => void
  uploadFiles: (files: FileList | File[]) => Promise<void>
}

export type ChannelComposerProps = {
  channelId: string
  threadRootId?: string | null
  isDm: boolean
  members: ChannelMemberView[]
  resolveAvatar: (accountId?: string, serverAvatar?: string) => string | undefined
  replyTo: ChannelMessageView | null
  onClearReplyTo: () => void
  onError: (message: string) => void
  pick?: PickService
}

function ComposerMemberAvatar({ avatar, seed }: { avatar?: string; seed: string }) {
  const clean = avatar?.trim()
  if (clean) {
    return <img src={clean} alt="" className="size-[18px] shrink-0 rounded-full object-cover" />
  }
  return <AiAvatar seed={seed || 'biu-ai'} size={18} className="shrink-0 rounded-full" />
}

/**
 * 与 clipboard-images.ts 一致：浏览器粘贴截图常同时把同一张图塞进 clipboardData.files 与 clipboardData.items
 * （两个 File 对象的 name / lastModified 不同），因此优先读 files，仅在 files 为空时回退 items，
 * 并按图片 type+size / 普通文件 type+size+name 去重，避免一次粘贴上传两张重复图片。
 */
function collectClipboardFiles(clipboard: DataTransfer | null | undefined): File[] {
  if (!clipboard) return []
  const raw: Array<File | null | undefined> =
    clipboard.files && clipboard.files.length > 0
      ? Array.from(clipboard.files)
      : clipboard.items
        ? Array.from(clipboard.items).map((item) => (item.kind === 'file' ? item.getAsFile() : null))
        : []
  const files: File[] = []
  const seen = new Set<string>()
  for (const file of raw) {
    if (!file || file.size <= 0) continue
    const key = file.type.startsWith('image/')
      ? `${file.type}\0${file.size}`
      : `${file.type}\0${file.size}\0${file.name}`
    if (seen.has(key)) continue
    seen.add(key)
    files.push(file)
  }
  return files
}

export const ChannelComposer = memo(
  forwardRef<ChannelComposerHandle, ChannelComposerProps>(function ChannelComposer(
    { channelId, threadRootId, isDm, members, resolveAvatar, replyTo, onClearReplyTo, onError, pick },
    ref,
  ) {
    const draftKey = threadRootId ? `${channelId}:thread:${threadRootId}` : channelId
    const location = useLocation()
    const formRef = useRef<HTMLFormElement>(null)
    const fileInputRef = useRef<HTMLInputElement>(null)
    const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const draftTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
    const activeDraftChannelRef = useRef<string | null>(null)
    const restoringDraftRef = useRef(false)
    const lastTypingSentRef = useRef(0)
    const canSubmitRef = useRef(false)
    const pickKeysRef = useRef(new Set<string>())
    const previewUrlsRef = useRef(new Map<string, string>())

    const revokePreviewUrl = useCallback((id: string) => {
      const url = previewUrlsRef.current.get(id)
      if (!url) return
      previewUrlsRef.current.delete(id)
      try {
        URL.revokeObjectURL(url)
      } catch {
        /* ignore in environments without revokeObjectURL */
      }
    }, [])

    const revokeAllPreviewUrls = useCallback(() => {
      for (const url of previewUrlsRef.current.values()) {
        try {
          URL.revokeObjectURL(url)
        } catch {
          /* ignore */
        }
      }
      previewUrlsRef.current.clear()
    }, [])

    const [canSubmit, setCanSubmit] = useState(false)
    const [expanded, setExpanded] = useState(false)
    const [editorHasChips, setEditorHasChips] = useState(false)
    const [attachments, setAttachments] = useState<ChannelAttachment[]>([])
    const [uploadingFiles, setUploadingFiles] = useState(0)
    const [sending, setSending] = useState(false)
    const [mentionTrigger, setMentionTrigger] = useState<ChannelMentionTrigger | null>(null)
    const [mentionIdx, setMentionIdx] = useState(0)
    const [pageMentions, setPageMentions] = useState<PageMentionItem[]>([])

    const { refs: pickRefs } = usePickState(pick)

    const placeholderText = useMemo(() => {
      const hasAgents = members.some((m) => m.memberType === 'agent')
      if (threadRootId) {
        return hasAgents
          ? '在讨论串中回复… 输入 @ 提及成员、Agent 或引用页面'
          : '在讨论串中回复… 输入 @ 提及成员或引用页面'
      }
      if (isDm) return '发送私聊消息… 输入 @ 引用页面或粘贴截图'
      return hasAgents
        ? '发送消息… 输入 @ 提及成员、Agent 或引用页面'
        : '发送消息… 输入 @ 提及成员或引用页面'
    }, [isDm, members, threadRootId])
    const placeholderRef = useRef(placeholderText)
    placeholderRef.current = placeholderText

    const memberOptions = useMemo<MemberMentionOption[]>(() => {
      const agents = members.filter((m) => m.memberType === 'agent')
      const humans = members.filter((m) => m.memberType === 'account')
      const base: MemberMentionOption[] = []
      if (agents.length > 0) {
        base.push({
          section: 'member',
          kind: 'everyone',
          id: 'everyone',
          label: '所有人',
          sub: `唤醒群内全部 ${agents.length} 个 Agent`,
        })
      }
      for (const a of agents) {
        base.push({
          section: 'member',
          kind: 'agent',
          id: a.memberId,
          label: a.name,
          sub: a.ownerName ? `Agent · 归属 ${a.ownerName}` : 'Agent',
          mascot: a.mascot,
        })
      }
      for (const h of humans) {
        base.push({
          section: 'member',
          kind: 'account',
          id: h.memberId,
          label: h.name,
          sub: '成员',
          avatar: resolveAvatar(h.memberId, h.avatar),
        })
      }
      if (!mentionTrigger?.query) return base
      const q = mentionTrigger.query.toLowerCase()
      return base.filter(
        (opt) => opt.label.toLowerCase().includes(q) || (opt.sub?.toLowerCase().includes(q) ?? false),
      )
    }, [members, mentionTrigger?.query, resolveAvatar])

    // 异步拉取工作区页面/记录以合并进统一 @ 弹层
    useEffect(() => {
      if (mentionTrigger === null) {
        setPageMentions([])
        return
      }
      const query = mentionTrigger.query
      const controller = new AbortController()
      const timer = setTimeout(() => {
        void fetchMentionItems(query, controller.signal)
          .then((items) => {
            if (!controller.signal.aborted) {
              setPageMentions(items.slice(0, MAX_PAGE_MENTION_ITEMS))
            }
          })
          .catch(() => {
            if (!controller.signal.aborted) setPageMentions([])
          })
      }, PAGE_MENTION_DEBOUNCE_MS)
      return () => {
        clearTimeout(timer)
        controller.abort()
      }
    }, [mentionTrigger?.query, mentionTrigger === null])

    const pageOptions = useMemo<PageMentionOption[]>(
      () =>
        pageMentions.map((item) => ({
          section: 'page',
          id: item.id,
          label: item.label,
          kindLabel: item.kindLabel,
        })),
      [pageMentions],
    )

    const allMentionOptions = useMemo<UnifiedMentionOption[]>(
      () => [...memberOptions, ...pageOptions],
      [memberOptions, pageOptions],
    )

    useEffect(() => {
      setMentionIdx(0)
    }, [mentionTrigger?.query, mentionTrigger === null, allMentionOptions.length])

    const scheduleCanSubmit = useCallback(
      (hasTextOrChips: boolean, attachmentCount: number, immediate = false) => {
        const next = hasTextOrChips || attachmentCount > 0
        if (debounceRef.current != null) {
          clearTimeout(debounceRef.current)
          debounceRef.current = null
        }
        if (immediate || next === canSubmitRef.current) {
          canSubmitRef.current = next
          setCanSubmit(next)
          return
        }
        debounceRef.current = setTimeout(() => {
          debounceRef.current = null
          canSubmitRef.current = next
          setCanSubmit(next)
        }, INPUT_DEBOUNCE_MS)
      },
      [],
    )

    const flushDraftTimer = useCallback(() => {
      if (draftTimerRef.current != null) {
        clearTimeout(draftTimerRef.current)
        draftTimerRef.current = null
      }
    }, [])

    const uploadFiles = useCallback(
      async (files: FileList | File[]) => {
        const list = Array.from(files).filter((f) => f && f.size > 0)
        if (list.length === 0) return
        onError('')
        setUploadingFiles((c) => c + list.length)
        try {
          for (const file of list) {
            try {
              const uploaded = await uploadChannelAttachment(channelId, file)
              if (uploaded.kind === 'image' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
                previewUrlsRef.current.set(uploaded.id, URL.createObjectURL(file))
              }
              setAttachments((prev) => [...prev, uploaded].slice(0, MAX_CHANNEL_ATTACHMENTS))
            } catch (err) {
              onError(err instanceof Error ? err.message : String(err))
            }
          }
        } finally {
          setUploadingFiles((c) => Math.max(0, c - list.length))
        }
      },
      [channelId, onError],
    )

    const hasExternalChips = Boolean(replyTo) || attachments.length > 0 || uploadingFiles > 0

    const live = useRef({
      channelId,
      route: location.pathname,
      pick,
      attachments,
      uploadingFiles,
      sending,
      hasExternalChips,
      mentionTrigger,
      allMentionOptions,
      mentionIdx,
      uploadFiles,
    })
    live.current = {
      channelId,
      route: location.pathname,
      pick,
      attachments,
      uploadingFiles,
      sending,
      hasExternalChips,
      mentionTrigger,
      allMentionOptions,
      mentionIdx,
      uploadFiles,
    }

    const pickOptionRef = useRef<(opt: UnifiedMentionOption) => void>(() => {})

    const extensions = useMemo(
      () => channelComposerExtensions(() => placeholderRef.current),
      [],
    )

    const editor = useEditor({
      immediatelyRender: false,
      extensions,
      editorProps: {
        attributes: {
          class: 'composer-tiptap',
          role: 'textbox',
          'aria-label': '聊天输入',
          'data-testid': 'channel-composer-input',
        },
        handlePaste(_view, event) {
          const plainOnly = consumePlainPasteIntent()
          const files = collectClipboardFiles(event.clipboardData)
          if (files.length > 0) {
            event.preventDefault()
            void live.current.uploadFiles(files)
            return true
          }
          const raw = event.clipboardData?.getData('text/plain') ?? ''
          if (plainOnly) return false
          const copiedPicks = readPickClipboard(event.clipboardData, raw)
          if (copiedPicks?.length) {
            event.preventDefault()
            if (editorRef.current) {
              insertPickChips(editorRef.current, copiedPicks)
            } else if (live.current.pick) {
              live.current.pick.addMany(copiedPicks)
            }
            return true
          }
          if (raw.trim().length < COMPOSER_PASTE_PICK_CHARS) return false
          const ref = textPickFromPlain(live.current.route, raw)
          if (!ref) return false
          event.preventDefault()
          if (live.current.pick) {
            live.current.pick.add(ref)
          } else if (editorRef.current) {
            insertPickChips(editorRef.current, [ref])
          }
          return true
        },
        handleDrop(_view, event) {
          const files = event.dataTransfer?.files
          if (files && files.length > 0) {
            event.preventDefault()
            void live.current.uploadFiles(files)
            return true
          }
          return false
        },
        handleKeyDown(_view, event) {
          if (isPlainPasteHotkey(event)) {
            markPlainPasteIntent()
            return false
          }
          const trigger = live.current.mentionTrigger
          const options = live.current.allMentionOptions
          if (trigger !== null && options.length > 0) {
            if (event.key === 'ArrowDown') {
              event.preventDefault()
              setMentionIdx((i) => (i + 1) % options.length)
              return true
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault()
              setMentionIdx((i) => (i - 1 + options.length) % options.length)
              return true
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              setMentionTrigger(null)
              return true
            }
            if (event.key === 'Tab' || (event.key === 'Enter' && !event.shiftKey)) {
              if (event.isComposing) return false
              event.preventDefault()
              const hit = options[live.current.mentionIdx] ?? options[0]
              if (hit) pickOptionRef.current(hit)
              return true
            }
          }
          if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault()
            formRef.current?.requestSubmit()
            return true
          }
          if (
            (event.key === 'Backspace' || event.key === 'Delete') &&
            live.current.attachments.length > 0 &&
            isChannelEditorEmpty(editorRef.current)
          ) {
            event.preventDefault()
            setAttachments((prev) => {
              const last = prev[prev.length - 1]
              if (last) revokePreviewUrl(last.id)
              return prev.slice(0, -1)
            })
            return true
          }
          return false
        },
      },
      onCreate: ({ editor: created }) => {
        if (isComposerFocusPending()) {
          focusComposerEditor(created as unknown as Parameters<typeof focusComposerEditor>[0])
        }
      },
      onUpdate: ({ editor: ed }) => {
        const packed = serializeChannelComposer(ed)
        const hasContent = Boolean(packed.plain.trim()) || packed.hasChips
        setEditorHasChips(packed.hasChips)
        scheduleCanSubmit(hasContent, live.current.attachments.length)

        const el = ed.view.dom
        const form = formRef.current
        const wraps = form ? editorWrapsInCompactRow(form, el) : el.scrollHeight > COMPOSER_LINE_PX + 4
        setExpanded(
          wraps ||
            packed.plain.includes('\n') ||
            packed.hasChips ||
            live.current.hasExternalChips,
        )

        if (!restoringDraftRef.current) {
          const targetChannel = activeDraftChannelRef.current ?? live.current.channelId
          if (targetChannel) {
            if (draftTimerRef.current != null) clearTimeout(draftTimerRef.current)
            const snapshot = hasContent ? ed.getJSON() : null
            draftTimerRef.current = setTimeout(() => {
              draftTimerRef.current = null
              if (snapshot) writeChannelDraft(targetChannel, snapshot)
              else clearChannelDraft(targetChannel)
            }, DRAFT_DEBOUNCE_MS)
          }
          if (packed.plain.trim() && Date.now() - lastTypingSentRef.current > 2500) {
            lastTypingSentRef.current = Date.now()
            void notifyChannelTyping(live.current.channelId)
          }
        }

        setMentionTrigger(readChannelMentionAtCursor(ed))

        const liveKeys = collectPickKeys(ed)
        for (const r of live.current.pick?.refs ?? []) {
          const key = pickKey(r)
          if (!liveKeys.has(key)) live.current.pick?.remove(key)
        }
        pickKeysRef.current = liveKeys
      },
      onSelectionUpdate: ({ editor: ed }) => {
        setMentionTrigger(readChannelMentionAtCursor(ed))
      },
    })

    const editorRef = useRef(editor)
    editorRef.current = editor

    const pickOption = useCallback(
      (opt: UnifiedMentionOption) => {
        const ed = editorRef.current
        const trigger = live.current.mentionTrigger
        if (!composerEditorReady(ed) || !trigger) return
        if (opt.section === 'member') {
          insertChannelMentionAtRange(ed, { from: trigger.from, to: trigger.to }, {
            kind: opt.kind,
            id: opt.id,
            label: opt.label,
          })
        } else {
          const ref = insertPageMentionAtRange(ed, { from: trigger.from, to: trigger.to }, {
            id: opt.id,
            label: opt.label,
          })
          if (ref) {
            pickKeysRef.current = collectPickKeys(ed)
            live.current.pick?.add(ref)
          }
        }
        setMentionTrigger(null)
      },
      [],
    )
    pickOptionRef.current = pickOption

    useImperativeHandle(
      ref,
      () => ({
        focus: () => {
          focusComposerEditor(editorRef.current as unknown as Parameters<typeof focusComposerEditor>[0])
        },
        uploadFiles,
      }),
      [uploadFiles],
    )

    // 响应全局聚焦事件
    useEffect(() => {
      const onFocus = () => {
        focusComposerEditor(editorRef.current as unknown as Parameters<typeof focusComposerEditor>[0])
      }
      window.addEventListener('biu:composer-focus', onFocus)
      return () => window.removeEventListener('biu:composer-focus', onFocus)
    }, [])

    useEffect(() => {
      if (!composerEditorReady(editor)) return
      if (isComposerFocusPending()) {
        focusComposerEditor(editor as unknown as Parameters<typeof focusComposerEditor>[0])
      }
    }, [editor])

    // 卸载清理定时器与本地图片预览 URL
    useEffect(
      () => () => {
        if (debounceRef.current != null) clearTimeout(debounceRef.current)
        if (draftTimerRef.current != null) clearTimeout(draftTimerRef.current)
        revokeAllPreviewUrls()
      },
      [revokeAllPreviewUrls],
    )

    // 同步外部附件/引用状态对提交按钮和展开态的影响
    useEffect(() => {
      const packed = serializeChannelComposer(editorRef.current)
      const hasContent = Boolean(packed.plain.trim()) || packed.hasChips
      scheduleCanSubmit(hasContent, attachments.length, true)
      if (hasExternalChips) {
        setExpanded(true)
      } else if (composerEditorReady(editorRef.current)) {
        const el = editorRef.current.view.dom
        const form = formRef.current
        const wraps = form ? editorWrapsInCompactRow(form, el) : el.scrollHeight > COMPOSER_LINE_PX + 4
        setExpanded(wraps || packed.plain.includes('\n') || packed.hasChips)
      }
    }, [attachments.length, hasExternalChips, scheduleCanSubmit])

    // 按 draftKey（频道或子话题）隔离并持久化草稿（含 @ 芯片与 Pick 芯片）
    useEffect(() => {
      if (!composerEditorReady(editor)) return
      const prevId = activeDraftChannelRef.current
      const switching = Boolean(prevId && prevId !== draftKey)
      flushDraftTimer()
      if (switching && prevId) {
        const prevPacked = serializeChannelComposer(editor)
        if (prevPacked.text.trim() || prevPacked.hasChips) {
          writeChannelDraft(prevId, editor.getJSON())
        } else {
          clearChannelDraft(prevId)
        }
      }
      activeDraftChannelRef.current = draftKey
      if (!draftKey) return

      const draft = readChannelDraft(draftKey)
      const keep = !switching ? (pick?.refs.slice() ?? []) : []
      restoringDraftRef.current = true
      try {
        if (!pick?.picking) pick?.clear()
        pickKeysRef.current = new Set()
        if (switching) {
          revokeAllPreviewUrls()
          setAttachments([])
          setUploadingFiles(0)
          setMentionTrigger(null)
        }
        if (draft) {
          runComposerCommands(editor, (ed) => ed.commands.setContent(draft))
          const { refs } = serializeChannelComposer(editor)
          if (refs.length) pick?.addMany(refs)
        } else {
          runComposerCommands(editor, (ed) => ed.commands.clearContent())
        }
        if (keep.length && !pick?.picking) pick?.addMany(keep)
        pickKeysRef.current = collectPickKeys(editor)
      } finally {
        restoringDraftRef.current = false
      }

      const restored = serializeChannelComposer(editor)
      setEditorHasChips(restored.hasChips)
      scheduleCanSubmit(Boolean(restored.plain.trim()) || restored.hasChips, switching ? 0 : live.current.attachments.length, true)
      setExpanded(restored.plain.includes('\n') || restored.hasChips)
      if (isComposerFocusPending()) {
        focusComposerEditor(editor as unknown as Parameters<typeof focusComposerEditor>[0])
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [draftKey, editor])

    // 同步全局 ⌘L Pick 拾取芯片进入编辑器
    useEffect(() => {
      if (!composerEditorReady(editor)) return
      const missing = pickRefs.filter((r) => !pickKeysRef.current.has(pickKey(r)))
      const nextKeys = new Set(pickRefs.map((item) => pickKey(item)))
      pickKeysRef.current = nextKeys
      queueMicrotask(() => {
        if (!composerEditorReady(editor)) return
        const stillMissing = missing.filter((r) => !collectPickKeys(editor).has(pickKey(r)))
        if (stillMissing.length) insertPickChips(editor, stillMissing)
        pickKeysRef.current = collectPickKeys(editor)
        const draft = pick?.takeDraft()
        if (draft?.text) {
          const prefix = serializeChannelComposer(editor).plain.trim() ? ' ' : ''
          editor.chain().focus().insertContent(`${prefix}${draft.text}`).run()
        }
        const packed = serializeChannelComposer(editor)
        setEditorHasChips(packed.hasChips)
        scheduleCanSubmit(Boolean(packed.plain.trim()) || packed.hasChips, live.current.attachments.length, true)
        if (draft?.send) queueMicrotask(() => formRef.current?.requestSubmit())
      })
    }, [pickRefs, editor, pick, scheduleCanSubmit])

    const openMentionPicker = useCallback(() => {
      const ed = editorRef.current
      if (!composerEditorReady(ed)) return
      const existing = readChannelMentionAtCursor(ed)
      if (existing) {
        ed.commands.focus()
        setMentionTrigger(existing)
        return
      }
      const { $from } = ed.state.selection
      const before = ed.state.doc.textBetween($from.start(), $from.pos, '\n', '\0')
      const needsSpace = before.length > 0 && !/[\s\0]$/.test(before)
      ed.chain().focus().insertContent(needsSpace ? ' @' : '@').run()
      setMentionTrigger(readChannelMentionAtCursor(ed))
    }, [])

    const clearInput = useCallback(() => {
      if (debounceRef.current != null) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      flushDraftTimer()
      runComposerCommands(editorRef.current, (ed) => ed.commands.clearContent(true))
      clearChannelDraft(draftKey)
      pick?.clear()
      pickKeysRef.current = new Set()
      canSubmitRef.current = false
      setCanSubmit(false)
      setEditorHasChips(false)
      revokeAllPreviewUrls()
      setAttachments([])
      setMentionTrigger(null)
      setExpanded(false)
      onClearReplyTo()
    }, [draftKey, flushDraftTimer, onClearReplyTo, pick, revokeAllPreviewUrls])

    const handleSend = useCallback(async () => {
      if (sending || uploadingFiles > 0) return
      if (debounceRef.current != null) {
        clearTimeout(debounceRef.current)
        debounceRef.current = null
      }
      const packed = serializeChannelComposer(editorRef.current)
      const body = packed.text
      if (!body && attachments.length === 0) return
      setSending(true)
      onError('')
      try {
        await sendChannelMessage(channelId, {
          text: body,
          ...(replyTo ? { replyToId: replyTo.id } : {}),
          ...(threadRootId ? { threadRootId } : {}),
          mentions: packed.mentions,
          ...(attachments.length > 0 ? { attachments } : {}),
        })
        clearInput()
      } catch (err) {
        onError(err instanceof Error ? err.message : String(err))
      } finally {
        setSending(false)
      }
    }, [attachments, channelId, clearInput, onError, replyTo, sending, threadRootId, uploadingFiles])

    const onFormSubmit = (event: FormEvent) => {
      event.preventDefault()
      if (mentionTrigger !== null && allMentionOptions.length > 0) {
        const hit = allMentionOptions[mentionIdx] ?? allMentionOptions[0]
        if (hit) pickOption(hit)
        return
      }
      void handleSend()
    }

    const onFormDrop = (event: DragEvent<HTMLFormElement>) => {
      const files = event.dataTransfer?.files
      if (files && files.length > 0) {
        event.preventDefault()
        event.stopPropagation()
        void uploadFiles(files)
      }
    }

    const imageAttachments = useMemo(
      () => attachments.filter((att) => att.kind === 'image'),
      [attachments],
    )
    const fileAttachments = useMemo(
      () => attachments.filter((att) => att.kind !== 'image'),
      [attachments],
    )

    const hasChips = editorHasChips || hasExternalChips

    return (
      <form
        ref={formRef}
        className={`composer-pill${expanded ? ' is-expanded' : ''}${hasChips ? ' has-chips' : ''}`}
        onSubmit={onFormSubmit}
        onDragOver={(event) => {
          if ([...(event.dataTransfer?.types ?? [])].includes('Files')) {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }
        }}
        onDrop={onFormDrop}
      >
        {/* 统一 @ 弹层：分区展示「成员与 Agent」及「页面与记录」 */}
        {mentionTrigger !== null && allMentionOptions.length > 0 ? (
          <div
            className="composer-slash"
            role="listbox"
            aria-label="提及成员、Agent 或页面"
            data-testid="channel-mention-menu"
          >
            {memberOptions.length > 0 ? (
              <>
                <div className="composer-slash-head">成员与 Agent · 输入过滤 · Enter 选用</div>
                {memberOptions.map((opt, idx) => (
                  <button
                    key={`${opt.kind}:${opt.id}`}
                    type="button"
                    role="option"
                    aria-selected={idx === mentionIdx}
                    className={`composer-slash-item !flex items-center gap-2${idx === mentionIdx ? ' is-active' : ''}`}
                    onMouseEnter={() => setMentionIdx(idx)}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      pickOption(opt)
                    }}
                  >
                    {opt.kind === 'agent' ? (
                      <SidebarMascot
                        size={18}
                        sessionId={opt.id}
                        identity={resolveSessionMascot(opt.id, opt.mascot)}
                        animate={false}
                        title=""
                      />
                    ) : opt.kind === 'account' ? (
                      <ComposerMemberAvatar avatar={opt.avatar} seed={opt.id} />
                    ) : (
                      <UserGroupIcon className="size-4 shrink-0 text-(--biu-color-icon)" />
                    )}
                    <span className="composer-slash-name !font-sans font-medium">@{opt.label}</span>
                    {opt.sub ? <span className="composer-slash-desc ml-auto">{opt.sub}</span> : null}
                  </button>
                ))}
              </>
            ) : null}

            {pageOptions.length > 0 ? (
              <>
                <div className="composer-slash-head">页面与记录 · 插入行内引用芯片</div>
                {pageOptions.map((opt, pageOffset) => {
                  const idx = memberOptions.length + pageOffset
                  return (
                    <button
                      key={`page:${opt.id}`}
                      type="button"
                      role="option"
                      aria-selected={idx === mentionIdx}
                      className={`composer-slash-item !flex items-center gap-2${idx === mentionIdx ? ' is-active' : ''}`}
                      onMouseEnter={() => setMentionIdx(idx)}
                      onMouseDown={(e) => {
                        e.preventDefault()
                        pickOption(opt)
                      }}
                    >
                      <DocumentIcon className="size-3.5 shrink-0 text-(--biu-color-icon)" />
                      <span className="composer-slash-name !font-sans font-medium">{opt.label}</span>
                      <span className="composer-slash-desc ml-auto">{opt.kindLabel}</span>
                    </button>
                  )
                })}
              </>
            ) : null}
          </div>
        ) : null}

        {/* 引用回复 & 非图片文件附件 chip */}
        {replyTo || fileAttachments.length > 0 || uploadingFiles > 0 ? (
          <div className="composer-tool-chips flex-wrap" aria-label="附件与引用">
            {replyTo ? (
              <button
                type="button"
                className="composer-tool-chip max-w-full"
                title="取消引用回复"
                data-testid="channel-reply-chip"
                onClick={onClearReplyTo}
              >
                <ArrowUturnLeftIcon className="size-3 shrink-0" />
                <span className="truncate">
                  回复 {replyTo.senderName}：{replyTo.text.slice(0, 60)}
                </span>
                <span aria-hidden>×</span>
              </button>
            ) : null}
            {fileAttachments.map((att) => (
              <span
                key={att.id}
                className="composer-tool-chip max-w-[220px]"
                data-testid={`composer-attachment-${att.id}`}
              >
                <DocumentIcon className="size-3.5 shrink-0" />
                <span className="truncate">{att.name}</span>
                <button
                  type="button"
                  className="cursor-pointer border-0 bg-transparent p-0 leading-none text-current opacity-70 hover:opacity-100"
                  aria-label={`移除附件 ${att.name}`}
                  onClick={() => setAttachments((prev) => prev.filter((x) => x.id !== att.id))}
                >
                  ×
                </button>
              </span>
            ))}
            {uploadingFiles > 0 ? (
              <span className="composer-tool-chip text-(--biu-color-text-subtle)">
                正在上传 {uploadingFiles} 个文件…
              </span>
            ) : null}
          </div>
        ) : null}

        {/* 图片附件：优先使用本地 blob 预览（与 Agent 输入框一致），同时兼容云端签名 URL */}
        {imageAttachments.length > 0 ? (
          <ImageThumbs
            images={imageAttachments.map((att) => ({
              name: att.name,
              mime: att.mime,
              url: previewUrlsRef.current.get(att.id) || resolveAssetUrl(att.url),
            }))}
            onRemove={(index) => {
              const target = imageAttachments[index]
              if (!target) return
              revokePreviewUrl(target.id)
              setAttachments((prev) => prev.filter((x) => x.id !== target.id))
            }}
          />
        ) : null}

        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          data-testid="channel-file-input"
          onChange={(e) => {
            if (e.target.files?.length) void uploadFiles(e.target.files)
            e.target.value = ''
          }}
        />

        <div className="composer-pill-row">
          <div className="composer-pill-left">
            <button
              type="button"
              className="composer-plus"
              title="上传图片或文件（也支持粘贴或拖拽）"
              aria-label="上传图片或文件"
              data-testid="channel-upload-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <PlusIcon className="size-4" />
            </button>

            <button
              type="button"
              className="composer-plus"
              title="提及成员、Agent 或引用页面 (@)"
              aria-label="提及成员或 Agent"
              data-testid="channel-mention-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={openMentionPicker}
            >
              <AtSymbolIcon className="size-3.5" />
            </button>
          </div>

          <div className="composer-editor">
            {composerEditorReady(editor) ? (
              <EditorContent editor={editor} />
            ) : (
              <div className="composer-tiptap" data-testid="channel-composer-pending" />
            )}
          </div>

          <div className="composer-pill-right">
            <button
              type="submit"
              disabled={!canSubmit || sending || uploadingFiles > 0}
              data-testid="channel-composer-send"
              className="composer-send"
              aria-label="发送消息"
              title="发送"
            >
              <ArrowUpIcon className="size-3.5" aria-hidden />
            </button>
          </div>
        </div>
      </form>
    )
  }),
)
