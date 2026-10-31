import { asPersonList } from '@biu/type-file-system'
import { ensureTagChipStyle, tagTone } from '@biu/biu-ui/tag-chip'

/** First-paint cells only need a screen of text; CSS overflow hides the rest. */
export const IDLE_CELL_TEXT_MAX = 80

export function idleClipText(value: string, max = IDLE_CELL_TEXT_MAX) {
  return value.length > max ? value.slice(0, max) : value
}

/** Escape text for table idle HTML (td children and quoted attributes). */
export function escapeTableHtml(value: string) {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export function tableHtmlAttr(name: string, value: string | number | boolean | null | undefined) {
  if (value == null || value === false) return ''
  if (value === true) return ` ${name}=""`
  return ` ${name}="${escapeTableHtml(String(value))}"`
}

export function tableHtmlStyle(style?: { width?: string; minWidth?: string; maxWidth?: string } | null) {
  if (!style) return ''
  const parts: string[] = []
  if (style.width) parts.push(`width:${style.width}`)
  if (style.minWidth) parts.push(`min-width:${style.minWidth}`)
  if (style.maxWidth) parts.push(`max-width:${style.maxWidth}`)
  return parts.length ? ` style="${parts.join(';')}"` : ''
}

export function idleTitleInnerHtml(label: string, iconKind: string, emoji?: string) {
  const mark = emoji
    ? `<span class="fsdb-record-emoji">${escapeTableHtml(emoji)}</span>`
    : `<span class="fsdb-record-mark is-sm" data-icon="${escapeTableHtml(iconKind)}" aria-hidden="true"></span>`
  return `<span class="fsdb-title-host">${mark}<span class="fsdb-title-text">${escapeTableHtml(idleClipText(label))}</span></span>`
}

export function idleBoolInnerHtml(on: boolean) {
  return `<span class="fsdb-bool" title="${on ? '是' : '否'}"><span class="fsdb-boolbox${on ? ' is-on' : ''}"></span></span>`
}

export function idleTextInnerHtml(text: string, extraClass?: string) {
  if (!text) return extraClass ? `<span class="${extraClass}"></span>` : ''
  const clipped = idleClipText(text)
  if (!extraClass) return escapeTableHtml(clipped)
  return `<span class="${extraClass}">${escapeTableHtml(clipped)}</span>`
}

export function idleEmptyUsageInnerHtml() {
  return '<span class="traj-usage-empty">—</span>'
}

export function idleSelectInnerHtml(text: string) {
  return idleTextInnerHtml(text, 'fsdb-select-text')
}

export function idleTagChipsInnerHtml(tags: { id: string; label: string }[]) {
  if (!tags.length) return ''
  ensureTagChipStyle()
  return `<span class="biu-tags">${tags
    .map((tag) => {
      const label = escapeTableHtml(idleClipText(tag.label, 24))
      const tone = escapeTableHtml(tagTone(tag.id))
      return `<span class="biu-tag" style="--biu-tag:${tone}" title="${label}"><span class="biu-tag-label">${label}</span></span>`
    })
    .join('')}</span>`
}

export function idlePersonInnerHtml(value: unknown) {
  const people = asPersonList(value).map((person) => person.name).filter(Boolean)
  if (!people.length) return ''
  return `<span class="fsdb-person-list">${people
    .map((name) => {
      const label = escapeTableHtml(idleClipText(name, 24))
      return `<span class="fsdb-person" title="${label}"><span class="fsdb-person-avatar" aria-hidden="true"></span><span class="fsdb-person-name">${label}</span></span>`
    })
    .join('')}</span>`
}

export function idleActionsInnerHtml(actions: { label: string; danger?: boolean }[]) {
  if (!actions.length) return ''
  return `<div class="tasks-row-actions">${actions
    .map((action) => {
      const label = escapeTableHtml(action.label)
      return `<span class="fsdb-action-tag${action.danger ? ' is-danger' : ''}">${label}</span>`
    })
    .join('')}</div>`
}

export type IdleTableTd = {
  key: string
  inner: string
  className?: string
  style?: { width?: string; minWidth?: string; maxWidth?: string }
  attrs?: Record<string, string | number | boolean | undefined>
}

export function idleTableRowHtml(cells: IdleTableTd[]) {
  let html = ''
  for (const cell of cells) {
    let extra = ''
    if (cell.attrs) {
      for (const [name, value] of Object.entries(cell.attrs)) extra += tableHtmlAttr(name, value)
    }
    html += `<td${cell.key ? tableHtmlAttr('data-col-key', cell.key) : ''}${cell.className ? tableHtmlAttr('class', cell.className) : ''}${tableHtmlStyle(cell.style)}${extra}>${cell.inner}</td>`
  }
  return html
}
