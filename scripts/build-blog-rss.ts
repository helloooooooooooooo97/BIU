// 重新生成 public/rss.xml：npx tsx scripts/build-blog-rss.ts
// 有正式域名时：BIU_SITE_URL=https://example.com npx tsx scripts/build-blog-rss.ts
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildBlogRss } from '../packages/web-app-shell/src/web/marketing-site/blog-rss.ts'

const out = resolve(process.cwd(), 'public/rss.xml')
writeFileSync(out, buildBlogRss(process.env.BIU_SITE_URL ?? ''))
console.log(`wrote ${out}`)
