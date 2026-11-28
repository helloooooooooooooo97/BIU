import { describe, expect, it } from 'vitest'
import {
  DEFAULT_WORKSPACE_AVATAR_PRESET_ID,
  WORKSPACE_AVATAR_PRESETS,
  buildWorkspaceAvatarDataUrl,
  detectWorkspaceAvatarPreset,
} from './workspace-avatar.tsx'

describe('workspace-avatar', () => {
  it('uses the BIU Deep Sea palette as the default preset', () => {
    expect(DEFAULT_WORKSPACE_AVATAR_PRESET_ID).toBe('deep-sea')
    expect(WORKSPACE_AVATAR_PRESETS[0]?.id).toBe('deep-sea')
    expect(WORKSPACE_AVATAR_PRESETS[0]?.colors).toEqual(['#1e3a8a', '#0ea5e9', '#0f172a'])
  })

  it('builds a circular BIU SVG data URL and detects its preset id', () => {
    const defaultUrl = buildWorkspaceAvatarDataUrl()
    expect(defaultUrl.startsWith('data:image/svg+xml;utf8,')).toBe(true)
    const decodedDefault = decodeURIComponent(defaultUrl)
    expect(decodedDefault).toContain('data-biu-workspace-avatar="deep-sea"')
    expect(decodedDefault).toContain('#1e3a8a')
    expect(decodedDefault).toContain('#0ea5e9')
    expect(decodedDefault).toContain('#0f172a')
    expect(decodedDefault).toContain('<circle cx="50" cy="50" r="50"/>')
    expect(decodedDefault).toContain('transform="rotate(45 50 50)"')
    expect(detectWorkspaceAvatarPreset(defaultUrl)).toBe('deep-sea')

    const vividUrl = buildWorkspaceAvatarDataUrl('vivid')
    expect(detectWorkspaceAvatarPreset(vividUrl)).toBe('vivid')
    expect(detectWorkspaceAvatarPreset('data:image/png;base64,abc')).toBeNull()
    expect(detectWorkspaceAvatarPreset('')).toBeNull()
  })
})
