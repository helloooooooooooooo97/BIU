import { pickRefFromAttrs, type PickRef } from './types.ts'

export const PICK_CLIPBOARD_MIME = 'application/x-biu-picks'

type PickClipboardEntry = {
  plain: string
  refs: PickRef[]
  at: number
}

const EMPTY_PLAIN_TTL_MS = 30_000
const PLAIN_PASTE_INTENT_MS = 600

let rememberedClipboard: PickClipboardEntry | null = null
let plainPasteIntentAt = 0

function normalizePlain(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n$/, '')
}

function parseMimeRefs(raw: string): PickRef[] | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const parsed = JSON.parse(trimmed) as unknown
    const list = Array.isArray(parsed) ? parsed : [parsed]
    const refs = list
      .map((item) => (item && typeof item === 'object' ? pickRefFromAttrs(item as Record<string, unknown>) : null))
      .filter((item): item is PickRef => Boolean(item))
    return refs.length ? refs : null
  } catch {
    return null
  }
}

/** 记住刚刚在 BIU 内复制的 Pick 引用及对应纯文本，用于粘贴到对话框时还原结构化芯片。 */
export function rememberPickClipboard(plain: string, refs: PickRef[], now = Date.now()) {
  if (!refs.length) {
    rememberedClipboard = null
    return
  }
  rememberedClipboard = { plain, refs: refs.slice(), at: now }
}

export function clearPickClipboard() {
  rememberedClipboard = null
  plainPasteIntentAt = 0
}

/** 从粘贴事件读取来自 BIU 的结构化 Pick：优先读自定义 MIME，否则校验 text/plain 是否与刚复制内容一致。 */
export function readPickClipboard(
  clipboardData?: Pick<DataTransfer, 'getData'> | null,
  plain?: string,
  now = Date.now(),
): PickRef[] | null {
  const mimeRaw = clipboardData?.getData(PICK_CLIPBOARD_MIME) ?? ''
  if (mimeRaw) {
    const fromMime = parseMimeRefs(mimeRaw)
    if (fromMime?.length) return fromMime
  }
  if (!rememberedClipboard) return null
  const text = plain !== undefined ? plain : (clipboardData?.getData('text/plain') ?? '')
  const normalized = normalizePlain(text)
  if (normalized !== normalizePlain(rememberedClipboard.plain)) return null
  if (!normalized && now - rememberedClipboard.at > EMPTY_PLAIN_TTL_MS) return null
  return rememberedClipboard.refs.slice()
}

/** ⌘⇧V / Ctrl+Shift+V：用户明确要求按纯文本粘贴，不转成芯片。 */
export function isPlainPasteHotkey(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  shiftKey: boolean
  altKey: boolean
  isComposing?: boolean
}) {
  if (event.isComposing) return false
  if (!(event.metaKey || event.ctrlKey) || !event.shiftKey || event.altKey) return false
  return event.key === 'v' || event.key === 'V'
}

export function markPlainPasteIntent(now = Date.now()) {
  plainPasteIntentAt = now
}

export function consumePlainPasteIntent(now = Date.now()): boolean {
  const active = plainPasteIntentAt > 0 && now - plainPasteIntentAt <= PLAIN_PASTE_INTENT_MS
  plainPasteIntentAt = 0
  return active
}
