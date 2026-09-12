import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import net from 'node:net'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

export function portOpen(port, host = '127.0.0.1') {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host })
    sock.once('connect', () => {
      sock.end()
      resolve(true)
    })
    sock.once('error', () => resolve(false))
  })
}
const tsc = join(root, 'node_modules', 'typescript', 'bin', 'tsc')
const electron = join(root, 'node_modules', '.bin', 'electron')

export function compileMain() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [tsc, '-p', join(root, 'electron', 'tsconfig.json')], {
      cwd: root,
      stdio: 'inherit',
    })
    child.on('exit', (code) => {
      if (code === 0 && existsSync(join(root, 'electron', 'out', 'main.js'))) resolve(undefined)
      else reject(new Error(`electron tsc exited ${code}`))
    })
  })
}

export function launchElectron(extraEnv = {}) {
  const child = spawn(electron, [join(root, 'electron', 'out', 'main.js')], {
    cwd: root,
    stdio: 'inherit',
    env: {
      ...process.env,
      ...extraEnv,
    },
  })
  return child
}

function isMain() {
  const entry = process.argv[1]
  if (!entry) return false
  return import.meta.url === pathToFileURL(resolve(entry)).href
}

if (isMain()) {
  await compileMain()
  const child = launchElectron()
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal)
    process.exit(code ?? 1)
  })
}
