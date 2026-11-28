import { memo, useEffect, useId, useMemo, useState } from 'react'
import { loadGrokGeo } from './grok-bot-loader.ts'
import type { GrokColor, GrokShape, SessionMascotIdentity } from './grok-bot-types.ts'
import { buildMascotMesh, mascotSwatch } from './mascot-palette.ts'

export type StaticMascotMarkProps = {
  identity: SessionMascotIdentity
  size?: number
  busy?: boolean
  className?: string
  title?: string
}

type FaceTune = { x: number; y: number; sx: number; sy: number; eye: number }
type GeoSnapshot = {
  path: string
  eyePaths: [string, string] | null
  face: FaceTune
  Re: number
  viewBox: { minX: number; minY: number; width: number; height: number }
}

const FACE_GAP = 1.18
const DEFAULT_FACE: FaceTune = { x: 0, y: 0, sx: 1, sy: 1, eye: 1 }
const DEFAULT_VB = { minX: -15, minY: -15, width: 259, height: 259 }

/**
 * 侧栏静止头像：身体轮廓 + 默认睁眼，不挂 GrokCharacter / RAF。
 */
export const StaticMascotMark = memo(function StaticMascotMark({
  identity,
  size = 28,
  busy = false,
  className,
  title = 'Session mascot',
}: StaticMascotMarkProps) {
  const [geo, setGeo] = useState<GeoSnapshot | null>(() => readGeo(identity))
  const rawId = useId()
  const uid = rawId.replace(/[^a-zA-Z0-9_-]/g, '')
  const mesh = useMemo(() => buildMascotMesh(identity.color, identity.shape), [identity.color, identity.shape])

  useEffect(() => {
    // LAN share listener intentionally does not expose workstation assets.
    // Render the bundled fallback below instead of requesting /grok-bot.
    if (typeof document !== 'undefined' && document.documentElement.classList.contains('share')) return
    let cancelled = false
    void loadGrokGeo()
      .then(() => {
        if (cancelled) return
        setGeo(readGeo(identity))
      })
      .catch(() => {
        // The inline mark remains visible if optional geometry cannot load.
      })
    return () => {
      cancelled = true
    }
  }, [identity.shape, identity.color, identity.eye])

  const vb = geo?.viewBox ?? DEFAULT_VB
  const bodyPath = geo?.path || mascotShapePath(identity.shape)
  const clipId = `sm-clip-${uid}`
  const baseGradId = `sm-base-${uid}`
  const glowGradId = `sm-glow-${uid}`

  return (
    <span
      className={`sidebar-mascot session-mascot-mark${busy ? ' is-busy' : ''}${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, display: 'inline-grid', placeItems: 'center' }}
      title={title}
      data-busy={busy ? 'true' : undefined}
    >
      <svg
        role="img"
        aria-label={title}
        width={size}
        height={size}
        viewBox={`${vb.minX} ${vb.minY} ${vb.width} ${vb.height}`}
        data-mascot-theme={mesh.themeId}
        style={{
          width: size,
          height: size,
          overflow: 'visible',
          opacity: 1,
        }}
      >
        <defs>
          <clipPath id={clipId}>
            <path d={bodyPath} />
          </clipPath>
          <linearGradient id={baseGradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={mesh.baseA} />
            <stop offset="100%" stopColor={mesh.baseB} />
          </linearGradient>
          {mesh.orbs.map((orb, index) => (
            <radialGradient key={index} id={`sm-orb-${index}-${uid}`} cx={`${orb.cx}%`} cy={`${orb.cy}%`} r={`${orb.r}%`}>
              <stop offset="0%" stopColor={orb.color} stopOpacity={orb.opacity} />
              <stop offset="46%" stopColor={orb.color} stopOpacity={Number((orb.opacity * 0.45).toFixed(2))} />
              <stop offset="100%" stopColor={orb.color} stopOpacity="0" />
            </radialGradient>
          ))}
          <radialGradient id={glowGradId} cx="34%" cy="28%" r="66%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.46" />
            <stop offset="42%" stopColor="#ffffff" stopOpacity="0.09" />
            <stop offset="78%" stopColor="#000000" stopOpacity="0.06" />
            <stop offset="100%" stopColor="#000000" stopOpacity="0.22" />
          </radialGradient>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <rect x={vb.minX} y={vb.minY} width={vb.width} height={vb.height} fill={`url(#${baseGradId})`} />
          {mesh.orbs.map((_, index) => (
            <rect
              key={index}
              x={vb.minX}
              y={vb.minY}
              width={vb.width}
              height={vb.height}
              fill={`url(#sm-orb-${index}-${uid})`}
            />
          ))}
          <rect x={vb.minX} y={vb.minY} width={vb.width} height={vb.height} fill={`url(#${glowGradId})`} />
          <path d={bodyPath} fill="none" stroke="#ffffff" strokeOpacity="0.16" strokeWidth="4" />
        </g>
        {geo?.eyePaths ? (
          <g transform={faceTransform(geo.Re, geo.face)}>
            <path
              d={geo.eyePaths[0]}
              fill="#ffffff"
              stroke="rgba(15, 23, 42, 0.22)"
              strokeWidth="2.4"
              paintOrder="stroke fill"
            />
            <path
              d={geo.eyePaths[1]}
              fill="#ffffff"
              stroke="rgba(15, 23, 42, 0.22)"
              strokeWidth="2.4"
              paintOrder="stroke fill"
            />
          </g>
        ) : (
          <>
            <ellipse
              cx="91"
              cy="119"
              rx="13"
              ry="18"
              fill="#ffffff"
              stroke="rgba(15, 23, 42, 0.22)"
              strokeWidth="2.4"
              paintOrder="stroke fill"
            />
            <ellipse
              cx="151"
              cy="119"
              rx="13"
              ry="18"
              fill="#ffffff"
              stroke="rgba(15, 23, 42, 0.22)"
              strokeWidth="2.4"
              paintOrder="stroke fill"
            />
          </>
        )}
      </svg>
      {busy ? <span className="sidebar-mascot-status" aria-hidden /> : null}
    </span>
  )
})

export function mascotFill(color: GrokColor) {
  return mascotSwatch(color)
}

export function mascotShapePath(shape: GrokShape) {
  if (shape === 'tablet' || shape === 'capsule' || shape === 'cylinder') {
    return 'M47 42C47 18 66 0 90 0H151C175 0 194 18 194 42V187C194 211 175 229 151 229H90C66 229 47 211 47 187Z'
  }
  if (shape === 'hex' || shape === 'gem' || shape === 'crystal' || shape === 'shield') {
    return 'M121 0L211 49L221 148L160 229H82L20 148L30 49Z'
  }
  if (shape === 'bean' || shape === 'leaf' || shape === 'teardrop') {
    return 'M205 32C239 77 222 162 174 205C126 248 43 224 16 163C-11 102 24 32 84 9C127-8 178-4 205 32Z'
  }
  return 'M121 0C185 0 229 45 229 112C229 180 187 229 115 229C43 229 0 181 0 114C0 48 51 0 121 0Z'
}

function readGeo(identity: SessionMascotIdentity): GeoSnapshot | null {
  const root = typeof window !== 'undefined' ? window.GROK_GEO : undefined
  if (!root) return null
  const shape = root.shapes?.[identity.shape] ?? root.shapes?.blob
  const path = shape?.path ?? ''
  if (!path) return null
  const face = {
    ...DEFAULT_FACE,
    ...(shape && 'face' in shape && shape.face && typeof shape.face === 'object' ? shape.face : {}),
  } as FaceTune
  const frame = root.eyes?.[Math.min(Math.max(0, identity.eye | 0), (root.eyes?.length ?? 1) - 1)] ?? root.eyes?.[0]
  const eyePaths =
    frame && frame.length >= 2
      ? ([polyPath(frame[0]!), polyPath(frame[1]!)] as [string, string])
      : null
  return {
    path,
    eyePaths,
    face,
    Re: root.Re ?? 114.27,
    viewBox: root.viewBox ?? DEFAULT_VB,
  }
}

function polyPath(poly: number[][]) {
  if (!poly.length) return ''
  let d = ''
  for (let i = 0; i < poly.length; i++) {
    const [x, y] = poly[i]!
    d += `${i === 0 ? 'M' : 'L'}${x} ${y}`
  }
  return `${d}Z`
}

/** 与运行时 FACE_TUNE.gap 对齐的粗略脸部摆位，让眼睛落在轮廓里。 */
function faceTransform(Re: number, face: FaceTune) {
  const sx = face.sx * FACE_GAP
  const sy = face.sy
  return `translate(${Re + face.x} ${Re + face.y}) scale(${sx} ${sy}) translate(${-Re} ${-Re})`
}
