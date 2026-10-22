import { renderToStaticMarkup } from 'react-dom/server'
import { BRAND_DEFAULT, BrandMark } from './brand-mark.tsx'

const FONT = `ui-sans-serif, system-ui, -apple-system, 'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif`

/** 白色圆角底 + 默认配色的标记。深海里最深的一块接近纯黑，必须垫白底才看得见轮廓。 */
function markSvg(displayWidth: number) {
  return renderToStaticMarkup(
    <BrandMark
      colors={[BRAND_DEFAULT.c0, BRAND_DEFAULT.c1, BRAND_DEFAULT.c2]}
      stroke={BRAND_DEFAULT.stroke}
      strokeWidth={BRAND_DEFAULT.strokeWidth}
      lineWidth={BRAND_DEFAULT.lineWidth}
      background={BRAND_DEFAULT.background}
      showBackground={BRAND_DEFAULT.showBackground}
      circleRatio={BRAND_DEFAULT.circleRatio}
      displayWidth={displayWidth}
      title="BIU"
    />,
  ).replace(/ role="img" aria-label="BIU"/, '')
}

function placed(markup: string, x: number, y: number, size: number) {
  return markup.replace('<svg ', `<svg x="${x}" y="${y}" width="${size}" height="${size}" `)
}

/** 标签页图标：和导航栏标记同一套默认参数。 */
export function buildFaviconSvg() {
  return `${markSvg(16)}\n`
}

/** README 顶部的横条：标记 + 名称。 */
export function buildLockupSvg() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 54" width="300" height="54" fill="none">',
    '<rect width="300" height="54" rx="16" fill="#0a0a0a"/>',
    placed(markSvg(38), 8, 8, 38),
    `<text x="58" y="35" text-anchor="start" fill="#ffffff" font-family="${FONT}" font-size="22" font-weight="700" letter-spacing="2">BIU</text>`,
    '</svg>',
    '',
  ].join('\n')
}

/** 分享卡片（og:image），1200×630。社交平台大多不认 SVG，发布用的是同名 PNG。 */
export function buildOgImageSvg() {
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">',
    '<rect width="1200" height="630" fill="#000000"/>',
    placed(markSvg(280), 120, 175, 280),
    `<g font-family="${FONT}" fill="#ffffff">`,
    '<text x="470" y="282" font-size="96" font-weight="700" letter-spacing="-2">BIU</text>',
    '<text x="470" y="368" font-size="48" font-weight="600">一个页面，组合所有软件</text>',
    '<text x="470" y="430" font-size="26" fill-opacity=".6">开源 · 免费 · All in One</text>',
    '</g>',
    '</svg>',
    '',
  ].join('\n')
}
