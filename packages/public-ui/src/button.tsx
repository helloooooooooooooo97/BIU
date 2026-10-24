import type { ButtonHTMLAttributes, ReactNode } from 'react'

const STYLE_ID = 'biu-public-ui-button'
const CSS = `
.biu-btn{
  display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;
  height:26px;padding:0 10px;border:1px solid var(--dsw-border);border-radius:6px;
  background:var(--dsw-hover);color:var(--dsw-label);font:inherit;font-size:13px;font-weight:650;
  cursor:pointer;line-height:24px
}
.biu-btn:hover{background:var(--dsw-input)}
.biu-btn:focus-visible{outline:none;border-color:var(--dsw-pick)}
.biu-btn:disabled{opacity:.5;cursor:default}
.biu-btn.is-danger{color:var(--dsw-danger);background:var(--dsw-danger-soft);border-color:var(--dsw-border)}
.biu-btn.is-danger:hover{background:color-mix(in srgb,var(--dsw-danger) 16%,transparent)}
`

export function ensureButtonStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

export function Button({
  danger = false,
  children,
  type = 'button',
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  danger?: boolean
  children?: ReactNode
}) {
  ensureButtonStyle()
  return (
    <button
      type={type}
      className={`biu-btn${danger ? ' is-danger' : ''}${className ? ` ${className}` : ''}`}
      {...rest}
    >
      {children}
    </button>
  )
}
