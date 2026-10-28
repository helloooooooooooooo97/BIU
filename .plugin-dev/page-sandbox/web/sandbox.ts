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
  ':host-context(html.pick-mode),:host-context(html.pick-mode) *{cursor:crosshair!important;user-select:none!important}'

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

function mountJsx(source: string, root: ShadowRoot) {
  const compiled = compileJsxSource(source)
  if (!compiled.ok) throw new Error(compiled.error)
  const factory = new Function(
    'React',
    'css',
    'window',
    'document',
    'globalThis',
    'self',
    `"use strict";
     ${transpileJsx(prepareJsx(source))}
     return (typeof __Component === "function" && __Component) || (typeof App === "function" && App);`,
  )
  const preview = root.host instanceof HTMLElement ? root.host : null
  const globals = sandboxGlobals(preview)
  const Component = factory(React, hostThemeCss(), globals.window, globals.document, globals.globalThis, globals.self)
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

export function mountSandbox(root: ShadowRoot, source: string) {
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
  mountJsx(text, root)
  return compileSandboxSource(text)
}

export { compileSandboxSource }
