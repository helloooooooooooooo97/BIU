import { TAG_TONES, tagTextColor, tagWashColor } from '@biu/public-ui'

/** 与合集标签相同的色相。 */
export const EDITOR_TONES = TAG_TONES

export { tagTextColor, tagWashColor }

export const TEXT_COLORS = [
  { label: '默认', value: '' },
  ...EDITOR_TONES.map((value) => ({ label: value, value: tagTextColor(value) })),
] as const

export const HIGHLIGHT_COLORS = [
  { label: '无', value: '' },
  ...EDITOR_TONES.map((value) => ({ label: value, value: tagWashColor(value) })),
] as const
