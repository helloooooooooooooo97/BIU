import { AI_AVATAR_THEMES, type AiAvatarTheme } from '@biu/biu-ui/ai-avatar'
import type { GrokColor, GrokShape } from './grok-bot-types.ts'

export type MascotMeshOrb = {
  cx: number
  cy: number
  r: number
  color: string
  opacity: number
}

export type MascotMeshSpec = {
  themeId: string
  swatch: string
  baseA: string
  baseB: string
  orbs: readonly [MascotMeshOrb, MascotMeshOrb, MascotMeshOrb, MascotMeshOrb]
}

/**
 * 将小人头像色系与个人头像 `AI_AVATAR_THEMES` 精确对齐，
 * 复用同一套深底渐变 + 柔光色块 + 珠光高光的视觉语言。
 */
export const MASCOT_AVATAR_THEME_ID: Record<GrokColor, string> = {
  black: 'carbon',
  brown: 'terracotta',
  red: 'crimson',
  orange: 'tangerine',
  yellow: 'amber',
  green: 'emerald',
  cyan: 'cyan',
  blue: 'ocean',
  violet: 'violet',
  magenta: 'magenta',
  gray: 'obsidian',
}

const THEME_BY_ID = new Map<string, AiAvatarTheme>(AI_AVATAR_THEMES.map((theme) => [theme.id, theme]))
const FALLBACK_THEME = THEME_BY_ID.get('cyan') ?? AI_AVATAR_THEMES[0]!

function hashSeed(input: string): number {
  let hash = 2166136261
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function nextUnit(state: { value: number }): number {
  state.value = (Math.imul(state.value, 1664525) + 1013904223) >>> 0
  return state.value / 0xffffffff
}

export function mascotAvatarTheme(color: GrokColor): AiAvatarTheme {
  const themeId = MASCOT_AVATAR_THEME_ID[color]
  return (themeId ? THEME_BY_ID.get(themeId) : undefined) ?? FALLBACK_THEME
}

export function mascotSwatch(color: GrokColor): string {
  return mascotAvatarTheme(color).swatch
}

/**
 * 根据色系 + 形状生成确定性的 4 象限径向弥散光团参数（纯 SVG 渐变，零 feGaussianBlur 开销），
 * 静态 `StaticMascotMark` 与动态 `GrokBotAvatar` 共用同一份定义，切换状态时色彩零跳变。
 */
export function buildMascotMesh(color: GrokColor, shape: GrokShape = 'blob'): MascotMeshSpec {
  const theme = mascotAvatarTheme(color)
  const [baseA, baseB, blob1, blob2, blob3, blob4] = theme.palette
  const state = { value: hashSeed(`${theme.id}:${shape}`) }
  const jitter = (center: number, span: number) => Math.round(center + (nextUnit(state) - 0.5) * span)

  const orbs: readonly [MascotMeshOrb, MascotMeshOrb, MascotMeshOrb, MascotMeshOrb] = [
    {
      cx: jitter(30, 12),
      cy: jitter(28, 12),
      r: jitter(58, 10),
      color: blob1,
      opacity: 0.9,
    },
    {
      cx: jitter(72, 12),
      cy: jitter(30, 12),
      r: jitter(54, 10),
      color: blob2,
      opacity: 0.82,
    },
    {
      cx: jitter(32, 12),
      cy: jitter(74, 12),
      r: jitter(56, 10),
      color: blob3,
      opacity: 0.78,
    },
    {
      cx: jitter(70, 12),
      cy: jitter(70, 12),
      r: jitter(52, 10),
      color: blob4,
      opacity: 0.7,
    },
  ]

  return {
    themeId: theme.id,
    swatch: theme.swatch,
    baseA,
    baseB,
    orbs,
  }
}
