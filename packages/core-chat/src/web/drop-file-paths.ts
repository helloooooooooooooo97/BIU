/** Electron / Chromium File 在拖放时可能带本机绝对路径，网页版没有。 */

type PathFile = File & { path?: string }

type PathBridge = {
  pathForFile?: (file: File) => string
}

function pathBridge(): PathBridge | null {
  if (typeof window === 'undefined') return null
  const api = (window as unknown as { biuBrowser?: PathBridge }).biuBrowser
  return api?.pathForFile ? api : null
}

export function isAbsoluteFilePath(path: string) {
  const value = path.trim()
  if (!value) return false
  if (value.startsWith('/')) return true
  if (/^[A-Za-z]:[\\/]/.test(value)) return true
  if (value.startsWith('\\\\')) return true
  return false
}

export function pathFromFileUrl(raw: string) {
  const trimmed = raw.trim()
  if (!trimmed) return ''
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'file:') return ''
    let path = decodeURIComponent(url.pathname)
    if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1)
    return isAbsoluteFilePath(path) ? path : ''
  } catch {
    return ''
  }
}

export function fileAbsolutePath(file: File): string {
  const bridge = pathBridge()
  if (bridge?.pathForFile) {
    try {
      const fromBridge = String(bridge.pathForFile(file) ?? '').trim()
      if (isAbsoluteFilePath(fromBridge)) return fromBridge
    } catch {
      /* 桥接失败时再看 File.path */
    }
  }
  const native = typeof (file as PathFile).path === 'string' ? (file as PathFile).path!.trim() : ''
  return isAbsoluteFilePath(native) ? native : ''
}

function addPath(seen: Set<string>, out: string[], path: string) {
  const abs = path.trim()
  if (!isAbsoluteFilePath(abs) || seen.has(abs)) return
  seen.add(abs)
  out.push(abs)
}

export function pathsFromUriList(raw: string) {
  const out: string[] = []
  const seen = new Set<string>()
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const fromUrl = pathFromFileUrl(trimmed)
    addPath(seen, out, fromUrl || trimmed)
  }
  return out
}

/** 只收集绝对路径，不读文件内容。 */
export function collectDroppedFilePaths(
  files: FileList | File[] | null | undefined,
  extra?: { uriList?: string },
): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  if (files) {
    for (const file of Array.from(files)) addPath(seen, out, fileAbsolutePath(file))
  }
  if (extra?.uriList) {
    for (const path of pathsFromUriList(extra.uriList)) addPath(seen, out, path)
  }
  return out
}
