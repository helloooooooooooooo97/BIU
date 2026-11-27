import DOMPurify from 'dompurify'
import { Marked, marked } from 'marked'
import { BoundedMap } from '@biu/biu-ui/cache'
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
const htmlCache = new BoundedMap<string, string>(CACHE_LIMIT)

/** 流式前缀增量缓存：段落或代码块闭合后只解析新增 delta，把流式长文从 O(N²) 降到 O(N)。 */
let streamFrozenCache: { prefix: string; html: string } = { prefix: '', html: '' }

function touchCache(text: string, html: string) {
  htmlCache.set(text, html)
}

export function getCachedMarkdownHtml(text: string): string | undefined {
  return htmlCache.get(text)
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

/** 测试用：清空缓存 */
export function resetMarkdownRenderForTests() {
  htmlCache.clear()
  streamFrozenCache = { prefix: '', html: '' }
}
