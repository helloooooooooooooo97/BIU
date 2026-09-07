import DOMPurify from 'dompurify'
import { Marked, marked } from 'marked'
import type { MarkdownWorkerRequest, MarkdownWorkerResponse } from './markdown.worker.ts'
import { markdownHighlight } from './markdown-highlight.ts'

marked.setOptions({
  gfm: true,
  breaks: false,
  async: false,
})
marked.use(markdownHighlight)

/** 流式预览：不走 highlight.js，避免每帧高亮整段代码块。 */
const liveMarked = new Marked({
  gfm: true,
  breaks: false,
  async: false,
})

if (typeof window !== 'undefined') {
  DOMPurify.addHook('afterSanitizeAttributes', (node) => {
    if (node.tagName === 'A') {
      node.setAttribute('target', '_blank')
      node.setAttribute('rel', 'noreferrer noopener')
    }
  })
}

const CACHE_LIMIT = 1200

/** text → 已消毒 HTML；虚表卸载再挂时同步命中，首帧即可贴 HTML */
const htmlCache = new Map<string, string>()

/** 同 text 并发只解析一次，避免虚表快速进出重复 marked */
const inflight = new Map<string, Promise<string>>()

let worker: Worker | null | undefined
let nextId = 1
const pending = new Map<
  number,
  { resolve: (html: string) => void; reject: (error: Error) => void }
>()

function touchCache(text: string, html: string) {
  if (htmlCache.has(text)) htmlCache.delete(text)
  htmlCache.set(text, html)
  while (htmlCache.size > CACHE_LIMIT) {
    const oldest = htmlCache.keys().next().value
    if (oldest == null) break
    htmlCache.delete(oldest)
  }
}

export function getCachedMarkdownHtml(text: string): string | undefined {
  const hit = htmlCache.get(text)
  if (hit == null) return undefined
  // LRU：命中后挪到末尾
  htmlCache.delete(text)
  htmlCache.set(text, hit)
  return hit
}

export function sanitizeMarkdownHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    USE_PROFILES: { html: true },
    ADD_ATTR: ['target', 'rel'],
  })
}

export function parseMarkdownSync(text: string): string {
  const dirty = marked.parse(text, { async: false }) as string
  const html = sanitizeMarkdownHtml(dirty)
  touchCache(text, html)
  return html
}

const FENCE_RE = /^ {0,3}```/gm

function fenceStarts(text: string): number[] {
  const starts: number[] = []
  const re = new RegExp(FENCE_RE.source, FENCE_RE.flags)
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) starts.push(m.index)
  return starts
}

function lineEndAfter(text: string, index: number): number {
  const nl = text.indexOf('\n', index)
  return nl === -1 ? text.length : nl + 1
}

/**
 * 已闭合的围栏可以定稿（含 highlight.js）；
 * 最后一个未闭合 ``` 及之后只做轻量 parse，避免每帧高亮正在增长的代码。
 */
export function splitStreamingMarkdown(text: string): { frozen: string; live: string } {
  const starts = fenceStarts(text)
  if (starts.length === 0) return { frozen: '', live: text }
  if (starts.length % 2 === 1) {
    const openAt = starts[starts.length - 1]!
    return { frozen: text.slice(0, openAt), live: text.slice(openAt) }
  }
  const closeAt = starts[starts.length - 1]!
  const end = lineEndAfter(text, closeAt)
  return { frozen: text.slice(0, end), live: text.slice(end) }
}

/** 未闭合的 ``` 在流式里会把后面全吃进代码块，补一个结束围栏再 parse。 */
export function stabilizeStreamingMarkdown(text: string): string {
  const starts = fenceStarts(text)
  if (starts.length % 2 === 1) return `${text}\n\`\`\``
  return text
}

function parseLiveFragment(text: string): string {
  if (!text) return ''
  const dirty = liveMarked.parse(stabilizeStreamingMarkdown(text), { async: false }) as string
  return sanitizeMarkdownHtml(dirty)
}

/**
 * 流式预览：闭合代码块走定稿高亮（frozen 前缀可进 LRU）；
 * 未闭合围栏与其后正文不高亮、不把整条 message 写入 LRU。
 */
export function parseMarkdownLive(text: string): string {
  const { frozen, live } = splitStreamingMarkdown(text)
  const frozenHtml = frozen ? (getCachedMarkdownHtml(frozen) ?? parseMarkdownSync(frozen)) : ''
  return frozenHtml + parseLiveFragment(live)
}

function getWorker(): Worker | null {
  if (worker !== undefined) return worker
  if (typeof Worker === 'undefined') {
    worker = null
    return null
  }
  try {
    worker = new Worker(new URL('./markdown.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<MarkdownWorkerResponse>) => {
      const data = event.data
      const entry = pending.get(data.id)
      if (!entry) return
      pending.delete(data.id)
      if ('error' in data) {
        entry.reject(new Error(data.error))
        return
      }
      entry.resolve(data.html)
    }
    worker.onerror = () => {
      // Worker 挂了就改走同步路径
      for (const [, entry] of pending) {
        entry.reject(new Error('markdown worker failed'))
      }
      pending.clear()
      worker?.terminate()
      worker = null
    }
  } catch {
    worker = null
  }
  return worker
}

/**
 * 把 Markdown 解析丢到 Worker；主线程只做 DOMPurify。
 * 无 Worker / 失败时同步 fallback（测例、旧环境）。
 * 同 text 合并 in-flight，虚表抖动不会打爆 Worker。
 */
export function renderMarkdownHtml(text: string): Promise<string> {
  const cached = getCachedMarkdownHtml(text)
  if (cached != null) return Promise.resolve(cached)

  const existing = inflight.get(text)
  if (existing) return existing

  const w = getWorker()
  if (!w) {
    return Promise.resolve(parseMarkdownSync(text))
  }

  const id = nextId++
  const job = new Promise<string>((resolve, reject) => {
    pending.set(id, {
      resolve: (dirty) => {
        try {
          const html = sanitizeMarkdownHtml(dirty)
          touchCache(text, html)
          resolve(html)
        } catch (error) {
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      },
      reject,
    })
    const request: MarkdownWorkerRequest = { id, text }
    w.postMessage(request)
  })
    .catch(() => parseMarkdownSync(text))
    .finally(() => {
      inflight.delete(text)
    })

  inflight.set(text, job)
  return job
}

/** 测试用：清空缓存与 Worker 状态 */
export function resetMarkdownRenderForTests() {
  htmlCache.clear()
  inflight.clear()
  for (const [, entry] of pending) {
    entry.reject(new Error('reset'))
  }
  pending.clear()
  worker?.terminate()
  worker = undefined
}
