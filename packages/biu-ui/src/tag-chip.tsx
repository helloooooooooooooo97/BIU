import type { ReactNode } from 'react'

const STYLE_ID = 'biu-public-ui-tag-chip'
const CSS = `
.biu-tag-wrap{border:0;background:transparent;padding:0;cursor:pointer;font:inherit}
.biu-tags{display:inline-flex;flex-wrap:wrap;gap:var(--biu-space-1);align-items:center;min-width:0;max-width:100%}
.biu-tag{display:inline-flex;align-items:center;gap:var(--biu-space-1);height:var(--biu-space-5);padding:0 var(--biu-space-1);border-radius:var(--biu-radius-sm);font-size:var(--biu-chat-chip-font-size,var(--biu-font-size-3));font-weight:var(--biu-font-weight-medium);line-height:var(--biu-space-5);background:color-mix(in srgb,var(--biu-tag,var(--biu-color-emphasis)) 22%,transparent);color:var(--biu-tag,var(--biu-color-emphasis));max-width:160px}
.biu-tag.is-btn{cursor:pointer}
.biu-tag.is-on{background:color-mix(in srgb,var(--biu-tag,var(--biu-color-emphasis)) 34%,transparent)}
.biu-tag-icon{display:inline-flex;width:var(--biu-size-icon,14px);height:var(--biu-size-icon,14px);flex:none;align-items:center;justify-content:center}
.biu-tag-icon svg{width:var(--biu-size-icon,14px);height:var(--biu-size-icon,14px);display:block}
.biu-tag-icon .fsdb-record-emoji{width:var(--biu-size-icon,14px);height:var(--biu-size-icon,14px);font-size:var(--biu-chat-chip-font-size,var(--biu-font-size-3))}
.biu-tag-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.biu-tag-x{border:0;background:transparent;padding:0;margin:0;color:inherit;opacity:.55;cursor:pointer;display:inline-flex;line-height:0}
.biu-tag-x:hover{opacity:1}
`

export const TAG_TONES = [
  'var(--biu-color-ink-blue)',
  'var(--biu-color-ink-purple)',
  'var(--biu-color-ink-orange)',
  'var(--biu-color-ink-green)',
  'var(--biu-color-ink-red)',
  'var(--biu-color-ink-pink)',
  'var(--biu-color-ink-gold)',
  'var(--biu-color-ink-gray)',
] as const
/** 日间叠在近黑墨上，夜间叠在纯白上；少掺色相。 */
export const TAG_INK_BASE = 'var(--biu-color-text)'

export function tagTextColor(tone: string, strength = 8) {
  return `color-mix(in srgb, ${tone} ${strength}%, ${TAG_INK_BASE})`
}

/** 浅底仍叠在透明上，不改成白色色块。 */
export function tagWashColor(tone: string, strength = 22) {
  return `color-mix(in srgb, ${tone} ${strength}%, transparent)`
}

/** 分面色板里的玫红。 */
export const TAG_TONE_ROSE = 'var(--biu-color-ink-pink)' as const
export const TAG_TONE_BLUE = 'var(--biu-color-ink-blue)' as const
export const TAG_TONE_ORANGE = 'var(--biu-color-ink-orange)' as const
export const TAG_TONE_GREEN = 'var(--biu-color-ink-green)' as const
export const TAG_TONE_RED = 'var(--biu-color-ink-red)' as const

export function tagTone(id: string) {
  let hash = 0
  const key = String(id ?? '')
  for (let i = 0; i < key.length; i += 1) hash = (hash * 33 + key.charCodeAt(i)) >>> 0
  return TAG_TONES[hash % TAG_TONES.length]!
}

export function ensureTagChipStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

export function TagChipCloseMark() {
  return (
    <svg aria-hidden viewBox="0 0 16 16" width="12" height="12" fill="currentColor">
      <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 1 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06z" />
    </svg>
  )
}

export function TagChip({
  id,
  label,
  onRemove,
  onClick,
  active,
  icon,
}: {
  id: string
  label: string
  onRemove?: () => void
  onClick?: () => void
  active?: boolean
  icon?: ReactNode
}) {
  ensureTagChipStyle()
  const chip = (
    <span
      className={`biu-tag${active ? ' is-on' : ''}${onClick ? ' is-btn' : ''}`}
      style={{ ['--biu-tag' as string]: tagTone(id) }}
      title={label}
    >
      {icon ? <span className="biu-tag-icon">{icon}</span> : null}
      <span className="biu-tag-label">{label}</span>
      {onRemove ? (
        <button
          type="button"
          className="biu-tag-x"
          aria-label={`移除 ${label}`}
          onClick={(event) => {
            event.stopPropagation()
            onRemove()
          }}
        >
          <TagChipCloseMark />
        </button>
      ) : null}
    </span>
  )
  if (!onClick) return chip
  return (
    <button type="button" className="biu-tag-wrap" onClick={onClick}>
      {chip}
    </button>
  )
}

export function TagChips({ children }: { children: ReactNode }) {
  ensureTagChipStyle()
  return <span className="biu-tags">{children}</span>
}
