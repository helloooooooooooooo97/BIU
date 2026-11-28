import { useId } from 'react'

export type WorkspaceAvatarPreset = {
  id: string
  label: string
  colors: readonly [string, string, string]
}

export const DEFAULT_WORKSPACE_AVATAR_PRESET_ID = 'deep-sea'

/**
 * 空间头像预设配色，参考官网 BIU 圆形品牌标记（brand-mark.tsx）。
 * 默认第一项为深海配色（与 public/favicon.svg 默认 BIU icon 一致）。
 */
export const WORKSPACE_AVATAR_PRESETS: readonly WorkspaceAvatarPreset[] = [
  { id: 'deep-sea', label: '深海（默认）', colors: ['#1e3a8a', '#0ea5e9', '#0f172a'] },
  { id: 'polar', label: '极地', colors: ['#a5d8ff', '#4dabf7', '#1864ab'] },
  { id: 'midnight', label: '午夜', colors: ['#4c1d95', '#7c3aed', '#1e1b4b'] },
  { id: 'vivid', label: '鲜亮', colors: ['#ff6b35', '#4ecdc4', '#ffe66d'] },
  { id: 'candy', label: '糖果', colors: ['#ff9ecd', '#7de2d1', '#fdf0a8'] },
  { id: 'lime', label: '青柠', colors: ['#c3f53c', '#4ade80', '#166534'] },
  { id: 'sunshine', label: '暖阳', colors: ['#f59e0b', '#ef4444', '#7c2d12'] },
  { id: 'sunset', label: '落日', colors: ['#fb923c', '#e11d48', '#581c87'] },
  { id: 'terracotta', label: '赤陶', colors: ['#e07a5f', '#d1495b', '#7d1a2b'] },
  { id: 'velocity', label: '速度', colors: ['#0066b1', '#662d91', '#e4002b'] },
  { id: 'racetrack', label: '赛道', colors: ['#1a1a1a', '#e4002b', '#f5f5f5'] },
  { id: 'forest', label: '森林', colors: ['#86efac', '#16a34a', '#14532d'] },
  { id: 'desert', label: '沙漠', colors: ['#fcd34d', '#d97706', '#78350f'] },
  { id: 'cherry-blossom', label: '樱花', colors: ['#fbcfe8', '#f472b6', '#9d174d'] },
  { id: 'tundra', label: '苔原', colors: ['#a7f3d0', '#5eead4', '#134e4a'] },
  { id: 'monochrome', label: '单色', colors: ['#8a8a8a', '#5f5f5f', '#333333'] },
  { id: 'ink', label: '墨阶', colors: ['#f5f5f5', '#a3a3a3', '#404040'] },
  { id: 'warm-gray', label: '暖灰', colors: ['#e8ddd3', '#b3a498', '#6b5f55'] },
]

/**
 * 与官网 BrandMark 一致的标准 45° 对角、严格 2:1:1（180° : 90° : 90°）层叠几何：
 *   底层整圆填 U（c2，45°→225°）
 *   中层覆盖 B 上弧（c0，225°→315°）并向 B 下弧内部斜向延展兜底，消除抗锯齿缝隙
 *   顶层覆盖 B 下弧（c1，315°→45°）
 */
const AVATAR_ROTATE = 'rotate(45 50 50)'
const AVATAR_B_TOP_POINTS = '-10,50 50,50 110,-10 -10,-10'

function resolvePreset(presetId?: string): WorkspaceAvatarPreset {
  return (
    WORKSPACE_AVATAR_PRESETS.find((item) => item.id === presetId) ??
    WORKSPACE_AVATAR_PRESETS[0]!
  )
}

export function buildWorkspaceAvatarDataUrl(
  presetId: string = DEFAULT_WORKSPACE_AVATAR_PRESET_ID,
): string {
  const preset = resolvePreset(presetId)
  const [c0, c1, c2] = preset.colors
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" data-biu-workspace-avatar="${preset.id}">` +
    `<defs><clipPath id="c"><circle cx="50" cy="50" r="50"/></clipPath></defs>` +
    `<g clip-path="url(#c)"><g transform="${AVATAR_ROTATE}">` +
    `<rect x="-10" y="-10" width="120" height="120" fill="${c2}"/>` +
    `<polygon points="${AVATAR_B_TOP_POINTS}" fill="${c0}"/>` +
    `<rect x="50" y="-10" width="60" height="60" fill="${c1}"/>` +
    `</g></g></svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export function detectWorkspaceAvatarPreset(avatarUrl: string): string | null {
  if (!avatarUrl.startsWith('data:image/svg+xml')) return null
  try {
    const decoded = decodeURIComponent(avatarUrl)
    const hit = decoded.match(/data-biu-workspace-avatar="([a-z0-9-]+)"/)
    return hit?.[1] ?? null
  } catch {
    return null
  }
}

export function WorkspaceAvatar({
  presetId = DEFAULT_WORKSPACE_AVATAR_PRESET_ID,
  colors,
  size,
  className,
  'data-testid': testId,
}: {
  presetId?: string
  colors?: readonly [string, string, string]
  size?: number
  className?: string
  'data-testid'?: string
}) {
  const rawId = useId()
  const clipId = `ws-brand-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  const preset = resolvePreset(presetId)
  const [c0, c1, c2] = colors ?? preset.colors

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={className}
      aria-hidden="true"
      data-testid={testId}
      data-workspace-avatar="brand-circle"
      data-workspace-preset={preset.id}
    >
      <defs>
        <clipPath id={clipId}>
          <circle cx="50" cy="50" r="50" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <g transform={AVATAR_ROTATE}>
          <rect x="-10" y="-10" width="120" height="120" fill={c2} />
          <polygon points={AVATAR_B_TOP_POINTS} fill={c0} />
          <rect x="50" y="-10" width="60" height="60" fill={c1} />
        </g>
      </g>
    </svg>
  )
}
