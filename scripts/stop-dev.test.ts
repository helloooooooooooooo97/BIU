import { test } from 'vitest'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { inRepo, isDevAncestor, isStopSeed, parseListenerPids, parseProcessStates, parseProcessTable, runStop, selectStopPids, stillRunning } from './stop-dev.mjs'

const tree = [
  { pid: 50, ppid: 1, command: '-zsh' },
  { pid: 60, ppid: 50, command: 'make dev' },
  { pid: 70, ppid: 60, command: 'npm run dev' },
  { pid: 80, ppid: 70, command: 'sh -c concurrently -k -n online,online-web,desktop,desktop-web npm:dev:host' },
  { pid: 90, ppid: 80, command: 'node node_modules/concurrently/dist/bin/concurrently.js -k npm:dev:host' },
  { pid: 91, ppid: 90, command: 'npm run dev:host' },
  { pid: 92, ppid: 91, command: 'sh -c PORT=3141 BIU_HOME=.cloud-data tsx host/index.ts' },
  { pid: 93, ppid: 92, command: 'node node_modules/tsx/dist/cli.mjs host/index.ts' },
  { pid: 94, ppid: 90, command: 'npm run dev:web' },
  { pid: 95, ppid: 94, command: 'sh -c node scripts/wait-port.mjs 3141 && exec vite' },
  { pid: 96, ppid: 95, command: 'node node_modules/vite/bin/vite.js' },
  { pid: 200, ppid: 50, command: 'make restart' },
  { pid: 201, ppid: 200, command: 'node scripts/stop-dev.mjs' },
  { pid: 500, ppid: 1, command: 'node /other/project/node_modules/vite/bin/vite.js' },
  { pid: 501, ppid: 50, command: 'vim scripts/wait-port.mjs' },
]

test('stop selects the dev tree and leaves make, the shell, and other vites', () => {
  const pids = selectStopPids({ processes: tree, listeners: [93, 96], selfPid: 201 })
  assert.deepEqual(pids, [70, 80, 90, 91, 92, 93, 94, 95, 96])
  assert.equal(isStopSeed(tree.find((proc) => proc.pid === 93)!.command), true)
  assert.equal(isStopSeed('vim scripts/wait-port.mjs'), false)
  assert.equal(isDevAncestor('make dev'), false)
  assert.equal(isDevAncestor('npm install'), false)
})

test('package hosts and other checkouts are left alone', () => {
  assert.equal(isStopSeed('node packages/host-http/src/host/index.ts'), false)
  assert.equal(isStopSeed('node node_modules/tsx/dist/cli.mjs host/index.ts'), true)
  const processes = [
    { pid: 93, ppid: 1, command: 'node node_modules/tsx/dist/cli.mjs host/index.ts' },
    { pid: 94, ppid: 1, command: 'node packages/host-http/src/host/index.ts' },
  ]
  const cwdByPid = new Map([[93, '/other/biu']])
  assert.deepEqual(
    selectStopPids({ processes, listeners: [], selfPid: 1, repoRoot: '/workspace', cwdByPid }),
    [],
  )
  assert.deepEqual(
    selectStopPids({ processes, listeners: [93], selfPid: 1, repoRoot: '/workspace', cwdByPid }),
    [93],
  )
  assert.equal(inRepo('/workspace', '/workspace'), true)
  assert.equal(inRepo('/workspace/packages', '/workspace'), true)
  assert.equal(inRepo('/workspace-other', '/workspace'), false)
})

test('a host that already dropped its port is still stopped', () => {
  const processes = [
    { pid: 50, ppid: 1, command: '-zsh' },
    { pid: 91, ppid: 50, command: 'npm run dev:desktop:host' },
    { pid: 92, ppid: 91, command: 'sh -c PORT=3151 tsx host/index.ts' },
    { pid: 93, ppid: 92, command: 'node node_modules/tsx/dist/cli.mjs host/index.ts' },
  ]
  assert.deepEqual(selectStopPids({ processes, listeners: [], selfPid: 1 }), [91, 92, 93])
})

test('stop selects the rebuilt cloud and local hosts', () => {
  const processes = [
    { pid: 60, ppid: 1, command: 'make rebuild' },
    { pid: 70, ppid: 60, command: 'npm run start:both' },
    { pid: 80, ppid: 70, command: 'node node_modules/concurrently/dist/bin/concurrently.js -k -n online,desktop npm:start npm:start:desktop' },
    { pid: 91, ppid: 80, command: 'npm run start' },
    { pid: 92, ppid: 91, command: 'sh -c PORT=3141 BIU_HOME=.cloud-data tsx host/index.ts' },
    { pid: 93, ppid: 92, command: 'node node_modules/tsx/dist/cli.mjs host/index.ts' },
    { pid: 94, ppid: 80, command: 'npm run start:desktop' },
    { pid: 95, ppid: 94, command: 'sh -c BIU_ONLINE=0 PORT=3151 BIU_HOME=.local-data tsx host/index.ts' },
    { pid: 96, ppid: 95, command: 'node node_modules/tsx/dist/cli.mjs host/index.ts' },
  ]
  assert.deepEqual(selectStopPids({ processes, listeners: [93, 96], selfPid: 1 }), [70, 80, 91, 92, 93, 94, 95, 96])
  assert.equal(isDevAncestor('npm run start:desktop'), true)
  assert.equal(isDevAncestor('npm install'), false)
})

