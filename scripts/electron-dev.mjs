import { spawn } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { compileMain, launchElectron, portOpen } from './electron-launch.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function waitFor(port, ms = 60_000) {
  const start = Date.now()
  return new Promise((resolve, reject) => {
    const tick = async () => {
      if (await portOpen(port)) return resolve(undefined)
      if (Date.now() - start > ms) return reject(new Error(`wait for :${port} timed out`))
      setTimeout(tick, 200)
    }
    void tick()
  })
}

function npmRun(script) {
  return spawn('npm', ['run', script], { cwd: root, stdio: 'inherit', env: process.env })
}

export { portOpen }

async function main() {
  const kids = []
  if (await portOpen(3141)) console.log('[electron] 已有 host :3141，复用')
  else {
    console.log('[electron] 启动 host :3141')
    kids.push(npmRun('dev:host'))
  }
  if (await portOpen(5173)) console.log('[electron] 已有 vite :5173，复用')
  else {
    console.log('[electron] 启动 vite :5173')
    kids.push(npmRun('dev:web'))
  }

  await waitFor(3141)
  await waitFor(5173)
  await compileMain()
  const electron = launchElectron({ BIU_ELECTRON_DEV: '1' })

  const shutdown = (signal) => {
    electron.kill(signal)
    for (const kid of kids) kid.kill(signal)
  }

  process.on('SIGINT', () => shutdown('SIGINT'))
  process.on('SIGTERM', () => shutdown('SIGTERM'))

  electron.on('exit', (code, signal) => {
    for (const kid of kids) kid.kill('SIGTERM')
    if (signal) process.kill(process.pid, signal)
    process.exit(code ?? 0)
  })
}

const entry = process.argv[1]
if (entry && import.meta.url === pathToFileURL(resolve(entry)).href) {
  await main()
}
