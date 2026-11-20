import { createElement, useRef, type ComponentType } from 'react'
import { transform } from 'sucrase'
import { sandboxUi, type SandboxUi } from './sandbox-ui.ts'

const FORBIDDEN = /\bimport\s*\(|\brequire\s*\(/

export type HostCompileResult =
  | { ok: true; code: string }
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
    // Single-line comment
    if (ch === '/' && next === '/') {
      i += 2
      while (i < len && source[i] !== '\n') i += 1
      continue
    }
    // Block comment
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
    // Single or double quoted string
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
    // Template literal (strip literal chunks, keep ${...} expressions)
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
    // Syntax-validate the compiled body once during compilation.
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('React', 'Block', 'Field', 'biu', 'ui', code)
    return { ok: true, code }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function loadSandboxComponent(
  code: string,
  env: {
    React: unknown
    Block?: unknown
    Field?: unknown
    biu: unknown
    ui?: SandboxUi | Record<string, unknown>
  },
) {
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  const factory = new Function(
    'React',
    'Block',
    'Field',
    'biu',
    'ui',
    `"use strict";
     ${code}
     return (typeof __Component === "function" && __Component) || (typeof App === "function" && App);`,
  )
  const Component = factory(
    env.React,
    env.Block ?? (() => null),
    env.Field ?? (() => null),
    env.biu,
    env.ui ?? sandboxUi,
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
