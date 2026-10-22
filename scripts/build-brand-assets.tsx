// 用 BRAND_DEFAULT 重新生成品牌素材：npx tsx scripts/build-brand-assets.tsx
//   public/favicon.svg       标签页图标
//   public/brand-lockup.svg  README 横条
//   public/og-image.svg/png  分享卡片（PNG 需要本机有 Chrome，可用 CHROME=路径 指定）
import { execFileSync } from 'node:child_process'
import { existsSync, statSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { buildFaviconSvg, buildLockupSvg, buildOgImageSvg } from '../packages/web-app-shell/src/web/marketing-site/brand-assets.tsx'

const pub = (name: string) => resolve(process.cwd(), 'public', name)

writeFileSync(pub('favicon.svg'), buildFaviconSvg())
writeFileSync(pub('brand-lockup.svg'), buildLockupSvg())
writeFileSync(pub('og-image.svg'), buildOgImageSvg())
console.log('wrote favicon.svg, brand-lockup.svg, og-image.svg')

const chrome = [
  process.env.CHROME,
  'google-chrome',
  'chromium',
  'chromium-browser',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((bin) => {
  if (!bin) return false
  if (bin.includes('/')) return existsSync(bin)
  try {
    execFileSync('which', [bin], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})

if (!chrome) {
  console.warn('没找到 Chrome，og-image.png 未更新（设置 CHROME=浏览器路径 后重跑）')
} else {
  const png = pub('og-image.png')
  const before = existsSync(png) ? statSync(png).mtimeMs : 0
  try {
    execFileSync(chrome, [
      '--headless=new',
      '--no-sandbox',
      '--hide-scrollbars',
      '--force-device-scale-factor=1',
      '--window-size=1200,630',
      `--screenshot=${png}`,
      pathToFileURL(pub('og-image.svg')).toString(),
    ], { stdio: 'ignore', timeout: 30_000 })
  } catch {
    // 部分环境里 Chrome 截完图不退出，只能靠超时收场；以文件是否更新为准
  }
  if (!existsSync(png) || statSync(png).mtimeMs === before) throw new Error('og-image.png 生成失败')
  console.log('wrote og-image.png')
}
