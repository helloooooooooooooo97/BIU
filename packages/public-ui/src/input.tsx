import type { InputHTMLAttributes } from 'react'

const STYLE_ID = 'biu-public-ui-input'
const CSS = `
.biu-input{
  box-sizing:border-box;height:26px;width:100%;min-width:0;padding:0 8px;
  border:1px solid var(--dsw-border);border-radius:6px;
  background:var(--dsw-input);color:var(--dsw-label);
  font:inherit;font-size:13px;outline:none
}
.biu-input::placeholder{color:var(--dsw-placeholder,#8d8b87)}
.biu-input:focus{border-color:var(--dsw-pick)}
.biu-input:disabled{opacity:.5;cursor:default}
`

export function ensureInputStyle() {
  if (typeof document === 'undefined') return
  if (document.getElementById(STYLE_ID)) return
  const style = document.createElement('style')
  style.id = STYLE_ID
  style.textContent = CSS
  document.head.appendChild(style)
}

export function Input({ className, type = 'text', ...rest }: InputHTMLAttributes<HTMLInputElement>) {
  ensureInputStyle()
  return <input type={type} className={`biu-input${className ? ` ${className}` : ''}`} {...rest} />
}
