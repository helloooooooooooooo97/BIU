import { afterEach, describe, expect, it } from 'vitest'
import {
  getCachedMarkdownHtml,
  parseMarkdownLive,
  parseMarkdownSync,
  renderMarkdownHtml,
  resetMarkdownRenderForTests,
  splitStreamingMarkdown,
  stabilizeStreamingMarkdown,
} from './markdown-render.ts'

afterEach(() => {
  resetMarkdownRenderForTests()
})

describe('markdown-render', () => {
  it('parses GFM sync and caches sanitized html', () => {
    const html = parseMarkdownSync('**bold** and `code`\n\n- a\n- b')
    expect(html).toContain('<strong>bold</strong>')
    expect(html).toContain('<code>code</code>')
    expect(html).toContain('<li>')
    expect(getCachedMarkdownHtml('**bold** and `code`\n\n- a\n- b')).toBe(html)
  })

  it('strips script tags via DOMPurify', () => {
    const html = parseMarkdownSync('hi<script>alert(1)</script>')
    expect(html).not.toContain('<script')
    expect(html).toContain('hi')
  })

  it('renderMarkdownHtml reuses cache without reparse', async () => {
    const text = 'hello **world**'
    const first = await renderMarkdownHtml(text)
    const second = await renderMarkdownHtml(text)
    expect(second).toBe(first)
    expect(second).toContain('<strong>world</strong>')
  })

  it('second ensure is cache hit (virtual list remount path)', () => {
    const text = 'remount **me**'
    const first = parseMarkdownSync(text)
    const second = getCachedMarkdownHtml(text)
    expect(second).toBe(first)
  })

  it('live parse does not fill the LRU and still renders GFM', () => {
    const text = 'hello **world**'
    const html = parseMarkdownLive(text)
    expect(html).toContain('<strong>world</strong>')
    expect(getCachedMarkdownHtml(text)).toBeUndefined()
  })

  it('live parse closes an odd fence', () => {
    expect(stabilizeStreamingMarkdown('```js\nconst x = 1')).toMatch(/\n```$/)
    expect(stabilizeStreamingMarkdown('```js\nconst x = 1\n```')).toBe('```js\nconst x = 1\n```')
    const html = parseMarkdownLive('```js\nconst x = 1')
    expect(html).toContain('<pre>')
    expect(html).toContain('const x = 1')
    expect(html).not.toContain('hljs')
  })

  it('splits at the last open fence so closed blocks can freeze', () => {
    const open = 'intro\n```js\nconst x = 1'
    expect(splitStreamingMarkdown(open)).toEqual({
      frozen: 'intro\n',
      live: '```js\nconst x = 1',
    })
    const closed = 'intro\n```js\nconst x = 1\n```\nmore **text**'
    expect(splitStreamingMarkdown(closed)).toEqual({
      frozen: 'intro\n```js\nconst x = 1\n```\n',
      live: 'more **text**',
    })
  })

  it('highlights a code block as soon as its fence closes', () => {
    const closed = '```js\nconst n = 1\n```\nstill **streaming**'
    const html = parseMarkdownLive(closed)
    expect(html).toContain('hljs')
    expect(html).toContain('language-js')
    expect(html).toContain('<strong>streaming</strong>')
    expect(getCachedMarkdownHtml(closed)).toBeUndefined()
    expect(getCachedMarkdownHtml('```js\nconst n = 1\n```\n')).toBeTruthy()
  })
})
