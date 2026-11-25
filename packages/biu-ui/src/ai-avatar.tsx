import { useId } from 'react'

type AiPalette = readonly [baseA: string, baseB: string, blob1: string, blob2: string, blob3: string, blob4: string]

export type AiAvatarTheme = {
  id: string
  label: string
  swatch: string
  palette: AiPalette
}

export const AI_AVATAR_THEMES: readonly AiAvatarTheme[] = [
  {
    id: 'ocean',
    label: '星云蓝',
    swatch: '#38bdf8',
    palette: ['#0f172a', '#1e3a8a', '#38bdf8', '#60a5fa', '#818cf8', '#22d3ee'],
  },
  {
    id: 'cobalt',
    label: '钴蓝',
    swatch: '#2563eb',
    palette: ['#0b1536', '#1d4ed8', '#3b82f6', '#60a5fa', '#2563eb', '#93c5fd'],
  },
  {
    id: 'sapphire',
    label: '深海蓝',
    swatch: '#1e40af',
    palette: ['#050b24', '#172554', '#1d4ed8', '#38bdf8', '#4f46e5', '#67e8f9'],
  },
  {
    id: 'glacier',
    label: '冰川蓝',
    swatch: '#7dd3fc',
    palette: ['#0c4a6e', '#0369a1', '#7dd3fc', '#bae6fd', '#38bdf8', '#e0f2fe'],
  },
  {
    id: 'sky',
    label: '晴空蓝',
    swatch: '#60a5fa',
    palette: ['#1e3a8a', '#0284c7', '#93c5fd', '#38bdf8', '#a5f3fc', '#c4b5fd'],
  },
  {
    id: 'indigo',
    label: '靛青',
    swatch: '#6366f1',
    palette: ['#1e1b4b', '#312e81', '#6366f1', '#818cf8', '#38bdf8', '#a5b4fc'],
  },
  {
    id: 'cyan',
    label: '霓虹青',
    swatch: '#22d3ee',
    palette: ['#083344', '#164e63', '#22d3ee', '#2dd4bf', '#38bdf8', '#a78bfa'],
  },
  {
    id: 'aqua',
    label: '碧水青',
    swatch: '#06b6d4',
    palette: ['#042f2e', '#155e75', '#06b6d4', '#67e8f9', '#34d399', '#a5f3fc'],
  },
  {
    id: 'teal',
    label: '松石绿',
    swatch: '#14b8a6',
    palette: ['#042f2e', '#115e59', '#14b8a6', '#2dd4bf', '#5eead4', '#38bdf8'],
  },
  {
    id: 'mint',
    label: '薄荷绿',
    swatch: '#6ee7b7',
    palette: ['#064e3b', '#0f766e', '#6ee7b7', '#a7f3d0', '#2dd4bf', '#99f6e4'],
  },
  {
    id: 'emerald',
    label: '翡翠绿',
    swatch: '#34d399',
    palette: ['#052e16', '#064e3b', '#34d399', '#2dd4bf', '#6ee7b7', '#38bdf8'],
  },
  {
    id: 'forest',
    label: '森屿绿',
    swatch: '#22c55e',
    palette: ['#052e16', '#14532d', '#22c55e', '#4ade80', '#10b981', '#86efac'],
  },
  {
    id: 'sage',
    label: '鼠尾草',
    swatch: '#84cc16',
    palette: ['#1a2e05', '#365314', '#84cc16', '#a3e635', '#4ade80', '#bef264'],
  },
  {
    id: 'lime',
    label: '青柠绿',
    swatch: '#a3e635',
    palette: ['#1a2e05', '#3f6212', '#a3e635', '#d9f99d', '#4ade80', '#fde047'],
  },
  {
    id: 'chartreuse',
    label: '嫩芽黄',
    swatch: '#eab308',
    palette: ['#422006', '#713f12', '#eab308', '#fde047', '#a3e635', '#fef08a'],
  },
  {
    id: 'sunbeam',
    label: '晨光黄',
    swatch: '#fde047',
    palette: ['#713f12', '#a16207', '#fde047', '#fef08a', '#fbbf24', '#fed7aa'],
  },
  {
    id: 'amber',
    label: '琥珀金',
    swatch: '#fbbf24',
    palette: ['#422006', '#78350f', '#fbbf24', '#f59e0b', '#fde047', '#fb923c'],
  },
  {
    id: 'honey',
    label: '蜂蜜橙',
    swatch: '#f59e0b',
    palette: ['#451a03', '#92400e', '#f59e0b', '#fbbf24', '#fb923c', '#fde68a'],
  },
  {
    id: 'sunset',
    label: '赤霞橙',
    swatch: '#fb923c',
    palette: ['#431407', '#7c2d12', '#fb923c', '#f97316', '#fb7185', '#fde047'],
  },
  {
    id: 'tangerine',
    label: '橘子汽水',
    swatch: '#f97316',
    palette: ['#431407', '#9a3412', '#f97316', '#fb923c', '#fdba74', '#facc15'],
  },
  {
    id: 'terracotta',
    label: '陶土棕',
    swatch: '#ea580c',
    palette: ['#291007', '#7c2d12', '#ea580c', '#f59e0b', '#d97706', '#fed7aa'],
  },
  {
    id: 'coral',
    label: '珊瑚红',
    swatch: '#f87171',
    palette: ['#450a0a', '#991b1b', '#f87171', '#fb7185', '#fb923c', '#fca5a5'],
  },
  {
    id: 'crimson',
    label: '绯红',
    swatch: '#ef4444',
    palette: ['#3b0712', '#881337', '#ef4444', '#f43f5e', '#fb7185', '#fda4af'],
  },
  {
    id: 'rose',
    label: '玫瑰粉',
    swatch: '#fb7185',
    palette: ['#3b0a2a', '#6b123e', '#fb7185', '#f472b6', '#fda4af', '#fb923c'],
  },
  {
    id: 'blush',
    label: '樱花粉',
    swatch: '#f472b6',
    palette: ['#500724', '#831843', '#f472b6', '#f9a8d4', '#fbcfe8', '#fda4af'],
  },
  {
    id: 'peach',
    label: '蜜桃粉',
    swatch: '#fda4af',
    palette: ['#7c2d12', '#9d174d', '#fda4af', '#fdba74', '#f9a8d4', '#fef08a'],
  },
  {
    id: 'magenta',
    label: '洋红',
    swatch: '#e879f9',
    palette: ['#4a044e', '#701a75', '#e879f9', '#f472b6', '#c084fc', '#f0abfc'],
  },
  {
    id: 'orchid',
    label: '兰花紫',
    swatch: '#c084fc',
    palette: ['#2e1065', '#581c87', '#c084fc', '#e879f9', '#818cf8', '#f5d0fe'],
  },
  {
    id: 'violet',
    label: '极光紫',
    swatch: '#a855f7',
    palette: ['#1e1b4b', '#3b0764', '#a855f7', '#c084fc', '#f472b6', '#818cf8'],
  },
  {
    id: 'lavender',
    label: '薰衣草',
    swatch: '#a78bfa',
    palette: ['#1e1b4b', '#4c1d95', '#a78bfa', '#c4b5fd', '#93c5fd', '#ddd6fe'],
  },
  {
    id: 'plum',
    label: '梅子紫',
    swatch: '#9333ea',
    palette: ['#1a062b', '#4a044e', '#9333ea', '#db2777', '#a855f7', '#f472b6'],
  },
  {
    id: 'obsidian',
    label: '曜石银',
    swatch: '#94a3b8',
    palette: ['#0f172a', '#1e293b', '#94a3b8', '#cbd5e1', '#64748b', '#e2e8f0'],
  },
  {
    id: 'onyx',
    label: '黑玛瑙',
    swatch: '#18181b',
    palette: ['#050507', '#111116', '#27272a', '#52525b', '#18181b', '#71717a'],
  },
  {
    id: 'carbon',
    label: '碳纤维',
    swatch: '#27272a',
    palette: ['#09090b', '#18181b', '#3f3f46', '#71717a', '#27272a', '#a1a1aa'],
  },
  {
    id: 'noir',
    label: '暗夜黑',
    swatch: '#0f172a',
    palette: ['#020408', '#0a0f18', '#1e293b', '#334155', '#0f172a', '#475569'],
  },
  {
    id: 'midnight-ink',
    label: '墨蓝黑',
    swatch: '#172554',
    palette: ['#020617', '#0a1026', '#1e3a8a', '#3b82f6', '#0f172a', '#1d4ed8'],
  },
  {
    id: 'eclipse',
    label: '日蚀紫黑',
    swatch: '#2e1065',
    palette: ['#05020d', '#140826', '#4c1d95', '#7c3aed', '#1e1b4b', '#6d28d9'],
  },
  {
    id: 'obsidian-gold',
    label: '黑曜金',
    swatch: '#422006',
    palette: ['#090806', '#1c1810', '#854d0e', '#ca8a04', '#292524', '#eab308'],
  },
  {
    id: 'volcanic',
    label: '熔岩黑',
    swatch: '#450a0a',
    palette: ['#0a0506', '#1f0b0e', '#7f1d1d', '#dc2626', '#271216', '#991b1b'],
  },
  {
    id: 'pine-noir',
    label: '幽林黑',
    swatch: '#042f2e',
    palette: ['#030a07', '#081c15', '#115e59', '#0f766e', '#062c22', '#14b8a6'],
  },
  {
    id: 'bronze-noir',
    label: '古铜黑',
    swatch: '#451a03',
    palette: ['#0c0907', '#1f1712', '#78350f', '#b45309', '#292018', '#d97706'],
  },
  {
    id: 'graphite-rose',
    label: '烟熏玫瑰黑',
    swatch: '#4c0519',
    palette: ['#0c0609', '#1f0f17', '#831843', '#be185d', '#2b1320', '#9d174d'],
  },
]

