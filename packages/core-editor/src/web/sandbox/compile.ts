import {
  hasForbiddenModuleSyntax,
  stripReactImports,
  transpileSandboxJsx,
} from '@biu/core-file-system/sandbox-compile'

export type SandboxCompileResult =
  | { ok: true; mode: 'jsx' }
  | { ok: false; error: string; mode?: 'jsx' }

export function sandboxModuleFile(file: string) {
  return /\.(jsx|tsx)$/i.test(String(file ?? '').trim())
}

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
  if (hasForbiddenModuleSyntax(text, false)) {
    return { ok: false, error: 'source cannot import or require modules', mode: 'jsx' }
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(text)
    return { ok: true, mode: 'jsx' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), mode: 'jsx' }
  }
}

export function transpileJsx(source: string) {
  return transpileSandboxJsx(source, 'sandbox.tsx')
}

export function compileJsxSource(source: string): SandboxCompileResult {
  const text = String(source ?? '').trim()
  if (!text) return { ok: false, error: 'empty source', mode: 'jsx' }
  if (hasForbiddenModuleSyntax(text, false)) {
    return { ok: false, error: 'source cannot import or require modules', mode: 'jsx' }
  }
  try {
    const stripped = stripReactImports(text)
      .replace(/export\s+default\s+function\s+/g, 'function ')
      .replace(/export\s+default\s+/g, 'const __Component = ')
    if (hasForbiddenModuleSyntax(stripped, true)) {
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
