import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { isSharePluginId } from '../share-resources.ts'
import { zipByteFiles } from '../shared/zip.ts'

export { zipByteFiles }

const SKIP = new Set(['node_modules', '.git', '.DS_Store'])

function pluginRoot(cwd: string, id: string) {
  const sandbox = resolve(join(cwd, '.plugin-dev', id))
  const installed = resolve(join(cwd, '.plugin', id))
  if (existsSync(sandbox)) return sandbox
  if (existsSync(installed)) return installed
  return ''
}

function walkFiles(root: string, dir: string, out: Array<{ name: string; data: Uint8Array }>) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue
    const full = join(dir, name)
    const st = statSync(full)
    if (st.isDirectory()) {
      walkFiles(root, full, out)
      continue
    }
    const rel = relative(root, full).split(sep).join('/')
    if (!rel || rel.startsWith('..')) continue
    out.push({ name: rel, data: new Uint8Array(readFileSync(full)) })
  }
}

export function readSharePluginWebJs(cwd: string, id: string): string | null {
  if (!isSharePluginId(id)) return null
  const cwdResolved = resolve(cwd)
  for (const file of [
    resolve(join(cwd, '.plugin', id, 'web.js')),
    resolve(join(cwd, '.plugin-dev', id, 'web.js')),
  ]) {
    if (!file.startsWith(cwdResolved + sep) && file !== cwdResolved) continue
    if (!existsSync(file)) continue
    return readFileSync(file, 'utf8')
  }
  return null
}

export function zipSharePluginSource(cwd: string, id: string): Uint8Array | null {
  if (!isSharePluginId(id)) return null
  const root = pluginRoot(cwd, id)
  if (!root) return null
  const cwdResolved = resolve(cwd)
  if (!root.startsWith(cwdResolved + sep) && root !== cwdResolved) return null
  const files: Array<{ name: string; data: Uint8Array }> = []
  walkFiles(root, root, files)
  if (!files.length) return null
  return zipByteFiles(files.map((file) => ({ name: `${id}/${file.name}`, data: file.data })))
}