const AI_PALETTES: readonly AiPalette[] = [
  ['#1d1b4b', '#312e81', '#38bdf8', '#c084fc', '#f472b6', '#34d399'],
  ['#1e1b4b', '#3b0764', '#22d3ee', '#a855f7', '#fb7185', '#fbbf24'],
  ['#0f172a', '#1e3a8a', '#2dd4bf', '#60a5fa', '#c084fc', '#f472b6'],
  ['#2e1065', '#4c1d95', '#f472b6', '#fb923c', '#38bdf8', '#a78bfa'],
  ['#0c4a6e', '#312e81', '#34d399', '#22d3ee', '#818cf8', '#f472b6'],
  ['#1e293b', '#3730a3', '#fb7185', '#c084fc', '#38bdf8', '#fde047'],
]

function hashSeed(input: string): number {
  const text = input.trim() || 'biu-ai'
  let hash = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  return hash >>> 0
}

function nextUnit(state: { value: number }) {
  state.value = (Math.imul(state.value, 1664525) + 1013904223) >>> 0
  return state.value / 0xffffffff
}

function buildBlobs(seed: string, palette: AiPalette) {
  const state = { value: hashSeed(seed) }
  return [
    {
      cx: 18 + Math.round(nextUnit(state) * 26),
      cy: 16 + Math.round(nextUnit(state) * 26),
      rx: 34 + Math.round(nextUnit(state) * 14),
      ry: 28 + Math.round(nextUnit(state) * 14),
      rotate: Math.round(nextUnit(state) * 180),
      color: palette[2],
    },
    {
      cx: 60 + Math.round(nextUnit(state) * 26),
      cy: 18 + Math.round(nextUnit(state) * 28),
      rx: 32 + Math.round(nextUnit(state) * 14),
      ry: 30 + Math.round(nextUnit(state) * 14),
      rotate: Math.round(nextUnit(state) * 180),
      color: palette[3],
    },
    {
      cx: 22 + Math.round(nextUnit(state) * 28),
      cy: 62 + Math.round(nextUnit(state) * 24),
      rx: 34 + Math.round(nextUnit(state) * 14),
      ry: 28 + Math.round(nextUnit(state) * 14),
      rotate: Math.round(nextUnit(state) * 180),
      color: palette[4],
    },
    {
      cx: 62 + Math.round(nextUnit(state) * 24),
      cy: 62 + Math.round(nextUnit(state) * 24),
      rx: 30 + Math.round(nextUnit(state) * 14),
      ry: 30 + Math.round(nextUnit(state) * 14),
      rotate: Math.round(nextUnit(state) * 180),
      color: palette[5],
    },
  ]
}

