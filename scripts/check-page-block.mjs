#!/usr/bin/env node
/**
 * 页面块编译闸门。
 *
 * 用法：
 *   node scripts/check-page-block.mjs <文件>            # 校验裸 JSX 文件（如 .workspace/xxx.jsx）
 *   node scripts/check-page-block.mjs <页面.md> --fence  # 校验 markdown 里第一个 :::pageBlock 围栏体
 *
 * 与宿主同一套配置（见 .plugin-dev/page-html-blocks/shared/compile.ts）：
 *   sucrase { transforms: ['jsx','typescript'], jsxRuntime: 'classic', production: true }
 *   再 new Function(code) 兜住语义层语法错误。
 *
 * 退出码 0 = 通过；1 = 失败（打印真实报错行号）。
 */
import { createRequire } from 'node:module'
import { readFileSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')

const candidates = [
  resolve(root, '.plugin-dev/page-html-blocks/node_modules/sucrase'),
  resolve(root, 'node_modules/sucrase'),
]
const sucrasePath = candidates.find((p) => existsSync(p))
if (!sucrasePath) {
  console.error('找不到 sucrase，先在被检插件目录 npm i，或确认根目录依赖已安装')
  process.exit(1)
}
const require = createRequire(import.meta.url)
const { transform } = require(sucrasePath)

const file = process.argv[2]
const asFence = process.argv.includes('--fence')
if (!file) {
  console.error('用法: node scripts/check-page-block.mjs <文件> [--fence]')
  process.exit(1)
}

let src = readFileSync(file, 'utf8')

if (asFence) {
  const m = src.match(/:::pageBlock[^\n]*\n([\s\S]*?)\n:::/)
  if (!m) {
    console.error('FAIL 没有找到 :::pageBlock 围栏')
    process.exit(1)
  }
  src = m[1]
}

// —— 静态体检：先数配对，比编译器的报错位置准得多 ——
const problems = []
const backticks = (src.match(/`/g) || []).length
if (backticks % 2 !== 0) problems.push(`反引号数量为奇数(${backticks})，大概率有未闭合的模板字符串`)

let depth = 0
for (let i = 0; i < src.length; i++) {
  const ch = src[i]
  if (ch === '{' || ch === '(' || ch === '[') depth++
  else if (ch === '}' || ch === ')' || ch === ']') depth--
  if (depth < 0) { problems.push(`第 ${src.slice(0, i).split('\n').length} 行出现多余的闭合符号 ${ch}`); break }
}

if (problems.length) {
  console.error('FAIL 静态体检\n  ' + problems.join('\n  '))
  console.error('\n提示：JSX 里写代码示例不要嵌模板字符串，改用数组 + join("\\n")。')
  process.exit(1)
}

const stripped = src
  .replace(/export\s+default\s+function\s+/g, 'function ')
  .replace(/export\s+default\s+/g, 'const __Component = ')

try {
  const code = transform(stripped, {
    transforms: ['jsx', 'typescript'],
    jsxRuntime: 'classic',
    production: true,
    filePath: 'html-block.tsx',
  }).code
  new Function(code)
  console.log(`OK mode=jsx  ${file}`)
} catch (e) {
  console.error(`FAIL ${e.message}`)
  process.exit(1)
}
