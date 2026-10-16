import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs'
import net from 'node:net'
import { basename, join, resolve } from 'node:path'

function isSqliteRuntimeFile(name: string) {
  return name.endsWith('.sqlite-shm') || name.endsWith('.sqlite-wal')
}

/** 优先使用约定端口；被占用时让系统分配空闲端口。 */
export function availablePort(preferred: number, host = '127.0.0.1') {
  const listen = (port: number) =>
    new Promise<number>((resolve, reject) => {
      const server = net.createServer()
      server.once('error', reject)
      server.listen(port, host, () => {
        const address = server.address()
        if (!address || typeof address === 'string') {
          server.close()
          reject(new Error('failed to allocate desktop host port'))
          return
        }
        server.close((error) => (error ? reject(error) : resolve(address.port)))
      })
    })
  return listen(preferred).catch((error: NodeJS.ErrnoException) => {
    if (preferred > 0 && error.code === 'EADDRINUSE') return listen(0)
    throw error
  })
}

function copyMerge(src: string, dest: string) {
  if (!existsSync(src)) return
  mkdirSync(dest, { recursive: true })
  let names: string[]
  try {
    names = readdirSync(src)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return
    throw error
  }
  for (const name of names) {
    if (isSqliteRuntimeFile(name)) continue
    const from = join(src, name)
    const to = join(dest, name)
    try {
      if (!existsSync(to)) {
        cpSync(from, to, {
          recursive: true,
          filter: (path) => !isSqliteRuntimeFile(basename(path)),
        })
        continue
      }
      if (!existsSync(from)) continue
      const fromStat = statSync(from)
      const toStat = statSync(to)
      if (fromStat.isDirectory() && toStat.isDirectory()) copyMerge(from, to)
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') continue
      throw error
    }
  }
}

/** 把旧包 Resources/biu 里残留的用户数据并进 userData；已有文件优先保留。不搬走安装包里的内置插件。 */
export function adoptPackedUserData(fromRoot: string, dataRoot: string, workspace: string) {
  const from = resolve(fromRoot)
  const dest = resolve(dataRoot)
  if (from === dest) return dest
  for (const name of ['.biu', '.cordis', '.page']) {
    copyMerge(join(from, name), join(dest, name))
    try {
      rmSync(join(from, name), { recursive: true, force: true })
    } catch {
      /* read-only bundle */
    }
  }
  for (const name of ['.plugin', '.plugin-dev', '.workspace']) {
    copyMerge(join(from, name), join(workspace, name))
  }
  return dest
}

/** 首次启动复制内置插件源码；已有沙箱属于用户，不覆盖。 */
export function seedPluginSandboxes(sourceDir: string, targetDir: string) {
  if (!existsSync(sourceDir)) return []
  mkdirSync(targetDir, { recursive: true })
  const copied: string[] = []
  for (const id of readdirSync(sourceDir).sort()) {
    const source = join(sourceDir, id)
    if (!existsSync(join(source, 'manifest.json'))) continue
    const target = join(targetDir, id)
    if (existsSync(target)) continue
    cpSync(source, target, {
      recursive: true,
      filter: (path) => basename(path) !== 'node_modules',
    })
    copied.push(id)
  }
  return copied
}