function toSvgDataUrl(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function buildAiAvatarDataUrl(themeId: string, seed = 'biu-ai'): string {
  const theme = AI_AVATAR_THEMES.find((item) => item.id === themeId) ?? AI_AVATAR_THEMES[0]!
  const blobs = buildBlobs(`${theme.id}:${seed}`, theme.palette)
  const ellipses = blobs
    .map(
      (b) =>
        `<ellipse cx="${b.cx}" cy="${b.cy}" rx="${b.rx}" ry="${b.ry}" fill="${b.color}" fill-opacity="0.9" transform="rotate(${b.rotate} ${b.cx} ${b.cy})"/>`,
    )
    .join('')
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-biu-theme="${theme.id}">` +
    `<defs>` +
    `<clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath>` +
    `<linearGradient id="b" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${theme.palette[0]}"/><stop offset="100%" stop-color="${theme.palette[1]}"/></linearGradient>` +
    `<radialGradient id="g" cx="32%" cy="26%" r="70%"><stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/><stop offset="45%" stop-color="#ffffff" stop-opacity="0.08"/><stop offset="100%" stop-color="#000000" stop-opacity="0.14"/></radialGradient>` +
    `<filter id="f" x="-40%" y="-40%" width="180%" height="180%"><feGaussianBlur stdDeviation="14"/></filter>` +
    `</defs>` +
    `<g clip-path="url(#c)"><rect width="100" height="100" fill="url(#b)"/><g filter="url(#f)">${ellipses}</g><circle cx="50" cy="50" r="50" fill="url(#g)"/></g>` +
    `</svg>`
  return toSvgDataUrl(svg)
}

export function detectAiAvatarTheme(avatarUrl: string): string | null {
  if (!avatarUrl.startsWith('data:image/svg+xml')) return null
  const decoded = decodeURIComponent(avatarUrl)
  const hit = decoded.match(/data-biu-theme="([a-z0-9-]+)"/)
  return hit?.[1] ?? null
}

export function AiAvatar({
  seed = 'biu-ai',
  size,
  className,
  'data-testid': testId,
}: {
  seed?: string
  size?: number
  className?: string
  'data-testid'?: string
}) {
  const rawId = useId()
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  const palette = AI_PALETTES[hashSeed(seed) % AI_PALETTES.length]!
  const blobs = buildBlobs(seed, palette)

  const baseGradId = `ai-base-${uid}`
  const glowGradId = `ai-glow-${uid}`
  const blurId = `ai-blur-${uid}`
  const clipId = `ai-clip-${uid}`

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      data-testid={testId}
      data-ai-avatar="mesh"
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
        <linearGradient id={baseGradId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={palette[0]} />
          <stop offset="100%" stopColor={palette[1]} />
        </linearGradient>
        <radialGradient id={glowGradId} cx="32%" cy="26%" r="70%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0.45" />
          <stop offset="45%" stopColor="#ffffff" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#000000" stopOpacity="0.14" />
        </radialGradient>
        <filter id={blurId} x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation="14" />
        </filter>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <rect width="100" height="100" fill={`url(#${baseGradId})`} />
        <g filter={`url(#${blurId})`}>
          {blobs.map((blob, index) => (
            <ellipse
              key={index}
              cx={blob.cx}
              cy={blob.cy}
              rx={blob.rx}
              ry={blob.ry}
              fill={blob.color}
              fillOpacity="0.88"
              transform={`rotate(${blob.rotate} ${blob.cx} ${blob.cy})`}
            />
          ))}
        </g>
        <circle cx="50" cy="50" r="50" fill={`url(#${glowGradId})`} />
      </g>
    </svg>
  )
}
