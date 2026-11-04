import { flushSync } from 'react-dom'
import { createRoot, type Root } from 'react-dom/client'
import { compileJsxSource, compileSandboxSource, looksLikeJsx, transpileJsx } from '../shared/compile.ts'
import { sandboxGlobals } from './gate.ts'

const React = globalThis.React
const roots = new WeakMap<ShadowRoot, Root>()

export function hostThemeCss() {
  if (typeof document === 'undefined') return ''
  const style = getComputedStyle(document.documentElement)
  const vars: string[] = []
  for (const name of style) {
    if (name.startsWith('--')) vars.push(`${name}:${style.getPropertyValue(name).trim()}`)
  }
  return `:host,:root,html,body{${vars.join(';')};color:inherit;font:inherit;box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}${SANDBOX_PICK_MODE_CSS}`
}

/** Light-DOM `html.pick-mode *` does not pierce this shadow. Force the pick cursor inside. */
export const SANDBOX_PICK_MODE_CSS =
  ':host-context(html.pick-mode),:host-context(html.pick-mode) *{cursor:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22M3.2%201.6v19.8l5.3-5.2%203.3%207.9%202.7-1.1-3.3-7.9h7.1z%22%2F%3E%3Cpath%20fill%3D%22%231a54c4%22%20d%3D%22M4.7%204.1v14.3l3.9-3.8%203%207.1%201.3-.5-3-7.2h5.3z%22%2F%3E%3C%2Fsvg%3E") 1 1,pointer!important;user-select:none!important}' +
  ':host-context(html.dark.pick-mode),:host-context(html.dark.pick-mode) *{cursor:url("data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2224%22%20height%3D%2224%22%20viewBox%3D%220%200%2024%2024%22%3E%3Cpath%20fill%3D%22%23fff%22%20d%3D%22M3.2%201.6v19.8l5.3-5.2%203.3%207.9%202.7-1.1-3.3-7.9h7.1z%22%2F%3E%3Cpath%20fill%3D%22%23308dbf%22%20d%3D%22M4.7%204.1v14.3l3.9-3.8%203%207.1%201.3-.5-3-7.2h5.3z%22%2F%3E%3C%2Fsvg%3E") 1 1,pointer!important}'

export function adoptDocumentStyles(shadow: ShadowRoot) {
  if (typeof document === 'undefined' || typeof CSSStyleSheet === 'undefined') return
  const sheets: CSSStyleSheet[] = []
  for (const sheet of document.styleSheets) {
    try {
      const copy = new CSSStyleSheet()
      copy.replaceSync([...sheet.cssRules].map((rule) => rule.cssText).join('\n'))
      sheets.push(copy)
    } catch {
      /* opaque / cross-origin */
    }
  }
  shadow.adoptedStyleSheets = sheets
}

function prepareJsx(source: string) {
  return source
    .replace(/^\s*import\s+[\s\S]*?from\s+['"]react['"]\s*;?\s*$/gim, '')
    .replace(/^\s*import\s+React\s*;?\s*$/gim, '')
    .replace(/export\s+default\s+function\s+([A-Za-z_][\w]*)/g, 'function $1')
    .replace(/export\s+default\s+/g, 'const __Component = ')
}

export type SandboxIO = {
  read: () => Promise<unknown>
  write: (value: unknown) => Promise<void>
}

function mountJsx(source: string, root: ShadowRoot, io?: SandboxIO) {
  const compiled = compileJsxSource(source)
  if (!compiled.ok) throw new Error(compiled.error)
  const biu = {
    read: () => (io ? io.read() : Promise.resolve(null)),
    write: (value: unknown) => (io ? io.write(value) : Promise.resolve()),
  }
  const factory = new Function(
    'React',
    'css',
    'window',
    'document',
    'globalThis',
    'self',
    'biu',
    `"use strict";
     ${transpileJsx(prepareJsx(source))}
     return (typeof __Component === "function" && __Component) || (typeof App === "function" && App);`,
  )
  const preview = root.host instanceof HTMLElement ? root.host : null
  const globals = sandboxGlobals(preview)
  const Component = factory(React, hostThemeCss(), globals.window, globals.document, globals.globalThis, globals.self, biu)
  const mount = document.createElement('div')
  mount.setAttribute('data-sandbox-root', '')
  root.append(mount)
  if (typeof Component !== 'function' || !React) return
  const prev = roots.get(root)
  prev?.unmount()
  const reactRoot = createRoot(mount)
  roots.set(root, reactRoot)
  flushSync(() => {
    reactRoot.render(React.createElement(Component, { css: hostThemeCss() }))
  })
}

export function unmountSandbox(root: ShadowRoot | null) {
  if (!root) return
  roots.get(root)?.unmount()
  roots.delete(root)
  root.innerHTML = ''
}

export function mountSandbox(root: ShadowRoot, source: string, io?: SandboxIO) {
  const text = String(source ?? '')
  roots.get(root)?.unmount()
  roots.delete(root)
  root.innerHTML = ''
  adoptDocumentStyles(root)
  const theme = document.createElement('style')
  theme.setAttribute('data-sandbox-theme', '')
  theme.textContent = hostThemeCss()
  root.append(theme)
  const pickMode = document.createElement('style')
  pickMode.setAttribute('data-sandbox-pick-mode', '')
  pickMode.textContent = SANDBOX_PICK_MODE_CSS
  root.append(pickMode)
  if (!looksLikeJsx(text)) {
    const compiled = compileSandboxSource(text)
    if (!compiled.ok) throw new Error(compiled.error)
    throw new Error('sandbox source must be a React component')
  }
  mountJsx(text, root, io)
  return compileSandboxSource(text)
}

export { compileSandboxSource }
