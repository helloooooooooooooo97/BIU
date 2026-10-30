import { transform } from 'sucrase'

export type SandboxCompileResult =
  | { ok: true; mode: 'jsx' }
  | { ok: false; error: string; mode?: 'jsx' }

const FORBIDDEN = /\bimport\s*\(|\brequire\s*\(/

export function looksLikeJsx(source: string) {
  const text = String(source ?? '').trim()
  if (!text) return false
  return (
    /\bexport\s+default\b/.test(text) ||
    /from\s+['"]react['"]/.test(text) ||
    /<\/?[A-Z][A-Za-z0-9]/.test(text) ||
    /\bfunction\s+[A-Z][A-Za-z0-9]*\s*\(/.test(text)
  )
}

function checkJs(source: string): SandboxCompileResult {
  const text = source.trim()
  if (!text) return { ok: true, mode: 'jsx' }
  if (FORBIDDEN.test(text)) return { ok: false, error: 'source cannot import or require modules', mode: 'jsx' }
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(text)
    return { ok: true, mode: 'jsx' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), mode: 'jsx' }
  }
}

export function transpileJsx(source: string) {
  return transform(source, {
    transforms: ['jsx', 'typescript'],
    jsxRuntime: 'classic',
    production: true,
    filePath: 'sandbox.tsx',
  }).code
}

function stripReactImports(source: string) {
  return source
    .replace(/^\s*import\s+[\s\S]*?from\s+['"]react['"]\s*;?\s*$/gim, '')
    .replace(/^\s*import\s+React\s*;?\s*$/gim, '')
    .replace(/^\s*import\s+\*\s+as\s+React\s+from\s+['"]react['"]\s*;?\s*$/gim, '')
}

export function compileJsxSource(source: string): SandboxCompileResult {
  const text = String(source ?? '').trim()
  if (!text) return { ok: false, error: 'empty source', mode: 'jsx' }
  if (FORBIDDEN.test(text)) return { ok: false, error: 'source cannot import or require modules', mode: 'jsx' }
  try {
    const stripped = stripReactImports(text)
      .replace(/export\s+default\s+function\s+/g, 'function ')
      .replace(/export\s+default\s+/g, 'const __Component = ')
    if (FORBIDDEN.test(stripped) || /^\s*import\b/m.test(stripped)) {
      return { ok: false, error: 'source cannot import or require modules', mode: 'jsx' }
    }
    return checkJs(transpileJsx(stripped))
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), mode: 'jsx' }
  }
}

export function compileSandboxSource(source: string): SandboxCompileResult {
  const text = String(source ?? '')
  if (!text.trim()) return { ok: false, error: 'empty source' }
  if (!looksLikeJsx(text)) return { ok: false, error: 'sandbox source must be a React component', mode: 'jsx' }
  return compileJsxSource(text)
}

export function formatCompileReport(result: SandboxCompileResult) {
  if (result.ok) return `ok mode=${result.mode}`
  return `error${result.mode ? ` mode=${result.mode}` : ''}: ${result.error}`
}
