import { transform } from 'sucrase'

const FORBIDDEN = /\bimport\s*\(|\brequire\s*\(/

export type HostCompileResult =
  | { ok: true; code: string }
  | { ok: false; error: string }

export type HostSlot = 'Block' | 'Field'

function stripReactImports(source: string) {
  return source
    .replace(/^\s*import\s+[\s\S]*?from\s+['"]react['"]\s*;?\s*$/gim, '')
    .replace(/^\s*import\s+React\s*;?\s*$/gim, '')
    .replace(/^\s*import\s+\*\s+as\s+React\s+from\s+['"]react['"]\s*;?\s*$/gim, '')
}

function prepareJsx(source: string) {
  return stripReactImports(source)
    .replace(/export\s+default\s+function\s+([A-Za-z_][\w]*)/g, 'function $1')
    .replace(/export\s+default\s+/g, 'const __Component = ')
}

function compileSlotSource(source: string, slot: HostSlot): HostCompileResult {
  const text = String(source ?? '').trim()
  if (!text) return { ok: false, error: 'empty source' }
  if (FORBIDDEN.test(text)) return { ok: false, error: 'source cannot import or require modules' }
  const stripped = prepareJsx(text)
  if (FORBIDDEN.test(stripped) || /^\s*import\b/m.test(stripped)) {
    return { ok: false, error: 'source cannot import or require modules' }
  }
  try {
    const code = transform(stripped, {
      transforms: ['jsx', 'typescript'],
      jsxRuntime: 'classic',
      production: true,
      filePath: slot === 'Field' ? 'page-prop-view.tsx' : 'page-view.tsx',
    }).code
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function('React', slot, 'biu', code)
    return { ok: true, code }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export function compileHostSource(source: string, slot: HostSlot = 'Block'): HostCompileResult {
  return compileSlotSource(source, slot)
}

export function loadHostComponent(code: string, React: unknown, Block: unknown, biu: unknown, slot: HostSlot = 'Block') {
  const factory = new Function(
    'React',
    slot,
    'biu',
    `"use strict";
     ${code}
     return (typeof __Component === "function" && __Component) || (typeof App === "function" && App);`,
  )
  const Component = factory(React, Block, biu)
  if (typeof Component !== 'function') throw new Error('sandbox view must export a React component')
  return Component as (...args: unknown[]) => unknown
}
