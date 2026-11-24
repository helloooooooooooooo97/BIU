import { useId } from 'react'

type AiPalette = readonly [baseA: string, baseB: string, blob1: string, blob2: string, blob3: string, blob4: string]

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
  const state = { value: hashSeed(seed) }
  const palette = AI_PALETTES[state.value % AI_PALETTES.length]!

  const blobs = [
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
