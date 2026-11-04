import { writeFile, mkdir, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { spawn } from 'node:child_process'
import type { Context } from 'cordis'

export const name = 'page-algorithm'
export const inject = ['http']

const JAVA_BIN = '/opt/homebrew/opt/openjdk@21/bin'

interface LangConfig {
  label: string
  ext: string
  mode: 'compiled' | 'interpreted'
  runCmd?: string[]
  compileCmd?: string[]
  runAfterCompile?: string[]
  filenameFromCode?: (code: string) => string
  wrap?: (code: string) => string
  timeout?: number
}

const LANGS: Record<string, LangConfig> = {
  python: { label: 'Python', ext: 'py', mode: 'interpreted', runCmd: ['python3', '{file}'], timeout: 15000 },
  javascript: { label: 'JavaScript', ext: 'js', mode: 'interpreted', runCmd: ['node', '{file}'], timeout: 15000 },
  typescript: { label: 'TypeScript', ext: 'ts', mode: 'interpreted', runCmd: ['npx', '--yes', 'tsx', '{file}'], timeout: 30000 },
  java: {
    label: 'Java',
    ext: 'java',
    mode: 'compiled',
    compileCmd: [join(JAVA_BIN, 'javac'), '-nowarn', '{file}'],
    runAfterCompile: [join(JAVA_BIN, 'java'), '-cp', '{dir}', '{name}'],
    filenameFromCode: (code: string) => {
      const m = code.match(/public\s+class\s+(\w+)/)
      return m ? m[1] : ''
    },
    wrap: (code: string) => {
      if (/\bclass\s+\w+/.test(code)) return code
      return `public class Main {\n  public static void main(String[] args) throws Exception {\n${code.split('\n').map((l: string) => '    ' + l).join('\n')}\n  }\n}`
    },
    timeout: 15000,
  },
  cpp: {
    label: 'C++',
    ext: 'cpp',
    mode: 'compiled',
    compileCmd: ['c++', '-std=c++17', '-o', '{dir}/out', '{file}'],
    runAfterCompile: ['{dir}/out'],
    timeout: 15000,
  },
}

function spawnRun(cmd: string[], cwd: string, env: Record<string, string>, timeout: number) {
  return new Promise<{ stdout: string; stderr: string; code: number | null }>((resolve) => {
    const proc = spawn(cmd[0], cmd.slice(1), { cwd, env, timeout })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d) => { stdout += d.toString() })
    proc.stderr.on('data', (d) => { stderr += d.toString() })
    proc.on('close', (code) => resolve({ stdout, stderr, code }))
    proc.on('error', () => resolve({ stdout, stderr, code: -1 }))
  })
}

function fillTemplate(arr: string[], vars: Record<string, string>) {
  return arr.map((s) => s.replace(/\{(\w+)\}/g, (_, k) => vars[k] || ''))
}

async function runCode(lang: string, code: string) {
  const cfg = LANGS[lang]
  if (!cfg) return { ok: false, stdout: '', stderr: `Unsupported language: ${lang}`, exitCode: -1, compileError: '' }

  const tmpDir = join('/tmp', `algo-runner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
  await mkdir(tmpDir, { recursive: true })

  let filename = 'main'
  let fileCode = code
  if (cfg.filenameFromCode) {
    filename = cfg.filenameFromCode(code)
    if (!filename) {
      fileCode = cfg.wrap ? cfg.wrap(code) : code
      filename = 'Main'
    }
  }

  const fileBase = filename || 'main'
  const srcFile = join(tmpDir, `${fileBase}.${cfg.ext}`)
  await writeFile(srcFile, fileCode, 'utf8')
  const vars = { file: srcFile, dir: tmpDir, name: fileBase }
  const env = { ...process.env, PATH: `${JAVA_BIN}:${process.env.PATH}` }

  try {
    if (cfg.mode === 'interpreted' && cfg.runCmd) {
      const result = await spawnRun(fillTemplate(cfg.runCmd, vars), tmpDir, env, cfg.timeout || 15000)
      await rm(tmpDir, { recursive: true, force: true })
      return { ok: result.code === 0, ...result, compileError: '' }
    }
    if (cfg.mode === 'compiled') {
      const compileResult = await spawnRun(fillTemplate(cfg.compileCmd!, vars), tmpDir, env, cfg.timeout || 15000)
      if (compileResult.code !== 0) {
        await rm(tmpDir, { recursive: true, force: true })
        return { ok: false, stdout: '', stderr: '', exitCode: compileResult.code, compileError: compileResult.stderr || compileResult.stdout }
      }
      const result = await spawnRun(fillTemplate(cfg.runAfterCompile!, vars), tmpDir, env, cfg.timeout || 15000)
      await rm(tmpDir, { recursive: true, force: true })
      return { ok: result.code === 0, ...result, compileError: '' }
    }
    return { ok: false, stdout: '', stderr: 'Unknown mode', exitCode: -1, compileError: '' }
  } catch (e) {
    await rm(tmpDir, { recursive: true, force: true })
    return { ok: false, stdout: '', stderr: String(e), exitCode: -1, compileError: '' }
  }
}

export function apply(ctx: Context) {
  ctx.http.route('POST', '/api/page-algorithm/run', async (route) => {
    const body = await route.json<{ code?: string; lang?: string }>()
    const code = body.code ?? ''
    const lang = body.lang ?? 'python'
    if (!code.trim()) {
      route.send(400, { error: 'empty code' })
      return
    }
    try {
      route.send(200, await runCode(lang, code))
    } catch (e) {
      route.send(500, { error: String(e) })
    }
  })
}
