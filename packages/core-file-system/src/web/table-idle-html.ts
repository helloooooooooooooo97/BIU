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
  return `<span class="fsdb-title-host">${mark}<span class="fsdb-title-text">${escapeTableHtml(label)}</span></span>`
}

export function idleBoolInnerHtml(on: boolean) {
  return `<span class="fsdb-bool" title="${on ? '是' : '否'}"><span class="fsdb-boolbox${on ? ' is-on' : ''}"></span></span>`
}

export function idleTextInnerHtml(text: string, extraClass?: string) {
  if (!text) return extraClass ? `<span class="${extraClass}"></span>` : ''
  if (!extraClass) return escapeTableHtml(text)
  return `<span class="${extraClass}">${escapeTableHtml(text)}</span>`
}

export function idleEmptyUsageInnerHtml() {
  return '<span class="traj-usage-empty">—</span>'
}

export function idleSelectInnerHtml(text: string) {
  return idleTextInnerHtml(text, 'fsdb-select-text')
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