test('stop does not kill its own make or shell', () => {
  const processes = [
    { pid: 50, ppid: 1, command: 'npm run dev' },
    { pid: 200, ppid: 50, command: 'node scripts/stop-dev.mjs' },
    { pid: 93, ppid: 200, command: 'node node_modules/tsx/dist/cli.mjs host/index.ts' },
  ]
  assert.deepEqual(selectStopPids({ processes, listeners: [93], selfPid: 200 }), [93])
})

test('parse ps and lsof output', () => {
  assert.deepEqual(parseProcessTable('  12  1  node host/index.ts\n\n  8 12 npm run dev\n'), [
    { pid: 12, ppid: 1, command: 'node host/index.ts' },
    { pid: 8, ppid: 12, command: 'npm run dev' },
  ])
  assert.deepEqual(parseListenerPids('93\n96\n93\n'), [93, 96])
})

test('runStop waits until the process exits, then force-kills', async () => {
  let gone = false
  let clock = 0
  const signals: string[] = []
  await runStop({
    listProcesses: async () => [{ pid: 93, ppid: 1, command: 'node node_modules/tsx/dist/cli.mjs host/index.ts' }],
    listListeners: async () => (gone ? [] : [93]),
    selfPid: 201,
    signal: (_pid, name) => {
      signals.push(name)
      if (name === 'SIGKILL') gone = true
    },
    isGone: async () => gone,
    sleep: async (ms) => {
      clock += ms
    },
    now: () => clock,
    termGraceMs: 800,
    killGraceMs: 200,
    log: () => {},
  })
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'])
  assert.equal(clock, 800)
})

test('runStop returns immediately when nothing is listening', async () => {
  const signals: string[] = []
  const logs: string[] = []
  await runStop({
    listProcesses: async () => [{ pid: 201, ppid: 1, command: 'node scripts/stop-dev.mjs' }],
    listListeners: async () => [],
    selfPid: 201,
    signal: (_pid, name) => signals.push(name),
    isGone: async () => true,
    sleep: async () => {},
    log: (message) => logs.push(message),
  })
  assert.deepEqual(signals, [])
  assert.deepEqual(logs, ['3141 3151 5173 5174 已空闲'])
})

test('a leftover zombie does not fail the stop', async () => {
  const signals: string[] = []
  const logs: string[] = []
  await runStop({
    listProcesses: async () => [{ pid: 62438, ppid: 1, command: 'node node_modules/tsx/dist/cli.mjs host/index.ts' }],
    listListeners: async () => [],
    selfPid: 201,
    signal: (_pid, name) => signals.push(name),
    isGone: async () => false,
    readStates: async () => parseProcessStates('62438 Z'),
    sleep: async () => {
      throw new Error('zombie should not keep the stop waiting')
    },
    log: (message) => logs.push(message),
  })
  assert.deepEqual(signals, ['SIGTERM'])
  assert.deepEqual(logs, ['结束 dev 进程'])
  assert.deepEqual(stillRunning([62438, 7], new Map([[62438, 'Z']])), [])
  assert.deepEqual(stillRunning([7], null), [7])
})

test('a stuck shutdown is ended quickly and without a force-kill roster', async () => {
  let gone = false
  let clock = 0
  const signals: string[] = []
  const logs: string[] = []
  await runStop({
    listProcesses: async () => [{ pid: 93, ppid: 1, command: 'node node_modules/tsx/dist/cli.mjs host/index.ts' }],
    listListeners: async () => (gone ? [] : [93]),
    selfPid: 201,
    signal: (_pid, name) => {
      signals.push(name)
      if (name === 'SIGKILL') gone = true
    },
    isGone: async () => gone,
    sleep: async (ms) => {
      clock += ms
    },
    now: () => clock,
    log: (message) => logs.push(message),
  })
  assert.deepEqual(signals, ['SIGTERM', 'SIGKILL'])
  assert.equal(clock, 400)
  assert.deepEqual(logs, ['结束 dev 进程'])
})

test('make stop waits for the dev process, not only the port', async () => {
  const makefile = await readFile(resolve(import.meta.dirname, '../Makefile'), 'utf8')
  assert.match(makefile, /node scripts\/stop-dev\.mjs/)
  assert.match(makefile, /^deploy: restart$/m)
  assert.match(makefile, /^rebuild: stop build$/m)
  assert.match(makefile, /npm run start:both/)
  const pkg = await readFile(resolve(import.meta.dirname, '../package.json'), 'utf8')
  assert.match(pkg, /"start:desktop": ".*BIU_ONLINE=0.*PORT=3151.*BIU_HOME=\.local-data/)
  assert.match(pkg, /"start": ".*PORT=3141.*BIU_HOME=\.cloud-data/)
  const source = await readFile(resolve(import.meta.dirname, 'stop-dev.mjs'), 'utf8')
  assert.match(source, /SIGTERM/)
  assert.match(source, /SIGKILL/)
  assert.match(source, /termGraceMs = 400/)
  assert.doesNotMatch(source, /强制结束/)
  const host = await readFile(resolve(import.meta.dirname, '../host/index.ts'), 'utf8')
  assert.match(host, /process\.once\('SIGTERM', exitOnStop\)/)
  const vite = await readFile(resolve(import.meta.dirname, '../vite.config.ts'), 'utf8')
  assert.match(vite, /closeAllConnections/)
})
