import { BLOG_AUTHOR, BLOG_POSTS, type BlogPost } from './blog-posts.ts'

const escape = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function itemBody(post: BlogPost) {
  return post.sections
    .flatMap((section) => [section.heading ?? '', ...section.body.filter((p): p is string => typeof p === 'string')])
    .filter(Boolean)
    .join('\n\n')
}

/**
 * 博客的 RSS 2.0。站点域名由调用方传入（BIU_SITE_URL）；不传时链接是站内相对路径，
 * 阅读器会按订阅地址补全。
 */
export function buildBlogRss(siteUrl = '') {
  const base = siteUrl.replace(/\/$/, '')
  const items = BLOG_POSTS.map((post) => {
    const link = `${base}/blog/${post.slug}`
    return [
      '    <item>',
      `      <title>${escape(post.title)}</title>`,
      `      <link>${escape(link)}</link>`,
      `      <guid isPermaLink="false">biu-blog-${post.slug}</guid>`,
      `      <pubDate>${new Date(`${post.date}T00:00:00+08:00`).toUTCString()}</pubDate>`,
      `      <author>${escape(`${BLOG_AUTHOR.email} (${BLOG_AUTHOR.name})`)}</author>`,
      `      <description>${escape(post.summary)}</description>`,
      `      <content:encoded><![CDATA[${itemBody(post).replace(/]]>/g, ']]]]><![CDATA[>')}]]></content:encoded>`,
      '    </item>',
    ].join('\n')
  })
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/">',
    '  <channel>',
    '    <title>BIU 博客</title>',
    `    <link>${escape(`${base}/blog`)}</link>`,
    '    <description>BIU 的设计理念：用页面组合软件、页面即边界、更少的原子、让工作留下来、开源与透明。</description>',
    '    <language>zh-CN</language>',
    ...items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n')
}
