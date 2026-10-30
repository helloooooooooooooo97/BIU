import { createRoot, type Root } from 'react-dom/client'
import { compileHtmlSource, compileJsxSource, looksLikeJsx, transpileJsx } from '../shared/compile.ts'

const React = globalThis.React
const roots = new WeakMap<ShadowRoot, Root>()

export function hostThemeCss() {
  if (typeof document === 'undefined') return ''
  const style = getComputedStyle(document.documentElement)
  const vars: string[] = []
  for (const name of style) {
    if (name.startsWith('--')) vars.push(`${name}:${style.getPropertyValue(name).trim()}`)
  }
  return `:host,:root,html,body{${vars.join(';')};color:inherit;font:inherit;box-sizing:border-box}*,*::before,*::after{box-sizing:inherit}`
}

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

function shadowDocument(root: ShadowRoot) {
  return {
    documentElement: root,
    body: root,
    head: root,
    getElementById: (id: string) => root.getElementById(id),
    querySelector: (sel: string) => root.querySelector(sel),
    querySelectorAll: (sel: string) => root.querySelectorAll(sel),
    createElement: (tag: string) => document.createElement(tag),
    createTextNode: (text: string) => document.createTextNode(text),
    createDocumentFragment: () => document.createDocumentFragment(),
  }
}

function runScript(body: string, root: ShadowRoot) {
  const factory = new Function('React', 'root', 'document', 'css', `"use strict";\n${body}`)
  factory(React, root, shadowDocument(root), hostThemeCss())
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
    `"use strict";
     ${transpileJsx(prepareJsx(source))}
     return (typeof __Component === "function" && __Component) || (typeof App === "function" && App);`,
  )
  const Component = factory(React, hostThemeCss())
  const mount = document.createElement('div')
  mount.setAttribute('data-html-react-root', '')
  root.append(mount)
  if (typeof Component !== 'function' || !React) return
  const prev = roots.get(root)
  prev?.unmount()
  const reactRoot = createRoot(mount)
  roots.set(root, reactRoot)
  reactRoot.render(React.createElement(Component, { css: hostThemeCss() }))
}

export function unmountHtmlSandbox(root: ShadowRoot | null) {
  if (!root) return
  roots.get(root)?.unmount()
  roots.delete(root)
  root.innerHTML = ''
}

export function mountHtmlSandbox(root: ShadowRoot, source: string, opts: { live: boolean }) {
  const html = String(source ?? '')
  roots.get(root)?.unmount()
  roots.delete(root)
  root.innerHTML = ''
  adoptDocumentStyles(root)
  const theme = document.createElement('style')
  theme.textContent = hostThemeCss()
  root.append(theme)
  if (opts.live && looksLikeJsx(html)) {
    mountJsx(html, root)
    return compileHtmlSource(html)
  }
  const box = document.createElement('div')
  box.setAttribute('data-html-sandbox-body', '')
  box.style.height = '100%'
  box.innerHTML = html
  if (!opts.live) {
    for (const node of [...box.querySelectorAll('script')]) node.remove()
    root.append(box)
    return compileHtmlSource(html)
  }
  const scripts = [...box.querySelectorAll('script')]
  for (const node of scripts) node.remove()
  root.append(box)
  for (const node of scripts) {
    if (node.getAttribute('src')) continue
    const type = node.getAttribute('type') ?? ''
    const body = node.textContent ?? ''
    if (type && /jsx|tsx|react/i.test(type)) mountJsx(body, root)
    else runScript(body, root)
  }
  return compileHtmlSource(html)
}

export { compileHtmlSource }
