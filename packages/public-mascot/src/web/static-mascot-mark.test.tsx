import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { AI_AVATAR_THEMES } from '@biu/biu-ui/ai-avatar'
import { GROK_COLORS, GROK_SHAPES } from './grok-bot-types.ts'
import { MASCOT_AVATAR_THEME_ID, buildMascotMesh, mascotAvatarTheme, mascotSwatch } from './mascot-palette.ts'
import { StaticMascotMark, mascotFill } from './static-mascot-mark.tsx'

describe('mascot avatar gradient alignment', () => {
  it('maps every GrokColor to a valid AI_AVATAR_THEMES palette and swatch', () => {
    const themeIds = new Set(AI_AVATAR_THEMES.map((theme) => theme.id))
    for (const color of GROK_COLORS) {
      const themeId = MASCOT_AVATAR_THEME_ID[color]
      expect(themeIds.has(themeId)).toBe(true)
      const theme = mascotAvatarTheme(color)
      expect(theme.id).toBe(themeId)
      expect(mascotFill(color)).toBe(theme.swatch)
      expect(mascotSwatch(color)).toBe(theme.swatch)
    }
  })

  it('builds a deterministic 4-orb mesh matching the aligned AI avatar palette', () => {
    const meshA = buildMascotMesh('orange', 'blob')
    const meshB = buildMascotMesh('orange', 'blob')
    expect(meshA).toEqual(meshB)

    const theme = mascotAvatarTheme('orange')
    expect(meshA.themeId).toBe(theme.id)
    expect(meshA.baseA).toBe(theme.palette[0])
    expect(meshA.baseB).toBe(theme.palette[1])
    expect(meshA.orbs.map((orb) => orb.color)).toEqual(theme.palette.slice(2, 6))
    for (const orb of meshA.orbs) {
      expect(orb.cx).toBeGreaterThanOrEqual(10)
      expect(orb.cx).toBeLessThanOrEqual(90)
      expect(orb.cy).toBeGreaterThanOrEqual(10)
      expect(orb.cy).toBeLessThanOrEqual(90)
      expect(orb.r).toBeGreaterThan(30)
      expect(orb.opacity).toBeGreaterThan(0.5)
    }

    // Different shapes get subtle organic orb variation while keeping the same palette.
    const otherShape = buildMascotMesh('orange', GROK_SHAPES[5]!)
    expect(otherShape.themeId).toBe(meshA.themeId)
    expect(otherShape.orbs.map((o) => o.color)).toEqual(meshA.orbs.map((o) => o.color))
  })

  it('renders StaticMascotMark with clipped mesh gradients, pearl specular glow, and crisp white eyes', () => {
    const html = renderToStaticMarkup(
      <StaticMascotMark identity={{ shape: 'blob', color: 'red', eye: 0 }} size={28} title="Agent" />,
    )
    expect(html).toContain('data-mascot-theme="crimson"')
    expect(html).toContain('<clipPath id="sm-clip-')
    expect(html).toContain('<linearGradient id="sm-base-')
    expect(html).toContain('stop-color="#3b0712"')
    expect(html).toContain('stop-color="#881337"')
    expect(html).toContain('<radialGradient id="sm-orb-0-')
    expect(html).toContain('<radialGradient id="sm-orb-3-')
    expect(html).toContain('<radialGradient id="sm-glow-')
    expect(html).toContain('fill="#ffffff"')
    expect(html).toContain('stroke-opacity="0.16"')
  })

  it('wires the same mesh gradient support into GrokBotAvatar and character.js', () => {
    const avatarSrc = readFileSync(resolve(import.meta.dirname, './grok-bot-avatar.tsx'), 'utf8')
    const charSrc = readFileSync(resolve(import.meta.dirname, '../../../../public/grok-bot/src/character.js'), 'utf8')
    expect(avatarSrc).toContain('buildMascotMesh')
    expect(avatarSrc).toContain('meshGradient:')
    expect(avatarSrc).toContain('setMeshGradient')
    expect(charSrc).toContain('setMeshGradient(mesh)')
    expect(charSrc).toContain('_syncMeshGradient()')
    expect(charSrc).toContain('data-mascot-theme')
  })
})
