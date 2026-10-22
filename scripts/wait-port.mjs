import net from 'node:net'

const port = Number(process.argv[2])
const timeoutMs = Number(process.env.BIU_WAIT_MS || 60_000)
if (!Number.isInteger(port) || port <= 0) {
  console.error('用法: node scripts/wait-port.mjs <port>')
  process.exit(1)
}

const started = Date.now()

function open() {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port })
    const done = (ok) => {
      socket.removeAllListeners()
      socket.destroy()
      resolve(ok)
    }
    socket.once('connect', () => done(true))
    socket.once('error', () => done(false))
  })
}

while (Date.now() - started < timeoutMs) {
  if (await open()) process.exit(0)
  await new Promise((resolve) => setTimeout(resolve, 200))
}

console.error(`等待 127.0.0.1:${port} 超过 ${timeoutMs}ms，后端没有启动`)
process.exit(1)
