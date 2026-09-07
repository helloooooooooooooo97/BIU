import { memo } from 'react'
import 'highlight.js/styles/github-dark.css'
import { getCachedMarkdownHtml, parseMarkdownLive, parseMarkdownSync } from './markdown-render.ts'

/**
 * 对话气泡内的 Markdown（GFM）。
 *
 * 定稿后：渲染期同步取 LRU 缓存；未命中则同步 parse 一次并写入缓存。
 * 虚表滚走再滚回 = 同 text 必命中缓存 → 首帧就是 HTML，不再闪「加载一下」。
 * 流式：按当前全文做轻量 marked（不高亮、不进缓存），chunk 已按帧合并。
 */
export const MarkdownBody = memo(function MarkdownBody({
  text,
  className = '',
  streaming = false,
}: {
  text: string
  className?: string
  /** 流式中用轻量 parse，定稿后再高亮并写入缓存 */
  streaming?: boolean
}) {
  if (!text) return null

  if (streaming) {
    const html = parseMarkdownLive(text)
    return (
      <div
        className={`chat-md chat-md-stream ${className}`.trim()}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  const html = getCachedMarkdownHtml(text) ?? parseMarkdownSync(text)

  return (
    <div
      className={`chat-md ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
})
