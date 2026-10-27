import { transform } from 'sucrase'

export type HtmlCompileMode = 'markup' | 'script' | 'jsx'

export type HtmlCompileResult =
  | { ok: true; mode: HtmlCompileMode }
  | { ok: false; error: string; mode?: HtmlCompileMode }

const FORBIDDEN = /\bimport\s*\(|\brequire\s*\(/

export function looksLikeJsx(source: string) {
  const text = String(source ?? '').trim()
  if (!text) return false
  if (/^<!DOCTYPE/i.test(text) || /^<html[\s>]/i.test(text)) return false
  return (
    /\bexport\s+default\b/.test(text) ||
    /from\s+['"]react['"]/.test(text) ||
    /<\/?[A-Z][A-Za-z0-9]/.test(text) ||
    /\bfunction\s+[A-Z][A-Za-z0-9]*\s*\(/.test(text)
  )
}

function scriptBodies(html: string) {
  return [...String(html).matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)].map((match) => ({
    attrs: match[1] ?? '',
    body: match[2] ?? '',
  }))
}

function checkJs(source: string, mode: HtmlCompileMode): HtmlCompileResult {
  const text = source.trim()
  if (!text) return { ok: true, mode }
  if (FORBIDDEN.test(text)) return { ok: false, error: 'source cannot import or require modules', mode }
  try {
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    new Function(text)
    return { ok: true, mode }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), mode }
  }
}

export function transpileJsx(source: string) {
  return transform(source, {
    transforms: ['jsx', 'typescript'],
    jsxRuntime: 'classic',
    production: true,
    filePath: 'html-block.tsx',
  }).code
}

function stripReactImports(source: string) {
  return source
    .replace(/^\s*import\s+[\s\S]*?from\s+['"]react['"]\s*;?\s*$/gim, '')
    .replace(/^\s*import\s+React\s*;?\s*$/gim, '')
    .replace(/^\s*import\s+\*\s+as\s+React\s+from\s+['"]react['"]\s*;?\s*$/gim, '')
}

export function compileJsxSource(source: string): HtmlCompileResult {
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
    const code = transpileJsx(stripped)
    return checkJs(code, 'jsx')
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error), mode: 'jsx' }
  }
}

export function compileHtmlSource(source: string): HtmlCompileResult {
  const text = String(source ?? '')
  if (!text.trim()) return { ok: false, error: 'empty source' }
  if (looksLikeJsx(text)) return compileJsxSource(text)
  const scripts = scriptBodies(text)
  for (const script of scripts) {
    if (/\bsrc\s*=/.test(script.attrs)) return { ok: false, error: 'external script src is not allowed', mode: 'script' }
    const type = /type\s*=\s*['"]([^'"]+)/i.exec(script.attrs)?.[1] ?? ''
    if (type && /jsx|tsx|react/i.test(type)) {
      const compiled = compileJsxSource(script.body)
      if (!compiled.ok) return compiled
      continue
    }
    if (type && !/javascript|ecmascript|module|^$/i.test(type)) continue
    const compiled = looksLikeJsx(script.body) ? compileJsxSource(script.body) : checkJs(script.body, 'script')
    if (!compiled.ok) return compiled
  }
  return { ok: true, mode: scripts.length ? 'script' : 'markup' }
}

export function formatCompileReport(result: HtmlCompileResult) {
  if (result.ok) return `ok mode=${result.mode}`
  return `error${result.mode ? ` mode=${result.mode}` : ''}: ${result.error}`
}
