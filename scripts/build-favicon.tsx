// 重新生成 public/favicon.svg（取 BRAND_DEFAULT 的配色）：npx tsx scripts/build-favicon.tsx
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { buildFaviconSvg } from '../packages/web-app-shell/src/web/marketing-site/brand-favicon.tsx'

const out = resolve(process.cwd(), 'public/favicon.svg')
writeFileSync(out, buildFaviconSvg())
console.log(`wrote ${out}`)
