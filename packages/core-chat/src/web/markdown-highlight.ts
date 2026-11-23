import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import dockerfile from 'highlight.js/lib/languages/dockerfile'
import go from 'highlight.js/lib/languages/go'
import http from 'highlight.js/lib/languages/http'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import plaintext from 'highlight.js/lib/languages/plaintext'
import python from 'highlight.js/lib/languages/python'
import ruby from 'highlight.js/lib/languages/ruby'
import rust from 'highlight.js/lib/languages/rust'
import scss from 'highlight.js/lib/languages/scss'
import shell from 'highlight.js/lib/languages/shell'
import sql from 'highlight.js/lib/languages/sql'
import swift from 'highlight.js/lib/languages/swift'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'
import { markedHighlight } from 'marked-highlight'

// 按需注册常用语言，避免全量引入 highlight.js（190+ 语言 ~1MB）拖慢主线程与 Worker 启动。
const LANGUAGES = {
  bash,
  c,
  cpp,
  css,
  diff,
  dockerfile,
  go,
  http,
  ini,
  java,
  javascript,
  json,
  kotlin,
  markdown,
  plaintext,
  python,
  ruby,
  rust,
  scss,
  shell,
  sql,
  swift,
  typescript,
  xml,
  yaml,
} as const

for (const [name, grammar] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, grammar)
}
hljs.registerAliases(['sh', 'zsh'], { languageName: 'bash' })
hljs.registerAliases(['js', 'jsx', 'mjs', 'cjs'], { languageName: 'javascript' })
hljs.registerAliases(['ts', 'tsx', 'mts', 'cts'], { languageName: 'typescript' })
hljs.registerAliases(['html', 'svg'], { languageName: 'xml' })
hljs.registerAliases(['yml'], { languageName: 'yaml' })
hljs.registerAliases(['toml'], { languageName: 'ini' })
hljs.registerAliases(['py'], { languageName: 'python' })
hljs.registerAliases(['rs'], { languageName: 'rust' })
hljs.registerAliases(['md'], { languageName: 'markdown' })
hljs.registerAliases(['text', 'txt'], { languageName: 'plaintext' })

/**
 * marked 的 markdown-highlight 扩展：为代码块添加 highlight.js 的高亮。
 * 主线程（markdown-render.ts）与 worker（markdown.worker.ts）共用同一份配置。
 */
export const markdownHighlight = markedHighlight({
  // 空语言也带上 hljs，便于统一套用高亮主题色
  emptyLangClass: 'hljs',
  langPrefix: 'hljs language-',
  highlight(code, lang) {
    const language = lang && hljs.getLanguage(lang) ? lang : 'plaintext'
    try {
      return hljs.highlight(code, { language, ignoreIllegals: true }).value
    } catch {
      // 高亮失败时退回原样，保证内容不丢
      try {
        return hljs.highlight(code, { language: 'plaintext', ignoreIllegals: true }).value
      } catch {
        return code
      }
    }
  },
})
