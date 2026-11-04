import { TAG_TONES, tagTextColor, tagWashColor } from '@biu/biu-ui'

/** 与标签相同的色相；文字/涂亮直接用饱和色，不叠黑白墨。 */
export const EDITOR_TONES = TAG_TONES

export { tagTextColor, tagWashColor }

export type EditorColorKind = 'text' | 'mark'

export type LastEditorColor = {
  kind: EditorColorKind
  value: string
}

const LAST_COLOR_KEY = 'biu-last-editor-color'
let lastColorMemory: LastEditorColor | null = null

export const INK_TONES = [
  { id: 'default', label: '默认', value: 'var(--biu-color-text)' },
  { id: 'gray', label: '灰', value: 'var(--biu-color-ink-gray)' },
  { id: 'brown', label: '棕', value: 'var(--biu-color-ink-brown)' },
  { id: 'orange', label: '橙', value: 'var(--biu-color-ink-orange)' },
  { id: 'pink', label: '粉', value: 'var(--biu-color-ink-pink)' },
  { id: 'gold', label: '金', value: 'var(--biu-color-ink-gold)' },
  { id: 'green', label: '绿', value: 'var(--biu-color-ink-green)' },
  { id: 'blue', label: '蓝', value: 'var(--biu-color-ink-blue)' },
  { id: 'purple', label: '紫', value: 'var(--biu-color-ink-purple)' },
  { id: 'red', label: '红', value: 'var(--biu-color-ink-red)' },
] as const

export const WASH_TONES = [
  { id: 'gray', label: '灰', value: 'var(--biu-color-wash-gray)' },
  { id: 'cream', label: '米', value: 'var(--biu-color-wash-cream)' },
  { id: 'peach', label: '桃', value: 'var(--biu-color-wash-peach)' },
  { id: 'pink', label: '粉', value: 'var(--biu-color-wash-pink)' },
  { id: 'yellow', label: '黄', value: 'var(--biu-color-wash-yellow)' },
  { id: 'mint', label: '薄荷', value: 'var(--biu-color-wash-mint)' },
  { id: 'sky', label: '天空', value: 'var(--biu-color-wash-sky)' },
  { id: 'lavender', label: '薰衣草', value: 'var(--biu-color-wash-lavender)' },
  { id: 'rose', label: '玫瑰', value: 'var(--biu-color-wash-rose)' },
  { id: 'yellow-2', label: '亮黄', value: 'var(--biu-color-wash-yellow-2)' },
  { id: 'aqua', label: '水', value: 'var(--biu-color-wash-aqua)' },
  { id: 'cyan', label: '青', value: 'var(--biu-color-wash-cyan)' },
  { id: 'violet', label: '紫', value: 'var(--biu-color-wash-violet)' },
  { id: 'coral', label: '珊瑚', value: 'var(--biu-color-wash-coral)' },
  { id: 'lime', label: '柠', value: 'var(--biu-color-wash-lime)', swatch: 'var(--biu-color-wash-lime-grad)' },
  { id: 'teal', label: '蓝绿', value: 'var(--biu-color-wash-teal)', swatch: 'var(--biu-color-wash-teal-grad)' },
  { id: 'azure', label: '雾蓝', value: 'var(--biu-color-wash-azure)', swatch: 'var(--biu-color-wash-azure-grad)' },
  { id: 'magenta', label: '洋红', value: 'var(--biu-color-wash-magenta)', swatch: 'var(--biu-color-wash-magenta-grad)' },
  { id: 'salmon', label: '鲑', value: 'var(--biu-color-wash-salmon)', swatch: 'var(--biu-color-wash-salmon-grad)' },
] as const

export function editorTextColor(tone: string) {
  return tone
}

export function editorHighlightColor(tone: string) {
  return tone
}

export const TEXT_COLORS = [
  { label: '默认', value: '' },
  ...INK_TONES.map((item) => ({ label: item.label, value: item.value })),
] as const

export const HIGHLIGHT_COLORS = [
  { label: '无', value: '' },
  ...WASH_TONES.map((item) => ({ label: item.label, value: item.value })),
] as const

export function readLastEditorColor(): LastEditorColor | null {
  if (typeof localStorage === 'undefined') return lastColorMemory
  try {
    const raw = localStorage.getItem(LAST_COLOR_KEY)
    if (!raw) return lastColorMemory
    const parsed = JSON.parse(raw) as LastEditorColor
    if (parsed?.kind !== 'text' && parsed?.kind !== 'mark') return lastColorMemory
    if (typeof parsed.value !== 'string' || !parsed.value) return lastColorMemory
    lastColorMemory = parsed
    return parsed
  } catch {
    return lastColorMemory
  }
}

export function writeLastEditorColor(next: LastEditorColor | null) {
  lastColorMemory = next
  if (typeof localStorage === 'undefined') return
  try {
    if (!next) localStorage.removeItem(LAST_COLOR_KEY)
    else localStorage.setItem(LAST_COLOR_KEY, JSON.stringify(next))
  } catch {
    /* ignore quota / private mode */
  }
}

export function isLastColorHotkey(event: {
  key: string
  metaKey: boolean
  ctrlKey: boolean
  altKey: boolean
  shiftKey: boolean
  isComposing?: boolean
}) {
  if (event.isComposing) return false
  if (!(event.metaKey || event.ctrlKey) || event.altKey || !event.shiftKey) return false
  return event.key === 'h' || event.key === 'H'
}

export function lastColorSwatch(last: LastEditorColor | null) {
  if (!last) return ''
  if (last.kind === 'text') return last.value
  const wash = WASH_TONES.find((item) => item.value === last.value)
  return ('swatch' in (wash ?? {}) && wash?.swatch) || last.value
}
