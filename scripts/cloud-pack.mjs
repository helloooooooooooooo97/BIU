#!/usr/bin/env node
/**
 * 按 profile 独立打包云端产物（cloud-api / cloud-worker），物理剔除桌面专属插件。
 * 用法：
 *   node scripts/cloud-pack.mjs --profile=cloud-api
 *   node scripts/cloud-pack.mjs --profile=cloud-worker
 */
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const hostRuntimeManifest = join(root, 'electron', 'host-runtime', 'package.json')
const HOST_RUNTIME_PACKAGES = Object.keys(
  JSON.parse(readFileSync(hostRuntimeManifest, 'utf8')).dependencies ?? {},
)

const VALID_CLOUD_PROFILES = new Set(['cloud-api', 'cloud-worker'])

function parseProfile(argv = process.argv.slice(2)) {
  const flag = argv.find((arg) => arg.startsWith('--profile='))
  const value = flag ? flag.slice('--profile='.length).trim() : 'cloud-api'
  if (!VALID_CLOUD_PROFILES.has(value)) {
    throw new Error(`unsupported cloud profile: ${value} (expected cloud-api or cloud-worker)`)
  }
  return value
}

function matchesProfile(item, profile) {
  if (!Array.isArray(item?.profiles) || item.profiles.length === 0) return true
  return item.profiles.includes(profile)
}

export function readCloudManifest(profile) {
  const config = JSON.parse(readFileSync(join(root, 'cordis.plugins.json'), 'utf8'))
  return {
    host: (config.host ?? []).filter((item) => matchesProfile(item, profile)),
    web: profile === 'cloud-api' ? (config.web ?? []).filter((item) => matchesProfile(item, profile)) : [],
    plugins: (config.plugins ?? []).filter((item) => matchesProfile(item, profile)),
  }
}

function packageName(specifier) {
  const parts = specifier.split('/')
  return specifier.startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0]
}

function packageSubpath(specifier) {
  const name = packageName(specifier)
  return specifier === name ? '.' : `.${specifier.slice(name.length)}`
}

function exportTarget(value, fallback) {
  if (typeof value === 'string') return value
  if (value && typeof value === 'object') return value.import || value.default || fallback
  return fallback
}

function configuredEntries(manifest) {
  const refs = [...(manifest.host ?? []), ...(manifest.plugins ?? [])]
    .map((item) => item.package)
    .filter(Boolean)
  const packageDirs = new Map()
  for (const dir of readdirSync(join(root, 'packages'))) {
    const manifestPath = join(root, 'packages', dir, 'package.json')
    if (!existsSync(manifestPath)) continue
    const pkg = JSON.parse(readFileSync(manifestPath, 'utf8'))
    if (pkg.name) packageDirs.set(pkg.name, { dir: join(root, 'packages', dir), pkg })
  }
  return [...new Set(refs)].map((specifier) => {
    const found = packageDirs.get(packageName(specifier))
    if (!found) throw new Error(`configured cloud package not found: ${specifier}`)
    const subpath = packageSubpath(specifier)
    const fallback = found.pkg.main || 'src/index.ts'
    const target = exportTarget(found.pkg.exports?.[subpath], fallback)
    return { specifier, entry: join(found.dir, target) }
  })
}

export async function packCloud(profile = parseProfile()) {
  const outDir = join(root, `pack-${profile}`)
  const manifest = readCloudManifest(profile)
  rmSync(outDir, { recursive: true, force: true })
  mkdirSync(join(outDir, 'host'), { recursive: true })
  cpSync(hostRuntimeManifest, join(outDir, 'package.json'))
  writeFileSync(join(outDir, 'cordis.plugins.json'), JSON.stringify(manifest, null, 2) + '\n')
  if (profile === 'cloud-api' && existsSync(join(root, 'dist', 'index.html'))) {
    cpSync(join(root, 'dist'), join(outDir, 'dist'), { recursive: true })
  }
  const { build } = await import('esbuild')
  const entries = configuredEntries(manifest)
  const modules = entries.map(
    ({ specifier, entry }) =>
      `${JSON.stringify(specifier)}: () => import(${JSON.stringify(`./${relative(root, entry).replace(/\\/g, '/')}`)})`,
  )
  const source = [
    `process.env.BIU_ONLINE = '1'`,
    `process.env.BIU_PROFILE = ${JSON.stringify(profile)}`,
    `globalThis[Symbol.for('biu.packagedHostModules')] = { ${modules.join(', ')} }`,
    `await import('./host/index.ts')`,
  ].join('\n')
  await build({
    stdin: {
      contents: source,
      resolveDir: root,
      sourcefile: `${profile}-entry.ts`,
      loader: 'ts',
    },
    outfile: join(outDir, 'host', 'index.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    sourcemap: false,
    legalComments: 'none',
    external: HOST_RUNTIME_PACKAGES.flatMap((name) => [name, `${name}/*`]),
    logLevel: 'info',
  })
  console.log(`[cloud-pack] built ${profile} -> ${outDir} (${entries.length} packages)`)
  return { outDir, manifest, entries }
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  await packCloud()
}
