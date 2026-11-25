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
    id: 'violet',
    label: '极光紫',
    swatch: '#a855f7',
    palette: ['#1e1b4b', '#3b0764', '#a855f7', '#c084fc', '#f472b6', '#818cf8'],
  },
  {
    id: 'rose',
    label: '珊瑚粉',
    swatch: '#fb7185',
    palette: ['#3b0a2a', '#6b123e', '#fb7185', '#f472b6', '#fda4af', '#fb923c'],
  },
  {
    id: 'amber',
    label: '琥珀金',
    swatch: '#fbbf24',
    palette: ['#422006', '#78350f', '#fbbf24', '#f59e0b', '#fde047', '#fb923c'],
  },
  {
    id: 'emerald',
    label: '翡翠绿',
    swatch: '#34d399',
    palette: ['#052e16', '#064e3b', '#34d399', '#2dd4bf', '#6ee7b7', '#38bdf8'],
  },
  {
    id: 'sunset',
    label: '赤霞橙',
    swatch: '#fb923c',
    palette: ['#431407', '#7c2d12', '#fb923c', '#f97316', '#fb7185', '#fde047'],
  },
  {
    id: 'cyan',
    label: '霓虹青',
    swatch: '#22d3ee',
    palette: ['#083344', '#164e63', '#22d3ee', '#2dd4bf', '#38bdf8', '#a78bfa'],
  },
  {
    id: 'obsidian',
    label: '曜石银',
    swatch: '#94a3b8',
    palette: ['#0f172a', '#1e293b', '#94a3b8', '#cbd5e1', '#64748b', '#e2e8f0'],
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

export type BuiltinAvatarPreset = {
  id: string
  label: string
  url: string
}

const PRESET_SVGS: ReadonlyArray<{ id: string; label: string; svg: string }> = [
  {
    id: 'spark',
    label: '星芒',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-biu-preset="spark"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#1e1b4b"/><stop offset="100%" stop-color="#4f46e5"/></linearGradient><radialGradient id="gl" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#c4b5fd" stop-opacity="0.6"/><stop offset="100%" stop-color="#4f46e5" stop-opacity="0"/></radialGradient></defs><rect width="100" height="100" rx="50" fill="url(#bg)"/><circle cx="50" cy="50" r="40" fill="url(#gl)"/><path d="M50 18 C52 38 62 48 82 50 C62 52 52 62 50 82 C48 62 38 52 18 50 C38 48 48 38 50 18 Z" fill="#ffffff"/><circle cx="72" cy="28" r="3.5" fill="#e0e7ff" opacity="0.9"/></svg>`,
  },
  {
    id: 'bot',
    label: '机器人',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-biu-preset="bot"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#0f172a"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="url(#bg)"/><line x1="50" y1="20" x2="50" y2="30" stroke="#38bdf8" stroke-width="4" stroke-linecap="round"/><circle cx="50" cy="18" r="4" fill="#38bdf8"/><rect x="24" y="30" width="52" height="44" rx="16" fill="#334155" stroke="#64748b" stroke-width="2"/><rect x="31" y="40" width="38" height="22" rx="9" fill="#0f172a"/><circle cx="42" cy="51" r="4.5" fill="#38bdf8"/><circle cx="58" cy="51" r="4.5" fill="#38bdf8"/><path d="M44 67 Q50 71 56 67" stroke="#94a3b8" stroke-width="2.5" stroke-linecap="round" fill="none"/></svg>`,
  },
  {
    id: 'cat',
    label: '黑猫',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-biu-preset="cat"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#312e81"/><stop offset="100%" stop-color="#6d28d9"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="url(#bg)"/><path d="M26 42 L31 20 L46 33 Q50 32 54 33 L69 20 L74 42 C78 52 76 74 50 76 C24 74 22 52 26 42 Z" fill="#18181b"/><circle cx="40" cy="52" r="4.5" fill="#fbbf24"/><circle cx="60" cy="52" r="4.5" fill="#fbbf24"/><circle cx="41" cy="51" r="1.6" fill="#18181b"/><circle cx="61" cy="51" r="1.6" fill="#18181b"/><path d="M47 60 L50 63 L53 60" stroke="#f472b6" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`,
  },
  {
    id: 'astronaut',
    label: '宇航员',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-biu-preset="astronaut"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#090d16"/><stop offset="100%" stop-color="#1e1b4b"/></linearGradient><linearGradient id="vs" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#38bdf8"/><stop offset="100%" stop-color="#1d4ed8"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="url(#bg)"/><circle cx="22" cy="24" r="1.6" fill="#fff" opacity="0.8"/><circle cx="78" cy="26" r="2" fill="#c4b5fd" opacity="0.9"/><circle cx="50" cy="54" r="28" fill="#f1f5f9"/><rect x="30" y="39" width="40" height="26" rx="13" fill="url(#vs)"/><path d="M38 46 Q46 42 54 45" stroke="#ffffff" stroke-width="3" stroke-linecap="round" opacity="0.65" fill="none"/></svg>`,
  },
  {
    id: 'sunset',
    label: '日落',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-biu-preset="sunset"><defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath><linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#f97316"/><stop offset="55%" stop-color="#fb7185"/><stop offset="100%" stop-color="#4c1d95"/></linearGradient></defs><g clip-path="url(#c)"><rect width="100" height="100" fill="url(#sky)"/><circle cx="50" cy="46" r="17" fill="#fef08a"/><path d="M0 72 L28 48 L56 70 L78 52 L100 72 L100 100 L0 100 Z" fill="#311042" opacity="0.72"/><path d="M0 80 L38 58 L70 82 L100 66 L100 100 L0 100 Z" fill="#1b0a2b"/></g></svg>`,
  },
  {
    id: 'aurora',
    label: '极光环',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-biu-preset="aurora"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#042f2e"/><stop offset="100%" stop-color="#0f172a"/></linearGradient><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#34d399"/><stop offset="50%" stop-color="#22d3ee"/><stop offset="100%" stop-color="#818cf8"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="url(#bg)"/><circle cx="50" cy="50" r="30" fill="none" stroke="url(#rg)" stroke-width="8"/><circle cx="50" cy="50" r="16" fill="none" stroke="url(#rg)" stroke-width="4" opacity="0.65"/><circle cx="50" cy="50" r="5" fill="#ecfeff"/></svg>`,
  },
  {
    id: 'ghost',
    label: '小幽灵',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-biu-preset="ghost"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#4c1d95"/><stop offset="100%" stop-color="#be185d"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="url(#bg)"/><path d="M28 50 C28 32 38 24 50 24 C62 24 72 32 72 50 L72 76 L63 69 L55 76 L50 70 L45 76 L37 69 L28 76 Z" fill="#ffffff"/><circle cx="42" cy="48" r="3.8" fill="#1e1b4b"/><circle cx="58" cy="48" r="3.8" fill="#1e1b4b"/><ellipse cx="36" cy="55" rx="3.2" ry="1.8" fill="#fda4af" opacity="0.8"/><ellipse cx="64" cy="55" rx="3.2" ry="1.8" fill="#fda4af" opacity="0.8"/></svg>`,
  },
  {
    id: 'prism',
    label: '棱镜',
    svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-biu-preset="prism"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#111827"/><stop offset="100%" stop-color="#1e293b"/></linearGradient></defs><rect width="100" height="100" rx="50" fill="url(#bg)"/><polygon points="50,16 78,50 50,84 22,50" fill="#38bdf8" opacity="0.22"/><polygon points="50,16 78,50 50,52" fill="#38bdf8" opacity="0.9"/><polygon points="50,16 22,50 50,52" fill="#a78bfa" opacity="0.9"/><polygon points="50,84 78,50 50,52" fill="#2dd4bf" opacity="0.85"/><polygon points="50,84 22,50 50,52" fill="#f472b6" opacity="0.85"/></svg>`,
  },
]

export const BUILTIN_AVATAR_PRESETS: readonly BuiltinAvatarPreset[] = PRESET_SVGS.map((item) => ({
  id: item.id,
  label: item.label,
  url: toSvgDataUrl(item.svg),
}))

export function detectAiAvatarTheme(avatarUrl: string): string | null {
  if (!avatarUrl.startsWith('data:image/svg+xml')) return null
  const decoded = decodeURIComponent(avatarUrl)
  const hit = decoded.match(/data-biu-theme="([a-z0-9-]+)"/)
  return hit?.[1] ?? null
}

export function detectBuiltinAvatarPreset(avatarUrl: string): string | null {
  if (!avatarUrl.startsWith('data:image/svg+xml')) return null
  const decoded = decodeURIComponent(avatarUrl)
  const hit = decoded.match(/data-biu-preset="([a-z0-9-]+)"/)
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
