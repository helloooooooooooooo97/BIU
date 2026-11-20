import type { Context } from 'cordis'
import { hostnameOf, presentFetch, presentSearch } from './present.ts'
import type { WebSearchResult } from './types.ts'

export { hostnameOf, presentFetch, presentSearch }

export function registerWebTools(ctx: Context) {
  ctx.systemPrompt.register(
    'web.access',
    '网上资料用 web_search（不知道 URL 时）；已知链接用 web_fetch。不要用 bash curl/wget 搜网页。引用时写成 markdown 链接。页面插图：web_search 只给网页链接；先 web_fetch 正文页看返回的 images（og:image / img），再 web_fetch 图片 URL。图片会落到本地 file.path，不要读成正文。然后 db_media write from=该路径，db_content 插入 ![说明](/api/db/file/<文件名>)。',
  )

  ctx.tools.register({
    name: 'web_search',
    description:
      '在网上搜索当前信息。不知道 URL 时用这个：传 queries 数组（可单条或多条批量搜），返回去重后的标题、链接和摘要。需要读正文再对链接调用 web_fetch。',
    parameters: {
      type: 'object',
      properties: {
        queries: {
          type: 'array',
          items: { type: 'string' },
          description: '搜索词数组（至少一条非空字符串）',
        },
      },
      required: ['queries'],
    },
    execution: 'parallel',
    execute: async (args, signal) => {
      const queries = collectQueries(args.queries)
      if (!queries.length) throw new Error('queries must include at least one non-empty string')
      const maxResults = ctx.web.searchMaxResults()
      const batches: WebSearchResult[] = []
      for (const query of queries) {
        batches.push(await ctx.web.search({ query, maxResults }, signal))
        ctx.tools.report(presentSearch(queries, batches))
      }
      return presentSearch(queries, batches)
    },
  })

  ctx.tools.register({
    name: 'web_fetch',
    description:
      '抓取一个已知的公开 http(s) URL。网页：抽出可读正文，并尽量带上 images（页面里的图片链接）；可传 extract=images 只取图片链接或 max_chars 限制正文长度省 token。图片 URL（png/jpg/gif/webp 等）：下载到本地，返回 file.path / file.mime / file.bytes，不要当正文读。插图：web_fetch 图片 → db_media write from=file.path → db_content 写 ![说明](/api/db/file/<name>)。搜资料请用 web_search。',
    parameters: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'https 链接' },
        extract: {
          type: 'string',
          enum: ['all', 'text', 'images'],
          description: '可选：all（默认，正文+图片）| text（仅正文）| images（仅图片链接，省正文 token）',
        },
        max_chars: {
          type: 'integer',
          description: '可选：正文最大返回字符数，超出截断',
        },
      },
      required: ['url'],
    },
    execution: 'parallel',
    execute: async (args, signal) => {
      const presented = presentFetch(await ctx.web.fetch({ url: String(args.url ?? '') }, signal))
      const extract = typeof args.extract === 'string' ? args.extract : 'all'
      const maxChars = typeof args.max_chars === 'number' && args.max_chars > 0 ? args.max_chars : 0
      const text =
        extract === 'images'
          ? ''
          : maxChars && presented.text.length > maxChars
            ? `${presented.text.slice(0, maxChars)}\n... [truncated ${presented.text.length - maxChars} chars]`
            : presented.text
      return {
        url: presented.url,
        status: presented.status,
        title: presented.title,
        ...(extract !== 'images' ? { text } : {}),
        ...(presented.file ? { file: presented.file } : {}),
        ...(extract !== 'text' && presented.images?.length ? { images: presented.images } : {}),
        truncated: presented.truncated || Boolean(maxChars && presented.text.length > maxChars),
      }
    },
  })
}

function collectQueries(raw: unknown) {
  const out: string[] = []
  const seen = new Set<string>()
  if (!Array.isArray(raw)) return out
  for (const value of raw) {
    const text = String(value ?? '').trim()
    if (!text || seen.has(text)) continue
    seen.add(text)
    out.push(text)
  }
  return out
}
