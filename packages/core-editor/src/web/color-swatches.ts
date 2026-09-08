import { TAG_TONES } from '@biu/public-ui'

/** 与合集标签相同的色相。 */
export const EDITOR_TONES = TAG_TONES

/** 标签字色。 */
export function tagTextColor(tone: string) {
  return tone
}

/** 标签浅底：22% 叠在透明上，和 `.biu-tag` 背景一致。 */
export function tagWashColor(tone: string) {
  return `color-mix(in srgb, ${tone} 22%, transparent)`
}

export const TEXT_COLORS = [
  { label: '默认', value: '' },
  ...EDITOR_TONES.map((value) => ({ label: value, value })),
] as const

export const HIGHLIGHT_COLORS = [
  { label: '无', value: '' },
  ...EDITOR_TONES.map((value) => ({ label: value, value: tagWashColor(value) })),
] as const
