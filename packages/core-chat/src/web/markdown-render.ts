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

/** 流式前缀增量缓存：段落或代码块闭合后只解析新增 delta，把流式长文从 O(N²) 降到 O(N)。 */
let streamFrozenCache: { prefix: string; html: string } = { prefix: '', html: '' }

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
 * 已闭合的围栏和已闭合的段落（`\n\n`）都可以定稿复用；
 * 最后一个未闭合 ``` 或最后一个正在增长的段落只做轻量 parse，避免每帧重解析整篇长文。
 */
export function splitStreamingMarkdown(text: string): { frozen: string; live: string } {
  const starts = fenceStarts(text)
  if (starts.length % 2 === 1) {
    const openAt = starts[starts.length - 1]!
    return { frozen: text.slice(0, openAt), live: text.slice(openAt) }
  }
  const fenceEnd = starts.length > 0 ? lineEndAfter(text, starts[starts.length - 1]!) : 0
  const paraEnd = text.lastIndexOf('\n\n')
  const cut = paraEnd >= fenceEnd ? paraEnd + 2 : fenceEnd
  if (cut <= 0) return { frozen: '', live: text }
  return { frozen: text.slice(0, cut), live: text.slice(cut) }
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

function resolveStreamFrozenHtml(frozen: string): string {
  if (!frozen) return ''
  const cached = getCachedMarkdownHtml(frozen)
  if (cached != null) {
    streamFrozenCache = { prefix: frozen, html: cached }
    return cached
  }
  if (streamFrozenCache.prefix === frozen) return streamFrozenCache.html
  if (streamFrozenCache.prefix && frozen.startsWith(streamFrozenCache.prefix)) {
    const delta = frozen.slice(streamFrozenCache.prefix.length)
    const dirty = marked.parse(delta, { async: false }) as string
    const html = streamFrozenCache.html + sanitizeMarkdownHtml(dirty)
    streamFrozenCache = { prefix: frozen, html }
    if (frozen.includes('```')) touchCache(frozen, html)
    return html
  }
  const dirty = marked.parse(frozen, { async: false }) as string
  const html = sanitizeMarkdownHtml(dirty)
  streamFrozenCache = { prefix: frozen, html }
  if (frozen.includes('```')) touchCache(frozen, html)
  return html
}

/**
 * 流式预览：闭合代码块与已定稿段落增量缓存；
 * 仅对最后一个正在增长的段落/未闭合围栏做轻量 parse，不把整条未定稿 message 写入 LRU。
 */
export function parseMarkdownLive(text: string): string {
  const { frozen, live } = splitStreamingMarkdown(text)
  return resolveStreamFrozenHtml(frozen) + parseLiveFragment(live)
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
  streamFrozenCache = { prefix: '', html: '' }
  inflight.clear()
  for (const [, entry] of pending) {
    entry.reject(new Error('reset'))
  }
  pending.clear()
  worker?.terminate()
  worker = undefined
}
