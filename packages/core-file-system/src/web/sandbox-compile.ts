import { createElement, useRef, type ComponentType } from 'react'
import { transform } from 'sucrase'
import { sandboxUi, type SandboxUi } from './sandbox-ui.ts'

const FORBIDDEN = /\bimport\s*\(|\brequire\s*\(/
const KEY_EVENT = /^(keydown|keyup|keypress)$/i

export type SandboxComponentFactory = (
  React: unknown,
  Block: unknown,
  Field: unknown,
  biu: unknown,
  ui: unknown,
  win: unknown,
  doc: unknown,
  gThis: unknown,
  selfRef: unknown,
) => unknown

export type HostCompileResult =
  | { ok: true; code: string; factory: SandboxComponentFactory }
  | { ok: false; error: string }

export type HostSlot = 'Block' | 'Field' | 'Layout'

/**
 * Strip JS/TS comments and string/template literals while preserving newlines
 * so lexical security checks do not false-positive on comments or UI text.
 */
export function stripCommentsAndStrings(source: string): string {
  let out = ''
  let i = 0
  const len = source.length
  while (i < len) {
    const ch = source[i]
    const next = source[i + 1]
    if (ch === '/' && next === '/') {
      i += 2
      while (i < len && source[i] !== '\n') i += 1
      continue
    }
    if (ch === '/' && next === '*') {
      i += 2
      while (i < len && !(source[i] === '*' && source[i + 1] === '/')) {
        if (source[i] === '\n') out += '\n'
        i += 1
      }
      i += 2
      out += ' '
      continue
    }
    if (ch === "'" || ch === '"') {
      const quote = ch
      i += 1
      out += ' '
      while (i < len && source[i] !== quote) {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (source[i] === '\n') out += '\n'
        i += 1
      }
      i += 1
      continue
    }
    if (ch === '`') {
      i += 1
      out += ' '
      while (i < len && source[i] !== '`') {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (source[i] === '$' && source[i + 1] === '{') {
          out += ' '
          i += 2
          let depth = 1
          while (i < len && depth > 0) {
            if (source[i] === '{') depth += 1
            else if (source[i] === '}') depth -= 1
            if (depth > 0) out += source[i]
            i += 1
          }
          out += ' '
          continue
        }
        if (source[i] === '\n') out += '\n'
        i += 1
      }
      i += 1
      continue
    }
    out += ch
    i += 1
  }
  return out
}

export function stripReactImports(source: string): string {
  return source
    .replace(/^\s*import\s+[\s\S]*?from\s+['"]react['"]\s*;?\s*$/gim, '')
    .replace(/^\s*import\s+React\s*;?\s*$/gim, '')
    .replace(/^\s*import\s+\*\s+as\s+React\s+from\s+['"]react['"]\s*;?\s*$/gim, '')
}

export function prepareSandboxJsx(source: string): string {
  return stripReactImports(source)
    .replace(/export\s+default\s+function\s+([A-Za-z_][\w]*)/g, 'function $1')
    .replace(/export\s+default\s+/g, 'const __Component = ')
}

export function hasForbiddenModuleSyntax(source: string, checkTopLevelImport = false): boolean {
  const cleaned = stripCommentsAndStrings(source)
  if (FORBIDDEN.test(cleaned)) return true
  if (checkTopLevelImport && /^\s*import\b/m.test(cleaned)) return true
  return false
}

export function transpileSandboxJsx(source: string, filePath = 'sandbox.tsx'): string {
  return transform(source, {
    transforms: ['jsx', 'typescript'],
    jsxRuntime: 'classic',
    production: true,
    filePath,
  }).code
}

function buildSandboxFactory(code: string): SandboxComponentFactory {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function(
    'React',
    'Block',
    'Field',
    'biu',
    'ui',
    'window',
    'document',
    'globalThis',
    'self',
    `"use strict";
     ${code}
     return (typeof __Component === "function" && __Component) || (typeof App === "function" && App);`,
  ) as SandboxComponentFactory
}

function slotFilePath(slot: HostSlot) {
  if (slot === 'Field') return 'record-prop-view.tsx'
  if (slot === 'Layout') return 'record-layout-view.tsx'
  return 'record-content-view.tsx'
}

export function compileHostSource(source: string, slot: HostSlot = 'Block'): HostCompileResult {
  const text = String(source ?? '').trim()
  if (!text) return { ok: false, error: 'empty source' }
  if (hasForbiddenModuleSyntax(text, false)) {
    return { ok: false, error: 'source cannot import or require modules' }
  }
  const stripped = prepareSandboxJsx(text)
  if (hasForbiddenModuleSyntax(stripped, true)) {
    return { ok: false, error: 'source cannot import or require modules' }
  }
  try {
    const code = transpileSandboxJsx(stripped, slotFilePath(slot))
    // Single-pass factory compilation: validates syntax AND produces the executable factory.
    const factory = buildSandboxFactory(code)
    return { ok: true, code, factory }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

function isPreviewInteractive(preview: HTMLElement | null, event: Event): boolean {
  if (!preview || !preview.isConnected) return false
  const target = event.target
  if (target instanceof Node && preview.contains(target)) return true
  const active = document.activeElement
  if (active && preview.contains(active)) return true
  try {
    if (preview.matches(':hover')) return true
  } catch {
    /* ignore */
  }
  return false
}

function gateEventTarget<T extends object>(
  real: T,
  getPreview: () => HTMLElement | null,
): T {
  const add = (real as EventTarget).addEventListener?.bind(real)
  const remove = (real as EventTarget).removeEventListener?.bind(real)
  const store = new WeakMap<EventListenerOrEventListenerObject, EventListener>()
  return new Proxy(real, {
    get(target, prop, receiver) {
      if (prop === 'addEventListener' && add) {
        return (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
          if (!listener || !KEY_EVENT.test(type)) return add(type, listener as EventListener, options)
          let gated = store.get(listener)
          if (!gated) {
            gated = (event: Event) => {
              const preview = getPreview()
              if (preview && !isPreviewInteractive(preview, event)) return
              if (typeof listener === 'function') return listener.call(real, event)
              return listener.handleEvent(event)
            }
            store.set(listener, gated)
          }
          return add(type, gated, options)
        }
      }
      if (prop === 'removeEventListener' && remove) {
        return (type: string, listener: EventListenerOrEventListenerObject | null, options?: boolean | AddEventListenerOptions) => {
          if (!listener) return remove(type, listener, options)
          return remove(type, store.get(listener) ?? listener, options)
        }
      }
      const value = Reflect.get(target, prop, receiver)
      return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
    },
  })
}

export function createSandboxGlobals(getPreview?: () => HTMLElement | null) {
  if (typeof window === 'undefined' || typeof document === 'undefined' || !getPreview) {
    return {
      window: typeof window !== 'undefined' ? window : undefined,
      document: typeof document !== 'undefined' ? document : undefined,
      globalThis: typeof globalThis !== 'undefined' ? globalThis : undefined,
      self: typeof self !== 'undefined' ? self : undefined,
    }
  }
  const documentView = gateEventTarget(document, getPreview)
  const windowView = gateEventTarget(window, getPreview)
  const windowWithDoc = new Proxy(windowView, {
    get(target, prop, receiver) {
      if (prop === 'document') return documentView
      if (prop === 'window' || prop === 'self' || prop === 'globalThis') return receiver
      return Reflect.get(target, prop, receiver)
    },
  })
  return {
    window: windowWithDoc,
    document: documentView,
    globalThis: windowWithDoc,
    self: windowWithDoc,
  }
}

export function loadSandboxComponent(
  compiledOrCode: string | { code: string; factory: SandboxComponentFactory },
  env: {
    React: unknown
    Block?: unknown
    Field?: unknown
    biu: unknown
    ui?: SandboxUi | Record<string, unknown>
    getPreview?: () => HTMLElement | null
  },
) {
  const factory =
    typeof compiledOrCode === 'string' ? buildSandboxFactory(compiledOrCode) : compiledOrCode.factory
  const globals = createSandboxGlobals(env.getPreview)
  const Component = factory(
    env.React,
    env.Block ?? (() => null),
    env.Field ?? (() => null),
    env.biu,
    env.ui ?? sandboxUi,
    globals.window,
    globals.document,
    globals.globalThis,
    globals.self,
  )
  if (typeof Component !== 'function') throw new Error('sandbox view must export a React component')
  return Component as (...args: unknown[]) => unknown
}

/**
 * 必须在 RenderBoundary 里渲染：用户源码顶层 hooks 会算进这个组件，不能算进宿主。
 * 注意：key 只绑定 code（源码变化才重建），数据 revision 变化只触发正常 re-render，
 * 避免改任意字段时卸载重建整个沙箱组件并丢失 useState / 焦点 / 滚动状态。
 */
export function SandboxPreview({
  code,
  load,
  errorTestId,
  revision: _revision,
}: {
  code: string
  load: () => ComponentType
  errorTestId?: string
  revision?: string
}) {
  const cache = useRef<{ code: string; Preview: ComponentType } | null>(null)
  try {
    if (!cache.current || cache.current.code !== code) {
      cache.current = { code, Preview: load() }
    }
    return createElement(cache.current.Preview, { key: code })
  } catch (error) {
    cache.current = null
    const message = error instanceof Error ? error.message : String(error)
    return createElement('div', { className: 'page-host-error', 'data-testid': errorTestId }, message || '无法渲染')
  }
}
