import { execFile } from 'node:child_process'
import { readlinkSync } from 'node:fs'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'
import { dirname, join, resolve, sep } from 'node:path'

const execFileAsync = promisify(execFile)

export const DEV_PORTS = [3141, 3151, 5173, 5174]

const HOST_ENTRY = /(?:^|[\s'"])(?:tsx|node)\b.*(?:^|[\s'"])host\/index\.ts(?:\s|$)/
const WAIT_PORT = /(?:^|[\s'"])node\b.*(?:^|[\s'"])scripts\/wait-port\.mjs(?:\s|$)/
const VITE_BIN = /(?:^|[\s/])vite(?:\.js)?(?:\s|$)/
const CONCURRENTLY = /\bconcurrently\b/
const NPM_APP = /\bnpm\b.*\b(?:dev|start)(?::[\w-]+)?\b/

export function isStopSeed(command) {
  return HOST_ENTRY.test(command) || WAIT_PORT.test(command)
}

export function isDevAncestor(command) {
  return isStopSeed(command) || VITE_BIN.test(command) || CONCURRENTLY.test(command) || NPM_APP.test(command)
}

export function inRepo(cwd, root) {
  if (!cwd || !root) return false
  const resolved = resolve(cwd)
  const base = resolve(root)
  return resolved === base || resolved.startsWith(base.endsWith(sep) ? base : base + sep)
}

export function selectStopPids({ processes, listeners, selfPid, repoRoot = '', cwdByPid = new Map() }) {
  const listenerSet = new Set(listeners)
  const byPid = new Map(processes.map((proc) => [proc.pid, proc]))
  const children = new Map()
  for (const proc of processes) {
    const list = children.get(proc.ppid)
    if (list) list.push(proc.pid)
    else children.set(proc.ppid, [proc.pid])
  }

  const protectedPids = new Set()
  const seen = new Set()
  let current = selfPid
  while (current && current > 1 && !seen.has(current)) {
    seen.add(current)
    protectedPids.add(current)
    current = byPid.get(current)?.ppid ?? 0
  }

  const kill = new Set()
  const add = (pid) => {
    if (!pid || pid <= 1 || protectedPids.has(pid) || kill.has(pid)) return false
    kill.add(pid)
    return true
  }

  for (const pid of listeners) add(pid)
  for (const proc of processes) {
    if (!isStopSeed(proc.command) || listenerSet.has(proc.pid)) continue
    const cwd = cwdByPid.get(proc.pid)
    if (repoRoot && cwd && !inRepo(cwd, repoRoot)) continue
    add(proc.pid)
  }

  const up = [...kill]
  while (up.length) {
    const parent = byPid.get(up.pop())?.ppid
    if (!parent || !add(parent)) continue
    if (!isDevAncestor(byPid.get(parent)?.command ?? '')) {
      kill.delete(parent)
      continue
    }
    up.push(parent)
  }

  const down = [...kill]
  while (down.length) {
    for (const child of children.get(down.pop()) ?? []) {
      if (add(child)) down.push(child)
    }
  }

  return [...kill].sort((a, b) => a - b)
}

export function parseProcessTable(stdout) {
  const processes = []
  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(.*)$/.exec(line)
    if (!match) continue
    processes.push({ pid: Number(match[1]), ppid: Number(match[2]), command: match[3] })
  }
  return processes
}

export function parseListenerPids(stdout) {
  return [...new Set(stdout.split(/\s+/).map(Number).filter((pid) => pid > 0))]
}

async function listProcesses() {
  const { stdout } = await execFileAsync('ps', ['-axww', '-o', 'pid=,ppid=,command='], {
    maxBuffer: 16 * 1024 * 1024,
  })
  return parseProcessTable(stdout)
}

async function listListeners() {
  try {
    const { stdout } = await execFileAsync('lsof', [
      '-nP',
      '-sTCP:LISTEN',
      '-t',
      ...DEV_PORTS.map((port) => `-iTCP:${port}`),
    ])
    return parseListenerPids(stdout)
  } catch (error) {
    if (error?.code === 1 || error?.code === '1') return []
    if (error?.code === 'ENOENT') throw new Error('需要 lsof 才能停止 dev 进程')
    const stderr = `${error?.stderr ?? ''}`
    if (/no such file|not found|cannot identify/i.test(stderr)) return []
    throw error
  }
}

function signal(pid, name) {
  try {
    process.kill(pid, name)
  } catch {
    // 进程已经退出
  }
}

function isGone(pid) {
  try {
    process.kill(pid, 0)
    return false
  } catch {
    return true
  }
}

export function parseProcessStates(stdout) {
  const states = new Map()
  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\S+)/.exec(line)
    if (match) states.set(Number(match[1]), match[2])
  }
  return states
}

/** 僵尸进程已经放开端口和 sqlite，只是父进程还没回收。空状态表示 ps 已经看不到它。 */
export function stillRunning(pids, states) {
  if (!states) return pids
  return pids.filter((pid) => {
    const state = states.get(pid)
    if (!state) return false
    return !state.startsWith('Z')
  })
}

async function readStates(pids) {
  if (pids.length === 0) return new Map()
  try {
    const { stdout } = await execFileAsync('ps', ['-o', 'pid=,state=', '-p', pids.join(',')])
    return parseProcessStates(stdout)
  } catch (error) {
    if (error?.code === 1 || error?.code === '1') return new Map()
    return null
  }
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')

export async function readCwd(pid) {
  try {
    return readlinkSync(`/proc/${pid}/cwd`)
  } catch {
    // macOS 没有 /proc。
  }
  try {
    const { stdout } = await execFileAsync('lsof', ['-a', '-p', String(pid), '-d', 'cwd', '-Fn'])
    const line = stdout.split('\n').find((item) => item.startsWith('n') && item.length > 1)
    return line ? line.slice(1) : null
  } catch {
    return null
  }
}

async function cwdForSeeds(processes, readers) {
  const cwdByPid = new Map()
  for (const proc of processes) {
    if (!isStopSeed(proc.command)) continue
    cwdByPid.set(proc.pid, await readers(proc.pid))
  }
  return cwdByPid
}

export async function runStop({
  listProcesses: readProcesses,
  listListeners: readListeners,
  readCwd: readProcessCwd = async () => null,
  repoRoot: root = '',
  selfPid,
  signal: send,
  isGone: exited,
  readStates: statesOf = async () => null,
  sleep,
  now = () => Date.now(),
  // Vite 的 SIGTERM 会等浏览器连接断开，页面开着就一直不退。
  // 拖满几秒也还是要杀掉，所以只给一小段时间，没退就结束掉。
  termGraceMs = 400,
  killGraceMs = 1500,
  log = () => {},
}) {
  const processes = await readProcesses()
  const listeners = await readListeners()
  const cwdByPid = root ? await cwdForSeeds(processes, readProcessCwd) : new Map()
  const targets = selectStopPids({ processes, listeners, selfPid, repoRoot: root, cwdByPid })
  if (targets.length === 0) {
    log(`${DEV_PORTS.join(' ')} 已空闲`)
    return
  }
  log('结束 dev 进程')
  for (const pid of targets) send(pid, 'SIGTERM')

  const waitGone = async (pids, graceMs) => {
    const start = now()
    for (;;) {
      let alive = []
      for (const pid of pids) {
        if (!(await exited(pid))) alive.push(pid)
      }
      if (alive.length === 0) return alive
      alive = stillRunning(alive, await statesOf(alive))
      if (alive.length === 0) return alive
      if (now() - start >= graceMs) return alive
      await sleep(50)
    }
  }

  let alive = await waitGone(targets, termGraceMs)
  if (alive.length) {
    const latest = await readProcesses()
    const stillListening = await readListeners()
    const again = selectStopPids({
      processes: latest,
      listeners: stillListening,
      selfPid,
      repoRoot: root,
      cwdByPid: root ? await cwdForSeeds(latest, readProcessCwd) : new Map(),
    })
    const force = [...new Set([...alive, ...again])].sort((a, b) => a - b)
    for (const pid of force) send(pid, 'SIGKILL')
    alive = await waitGone(force, killGraceMs)
  }
  const stillListening = alive.length ? [] : await readListeners()
  if (alive.length || stillListening.length) {
    const detail = [
      alive.length ? `进程 ${alive.join(' ')}` : '',
      stillListening.length ? `端口上的进程 ${stillListening.join(' ')}` : '',
    ].filter(Boolean).join('，')
    throw new Error(`dev 没有停干净：${detail}`)
  }
}

async function main() {
  await runStop({
    listProcesses,
    listListeners,
    readCwd,
    repoRoot,
    selfPid: process.pid,
    signal,
    isGone,
    readStates,
    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),
    log: (message) => console.log(message),
  })
}

const entry = process.argv[1] ? resolve(process.argv[1]) : ''
if (entry && entry === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
}
