import type { Context } from 'cordis'
import type { DatabaseUi } from '@biu/type-file-system/ui'
import { noticesChrome } from './chrome.tsx'

export const name = 'core-notices-ui'
export const inject = ['databaseUi']

export function apply(ctx: Context) {
  const ui = ctx.get('databaseUi') as DatabaseUi
  ctx.effect(() => ui.decorate('/notices', noticesChrome).dispose)
}

if (typeof document !== 'undefined') {
  const id = 'biu-notices-ui-style'
  const style = document.getElementById(id) ?? document.createElement('style')
  style.id = id
  style.textContent = `
.notice-files{list-style:none;margin:0;padding:12px 16px 20px;display:flex;flex-direction:column;gap:8px}
.notice-file{display:flex;align-items:center;gap:10px;min-height:52px;padding:8px 10px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:8px;background:color-mix(in srgb,var(--biu-color-bg-faint) 40%,transparent)}
.notice-file-img{width:48px;height:48px;flex:none;object-fit:cover;border-radius:6px;background:var(--biu-color-bg-hover)}
.notice-file-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--font-mono);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);color:var(--biu-color-text);text-decoration:none}
.notice-file-name:hover{text-decoration:underline}
`
  if (!document.getElementById(id)) document.head.appendChild(style)
}
