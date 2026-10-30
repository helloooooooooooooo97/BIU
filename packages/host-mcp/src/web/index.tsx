import type { Context } from 'cordis'
import type { DatabaseUi } from '@biu/type-file-system/ui'
import { mcpChrome } from './chrome.tsx'

export const name = 'host-mcp-ui'
export const inject = ['databaseUi']

export function apply(ctx: Context) {
  const ui = ctx.get('databaseUi') as DatabaseUi
  ctx.effect(() => ui.decorate('/mcp', mcpChrome).dispose)
}

if (typeof document !== 'undefined') {
  const id = 'biu-mcp-ui-style'
  const style = document.getElementById(id) ?? document.createElement('style')
  style.id = id
  style.textContent = `
.mcp-tools{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.mcp-tool{position:relative;display:flex;flex-direction:column;gap:8px;min-height:52px;padding:8px 28px 8px 10px;border:var(--biu-stroke-width) solid var(--biu-color-border);border-radius:8px;background:color-mix(in srgb,var(--biu-color-bg-faint) 40%,transparent)}
.mcp-tool.is-blocked{opacity:.78}
.mcp-tool-copy{min-width:0;display:flex;flex-direction:column;gap:4px;padding-right:8px}
.mcp-tool-name{font-family:var(--font-mono);font-size:var(--biu-font-size-3);font-weight:var(--biu-font-weight-semibold);color:var(--biu-color-text)}
.mcp-tool-desc{font-size:var(--biu-font-size-2);line-height:1.45;color:var(--biu-color-text-muted);padding-bottom:22px}
.mcp-tool:not(:has(.mcp-tool-desc)) .mcp-tool-copy{padding-bottom:22px}
.mcp-tool-dot{position:absolute;top:10px;right:10px;width:8px;height:8px;border-radius:50%;background:var(--biu-color-ok)}
.mcp-tool-actions{position:absolute;right:8px;bottom:8px;display:flex;align-items:center;gap:6px}
.mcp-tool-toggle{border:var(--biu-stroke-width) solid var(--biu-color-border);background:transparent;color:var(--biu-color-text-muted);border-radius:999px;padding:3px 8px;font:inherit;font-size:11px;font-weight:var(--biu-font-weight-semibold);cursor:pointer}
.mcp-tool-toggle.is-on{color:var(--biu-color-ok);border-color:color-mix(in srgb,var(--biu-color-ok) 40%,transparent);background:color-mix(in srgb,var(--biu-color-ok) 12%,transparent)}
.mcp-tool-toggle.is-deny.is-on{color:var(--biu-color-danger);border-color:color-mix(in srgb,var(--biu-color-danger) 40%,transparent);background:color-mix(in srgb,var(--biu-color-danger) 12%,transparent)}
.mcp-tools-empty{margin:0;font-size:var(--biu-font-size-3);color:var(--biu-color-text-subtle)}
`
  if (!document.getElementById(id)) document.head.appendChild(style)
}
